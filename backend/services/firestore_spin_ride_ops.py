"""
Firestore Spin Ride History CRUD Operations
Mixin providing per-user saved-ride storage at users/{uid}/spin_rides/{id}.
"""

import logging
import secrets
from datetime import datetime, timezone
from typing import List, Optional

try:
    from firebase_admin import firestore
except ImportError:
    firestore = None

from ..models.spin_ride import (
    SavedSpinRide,
    SaveSpinRideRequest,
    UpdateSavedSpinRideRequest,
)

logger = logging.getLogger(__name__)


def _make_ride_id() -> str:
    """Generate a stable, sortable ID for a saved ride."""
    now = datetime.now(timezone.utc)
    return f"spin-{now.strftime('%Y%m%d-%H%M%S')}-{secrets.token_hex(3)}"


def _doc_to_saved_ride(doc) -> Optional[SavedSpinRide]:
    """Convert a Firestore document snapshot into a SavedSpinRide model."""
    data = doc.to_dict() or {}
    data['id'] = doc.id
    # Firestore returns DatetimeWithNanoseconds which Pydantic accepts as datetime.
    try:
        return SavedSpinRide(**data)
    except Exception as e:
        logger.error(f"Failed to parse saved spin ride {doc.id}: {e}")
        return None


class FirestoreSpinRideOps:
    """Mixin for saved-spin-ride CRUD operations."""

    def _spin_rides_collection(self, user_id: str):
        return (self.db.collection('users')
                .document(user_id)
                .collection('spin_rides'))

    async def save_spin_ride(
        self,
        user_id: str,
        request: SaveSpinRideRequest,
    ) -> Optional[SavedSpinRide]:
        """Save a completed ride to the user's personal history."""
        if not self.is_available():
            logger.warning("Firestore not available - cannot save spin ride")
            return None

        try:
            ride_id = _make_ride_id()
            doc_ref = self._spin_rides_collection(user_id).document(ride_id)
            now = datetime.now(timezone.utc)

            payload = {
                'plan': request.plan.model_dump(),
                'is_favorite': False,
                'completion_count': 1,
                'saved_at': firestore.SERVER_TIMESTAMP,
                'last_ridden_at': firestore.SERVER_TIMESTAMP,
                'last_actual_seconds': request.last_actual_seconds,
            }
            doc_ref.set(payload)

            # Return a model immediately — server timestamps resolve async,
            # so use local `now` for the response. The persisted record will
            # have the canonical Firestore timestamp.
            return SavedSpinRide(
                id=ride_id,
                plan=request.plan,
                is_favorite=False,
                completion_count=1,
                saved_at=now,
                last_ridden_at=now,
                last_actual_seconds=request.last_actual_seconds,
            )

        except Exception as e:
            logger.error(f"Failed to save spin ride: {e}")
            return None

    async def list_spin_rides(
        self,
        user_id: str,
        page: int = 1,
        page_size: int = 50,
        favorites_only: bool = False,
    ) -> tuple[List[SavedSpinRide], int]:
        """List saved rides for a user, favorites first then most-recent."""
        if not self.is_available():
            return [], 0

        try:
            col = self._spin_rides_collection(user_id)
            # Fetch ordered by recency; we re-sort in Python to bubble
            # favorites to the top without requiring a composite index.
            query = col.order_by('last_ridden_at', direction=firestore.Query.DESCENDING)
            if favorites_only:
                query = query.where('is_favorite', '==', True)

            docs = list(query.stream())
            rides = [r for r in (_doc_to_saved_ride(d) for d in docs) if r is not None]
            rides.sort(key=lambda r: (not r.is_favorite, -r.last_ridden_at.timestamp()))

            total = len(rides)
            start = (page - 1) * page_size
            end = start + page_size
            return rides[start:end], total

        except Exception as e:
            logger.error(f"Failed to list spin rides: {e}")
            return [], 0

    async def get_spin_ride(
        self,
        user_id: str,
        ride_id: str,
    ) -> Optional[SavedSpinRide]:
        """Fetch one saved ride by ID."""
        if not self.is_available():
            return None

        try:
            doc = self._spin_rides_collection(user_id).document(ride_id).get()
            if not doc.exists:
                return None
            return _doc_to_saved_ride(doc)

        except Exception as e:
            logger.error(f"Failed to get spin ride {ride_id}: {e}")
            return None

    async def update_spin_ride(
        self,
        user_id: str,
        ride_id: str,
        update: UpdateSavedSpinRideRequest,
    ) -> Optional[SavedSpinRide]:
        """Toggle favorite, bump completion_count, or update actual_seconds."""
        if not self.is_available():
            return None

        try:
            doc_ref = self._spin_rides_collection(user_id).document(ride_id)
            current = doc_ref.get()
            if not current.exists:
                return None

            patch: dict = {}
            if update.is_favorite is not None:
                patch['is_favorite'] = update.is_favorite
            if update.increment_completion:
                patch['completion_count'] = firestore.Increment(1)
                patch['last_ridden_at'] = firestore.SERVER_TIMESTAMP
            if update.last_actual_seconds is not None:
                patch['last_actual_seconds'] = update.last_actual_seconds

            if not patch:
                return _doc_to_saved_ride(current)

            doc_ref.update(patch)
            return _doc_to_saved_ride(doc_ref.get())

        except Exception as e:
            logger.error(f"Failed to update spin ride {ride_id}: {e}")
            return None

    async def delete_spin_ride(self, user_id: str, ride_id: str) -> bool:
        """Permanently delete a saved ride."""
        if not self.is_available():
            return False

        try:
            doc_ref = self._spin_rides_collection(user_id).document(ride_id)
            if not doc_ref.get().exists:
                return False
            doc_ref.delete()
            return True

        except Exception as e:
            logger.error(f"Failed to delete spin ride {ride_id}: {e}")
            return False
