"""
Tabata Kettlebell API Endpoints
AI-generated kettlebell tabata workouts with structured work/rest segments.
"""

from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any
import logging
import os

from ..models.tabata_kettlebell import GenerateTabataKettlebellRequest
from ..services.tabata_kettlebell_generator import get_tabata_kettlebell_generator
from ..services.ai_rate_limiter import ai_rate_limiter
from ..middleware.auth import get_current_user, extract_user_id

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
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Generate an AI-powered tabata kettlebell workout plan."""
    user_id = extract_user_id(current_user)
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
        )
        ai_rate_limiter.record_request(user_id)
        logger.info(
            f"Generated tabata KB workout for user {user_id} "
            f"(protocol={request.protocol}, sets={request.sets}, "
            f"rounds_per_set={request.rounds_per_set}, focus={request.focus_areas})"
        )
        return plan

    except ValueError as e:
        logger.error(f"Tabata KB generation ValueError: {e}")
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(
            f"Tabata KB generation failed: {type(e).__name__}: {e}", exc_info=True
        )
        raise HTTPException(status_code=500, detail=f"Workout generation failed: {str(e)}")
