"""
Firestore Data Service - Orchestrator
Composes domain-specific mixins into a single service with shared initialization.
Handles user profiles, migration, search, and stat counters directly.

Domain operations are provided by mixin classes:
  - FirestoreWorkoutOps:  workout CRUD (firestore_workout_ops.py)
  - FirestoreProgramOps:  program CRUD + program-workout management (firestore_program_ops.py)
  - FirestoreSessionOps:  workout sessions + exercise history (firestore_session_ops.py)
  - FirestoreCardioOps:   cardio sessions (firestore_cardio_ops.py)
"""

import logging
import traceback
from typing import Dict, List, Optional, Any
from datetime import datetime

# Set up logging
logger = logging.getLogger(__name__)

try:
    from firebase_admin import firestore
    FIRESTORE_AVAILABLE = True
    logger.info("Firestore data service: firestore module imported successfully")
except ImportError as e:
    FIRESTORE_AVAILABLE = False
    firestore = None
    logger.error(f"Firestore data service: Failed to import firestore - {str(e)}")
    logger.error(f"Traceback: {traceback.format_exc()}")

from ..config.firebase_config import get_firebase_app
from ..models import (
    Program, WorkoutTemplate, CreateWorkoutRequest, CreateProgramRequest,
    UpdateWorkoutRequest, UpdateProgramRequest, ProgramWorkout
)

from .firestore_workout_ops import FirestoreWorkoutOps
from .firestore_program_ops import FirestoreProgramOps
from .firestore_session_ops import FirestoreSessionOps
from .firestore_cardio_ops import FirestoreCardioOps
from .firestore_spin_ride_ops import FirestoreSpinRideOps


