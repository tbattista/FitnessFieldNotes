"""
Firestore Program CRUD Operations
Mixin providing program create/read/update/delete and program-workout management
"""

import logging
from typing import Dict, List, Optional, Any

try:
    from firebase_admin import firestore
except ImportError:
    firestore = None

from ..models import Program, CreateProgramRequest, UpdateProgramRequest, ProgramWorkout

logger = logging.getLogger(__name__)


class FirestoreProgramOps:
    """Mixin for program CRUD and program-workout management operations"""

    async def create_program(self, user_id: str, program_request: CreateProgramRequest) -> Optional[Program]:
        """Create a new program for user"""
        if not self.is_available():
            logger.warning("Firestore not available - cannot create program")
            return None

        try:
            # Create program object
            program = Program(
                name=program_request.name,
                description=program_request.description,
                duration_weeks=program_request.duration_weeks,
                difficulty_level=program_request.difficulty_level,
                tags=program_request.tags,
                tracker_enabled=getattr(program_request, 'tracker_enabled', False),
                tracker_goal=getattr(program_request, 'tracker_goal', None)
            )

            # Save to Firestore
            program_ref = self.db.collection('users').document(user_id).collection('programs').document(program.id)
            program_data = program.model_dump()

            # Convert datetime objects to timestamps
            program_data['created_date'] = firestore.SERVER_TIMESTAMP
            program_data['modified_date'] = firestore.SERVER_TIMESTAMP
            program_data['version'] = 1
            program_data['sync_status'] = 'synced'

            program_ref.set(program_data)

            # Update user stats
            await self._increment_user_program_count(user_id)

            logger.info(f"Created program {program.id} for user {user_id}")
            return program

        except Exception as e:
            logger.error(f"Failed to create program: {str(e)}")
            return None

    async def get_user_programs(self, user_id: str, limit: int = 20) -> List[Program]:
        """Get all programs for a user"""
        if not self.is_available():
            return []

        try:
            programs_ref = (self.db.collection('users')
                          .document(user_id)
                          .collection('programs')
                          .order_by('modified_date', direction=firestore.Query.DESCENDING)
                          .limit(limit))

            docs = programs_ref.stream()
            programs = []

            for doc in docs:
                try:
                    program_data = doc.to_dict()
                    program = Program(**program_data)
                    programs.append(program)
                except Exception as e:
                    logger.warning(f"Failed to parse program {doc.id}: {str(e)}")
                    continue

            logger.info(f"Retrieved {len(programs)} programs for user {user_id}")
            return programs

        except Exception as e:
            logger.error(f"Failed to get user programs: {str(e)}")
            return []

    async def get_program(self, user_id: str, program_id: str) -> Optional[Program]:
        """Get a specific program by ID"""
        if not self.is_available():
            return None

        try:
            program_ref = (self.db.collection('users')
                          .document(user_id)
                          .collection('programs')
                          .document(program_id))

            doc = program_ref.get()

            if doc.exists:
                program_data = doc.to_dict()
                return Program(**program_data)
            else:
                logger.info(f"Program {program_id} not found for user {user_id}")
                return None

        except Exception as e:
            logger.error(f"Failed to get program: {str(e)}")
            return None

    async def update_program(self, user_id: str, program_id: str, update_request: UpdateProgramRequest) -> Optional[Program]:
        """Update a program"""
        if not self.is_available():
            return None

        try:
            program_ref = (self.db.collection('users')
                          .document(user_id)
                          .collection('programs')
                          .document(program_id))

            # Get current program for version checking
            current_doc = program_ref.get()
            if not current_doc.exists:
                logger.warning(f"Program {program_id} not found for update")
                return None

            current_data = current_doc.to_dict()
            current_version = current_data.get('version', 1)

            # Prepare update data
            update_data = update_request.model_dump(exclude_unset=True)
            update_data['modified_date'] = firestore.SERVER_TIMESTAMP
            update_data['version'] = current_version + 1
            update_data['sync_status'] = 'synced'

            program_ref.update(update_data)

            # Get updated program
            return await self.get_program(user_id, program_id)

        except Exception as e:
            logger.error(f"Failed to update program: {str(e)}")
            return None

    async def delete_program(self, user_id: str, program_id: str) -> bool:
        """Delete a program"""
        if not self.is_available():
            return False

        try:
            program_ref = (self.db.collection('users')
                          .document(user_id)
                          .collection('programs')
                          .document(program_id))

            program_ref.delete()

            # Update user stats
            await self._decrement_user_program_count(user_id)

            logger.info(f"Deleted program {program_id} for user {user_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to delete program: {str(e)}")
            return False

    async def get_program_with_workout_details(self, user_id: str, program_id: str) -> Optional[Dict[str, Any]]:
        """Get program with full workout details"""
        program = await self.get_program(user_id, program_id)
        if not program:
            return None

        workout_details = []
        for pw in program.workouts:
            workout = await self.get_workout(user_id, pw.workout_id)
            if workout:
                workout_details.append(workout)

        return {
            "program": program,
            "workout_details": workout_details
        }

    # Program-Workout Management

    async def add_workout_to_program(self, user_id: str, program_id: str, workout_id: str,
                                   order_index: Optional[int] = None, custom_name: Optional[str] = None,
                                   custom_date: Optional[str] = None) -> Optional[Program]:
        """Add a workout to a program"""
        program = await self.get_program(user_id, program_id)
        if not program:
            return None

        # Verify workout exists
        if not await self.get_workout(user_id, workout_id):
            return None

        # Determine order index
        if order_index is None:
            order_index = len(program.workouts)

        # Create program workout entry
        program_workout = ProgramWorkout(
            workout_id=workout_id,
            order_index=order_index,
            custom_name=custom_name,
            custom_date=custom_date
        )

        # Insert at specified position
        program.workouts.insert(order_index, program_workout)

        # Reorder indices to maintain consistency
        for i, pw in enumerate(program.workouts):
            pw.order_index = i

        # Update program
        update_request = UpdateProgramRequest(workouts=program.workouts)
        return await self.update_program(user_id, program_id, update_request)

    async def remove_workout_from_program(self, user_id: str, program_id: str, workout_id: str) -> Optional[Program]:
        """Remove a workout from a program"""
        program = await self.get_program(user_id, program_id)
        if not program:
            return None

        # Remove workout
        original_length = len(program.workouts)
        program.workouts = [pw for pw in program.workouts if pw.workout_id != workout_id]

        if len(program.workouts) == original_length:
            return None  # Workout not found in program

        # Reorder indices
        for i, pw in enumerate(program.workouts):
            pw.order_index = i

        # Update program
        update_request = UpdateProgramRequest(workouts=program.workouts)
        return await self.update_program(user_id, program_id, update_request)
