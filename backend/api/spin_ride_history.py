"""
Spin Ride History API Endpoints
Per-user storage of completed AI-generated spin rides, with favorite + re-ride support.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
import logging

from ..models.spin_ride import (
    SavedSpinRide,
    SaveSpinRideRequest,
    UpdateSavedSpinRideRequest,
    SavedSpinRideListResponse,
)
from ..services.firestore_data_service import firestore_data_service
from ..services.firebase_service import firebase_service
from ..middleware.auth import get_current_user_optional, extract_user_id

router = APIRouter(prefix="/api/v3/firebase/spin-rides", tags=["Spin Ride History"])
logger = logging.getLogger(__name__)


def _require_auth(current_user: Optional[dict]) -> str:
    user_id = extract_user_id(current_user)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    if not firebase_service.is_available():
        raise HTTPException(status_code=503, detail="Spin ride history unavailable")
    return user_id


@router.post("", response_model=SavedSpinRide)
async def save_ride(
    request: SaveSpinRideRequest,
    current_user: Optional[dict] = Depends(get_current_user_optional),
):
    """Save a completed ride to the user's personal history."""
    user_id = _require_auth(current_user)
    ride = await firestore_data_service.save_spin_ride(user_id, request)
    if not ride:
        raise HTTPException(status_code=500, detail="Failed to save spin ride")
    logger.info(f"✅ Saved spin ride {ride.id} for user {user_id}")
    return ride


@router.get("", response_model=SavedSpinRideListResponse)
async def list_rides(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    favorites_only: bool = Query(False),
    current_user: Optional[dict] = Depends(get_current_user_optional),
):
    """List saved rides. Favorites bubble to the top, then most-recent."""
    user_id = _require_auth(current_user)
    rides, total = await firestore_data_service.list_spin_rides(
        user_id, page=page, page_size=page_size, favorites_only=favorites_only,
    )
    return SavedSpinRideListResponse(
        rides=rides, total_count=total, page=page, page_size=page_size,
    )


@router.get("/{ride_id}", response_model=SavedSpinRide)
async def get_ride(
    ride_id: str,
    current_user: Optional[dict] = Depends(get_current_user_optional),
):
    """Fetch one saved ride. Used by the re-ride flow."""
    user_id = _require_auth(current_user)
    ride = await firestore_data_service.get_spin_ride(user_id, ride_id)
    if not ride:
        raise HTTPException(status_code=404, detail="Saved ride not found")
    return ride


@router.patch("/{ride_id}", response_model=SavedSpinRide)
async def update_ride(
    ride_id: str,
    update: UpdateSavedSpinRideRequest,
    current_user: Optional[dict] = Depends(get_current_user_optional),
):
    """Toggle favorite, bump completion_count, or update last_actual_seconds."""
    user_id = _require_auth(current_user)
    ride = await firestore_data_service.update_spin_ride(user_id, ride_id, update)
    if not ride:
        raise HTTPException(status_code=404, detail="Saved ride not found")
    return ride


@router.delete("/{ride_id}")
async def delete_ride(
    ride_id: str,
    current_user: Optional[dict] = Depends(get_current_user_optional),
):
    """Permanently delete a saved ride."""
    user_id = _require_auth(current_user)
    success = await firestore_data_service.delete_spin_ride(user_id, ride_id)
    if not success:
        raise HTTPException(status_code=404, detail="Saved ride not found")
    return {"message": "Saved ride deleted"}