class FirestoreDataService(
    FirestoreWorkoutOps,
    FirestoreProgramOps,
    FirestoreSessionOps,
    FirestoreCardioOps,
    FirestoreSpinRideOps
):
    """
    Firestore service composing all domain operations.
    Supports real-time sync, conflict resolution, and offline capabilities.
    """

    def __init__(self):
        """Initialize Firestore data service"""
        if not FIRESTORE_AVAILABLE:
            logger.warning("Firebase Admin SDK not available - Firestore data service disabled")
            self.db = None
            self.available = False
            self.app = None
            return

        try:
            self.app = get_firebase_app()
            if self.app:
                self.db = firestore.client(app=self.app)
                self.available = True
                logger.info("Firestore data service initialized successfully")
            else:
                self.db = None
                self.available = False
                logger.warning("Firestore data service not available - Firebase not initialized")
        except Exception as e:
            logger.error(f"Failed to initialize Firestore data service: {str(e)}")
            self.db = None
            self.available = False

    def is_available(self) -> bool:
        """Check if Firestore service is available"""
        return self.available and self.db is not None

    # ========================================================================
    # User Profile Operations
    # ========================================================================

    async def create_user_profile(self, user_id: str, user_data: Dict[str, Any]) -> bool:
        """Create user profile in Firestore"""
        if not self.is_available():
            logger.warning("Firestore not available - cannot create user profile")
            return False

        try:
            user_ref = self.db.collection('users').document(user_id)

            profile_data = {
                'uid': user_id,
                'email': user_data.get('email'),
                'displayName': user_data.get('displayName'),
                'createdAt': firestore.SERVER_TIMESTAMP,
                'lastLoginAt': firestore.SERVER_TIMESTAMP,
                'preferences': {
                    'theme': 'dark',
                    'defaultUnits': 'metric',
                    'autoBackup': True,
                    'realTimeSync': True
                },
                'subscription': {
                    'plan': 'free',
                    'expiresAt': None
                },
                'stats': {
                    'totalPrograms': 0,
                    'totalWorkouts': 0,
                    'lastActivity': firestore.SERVER_TIMESTAMP
                }
            }

            user_ref.set(profile_data)
            logger.info(f"Created user profile for user: {user_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to create user profile: {str(e)}")
            return False

    async def get_user_profile(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get user profile from Firestore"""
        if not self.is_available():
            return None

        try:
            user_ref = self.db.collection('users').document(user_id)
            doc = user_ref.get()

            if doc.exists:
                return doc.to_dict()
            else:
                logger.info(f"User profile not found: {user_id}")
                return None

        except Exception as e:
            logger.error(f"Failed to get user profile: {str(e)}")
            return None

    async def update_user_stats(self, user_id: str, stats_update: Dict[str, Any]) -> bool:
        """Update user statistics"""
        if not self.is_available():
            return False

        try:
            user_ref = self.db.collection('users').document(user_id)
            user_ref.update({
                'stats': stats_update,
                'lastActivity': firestore.SERVER_TIMESTAMP
            })
            return True
        except Exception as e:
            logger.error(f"Failed to update user stats: {str(e)}")
            return False

    # ========================================================================
    # Search Operations
    # ========================================================================

    async def search_workouts(self, user_id: str, query: str, limit: int = 50) -> List[WorkoutTemplate]:
        """Search workouts by name, description, or tags"""
        if not self.is_available():
            return []

        try:
            workouts = await self.get_user_workouts(user_id, limit=limit)

            query_lower = query.lower()
            matching_workouts = []

            for workout in workouts:
                if (query_lower in workout.name.lower() or
                    query_lower in workout.description.lower() or
                    any(query_lower in tag.lower() for tag in workout.tags)):
                    matching_workouts.append(workout)

            return matching_workouts

        except Exception as e:
            logger.error(f"Failed to search workouts: {str(e)}")
            return []

    async def search_programs(self, user_id: str, query: str, limit: int = 20) -> List[Program]:
        """Search programs by name, description, or tags"""
        if not self.is_available():
            return []

        try:
            programs = await self.get_user_programs(user_id, limit=limit)

            query_lower = query.lower()
            matching_programs = []

            for program in programs:
                if (query_lower in program.name.lower() or
                    query_lower in program.description.lower() or
                    any(query_lower in tag.lower() for tag in program.tags)):
                    matching_programs.append(program)

            return matching_programs

        except Exception as e:
            logger.error(f"Failed to search programs: {str(e)}")
            return []

    # ========================================================================
    # Data Migration Support
    # ========================================================================

    async def migrate_anonymous_data(self, user_id: str, programs_data: List[Dict], workouts_data: List[Dict]) -> Dict[str, Any]:
        """Migrate anonymous user data to authenticated account"""
        if not self.is_available():
            logger.warning("Firestore not available - cannot migrate data")
            return {"success": False, "error": "Firestore not available"}

        try:
            batch = self.db.batch()
            migrated_programs = 0
            migrated_workouts = 0
            errors = []

            # Migrate workouts first
            for workout_data in workouts_data:
                try:
                    # Remove old IDs and timestamps
                    workout_data.pop('id', None)
                    workout_data.pop('created_date', None)
                    workout_data.pop('modified_date', None)

                    # Create new workout
                    workout = WorkoutTemplate(**workout_data)
                    workout_ref = (self.db.collection('users')
                                 .document(user_id)
                                 .collection('workouts')
                                 .document(workout.id))

                    workout_dict = workout.model_dump()
                    workout_dict['created_date'] = firestore.SERVER_TIMESTAMP
                    workout_dict['modified_date'] = firestore.SERVER_TIMESTAMP
                    workout_dict['migrated_at'] = firestore.SERVER_TIMESTAMP
                    workout_dict['version'] = 1
                    workout_dict['sync_status'] = 'synced'

                    batch.set(workout_ref, workout_dict)
                    migrated_workouts += 1

                except Exception as e:
                    logger.warning(f"Failed to migrate workout: {str(e)}")
                    errors.append(f"Workout migration error: {str(e)}")
                    continue

            # Migrate programs
            for program_data in programs_data:
                try:
                    # Remove old IDs and timestamps
                    program_data.pop('id', None)
                    program_data.pop('created_date', None)
                    program_data.pop('modified_date', None)

                    # Create new program
                    program = Program(**program_data)
                    program_ref = (self.db.collection('users')
                                 .document(user_id)
                                 .collection('programs')
                                 .document(program.id))

                    program_dict = program.model_dump()
                    program_dict['created_date'] = firestore.SERVER_TIMESTAMP
                    program_dict['modified_date'] = firestore.SERVER_TIMESTAMP
                    program_dict['migrated_at'] = firestore.SERVER_TIMESTAMP
                    program_dict['version'] = 1
                    program_dict['sync_status'] = 'synced'

                    batch.set(program_ref, program_dict)
                    migrated_programs += 1

                except Exception as e:
                    logger.warning(f"Failed to migrate program: {str(e)}")
                    errors.append(f"Program migration error: {str(e)}")
                    continue

            # Commit batch
            batch.commit()

            # Update user stats
            await self.update_user_stats(user_id, {
                'totalPrograms': migrated_programs,
                'totalWorkouts': migrated_workouts,
                'lastMigration': firestore.SERVER_TIMESTAMP
            })

            logger.info(f"Successfully migrated data for user {user_id}: {migrated_programs} programs, {migrated_workouts} workouts")

            return {
                "success": True,
                "migrated_programs": migrated_programs,
                "migrated_workouts": migrated_workouts,
                "errors": errors
            }

        except Exception as e:
            logger.error(f"Failed to migrate anonymous data: {str(e)}")
            return {"success": False, "error": str(e)}

    # ========================================================================
    # Private Stat Counter Helpers
    # ========================================================================

    async def _increment_user_program_count(self, user_id: str):
        """Increment user program count"""
        try:
            user_ref = self.db.collection('users').document(user_id)
            user_ref.update({
                'stats.totalPrograms': firestore.Increment(1),
                'stats.lastActivity': firestore.SERVER_TIMESTAMP
            })
        except Exception as e:
            logger.warning(f"Failed to increment program count: {str(e)}")

    async def _decrement_user_program_count(self, user_id: str):
        """Decrement user program count"""
        try:
            user_ref = self.db.collection('users').document(user_id)
            user_ref.update({
                'stats.totalPrograms': firestore.Increment(-1),
                'stats.lastActivity': firestore.SERVER_TIMESTAMP
            })
        except Exception as e:
            logger.warning(f"Failed to decrement program count: {str(e)}")

    async def _increment_user_workout_count(self, user_id: str):
        """Increment user workout count"""
        try:
            user_ref = self.db.collection('users').document(user_id)
            user_ref.update({
                'stats.totalWorkouts': firestore.Increment(1),
                'stats.lastActivity': firestore.SERVER_TIMESTAMP
            })
        except Exception as e:
            logger.warning(f"Failed to increment workout count: {str(e)}")

    async def _decrement_user_workout_count(self, user_id: str):
        """Decrement user workout count"""
        try:
            user_ref = self.db.collection('users').document(user_id)
            user_ref.update({
                'stats.totalWorkouts': firestore.Increment(-1),
                'stats.lastActivity': firestore.SERVER_TIMESTAMP
            })
        except Exception as e:
            logger.warning(f"Failed to decrement workout count: {str(e)}")


# Global Firestore data service instance
firestore_data_service = FirestoreDataService()
