"""
Firestore Cardio Session Operations
Mixin providing cardio session CRUD functionality
"""

import logging
from typing import List, Optional, Any

try:
    from firebase_admin import firestore
except ImportError:
    firestore = None

logger = logging.getLogger(__name__)


class FirestoreCardioOps:
    """Mixin for cardio session CRUD operations"""

    async def create_cardio_session(self, user_id: str, session_request) -> Optional[Any]:
        """Create a new cardio session"""
        if not self.is_available():
            logger.warning("Firestore not available - cannot create cardio session")
            return None

        try:
            from ..models import CardioSession

            # Create session object
            session = CardioSession(
                activity_type=session_request.activity_type,
                activity_name=getattr(session_request, 'activity_name', None),
                started_at=session_request.started_at,
                completed_at=getattr(session_request, 'completed_at', None),
                duration_minutes=session_request.duration_minutes,
                distance=getattr(session_request, 'distance', None),
                distance_unit=getattr(session_request, 'distance_unit', 'mi'),
                pace_per_unit=getattr(session_request, 'pace_per_unit', None),
                avg_heart_rate=getattr(session_request, 'avg_heart_rate', None),
                max_heart_rate=getattr(session_request, 'max_heart_rate', None),
                calories=getattr(session_request, 'calories', None),
                rpe=getattr(session_request, 'rpe', None),
                elevation_gain=getattr(session_request, 'elevation_gain', None),
                elevation_unit=getattr(session_request, 'elevation_unit', 'ft'),
                activity_details=getattr(session_request, 'activity_details', {}),
                notes=getattr(session_request, 'notes', None),
                status="completed"
            )

            # Save to Firestore
            session_ref = (self.db.collection('users')
                          .document(user_id)
                          .collection('cardio_sessions')
                          .document(session.id))

            session_data = session.model_dump()
            session_data['started_at'] = session.started_at
            session_data['created_at'] = firestore.SERVER_TIMESTAMP

            session_ref.set(session_data)

            logger.info(f"Created cardio session {session.id} for user {user_id}")
            return session

        except Exception as e:
            logger.error(f"Failed to create cardio session: {str(e)}")
            return None

    async def get_cardio_session(self, user_id: str, session_id: str) -> Optional[Any]:
        """Get a single cardio session by ID"""
        if not self.is_available():
            return None

        try:
            from ..models import CardioSession

            session_ref = (self.db.collection('users')
                          .document(user_id)
                          .collection('cardio_sessions')
                          .document(session_id))

            doc = session_ref.get()
            if not doc.exists:
                return None

            session_data = doc.to_dict()
            return CardioSession(**session_data)

        except Exception as e:
            logger.error(f"Failed to get cardio session {session_id}: {str(e)}")
            return None

    async def get_user_cardio_sessions(
        self,
        user_id: str,
        activity_type: Optional[str] = None,
        limit: int = 20
    ) -> List[Any]:
        """Get user's cardio sessions with optional filtering"""
        if not self.is_available():
            return []

        try:
            from ..models import CardioSession

            sessions_ref = (self.db.collection('users')
                           .document(user_id)
                           .collection('cardio_sessions'))

            # Apply filters
            if activity_type:
                sessions_ref = sessions_ref.where('activity_type', '==', activity_type)

            # Order by started_at descending and limit
            sessions_ref = (sessions_ref
                           .order_by('started_at', direction=firestore.Query.DESCENDING)
                           .limit(limit))

            docs = sessions_ref.stream()
            sessions = []

            for doc in docs:
                try:
                    session_data = doc.to_dict()
                    session = CardioSession(**session_data)
                    sessions.append(session)
                except Exception as e:
                    logger.warning(f"Failed to parse cardio session {doc.id}: {str(e)}")
                    continue

            logger.info(f"Retrieved {len(sessions)} cardio sessions for user {user_id}")
            return sessions

        except Exception as e:
            logger.error(f"Failed to get user cardio sessions: {str(e)}")
            return []

    async def update_cardio_session(self, user_id: str, session_id: str, update_request) -> Optional[Any]:
        """Update a cardio session"""
        if not self.is_available():
            return None

        try:
            session_ref = (self.db.collection('users')
                          .document(user_id)
                          .collection('cardio_sessions')
                          .document(session_id))

            # Check if session exists
            current_doc = session_ref.get()
            if not current_doc.exists:
                logger.warning(f"Cardio session {session_id} not found for update")
                return None

            # Prepare update data
            update_data = update_request.model_dump(exclude_unset=True)

            session_ref.update(update_data)

            # Get updated session
            return await self.get_cardio_session(user_id, session_id)

        except Exception as e:
            logger.error(f"Failed to update cardio session: {str(e)}")
            return None

    async def edit_cardio_session(self, user_id: str, session_id: str, edit_request) -> Optional[Any]:
        """Edit a completed cardio session including date/time fields"""
        if not self.is_available():
            return None

        try:
            session_ref = (self.db.collection('users')
                          .document(user_id)
                          .collection('cardio_sessions')
                          .document(session_id))

            current_doc = session_ref.get()
            if not current_doc.exists:
                logger.warning(f"Cardio session {session_id} not found for edit")
                return None

            update_data = edit_request.model_dump(exclude_unset=True)

            # Recalculate duration if dates changed and duration not explicitly set
            if 'duration_minutes' not in update_data and (
                'started_at' in update_data or 'completed_at' in update_data
            ):
                current_data = current_doc.to_dict()
                new_started = update_data.get('started_at', current_data.get('started_at'))
                new_completed = update_data.get('completed_at', current_data.get('completed_at'))

                if new_started and new_completed:
                    sa = new_started.replace(tzinfo=None) if hasattr(new_started, 'replace') and getattr(new_started, 'tzinfo', None) else new_started
                    ca = new_completed.replace(tzinfo=None) if hasattr(new_completed, 'replace') and getattr(new_completed, 'tzinfo', None) else new_completed
                    update_data['duration_minutes'] = max(1, int((ca - sa).total_seconds() / 60))

            session_ref.update(update_data)

            logger.info(f"Edited cardio session {session_id} for user {user_id}")
            return await self.get_cardio_session(user_id, session_id)

        except Exception as e:
            logger.error(f"Failed to edit cardio session: {str(e)}")
            return None

    async def delete_cardio_session(self, user_id: str, session_id: str) -> bool:
        """Delete a cardio session"""
        if not self.is_available():
            return False

        try:
            session_ref = (self.db.collection('users')
                          .document(user_id)
                          .collection('cardio_sessions')
                          .document(session_id))

            session_ref.delete()

            logger.info(f"Deleted cardio session {session_id} for user {user_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to delete cardio session: {str(e)}")
            return False
