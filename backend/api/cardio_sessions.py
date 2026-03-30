"""
Cardio Session Management API
Handles cardio session CRUD operations for activity logging
Premium feature for authenticated users only
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
import logging

from ..models import (
    CardioSession,
    CreateCardioSessionRequest,
    UpdateCardioSessionRequest,
    EditCardioSessionRequest,
    CardioSessionListResponse
)
from ..services.firestore_data_service import firestore_data_service
from ..services.firebase_service import firebase_service
from ..middleware.auth import get_current_user_optional, extract_user_id

router = APIRouter(prefix="/api/v3/cardio-sessions", tags=["Cardio Sessions"])
logger = logging.getLogger(__name__)


# ============================================================================
# Cardio Session Endpoints
# ============================================================================

@router.post("", response_model=CardioSession)
async def create_cardio_session(
    session_request: CreateCardioSessionRequest,
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """
    Log a new cardio session

    **Premium Feature**: Requires authentication
    """
    try:
        user_id = extract_user_id(current_user)

        if not user_id:
            raise HTTPException(
                status_code=401,
                detail="Authentication required for cardio logging"
            )

        if not firebase_service.is_available():
            raise HTTPException(
                status_code=503,
                detail="Cardio logging service temporarily unavailable"
            )

        logger.info(f"Creating cardio session for user {user_id}: {session_request.activity_type}")

        session = await firestore_data_service.create_cardio_session(user_id, session_request)

        if not session:
            raise HTTPException(
                status_code=500,
                detail="Failed to create cardio session"
            )

        logger.info(f"✅ Cardio session created: {session.id}")
        return session

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating cardio session: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error creating cardio session: {str(e)}")


@router.get("", response_model=CardioSessionListResponse)
async def list_cardio_sessions(
    activity_type: Optional[str] = Query(None, description="Filter by activity type (running, cycling, rowing, etc.)"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """
    List user's cardio sessions with optional filtering

    **Premium Feature**: Requires authentication
    """
    try:
        user_id = extract_user_id(current_user)

        if not user_id:
            raise HTTPException(
                status_code=401,
                detail="Authentication required"
            )

        sessions = await firestore_data_service.get_user_cardio_sessions(
            user_id,
            activity_type=activity_type,
            limit=page_size
        )

        total_count = len(sessions)

        return CardioSessionListResponse(
            sessions=sessions,
            total_count=total_count,
            page=page,
            page_size=page_size
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing cardio sessions: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error listing cardio sessions: {str(e)}")


@router.get("/{session_id}", response_model=CardioSession)
async def get_cardio_session(
    session_id: str,
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """
    Get a specific cardio session by ID

    **Premium Feature**: Requires authentication
    """
    try:
        user_id = extract_user_id(current_user)

        if not user_id:
            raise HTTPException(
                status_code=401,
                detail="Authentication required"
            )

        session = await firestore_data_service.get_cardio_session(user_id, session_id)

        if not session:
            raise HTTPException(
                status_code=404,
                detail="Cardio session not found"
            )

        return session

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving cardio session: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving cardio session: {str(e)}")


@router.put("/{session_id}", response_model=CardioSession)
async def update_cardio_session(
    session_id: str,
    update_request: UpdateCardioSessionRequest,
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """
    Update a cardio session

    **Premium Feature**: Requires authentication
    """
    try:
        user_id = extract_user_id(current_user)

        if not user_id:
            raise HTTPException(
                status_code=401,
                detail="Authentication required"
            )

        logger.info(f"Updating cardio session {session_id} for user {user_id}")

        session = await firestore_data_service.update_cardio_session(
            user_id,
            session_id,
            update_request
        )

        if not session:
            raise HTTPException(
                status_code=404,
                detail="Cardio session not found"
            )

        logger.info(f"✅ Cardio session updated: {session_id}")
        return session

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating cardio session: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating cardio session: {str(e)}")


@router.patch("/{session_id}", response_model=CardioSession)
async def edit_cardio_session(
    session_id: str,
    edit_request: EditCardioSessionRequest,
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """
    Edit a completed cardio session's metadata including date/time.

    **Premium Feature**: Requires authentication
    """
    try:
        user_id = extract_user_id(current_user)

        if not user_id:
            raise HTTPException(
                status_code=401,
                detail="Authentication required"
            )

        logger.info(f"Editing cardio session {session_id} for user {user_id}")

        session = await firestore_data_service.edit_cardio_session(
            user_id,
            session_id,
            edit_request
        )

        if not session:
            raise HTTPException(
                status_code=404,
                detail="Cardio session not found"
            )

        logger.info(f"✅ Cardio session edited: {session_id}")
        return session

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error editing cardio session: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error editing cardio session: {str(e)}")


@router.delete("/{session_id}")
async def delete_cardio_session(
    session_id: str,
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """
    Delete a cardio session

    **Premium Feature**: Requires authentication
    """
    try:
        user_id = extract_user_id(current_user)

        if not user_id:
            raise HTTPException(
                status_code=401,
                detail="Authentication required"
            )

        logger.info(f"Deleting cardio session {session_id} for user {user_id}")

        success = await firestore_data_service.delete_cardio_session(user_id, session_id)

        if not success:
            raise HTTPException(
                status_code=404,
                detail="Cardio session not found"
            )

        logger.info(f"✅ Cardio session deleted: {session_id}")
        return {"message": "Cardio session deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting cardio session: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting cardio session: {str(e)}")
