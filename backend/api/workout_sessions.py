"""
Workout Session Management API
Handles workout session CRUD operations and exercise history tracking
Premium feature for authenticated users only
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
import logging

from ..models import (
    WorkoutSession,
    CreateSessionRequest,
    UpdateSessionRequest,
    CompleteSessionRequest,
    CreateAndCompleteSessionRequest,
    EditSessionRequest,
    SessionListResponse,
    ExerciseHistory,
    ExerciseHistoryResponse
)
from ..services.firestore_data_service import firestore_data_service
from ..services.firebase_service import firebase_service
from ..middleware.auth import get_current_user_optional, extract_user_id

router = APIRouter(prefix="/api/v3/workout-sessions", tags=["Workout Sessions"])
logger = logging.getLogger(__name__)


# ============================================================================
# Session Management Endpoints
# ============================================================================

@router.post("", response_model=WorkoutSession)
async def create_session(
    session_request: CreateSessionRequest,
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """
    Create a new workout session (start workout)
    
    **Premium Feature**: Requires authentication
    """
    try:
        user_id = extract_user_id(current_user)
        
        if not user_id:
            raise HTTPException(
                status_code=401,
                detail="Authentication required for workout logging"
            )
        
        if not firebase_service.is_available():
            raise HTTPException(
                status_code=503,
                detail="Workout logging service temporarily unavailable"
            )
        
        logger.info(f"Creating workout session for user {user_id}: {session_request.workout_name}")
        
        session = await firestore_data_service.create_workout_session(user_id, session_request)
        
        if not session:
            raise HTTPException(
                status_code=500,
                detail="Failed to create workout session"
            )
        
        logger.info(f"✅ Workout session created: {session.id}")
        return session

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating workout session: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error creating session: {str(e)}")


@router.post("/create-and-complete", response_model=WorkoutSession)
async def create_and_complete_session(
    request: CreateAndCompleteSessionRequest,
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """
    Atomically create and complete a workout session in one operation.

    Used for recovery scenarios where the original session was lost due to:
    - Network issues during session creation
    - Page refresh/crash during workout
    - localStorage session with no corresponding Firestore document

    This endpoint avoids the race condition that can occur when making
    separate create and complete API calls.

    **Premium Feature**: Requires authentication
    """
    try:
        user_id = extract_user_id(current_user)

        if not user_id:
            raise HTTPException(
                status_code=401,
                detail="Authentication required for workout logging"
            )

        if not firebase_service.is_available():
            raise HTTPException(
                status_code=503,
                detail="Workout logging service temporarily unavailable"
            )

        logger.info(f"🔄 Atomic create-and-complete for user {user_id}: {request.workout_name}")

        session = await firestore_data_service.create_and_complete_workout_session(user_id, request)

        if not session:
            raise HTTPException(
                status_code=500,
                detail="Failed to create and complete workout session"
            )

        logger.info(f"✅ Atomic session completed: {session.id}")
        return session

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in atomic create-and-complete: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error completing session: {str(e)}")


@router.get("/{session_id}", response_model=WorkoutSession)
async def get_session(
    session_id: str,
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """
    Get a specific workout session by ID
    
    **Premium Feature**: Requires authentication
    """
    try:
        user_id = extract_user_id(current_user)
        
        if not user_id:
            raise HTTPException(
                status_code=401,
                detail="Authentication required"
            )
        
        session = await firestore_data_service.get_workout_session(user_id, session_id)
        
        if not session:
            raise HTTPException(
                status_code=404,
                detail="Workout session not found"
            )
        
        return session
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving workout session: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving session: {str(e)}")


@router.put("/{session_id}", response_model=WorkoutSession)
async def update_session(
    session_id: str,
    update_request: UpdateSessionRequest,
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """
    Update workout session progress (auto-save during workout)
    
    **Premium Feature**: Requires authentication
    """
    try:
        user_id = extract_user_id(current_user)
        
        if not user_id:
            raise HTTPException(
                status_code=401,
                detail="Authentication required"
            )
        
        logger.info(f"Updating workout session {session_id} for user {user_id}")
        
        session = await firestore_data_service.update_workout_session(
            user_id,
            session_id,
            update_request
        )
        
        if not session:
            raise HTTPException(
                status_code=404,
                detail="Workout session not found"
            )
        
        logger.info(f"✅ Workout session updated: {session_id}")
        return session
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating workout session: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating session: {str(e)}")


@router.patch("/{session_id}", response_model=WorkoutSession)
async def edit_session(
    session_id: str,
    edit_request: EditSessionRequest,
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """
    Edit a completed workout session's metadata and exercises.

    Allows editing: date/time, duration, workout name, notes, and exercises.

    **Premium Feature**: Requires authentication
    """
    try:
        user_id = extract_user_id(current_user)

        if not user_id:
            raise HTTPException(
                status_code=401,
                detail="Authentication required"
            )

        logger.info(f"Editing workout session {session_id} for user {user_id}")

        session = await firestore_data_service.edit_completed_session(
            user_id,
            session_id,
            edit_request
        )

        if not session:
            raise HTTPException(
                status_code=404,
                detail="Workout session not found"
            )

        logger.info(f"✅ Workout session edited: {session_id}")
        return session

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error editing workout session: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error editing session: {str(e)}")


@router.post("/{session_id}/complete", response_model=WorkoutSession)
async def complete_session(
    session_id: str,
    complete_request: CompleteSessionRequest,
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """
    Complete a workout session and update exercise history
    
    **Premium Feature**: Requires authentication
    
    This endpoint:
    1. Marks the session as completed
    2. Calculates workout duration
    3. Updates exercise history for all exercises
    4. Records personal records if applicable
    5. Saves custom exercise order (if provided) for future sessions
    """
    try:
        user_id = extract_user_id(current_user)
        
        if not user_id:
            raise HTTPException(
                status_code=401,
                detail="Authentication required"
            )
        
        logger.info(f"Completing workout session {session_id} for user {user_id}")
        
        session = await firestore_data_service.complete_workout_session(
            user_id,
            session_id,
            complete_request
        )
        
        if not session:
            raise HTTPException(
                status_code=404,
                detail="Workout session not found"
            )
        
        logger.info(f"✅ Workout session completed: {session_id}")
        return session
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error completing workout session: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error completing session: {str(e)}")


@router.get("", response_model=SessionListResponse)
async def list_sessions(
    workout_id: Optional[str] = Query(None, description="Filter by workout ID"),
    status: Optional[str] = Query(None, description="Filter by status (in_progress, completed, abandoned)"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """
    List user's workout sessions with optional filtering
    
    **Premium Feature**: Requires authentication
    """
    try:
        user_id = extract_user_id(current_user)
        
        if not user_id:
            raise HTTPException(
                status_code=401,
                detail="Authentication required"
            )
        
        sessions = await firestore_data_service.get_user_sessions(
            user_id,
            workout_id=workout_id,
            limit=page_size,
            status=status
        )
        
        # Calculate total count (simplified - in production, use a separate count query)
        total_count = len(sessions)
        
        return SessionListResponse(
            sessions=sessions,
            total_count=total_count,
            page=page,
            page_size=page_size
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing workout sessions: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error listing sessions: {str(e)}")


@router.delete("/{session_id}")
async def delete_session(
    session_id: str,
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """
    Delete a workout session
    
    **Premium Feature**: Requires authentication
    
    Note: This does not update exercise history. Use with caution.
    """
    try:
        user_id = extract_user_id(current_user)
        
        if not user_id:
            raise HTTPException(
                status_code=401,
                detail="Authentication required"
            )
        
        logger.info(f"Deleting workout session {session_id} for user {user_id}")
        
        success = await firestore_data_service.delete_workout_session(user_id, session_id)
        
        if not success:
            raise HTTPException(
                status_code=404,
                detail="Workout session not found"
            )
        
        logger.info(f"✅ Workout session deleted: {session_id}")
        return {"message": "Workout session deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting workout session: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting session: {str(e)}")


# ============================================================================
# Exercise History Endpoints
# ============================================================================

@router.get("/history/workout/{workout_id}", response_model=ExerciseHistoryResponse)
async def get_workout_history(
    workout_id: str,
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """
    Get exercise history for all exercises in a workout
    
    **Premium Feature**: Requires authentication
    
    Returns last used weights, personal records, and recent session data
    for all exercises in the specified workout.
    """
    try:
        user_id = extract_user_id(current_user)
        
        if not user_id:
            raise HTTPException(
                status_code=401,
                detail="Authentication required"
            )
        
        # Get workout to get the name
        workout = await firestore_data_service.get_workout(user_id, workout_id)
        workout_name = workout.name if workout else "Unknown Workout"
        
        # Get exercise histories
        histories = await firestore_data_service.get_exercise_history_for_workout(
            user_id,
            workout_id
        )
        
        # PHASE 3: Get last session's custom exercise order
        last_exercise_order = None
        try:
            sessions = await firestore_data_service.get_user_sessions(
                user_id,
                workout_id=workout_id,
                status="completed",
                limit=1
            )
            
            if sessions and len(sessions) > 0:
                last_session = sessions[0]
                if hasattr(last_session, 'exercise_order') and last_session.exercise_order:
                    last_exercise_order = last_session.exercise_order
                    logger.info(f"Found custom exercise order from last session: {len(last_exercise_order)} exercises")
        except Exception as order_error:
            logger.warning(f"Could not retrieve last exercise order: {str(order_error)}")
            # Non-fatal - continue without order
        
        return ExerciseHistoryResponse(
            workout_id=workout_id,
            workout_name=workout_name,
            exercises=histories,
            last_exercise_order=last_exercise_order
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving workout history: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving history: {str(e)}")


@router.get("/history/{workout_id}/{exercise_name}", response_model=ExerciseHistory)
async def get_exercise_history(
    workout_id: str,
    exercise_name: str,
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """
    Get history for a specific exercise in a workout
    
    **Premium Feature**: Requires authentication
    
    Returns detailed history including:
    - Last weight used
    - Personal record
    - Total sessions
    - Recent session data (last 5)
    """
    try:
        user_id = extract_user_id(current_user)
        
        if not user_id:
            raise HTTPException(
                status_code=401,
                detail="Authentication required"
            )
        
        history = await firestore_data_service.get_exercise_history(
            user_id,
            workout_id,
            exercise_name
        )
        
        if not history:
            raise HTTPException(
                status_code=404,
                detail="Exercise history not found"
            )
        
        return history
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving exercise history: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving history: {str(e)}")

# Export router
__all__ = ['router']