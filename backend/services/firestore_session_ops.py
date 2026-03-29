"""
Firestore Workout Session & Exercise History Operations
Mixin providing session lifecycle, exercise tracking, and history management
"""

import asyncio
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone

try:
    from firebase_admin import firestore
except ImportError:
    firestore = None

logger = logging.getLogger(__name__)


class FirestoreSessionOps:
    """Mixin for workout session and exercise history operations"""

    # ========================================================================
    # Workout Session Management
    # ========================================================================

    async def create_workout_session(self, user_id: str, session_request) -> Optional[Any]:
        """Create a new workout session (draft state)"""
        if not self.is_available():
            logger.warning("Firestore not available - cannot create workout session")
            return None

        try:
            from ..models import WorkoutSession

            # Create session object
            session = WorkoutSession(
                workout_id=session_request.workout_id,
                workout_name=session_request.workout_name,
                started_at=session_request.started_at,
                status="in_progress",
                session_mode=getattr(session_request, 'session_mode', 'timed'),
                program_id=getattr(session_request, 'program_id', None)
            )

            # Save to Firestore
            session_ref = (self.db.collection('users')
                          .document(user_id)
                          .collection('workout_sessions')
                          .document(session.id))

            session_data = session.model_dump()
            session_data['started_at'] = session.started_at
            session_data['created_at'] = firestore.SERVER_TIMESTAMP

            session_ref.set(session_data)

            logger.info(f"Created workout session {session.id} for user {user_id}")
            return session

        except Exception as e:
            logger.error(f"Failed to create workout session: {str(e)}")
            return None

    async def get_workout_session(self, user_id: str, session_id: str) -> Optional[Any]:
        """Get a specific workout session"""
        if not self.is_available():
            return None

        try:
            from ..models import WorkoutSession

            session_ref = (self.db.collection('users')
                          .document(user_id)
                          .collection('workout_sessions')
                          .document(session_id))

            doc = session_ref.get()

            if doc.exists:
                session_data = doc.to_dict()
                return WorkoutSession(**session_data)
            else:
                logger.info(f"Workout session {session_id} not found for user {user_id}")
                return None

        except Exception as e:
            logger.error(f"Failed to get workout session: {str(e)}")
            return None

    async def update_workout_session(self, user_id: str, session_id: str, update_request) -> Optional[Any]:
        """Update session progress (auto-save during workout)"""
        if not self.is_available():
            return None

        try:
            session_ref = (self.db.collection('users')
                          .document(user_id)
                          .collection('workout_sessions')
                          .document(session_id))

            # Check if session exists
            current_doc = session_ref.get()
            if not current_doc.exists:
                logger.warning(f"Workout session {session_id} not found for update")
                return None

            # Prepare update data
            update_data = update_request.model_dump(exclude_unset=True)

            # Convert exercises_performed to dict format if present
            if 'exercises_performed' in update_data and update_data['exercises_performed']:
                update_data['exercises_performed'] = [
                    ex.model_dump() if hasattr(ex, 'model_dump') else ex
                    for ex in update_data['exercises_performed']
                ]

            session_ref.update(update_data)

            # Get updated session
            return await self.get_workout_session(user_id, session_id)

        except Exception as e:
            logger.error(f"Failed to update workout session: {str(e)}")
            return None

    async def complete_workout_session(self, user_id: str, session_id: str, complete_request) -> Optional[Any]:
        """Finalize workout session and update exercise history"""
        if not self.is_available():
            return None

        try:
            from ..models import WorkoutSession

            session_ref = (self.db.collection('users')
                          .document(user_id)
                          .collection('workout_sessions')
                          .document(session_id))

            # Check if session exists
            current_doc = session_ref.get()
            if not current_doc.exists:
                logger.info(f"Session {session_id} not found for user {user_id}")
                return None

            current_data = current_doc.to_dict()

            # Always capture completed_at from the request (defaults to now)
            completed_at = complete_request.completed_at

            # Calculate duration
            # For quick_log sessions, use manual duration if provided
            manual_duration = getattr(complete_request, 'duration_minutes', None)
            if manual_duration is not None:
                # Use manually provided duration (for quick_log sessions)
                duration_minutes = manual_duration
                logger.info(f"Using manual duration: {duration_minutes} minutes")
            else:
                # Auto-calculate from timestamps (for timed sessions)
                started_at = current_data.get('started_at')
                duration_minutes = None

                if started_at and completed_at:
                    # Ensure both datetimes are timezone-naive for comparison
                    if hasattr(started_at, 'replace') and started_at.tzinfo is not None:
                        started_at = started_at.replace(tzinfo=None)
                    calc_completed = completed_at
                    if hasattr(calc_completed, 'replace') and calc_completed.tzinfo is not None:
                        calc_completed = calc_completed.replace(tzinfo=None)

                    duration = calc_completed - started_at
                    duration_minutes = int(duration.total_seconds() / 60)

            # Prepare completion data
            completion_data = {
                'completed_at': completed_at,
                'duration_minutes': duration_minutes,
                'exercises_performed': [
                    ex.model_dump() if hasattr(ex, 'model_dump') else ex
                    for ex in complete_request.exercises_performed
                ],
                'status': 'completed'
            }

            if complete_request.notes:
                completion_data['notes'] = complete_request.notes

            # Save session notes if provided
            if hasattr(complete_request, 'session_notes') and complete_request.session_notes:
                completion_data['session_notes'] = [
                    note.model_dump() if hasattr(note, 'model_dump') else note
                    for note in complete_request.session_notes
                ]
                logger.info(f"Saving {len(complete_request.session_notes)} session notes")

            # Save custom exercise order if provided (Phase 3 - Exercise Reordering)
            if hasattr(complete_request, 'exercise_order') and complete_request.exercise_order:
                completion_data['exercise_order'] = complete_request.exercise_order
                logger.info(f"Saving custom exercise order with {len(complete_request.exercise_order)} exercises")

            # Update session
            session_ref.update(completion_data)

            # Get completed session
            completed_session = await self.get_workout_session(user_id, session_id)

            # Update exercise histories in the background to avoid timeout
            if completed_session:
                asyncio.create_task(
                    self._update_histories_background(user_id, session_id, completed_session)
                )

            logger.info(f"Completed workout session {session_id} for user {user_id}")
            return completed_session

        except Exception as e:
            logger.error(f"Failed to complete workout session: {str(e)}")
            return None

    async def _update_histories_background(self, user_id: str, session_id: str, completed_session) -> None:
        """Run exercise history and personal record updates in the background."""
        try:
            await self._update_exercise_histories_batch(user_id, completed_session)
            await self._auto_update_personal_records(user_id, completed_session)
            logger.info(f"Background history updates completed for session {session_id}")
        except Exception as e:
            logger.error(f"Background history update failed for session {session_id}: {str(e)}")

    async def create_and_complete_workout_session(self, user_id: str, request) -> Optional[Any]:
        """
        Atomically create and complete a workout session in a single write.
        Used for recovery scenarios where the original session was lost.
        """
        if not self.is_available():
            return None

        try:
            from ..models import WorkoutSession

            # Calculate duration
            if request.duration_minutes is not None:
                duration_minutes = request.duration_minutes
                logger.info(f"Using manual duration: {duration_minutes} minutes")
            else:
                started_at = request.started_at
                completed_at = request.completed_at or datetime.now(timezone.utc)

                # Ensure both datetimes are timezone-naive for comparison
                if hasattr(started_at, 'replace') and started_at.tzinfo is not None:
                    started_at = started_at.replace(tzinfo=None)
                if hasattr(completed_at, 'replace') and completed_at.tzinfo is not None:
                    completed_at = completed_at.replace(tzinfo=None)

                duration = completed_at - started_at
                duration_minutes = int(duration.total_seconds() / 60)
                logger.info(f"Auto-calculated duration: {duration_minutes} minutes")

            # Create session with completed status directly
            session = WorkoutSession(
                workout_id=request.workout_id,
                workout_name=request.workout_name,
                started_at=request.started_at,
                completed_at=request.completed_at or datetime.now(),
                status="completed",
                session_mode=request.session_mode,
                program_id=getattr(request, 'program_id', None),
                exercises_performed=[
                    ex.model_dump() if hasattr(ex, 'model_dump') else ex
                    for ex in request.exercises_performed
                ],
                notes=request.notes,
                session_notes=[
                    note.model_dump() if hasattr(note, 'model_dump') else note
                    for note in (request.session_notes or [])
                ],
                exercise_order=request.exercise_order,
                duration_minutes=duration_minutes
            )

            # Single write with completed state
            session_ref = (self.db.collection('users')
                          .document(user_id)
                          .collection('workout_sessions')
                          .document(session.id))

            session_data = session.model_dump()
            session_data['created_at'] = firestore.SERVER_TIMESTAMP
            session_ref.set(session_data)

            logger.info(f"Atomically created and completed session {session.id} for user {user_id}")

            # Update exercise histories in the background to avoid timeout
            asyncio.create_task(
                self._update_histories_background(user_id, session.id, session)
            )

            return session

        except Exception as e:
            logger.error(f"Failed to create-and-complete workout session: {str(e)}")
            return None

    async def get_user_sessions(
        self,
        user_id: str,
        workout_id: Optional[str] = None,
        limit: int = 20,
        status: Optional[str] = None
    ) -> List[Any]:
        """Get user's workout sessions with optional filtering"""
        if not self.is_available():
            return []

        try:
            from ..models import WorkoutSession

            sessions_ref = (self.db.collection('users')
                           .document(user_id)
                           .collection('workout_sessions'))

            # Apply filters
            if workout_id:
                sessions_ref = sessions_ref.where('workout_id', '==', workout_id)

            if status:
                sessions_ref = sessions_ref.where('status', '==', status)

            # Order by started_at descending and limit
            sessions_ref = (sessions_ref
                           .order_by('started_at', direction=firestore.Query.DESCENDING)
                           .limit(limit))

            docs = sessions_ref.stream()
            sessions = []

            for doc in docs:
                try:
                    session_data = doc.to_dict()
                    session = WorkoutSession(**session_data)
                    sessions.append(session)
                except Exception as e:
                    logger.warning(f"Failed to parse workout session {doc.id}: {str(e)}")
                    continue

            logger.info(f"Retrieved {len(sessions)} workout sessions for user {user_id}")
            return sessions

        except Exception as e:
            logger.error(f"Failed to get user workout sessions: {str(e)}")
            return []

    async def delete_workout_session(self, user_id: str, session_id: str) -> bool:
        """Delete a workout session"""
        if not self.is_available():
            return False

        try:
            session_ref = (self.db.collection('users')
                          .document(user_id)
                          .collection('workout_sessions')
                          .document(session_id))

            session_ref.delete()

            logger.info(f"Deleted workout session {session_id} for user {user_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to delete workout session: {str(e)}")
            return False

    # ========================================================================
    # Exercise History Management
    # ========================================================================

    async def get_exercise_history_for_workout(self, user_id: str, workout_id: str) -> Dict[str, Any]:
        """Get last weights for all exercises in a workout"""
        if not self.is_available():
            return {}

        try:
            from ..models import ExerciseHistory

            # Query all exercise histories for this workout
            history_ref = (self.db.collection('users')
                          .document(user_id)
                          .collection('exercise_history')
                          .where('workout_id', '==', workout_id))

            docs = history_ref.stream()
            histories = {}

            for doc in docs:
                try:
                    history_data = doc.to_dict()
                    history = ExerciseHistory(**history_data)
                    histories[history.exercise_name] = history
                except Exception as e:
                    logger.warning(f"Failed to parse exercise history {doc.id}: {str(e)}")
                    continue

            logger.info(f"Retrieved {len(histories)} exercise histories for workout {workout_id}")
            return histories

        except Exception as e:
            logger.error(f"Failed to get exercise history for workout: {str(e)}")
            return {}

    async def get_exercise_history(
        self,
        user_id: str,
        workout_id: str,
        exercise_name: str
    ) -> Optional[Any]:
        """Get history for specific exercise in workout"""
        if not self.is_available():
            return None

        try:
            from ..models import ExerciseHistory

            history_id = f"{workout_id}_{exercise_name}"
            history_ref = (self.db.collection('users')
                          .document(user_id)
                          .collection('exercise_history')
                          .document(history_id))

            doc = history_ref.get()

            if doc.exists:
                history_data = doc.to_dict()
                return ExerciseHistory(**history_data)
            else:
                return None

        except Exception as e:
            logger.error(f"Failed to get exercise history: {str(e)}")
            return None

    async def update_exercise_history(
        self,
        user_id: str,
        workout_id: str,
        exercise_name: str,
        session_data: Dict[str, Any],
        next_weight_direction: Optional[str] = None
    ) -> bool:
        """Update exercise history after session completion"""
        if not self.is_available():
            return False

        try:
            from ..models import ExerciseHistory

            history_id = f"{workout_id}_{exercise_name}"
            history_ref = (self.db.collection('users')
                          .document(user_id)
                          .collection('exercise_history')
                          .document(history_id))

            # Get existing history or create new
            doc = history_ref.get()

            if doc.exists:
                # Update existing history
                current_history = doc.to_dict()

                # Update recent sessions (keep last 5)
                recent_sessions = current_history.get('recent_sessions', [])
                recent_sessions.insert(0, session_data)
                recent_sessions = recent_sessions[:5]  # Keep only last 5

                # Check if this is a new PR
                best_weight = current_history.get('best_weight')
                new_weight = session_data.get('weight')

                update_data = {
                    'last_weight': new_weight,
                    'last_weight_unit': session_data.get('weight_unit', 'lbs'),
                    'last_session_id': session_data.get('session_id'),
                    'last_session_date': session_data.get('date'),
                    'last_weight_direction': next_weight_direction,
                    'total_sessions': current_history.get('total_sessions', 0) + 1,
                    'recent_sessions': recent_sessions,
                    'updated_at': firestore.SERVER_TIMESTAMP
                }

                # Update PR if applicable (compare numerically to avoid string ordering bugs)
                def _is_new_pr(new_w, best_w):
                    if not new_w:
                        return False
                    if not best_w:
                        return True
                    try:
                        return float(new_w) > float(best_w)
                    except (ValueError, TypeError):
                        return False  # Skip PR check for text weights like "BW+25"

                if _is_new_pr(new_weight, best_weight):
                    update_data['best_weight'] = new_weight
                    update_data['best_weight_date'] = session_data.get('date')

                history_ref.update(update_data)
                logger.debug(f"Updated exercise history: {exercise_name} (direction: {next_weight_direction or 'none'})")

            else:
                # Create new history
                new_history = ExerciseHistory(
                    id=history_id,
                    workout_id=workout_id,
                    exercise_name=exercise_name,
                    last_weight=session_data.get('weight'),
                    last_weight_unit=session_data.get('weight_unit', 'lbs'),
                    last_session_id=session_data.get('session_id'),
                    last_session_date=session_data.get('date'),
                    last_weight_direction=next_weight_direction,
                    total_sessions=1,
                    first_session_date=session_data.get('date'),
                    best_weight=session_data.get('weight'),
                    best_weight_date=session_data.get('date'),
                    recent_sessions=[session_data]
                )

                history_data = new_history.model_dump()
                history_data['updated_at'] = firestore.SERVER_TIMESTAMP
                history_ref.set(history_data)
                logger.debug(f"Created exercise history: {exercise_name} (direction: {next_weight_direction or 'none'})")

            return True

        except Exception as e:
            logger.error(f"Failed to update exercise history: {str(e)}")
            return False

    async def _update_exercise_histories_batch(self, user_id: str, session: Any) -> bool:
        """Batch update all exercise histories from completed session"""
        if not self.is_available():
            return False

        try:
            for exercise in session.exercises_performed:
                session_data = {
                    'session_id': session.id,
                    'date': session.completed_at,
                    'weight': exercise.weight,
                    'weight_unit': exercise.weight_unit,
                    'sets': exercise.sets_completed
                }

                # Extract weight direction if available
                next_weight_direction = getattr(exercise, 'next_weight_direction', None)

                await self.update_exercise_history(
                    user_id,
                    session.workout_id,
                    exercise.exercise_name,
                    session_data,
                    next_weight_direction=next_weight_direction
                )

            logger.info(f"Updated {len(session.exercises_performed)} exercise histories for session {session.id}")
            return True

        except Exception as e:
            logger.error(f"Failed to batch update exercise histories: {str(e)}")
            return False

    async def _auto_update_personal_records(self, user_id: str, session: Any) -> bool:
        """
        Auto-update personal records if any exercise in this session exceeds tracked PR values.
        Only updates exercises that are already PR-tracked by the user.
        """
        if not self.is_available():
            return False

        try:
            import re

            # Read user's PR document
            pr_doc_ref = (self.db.collection('users')
                          .document(user_id)
                          .collection('data')
                          .document('personal_records'))
            pr_doc = pr_doc_ref.get()

            if not pr_doc.exists:
                return False

            pr_data = pr_doc.to_dict()
            records = pr_data.get('records', {})

            if not records:
                return False

            # Build lookup: normalized exercise name -> pr_id for weight PRs
            name_to_pr = {}
            for pr_id, pr in records.items():
                if pr.get('pr_type') == 'weight':
                    normalized = pr.get('exercise_name', '').lower()
                    name_to_pr[normalized] = (pr_id, pr)

            if not name_to_pr:
                return False

            updates = {}
            session_date = getattr(session, 'completed_at', None) or getattr(session, 'started_at', None)

            for exercise in session.exercises_performed:
                if not exercise.exercise_name or exercise.is_skipped:
                    continue

                ex_name_lower = exercise.exercise_name.lower()

                # Check exact match first, then try base name (strip equipment prefix)
                match = name_to_pr.get(ex_name_lower)
                if not match:
                    # Try stripping equipment prefix to match base name
                    from .personal_records_service import _normalize_pr_id
                    # Check if any tracked PR base name matches
                    for tracked_name, (pr_id, pr) in name_to_pr.items():
                        if tracked_name in ex_name_lower or ex_name_lower in tracked_name:
                            match = (pr_id, pr)
                            break

                if not match:
                    continue

                pr_id, current_pr = match
                new_weight = exercise.weight

                if new_weight is None:
                    continue

                try:
                    new_w = float(new_weight)
                    current_w = float(current_pr.get('value', 0))
                except (ValueError, TypeError):
                    continue

                if new_w > current_w:
                    updates[f'records.{pr_id}.value'] = str(new_weight)
                    updates[f'records.{pr_id}.session_id'] = session.id
                    if session_date:
                        updates[f'records.{pr_id}.session_date'] = session_date
                    updates[f'records.{pr_id}.marked_at'] = datetime.now().isoformat()
                    updates[f'records.{pr_id}.is_manual'] = False
                    logger.info(f"Auto-updating PR {pr_id}: {current_w} -> {new_w} for user {user_id}")

            if updates:
                updates['lastUpdated'] = firestore.SERVER_TIMESTAMP
                pr_doc_ref.update(updates)
                logger.info(f"Auto-updated {len([k for k in updates if k.startswith('records.') and k.endswith('.value')])} PRs for user {user_id}")

            return True

        except Exception as e:
            logger.error(f"Failed to auto-update personal records: {str(e)}")
            return False

    # ========================================================================
    # Program Progress Tracking
    # ========================================================================

    async def get_program_sessions(
        self,
        user_id: str,
        program_id: str,
        limit: int = 200
    ) -> List[Any]:
        """Get all completed sessions linked to a specific program"""
        if not self.is_available():
            return []

        try:
            from ..models import WorkoutSession

            sessions_ref = (self.db.collection('users')
                           .document(user_id)
                           .collection('workout_sessions')
                           .where('program_id', '==', program_id)
                           .where('status', '==', 'completed')
                           .order_by('completed_at', direction=firestore.Query.DESCENDING)
                           .limit(limit))

            docs = sessions_ref.stream()
            sessions = []

            for doc in docs:
                try:
                    session_data = doc.to_dict()
                    session = WorkoutSession(**session_data)
                    sessions.append(session)
                except Exception as e:
                    logger.warning(f"Failed to parse program session {doc.id}: {str(e)}")
                    continue

            logger.info(f"Retrieved {len(sessions)} program sessions for program {program_id}")
            return sessions

        except Exception as e:
            logger.error(f"Failed to get program sessions: {str(e)}")
            return []

    async def get_program_progress(
        self,
        user_id: str,
        program_id: str,
        program_name: str,
        program_workout_ids: List[str]
    ) -> dict:
        """Compute program progress stats from completed sessions"""
        try:
            sessions = await self.get_program_sessions(user_id, program_id)

            # Build stats
            workouts_completed: Dict[str, int] = {}
            total_duration = 0
            daily_activity: Dict[str, int] = {}
            session_dates: List[datetime] = []

            for session in sessions:
                # Count per workout
                wid = session.workout_id
                workouts_completed[wid] = workouts_completed.get(wid, 0) + 1

                # Duration
                if session.duration_minutes:
                    total_duration += session.duration_minutes

                # Daily activity
                completed = session.completed_at or session.started_at
                if completed:
                    if hasattr(completed, 'strftime'):
                        date_key = completed.strftime('%Y-%m-%d')
                    else:
                        date_key = str(completed)[:10]
                    daily_activity[date_key] = daily_activity.get(date_key, 0) + 1
                    session_dates.append(completed)

            # Sort dates for streak calculation
            unique_dates = sorted(set(d.strftime('%Y-%m-%d') if hasattr(d, 'strftime') else str(d)[:10] for d in session_dates))

            # Calculate streaks
            current_streak = 0
            best_streak = 0
            if unique_dates:
                from datetime import timedelta
                today = datetime.now().strftime('%Y-%m-%d')
                streak = 0
                # Walk backwards from today
                check_date = datetime.now().date()
                for _ in range(365):
                    date_str = check_date.strftime('%Y-%m-%d')
                    if date_str in daily_activity:
                        streak += 1
                        check_date -= timedelta(days=1)
                    else:
                        break
                current_streak = streak

                # Best streak from all dates
                streak = 1
                for i in range(1, len(unique_dates)):
                    prev = datetime.strptime(unique_dates[i-1], '%Y-%m-%d').date()
                    curr = datetime.strptime(unique_dates[i], '%Y-%m-%d').date()
                    if (curr - prev).days == 1:
                        streak += 1
                    else:
                        best_streak = max(best_streak, streak)
                        streak = 1
                best_streak = max(best_streak, streak, current_streak)

            # Weekly summary
            weekly_summary: Dict[str, int] = {}
            for date_str, count in daily_activity.items():
                try:
                    dt = datetime.strptime(date_str, '%Y-%m-%d')
                    week_key = dt.strftime('%Y-W%W')
                    weekly_summary[week_key] = weekly_summary.get(week_key, 0) + count
                except ValueError:
                    pass

            unique_completed = len(workouts_completed)
            total_in_program = len(program_workout_ids)
            completion_pct = (unique_completed / total_in_program * 100) if total_in_program > 0 else 0

            first_date = unique_dates[0] if unique_dates else None
            last_date = unique_dates[-1] if unique_dates else None

            return {
                "program_id": program_id,
                "program_name": program_name,
                "total_sessions": len(sessions),
                "workouts_completed": workouts_completed,
                "unique_workouts_completed": unique_completed,
                "total_workouts_in_program": total_in_program,
                "completion_percentage": round(completion_pct, 1),
                "total_duration_minutes": total_duration,
                "first_session_date": first_date,
                "last_session_date": last_date,
                "current_streak": current_streak,
                "best_streak": best_streak,
                "daily_activity": daily_activity,
                "weekly_summary": weekly_summary
            }

        except Exception as e:
            logger.error(f"Failed to compute program progress: {str(e)}")
            return {
                "program_id": program_id,
                "program_name": program_name,
                "total_sessions": 0,
                "workouts_completed": {},
                "unique_workouts_completed": 0,
                "total_workouts_in_program": len(program_workout_ids),
                "completion_percentage": 0,
                "total_duration_minutes": 0,
                "first_session_date": None,
                "last_session_date": None,
                "current_streak": 0,
                "best_streak": 0,
                "daily_activity": {},
                "weekly_summary": {}
            }
