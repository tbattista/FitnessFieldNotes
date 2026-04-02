"""
Spin Ride API Endpoints
AI-generated spin bike interval workouts with structured ride plans.
"""

from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any
import logging
import os

from ..models.spin_ride import GenerateSpinRideRequest, SpinRidePlan
from ..services.spin_ride_generator import get_spin_ride_generator
from ..services.ai_rate_limiter import ai_rate_limiter
from ..middleware.auth import get_current_user, extract_user_id

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


@router.post("/generate", response_model=SpinRidePlan)
async def generate_spin_ride(
    request: GenerateSpinRideRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Generate an AI-powered spin ride plan for the given duration."""
    user_id = extract_user_id(current_user)
    _check_ai_rate_limit(user_id)

    generator = get_spin_ride_generator()
    if not generator.is_available():
        raise HTTPException(
            status_code=503,
            detail="AI ride generation is not available (API key not configured)"
        )

    try:
        plan = generator.generate(request.duration_minutes)
        ai_rate_limiter.record_request(user_id, is_authenticated=True)
        logger.info(f"Generated {request.duration_minutes}min spin ride for user {user_id}")
        return plan

    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Spin ride generation failed: {e}")
        raise HTTPException(status_code=500, detail="Ride generation failed — please try again")
