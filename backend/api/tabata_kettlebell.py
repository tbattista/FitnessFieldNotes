"""
Tabata Kettlebell API Endpoints
AI-generated kettlebell tabata workouts with structured work/rest segments.
"""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from typing import Dict, Any
import logging
import os

from ..models.tabata_kettlebell import GenerateTabataKettlebellRequest
from ..services.tabata_kettlebell_generator import get_tabata_kettlebell_generator
from ..services.ai_rate_limiter import ai_rate_limiter
from ..middleware.auth import get_current_user, extract_user_id, extract_user_email
from ..services.workout_library_service import (
    criteria_from_tabata_request,
    entry_path,
    is_admin_email,
    workout_library_service,
)
from .workout_library import publish_admin_generation

router = APIRouter(prefix="/api/v3/tabata-kettlebell", tags=["Tabata Kettlebell"])
logger = logging.getLogger(__name__)


def _check_ai_rate_limit(user_id: str):
    """Check AI rate limit. Raises 429 if exceeded."""
    allowed, remaining = ai_rate_limiter.check_limit(user_id, is_authenticated=True)
    if not allowed:
        usage = ai_rate_limiter.get_usage(user_id, is_authenticated=True)
        raise HTTPException(
            status_code=429,
            detail=f"AI limit reached ({usage['limit']}/day). Resets in ~24 hours."
        )


@router.get("/status")
async def tabata_kettlebell_status():
    """Health check for tabata kettlebell generator."""
    generator = get_tabata_kettlebell_generator()
    return {
        "available": generator.is_available(),
        "gemini_key_set": bool(os.getenv("GEMINI_API_KEY")),
    }


@router.post("/generate")
async def generate_tabata_kettlebell(
    request: GenerateTabataKettlebellRequest,
    background_tasks: BackgroundTasks,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Generate an AI-powered tabata kettlebell workout plan."""
    user_id = extract_user_id(current_user)
    email = extract_user_email(current_user)

    # Reuse a matching library workout the user hasn't done yet instead of
    # paying for a new generation. Never for the admin (their generations grow
    # the library), for "fresh" requests, or when notes / include / exclude lists
    # make it bespoke.
    if not request.fresh and not is_admin_email(email) and not (
        request.notes.strip() or request.include_exercises or request.exclude_exercises
    ):
        reused = workout_library_service.find_reuse("tabata", criteria_from_tabata_request(request), user_id)
        if reused:
            workout_library_service.record_event(reused["id"], "served", user_id)
            logger.info(f"Served library tabata {reused['id']} to user {user_id} instead of generating")
            return {**reused["plan"], "library": {"id": reused["id"], "url": entry_path(reused)}}

    _check_ai_rate_limit(user_id)

    generator = get_tabata_kettlebell_generator()
    if not generator.is_available():
        raise HTTPException(
            status_code=503,
            detail="AI workout generation is not available (API key not configured)"
        )

    try:
        plan = generator.generate(
            protocol=request.protocol,
            focus_areas=list(request.focus_areas),
            sets=request.sets,
            rounds_per_set=request.rounds_per_set,
            include_exercises=list(request.include_exercises or []),
            exclude_exercises=list(request.exclude_exercises or []),
            exercise_variety=request.exercise_variety,
            notes=request.notes,
        )
        ai_rate_limiter.record_request(user_id)
        logger.info(
            f"Generated tabata KB workout for user {user_id} "
            f"(protocol={request.protocol}, sets={request.sets}, "
            f"rounds_per_set={request.rounds_per_set}, focus={request.focus_areas}, "
            f"include={len(request.include_exercises or [])}, "
            f"exclude={len(request.exclude_exercises or [])}, "
            f"variety={request.exercise_variety}, notes={'yes' if request.notes.strip() else 'no'})"
        )
        # Admin generations are the library's source: publish them for the public
        # pages (SEO copy is written in the background so the response isn't slowed).
        if is_admin_email(email):
            background_tasks.add_task(
                publish_admin_generation, "tabata", plan, criteria_from_tabata_request(request), email)
        return plan

    except ValueError as e:
        logger.error(f"Tabata KB generation ValueError: {e}")
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(
            f"Tabata KB generation failed: {type(e).__name__}: {e}", exc_info=True
        )
        raise HTTPException(status_code=500, detail=f"Workout generation failed: {str(e)}")
