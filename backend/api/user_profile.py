"""
User Profile API Endpoints
Handles user profile operations including account deletion
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional
import logging

from ..middleware.auth import get_current_user
from ..services.firebase_service import firebase_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/user", tags=["user"])


class ActiveProgramRequest(BaseModel):
    program_id: str


@router.get("/profile")
async def get_user_profile(
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Get current user's profile information
    
    Returns user data from Firebase Auth
    """
    try:
        user_id = current_user.get('uid')
        if not user_id:
            raise HTTPException(status_code=401, detail="User ID not found")
        
        logger.info(f"📊 Getting profile for user: {user_id}")
        
        # Return user data from token
        return {
            "uid": current_user.get('uid'),
            "email": current_user.get('email'),
            "email_verified": current_user.get('email_verified', False),
            "name": current_user.get('name'),
            "picture": current_user.get('picture'),
            "firebase_claims": current_user.get('firebase_claims', {})
        }
        
    except Exception as e:
        logger.error(f"❌ Error getting user profile: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/delete")
async def delete_user_account(
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Delete user account and all associated data from Firestore
    
    This endpoint deletes:
    - User's workouts
    - User's programs
    - User's workout sessions
    - User's favorites
    - User's exercise history
    - User document
    
    Note: Firebase Auth account deletion happens on the frontend
    """
    try:
        user_id = current_user.get('uid')
        if not user_id:
            raise HTTPException(status_code=401, detail="User ID not found")
        
        logger.info(f"🗑️ Deleting account for user: {user_id}")
        
        # Check if Firebase/Firestore is available
        if not firebase_service.is_available():
            logger.warning("⚠️ Firebase not available, skipping Firestore deletion")
            return {
                "success": True,
                "message": "Account deletion initiated (Firestore not available)"
            }
        
        # Get Firestore client
        db = firebase_service.get_firestore()
        if not db:
            logger.warning("⚠️ Firestore client not available")
            return {
                "success": True,
                "message": "Account deletion initiated (Firestore client not available)"
            }
        
        # Delete user's subcollections
        collections_to_delete = [
            'workouts',
            'programs',
            'workout_sessions',
            'favorites',
            'exercise_history'
        ]
        
        for collection_name in collections_to_delete:
            try:
                collection_ref = db.collection('users').document(user_id).collection(collection_name)
                docs = collection_ref.stream()
                
                deleted_count = 0
                for doc in docs:
                    doc.reference.delete()
                    deleted_count += 1
                
                if deleted_count > 0:
                    logger.info(f"✅ Deleted {deleted_count} documents from {collection_name}")
                    
            except Exception as e:
                logger.error(f"❌ Error deleting {collection_name}: {e}")
                # Continue with other collections even if one fails
        
        # Delete user document
        try:
            user_doc_ref = db.collection('users').document(user_id)
            user_doc_ref.delete()
            logger.info(f"✅ Deleted user document for: {user_id}")
        except Exception as e:
            logger.error(f"❌ Error deleting user document: {e}")
        
        logger.info(f"✅ Account deletion completed for user: {user_id}")
        
        return {
            "success": True,
            "message": "Account and all associated data deleted successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error deleting user account: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete account: {str(e)}"
        )


@router.put("/profile")
async def update_user_profile(
    profile_data: Dict[str, Any],
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Update user profile information

    Persists display_name to Firestore users collection
    so it can be used for public workout attribution.
    """
    try:
        user_id = current_user.get('uid')
        if not user_id:
            raise HTTPException(status_code=401, detail="User ID not found")

        logger.info(f"📝 Updating profile for user: {user_id}")

        display_name = profile_data.get('display_name', '').strip()
        if not display_name:
            raise HTTPException(status_code=400, detail="Display name cannot be empty")

        if len(display_name) > 50:
            raise HTTPException(status_code=400, detail="Display name must be 50 characters or less")

        # Persist to Firestore users collection
        if firebase_service.is_available():
            db = firebase_service.get_firestore()
            if db:
                user_ref = db.collection('users').document(user_id)
                user_ref.set({'displayName': display_name}, merge=True)
                logger.info(f"✅ Display name saved to Firestore: {display_name}")

        return {
            "success": True,
            "message": "Profile updated successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error updating user profile: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/active-program")
async def get_active_program(
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    """Get the user's active (pinned) program ID"""
    try:
        user_id = current_user.get('uid')
        if not user_id:
            raise HTTPException(status_code=401, detail="User ID not found")

        if not firebase_service.is_available():
            return {"program_id": None}

        db = firebase_service.get_firestore()
        if not db:
            return {"program_id": None}

        user_doc = db.collection('users').document(user_id).get()
        if user_doc.exists:
            data = user_doc.to_dict()
            return {"program_id": data.get('active_program_id')}

        return {"program_id": None}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error getting active program: {e}")
        # Return null rather than 500 — this is a non-critical read
        return {"program_id": None}


@router.put("/active-program")
async def set_active_program(
    request: ActiveProgramRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    """Set a program as the user's active (pinned) program"""
    try:
        user_id = current_user.get('uid')
        if not user_id:
            raise HTTPException(status_code=401, detail="User ID not found")

        if not firebase_service.is_available():
            raise HTTPException(status_code=503, detail="Firebase not available")

        db = firebase_service.get_firestore()
        if not db:
            raise HTTPException(status_code=503, detail="Firestore not available")

        user_ref = db.collection('users').document(user_id)
        user_ref.set({'active_program_id': request.program_id}, merge=True)

        logger.info(f"✅ Set active program {request.program_id} for user {user_id}")
        return {"success": True, "program_id": request.program_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error setting active program: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/active-program")
async def clear_active_program(
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    """Clear the user's active program"""
    try:
        user_id = current_user.get('uid')
        if not user_id:
            raise HTTPException(status_code=401, detail="User ID not found")

        if not firebase_service.is_available():
            return {"success": True}

        db = firebase_service.get_firestore()
        if not db:
            return {"success": True}

        from google.cloud.firestore_v1 import DELETE_FIELD
        user_ref = db.collection('users').document(user_id)
        user_ref.update({'active_program_id': DELETE_FIELD})

        logger.info(f"✅ Cleared active program for user {user_id}")
        return {"success": True}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error clearing active program: {e}")
        raise HTTPException(status_code=500, detail=str(e))