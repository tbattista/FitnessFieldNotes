"""
Workout Template Management
Handles workout CRUD operations with Firebase dual-mode support
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
import logging
from ..models import (
    WorkoutTemplate, CreateWorkoutRequest, UpdateWorkoutRequest,
    WorkoutListResponse
)
from ..services.data_service import DataService
from ..services.firestore_data_service import firestore_data_service
from ..services.firebase_service import firebase_service
from ..api.dependencies import get_data_service, optional_auth
from ..middleware.auth import get_current_user_optional, extract_user_id

router = APIRouter(prefix="/api/v3", tags=["Workouts"])
logger = logging.getLogger(__name__)


# Local Storage Endpoints

@router.post("/workouts", response_model=WorkoutTemplate)
async def create_workout(
    workout_request: CreateWorkoutRequest,
    data_service: DataService = Depends(get_data_service)
):
    """Create a new workout template (local storage)"""
    try:
        logger.info(f"Creating workout: {workout_request.name}")
        workout = data_service.create_workout(workout_request)
        logger.info(f"Workout created successfully with ID: {workout.id}")
        return workout
    except Exception as e:
        logger.error(f"Error creating workout: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error creating workout: {str(e)}")


@router.get("/workouts", response_model=WorkoutListResponse)
async def get_workouts(
    tags: Optional[List[str]] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    search: Optional[str] = Query(None),
    data_service: DataService = Depends(get_data_service)
):
    """Get all workout templates with optional filtering (local storage)"""
    try:
        if search:
            workouts = data_service.search_workouts(search)
            total_count = len(workouts)
            # Apply pagination to search results
            start_idx = (page - 1) * page_size
            end_idx = start_idx + page_size
            workouts = workouts[start_idx:end_idx]
        else:
            workouts = data_service.get_all_workouts(tags=tags, page=page, page_size=page_size)
            total_count = data_service.get_workout_count()
        
        return WorkoutListResponse(
            workouts=workouts,
            total_count=total_count,
            page=page,
            page_size=page_size
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving workouts: {str(e)}")


@router.get("/workouts/{workout_id}", response_model=WorkoutTemplate)
async def get_workout(
    workout_id: str,
    data_service: DataService = Depends(get_data_service)
):
    """Get a specific workout template (local storage)"""
    workout = data_service.get_workout(workout_id)
    if not workout:
        raise HTTPException(status_code=404, detail="Workout not found")
    return workout


@router.put("/workouts/{workout_id}", response_model=WorkoutTemplate)
async def update_workout(
    workout_id: str,
    update_request: UpdateWorkoutRequest,
    data_service: DataService = Depends(get_data_service)
):
    """Update a workout template (local storage)"""
    workout = data_service.update_workout(workout_id, update_request)
    if not workout:
        raise HTTPException(status_code=404, detail="Workout not found")
    return workout


@router.delete("/workouts/{workout_id}")
async def delete_workout(
    workout_id: str,
    data_service: DataService = Depends(get_data_service)
):
    """Archive a workout template (local storage)"""
    success = data_service.delete_workout(workout_id)
    if not success:
        raise HTTPException(status_code=404, detail="Workout not found")
    return {"message": "Workout archived successfully"}


@router.post("/workouts/{workout_id}/restore")
async def restore_workout(
    workout_id: str,
    data_service: DataService = Depends(get_data_service)
):
    """Restore an archived workout (local storage)"""
    success = data_service.restore_workout(workout_id)
    if not success:
        raise HTTPException(status_code=404, detail="Workout not found")
    return {"message": "Workout restored successfully"}


@router.delete("/workouts/{workout_id}/permanent")
async def permanent_delete_workout(
    workout_id: str,
    data_service: DataService = Depends(get_data_service)
):
    """Permanently delete a workout (local storage)"""
    success = data_service.permanent_delete_workout(workout_id)
    if not success:
        raise HTTPException(status_code=404, detail="Workout not found")
    return {"message": "Workout permanently deleted"}


@router.post("/workouts/{workout_id}/duplicate", response_model=WorkoutTemplate)
async def duplicate_workout(
    workout_id: str,
    new_name: str = Query(...),
    data_service: DataService = Depends(get_data_service)
):
    """Duplicate a workout template with a new name"""
    workout = data_service.duplicate_workout(workout_id, new_name)
    if not workout:
        raise HTTPException(status_code=404, detail="Workout not found")
    return workout


# Firebase Dual-Mode Endpoints

# Create a separate router for firebase endpoints to avoid path conflicts
firebase_router = APIRouter(prefix="/api/v3/firebase/workouts", tags=["Workouts"])

@firebase_router.post("", response_model=WorkoutTemplate)
async def create_workout_firebase(
    workout_request: CreateWorkoutRequest,
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """Create a new workout template (Firebase-enabled with fallback)"""
    try:
        user_id = extract_user_id(current_user)
        logger.info(f"Creating workout: {workout_request.name}, user_id: {user_id}")

        if user_id and firebase_service.is_available():
            # Authenticated user - use Firestore data service
            logger.info("Using Firestore for authenticated user")
            workout = await firestore_data_service.create_workout(user_id, workout_request)
            if workout:
                logger.info(f"✅ Workout created in Firestore: {workout.name} with ID: {workout.id}")
                return workout
            else:
                logger.error("Firebase workout creation returned None for authenticated user")
                raise HTTPException(status_code=500, detail="Failed to save workout. Please try again.")

        # Anonymous user or Firebase unavailable - use local storage
        logger.info("Using local storage for workout creation")
        data_service = DataService()
        workout = data_service.create_workout(workout_request)
        logger.info(f"Workout created in local storage with ID: {workout.id}")
        return workout
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating workout: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error creating workout: {str(e)}")


@firebase_router.get("", response_model=WorkoutListResponse)
async def get_workouts_firebase(
    tags: Optional[List[str]] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    search: Optional[str] = Query(None),
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """Get workout templates (Firebase-enabled with fallback)"""
    try:
        user_id = extract_user_id(current_user)
        logger.info(f"📱 [MOBILE DEBUG] get_workouts_firebase called - user_id: {user_id}, firebase_available: {firebase_service.is_available()}")

        if user_id and firebase_service.is_available():
            # Authenticated user - get from Firestore
            if search:
                workouts = await firestore_data_service.search_workouts(user_id, search, limit=page_size)
            else:
                workouts = await firestore_data_service.get_user_workouts(user_id, limit=page_size, tags=tags)

            logger.info(f"📱 [MOBILE DEBUG] Firestore returned {len(workouts)} workouts for user {user_id}")
            total_count = len(workouts)
            
            # Apply pagination
            start_idx = (page - 1) * page_size
            end_idx = start_idx + page_size
            workouts = workouts[start_idx:end_idx]
        else:
            # Anonymous user or Firebase unavailable - use local storage
            logger.info(f"📱 [MOBILE DEBUG] Using LOCAL STORAGE fallback - user_id: {user_id}, firebase_available: {firebase_service.is_available()}")
            data_service = DataService()
            if search:
                workouts = data_service.search_workouts(search)
                total_count = len(workouts)
                start_idx = (page - 1) * page_size
                end_idx = start_idx + page_size
                workouts = workouts[start_idx:end_idx]
            else:
                workouts = data_service.get_all_workouts(tags=tags, page=page, page_size=page_size)
                total_count = data_service.get_workout_count()
        
        return WorkoutListResponse(
            workouts=workouts,
            total_count=total_count,
            page=page,
            page_size=page_size
        )
        
    except Exception as e:
        logger.error(f"Error retrieving workouts: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving workouts: {str(e)}")


@firebase_router.put("/{workout_id}", response_model=WorkoutTemplate)
async def update_workout_firebase(
    workout_id: str,
    workout_request: UpdateWorkoutRequest,
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """Update a workout template (Firebase-enabled with fallback)"""
    try:
        user_id = extract_user_id(current_user)
        logger.info(f"Updating workout {workout_id}, user_id: {user_id}")
        
        if user_id and firebase_service.is_available():
            logger.info("Using Firestore for authenticated user workout update")
            # Authenticated user - use Firestore data service
            workout = await firestore_data_service.update_workout(user_id, workout_id, workout_request)
            if workout:
                logger.info(f"✅ Workout updated in Firestore: {workout.name} with ID: {workout.id}")
                return workout
            else:
                # Workout not found in Firestore - don't fall back to localStorage
                raise HTTPException(status_code=404, detail="Workout not found")

        # Anonymous user or Firebase unavailable - use local storage
        logger.info("Using local storage for workout update")
        data_service = DataService()
        workout = data_service.update_workout(workout_id, workout_request)
        if not workout:
            raise HTTPException(status_code=404, detail="Workout not found")
        logger.info(f"Workout updated in local storage with ID: {workout.id}")
        return workout
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating workout: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating workout: {str(e)}")


@firebase_router.delete("/{workout_id}")
async def delete_workout_firebase(
    workout_id: str,
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """Delete a workout template (Firebase-enabled with fallback)"""
    try:
        user_id = extract_user_id(current_user)
        logger.info(f"Deleting workout {workout_id}, user_id: {user_id}")
        
        if user_id and firebase_service.is_available():
            logger.info("Using Firestore for authenticated user workout archival")
            # Authenticated user - use Firestore data service
            success = await firestore_data_service.delete_workout(user_id, workout_id)
            if success:
                logger.info(f"✅ Workout archived in Firestore: {workout_id}")
                return {"message": "Workout archived successfully"}
            else:
                logger.warning("Firebase workout archival failed, falling back to local storage")

        # Anonymous user or Firebase unavailable - use local storage
        logger.info("Using local storage for workout archival")
        data_service = DataService()
        success = data_service.delete_workout(workout_id)
        if not success:
            raise HTTPException(status_code=404, detail="Workout not found")
        logger.info(f"Workout archived in local storage: {workout_id}")
        return {"message": "Workout archived successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error archiving workout: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error archiving workout: {str(e)}")


@firebase_router.post("/{workout_id}/restore")
async def restore_workout_firebase(
    workout_id: str,
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """Restore an archived workout (Firebase-enabled with fallback)"""
    try:
        user_id = extract_user_id(current_user)
        logger.info(f"Restoring workout {workout_id}, user_id: {user_id}")

        if user_id and firebase_service.is_available():
            success = await firestore_data_service.restore_workout(user_id, workout_id)
            if success:
                logger.info(f"✅ Workout restored in Firestore: {workout_id}")
                return {"message": "Workout restored successfully"}
            else:
                logger.warning("Firebase workout restore failed, falling back to local storage")

        data_service = DataService()
        success = data_service.restore_workout(workout_id)
        if not success:
            raise HTTPException(status_code=404, detail="Workout not found")
        return {"message": "Workout restored successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error restoring workout: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error restoring workout: {str(e)}")


@firebase_router.delete("/{workout_id}/permanent")
async def permanent_delete_workout_firebase(
    workout_id: str,
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """Permanently delete a workout (Firebase-enabled with fallback)"""
    try:
        user_id = extract_user_id(current_user)
        logger.info(f"Permanently deleting workout {workout_id}, user_id: {user_id}")

        if user_id and firebase_service.is_available():
            success = await firestore_data_service.permanent_delete_workout(user_id, workout_id)
            if success:
                logger.info(f"✅ Workout permanently deleted from Firestore: {workout_id}")
                return {"message": "Workout permanently deleted"}
            else:
                logger.warning("Firebase permanent delete failed, falling back to local storage")

        data_service = DataService()
        success = data_service.permanent_delete_workout(workout_id)
        if not success:
            raise HTTPException(status_code=404, detail="Workout not found")
        return {"message": "Workout permanently deleted"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error permanently deleting workout: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error permanently deleting workout: {str(e)}")


@firebase_router.get("/exercise-history/workout/{workout_id}")
async def get_workout_exercise_history(
    workout_id: str,
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """
    Get exercise history for all exercises in a workout
    Returns last weights used for each exercise to auto-populate workout builder
    """
    try:
        user_id = extract_user_id(current_user)
        
        if not user_id:
            raise HTTPException(status_code=401, detail="Authentication required")
        
        if not firebase_service.is_available():
            raise HTTPException(status_code=503, detail="Firebase service unavailable")
        
        logger.info(f"Fetching exercise history for workout {workout_id}, user: {user_id}")
        
        # Reuse existing service method
        histories = await firestore_data_service.get_exercise_history_for_workout(
            user_id,
            workout_id
        )
        
        # Convert to dict keyed by exercise name for easy frontend lookup
        result = {
            name: history.model_dump()
            for name, history in histories.items()
        }
        
        logger.info(f"✅ Retrieved history for {len(result)} exercises")
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get exercise history: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Export both routers
__all__ = ['router', 'firebase_router']