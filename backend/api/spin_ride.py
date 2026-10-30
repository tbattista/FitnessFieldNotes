"""
Spin Ride API Endpoints
AI-generated spin bike interval workouts with structured ride plans.
"""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from typing import Dict, Any
import logging
import os

from ..models.spin_ride import GenerateSpinRideRequest, SpinRidePlan
from ..services.spin_ride_generator import get_spin_ride_generator
from ..services.ai_rate_limiter import ai_rate_limiter
from ..middleware.auth import get_current_user, extract_user_id, extract_user_email
from ..services.workout_library_service import (
    criteria_from_spin_request,
    entry_path,
    is_admin_email,
    workout_library_service,
)
from .workout_library import publish_admin_generation

router = APIRouter(prefix="/api/v3/spin-ride", tags=["Spin Ride"])
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
async def spin_ride_status():
    """Health check for spin ride generator."""
    generator = get_spin_ride_generator()
    return {
        "available": generator.is_available(),
        "gemini_key_set": bool(os.getenv("GEMINI_API_KEY")),
    }


@router.post("/generate")
async def generate_spin_ride(
    request: GenerateSpinRideRequest,
    background_tasks: BackgroundTasks,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Generate an AI-powered spin ride plan for the given duration."""
    user_id = extract_user_id(current_user)
    email = extract_user_email(current_user)

    # Reuse a matching library workout the user hasn't done yet instead of
    # paying for a new generation. Never for the admin (their generations grow
    # the library), for "fresh" requests, or when rider notes make it bespoke.
    if not request.fresh and not is_admin_email(email) and not (request.notes or "").strip():
        reused = workout_library_service.find_reuse("spin", criteria_from_spin_request(request), user_id)
        if reused:
            workout_library_service.record_event(reused["id"], "served", user_id)
            logger.info(f"Served library spin {reused['id']} to user {user_id} instead of generating")
            return {**reused["plan"], "library": {"id": reused["id"], "url": entry_path(reused)}}

    _check_ai_rate_limit(user_id)

    generator = get_spin_ride_generator()
    if not generator.is_available():
        raise HTTPException(
            status_code=503,
            detail="AI ride generation is not available (API key not configured)"
        )

    try:
        plan = generator.generate(
            request.duration_minutes,
            include_all_outs=request.include_all_outs,
            difficulty=request.difficulty,
            notes=request.notes,
        )
        ai_rate_limiter.record_request(user_id)
        logger.info(
            f"Generated {request.duration_minutes}min spin ride for user {user_id} "
            f"(all_outs={'on' if request.include_all_outs else 'off'}, "
            f"difficulty={request.difficulty or 'auto'})"
        )
        # Admin generations are the library's source: publish them for the public
        # pages (SEO copy is written in the background so the response isn't slowed).
        if is_admin_email(email):
            background_tasks.add_task(
                publish_admin_generation, "spin", plan, criteria_from_spin_request(request), email)
        return plan

    except ValueError as e:
        logger.error(f"Spin ride generation ValueError: {e}")
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Spin ride generation failed: {type(e).__name__}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ride generation failed: {str(e)}")
