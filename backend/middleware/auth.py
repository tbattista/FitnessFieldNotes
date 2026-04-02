"""
Authentication Middleware for Ghost Gym V3
Handles Firebase JWT token validation and user authentication
"""

import os
import logging
from typing import Optional, Dict, Any
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

try:
    import firebase_admin
    from firebase_admin import auth
    FIREBASE_AUTH_AVAILABLE = True
except ImportError:
    FIREBASE_AUTH_AVAILABLE = False
    firebase_admin = None
    auth = None

from ..config.firebase_config import get_firebase_app

logger = logging.getLogger(__name__)

# Security scheme for Bearer token
security = HTTPBearer(auto_error=False)

async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Optional[Dict[str, Any]]:
    """
    Get current user from Firebase token (optional - returns None if not authenticated)
    
    Args:
        credentials: Bearer token from Authorization header
        
    Returns:
        User information dict or None if not authenticated
    """
    if not credentials or not FIREBASE_AUTH_AVAILABLE:
        return None
    
    try:
        # Get Firebase app
        app = get_firebase_app()
        if not app:
            logger.warning("Firebase app not available for authentication")
            return None
        
        # Verify the Firebase ID token
        decoded_token = auth.verify_id_token(credentials.credentials, app=app)
        logger.info(f"📱 [AUTH DEBUG] Token verified - UID: {decoded_token.get('uid')}, Email: {decoded_token.get('email')}")

        # Extract user information
        user_info = {
            'uid': decoded_token.get('uid'),
            'email': decoded_token.get('email'),
            'email_verified': decoded_token.get('email_verified', False),
            'name': decoded_token.get('name'),
            'picture': decoded_token.get('picture'),
            'provider': decoded_token.get('firebase', {}).get('sign_in_provider'),
            'auth_time': decoded_token.get('auth_time'),
            'exp': decoded_token.get('exp'),
            'iat': decoded_token.get('iat')
        }
        
        logger.info(f"✅ User authenticated: {user_info.get('email', user_info.get('uid'))}")
        return user_info
        
    except auth.InvalidIdTokenError:
        logger.warning("Invalid Firebase ID token provided")
        return None
    except auth.ExpiredIdTokenError:
        logger.warning("Expired Firebase ID token provided")
        return None
    except Exception as e:
        logger.error(f"Error verifying Firebase token: {str(e)}")
        return None

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Dict[str, Any]:
    """
    Get current user from Firebase token (required - raises exception if not authenticated)
    
    Args:
        credentials: Bearer token from Authorization header
        
    Returns:
        User information dict
        
    Raises:
        HTTPException: If user is not authenticated or token is invalid
    """
    user = await get_current_user_optional(credentials)
    
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Authentication required. Please provide a valid Firebase ID token.",
            headers={"WWW-Authenticate": "Bearer"}
        )
    
    return user

DEMO_USER_ID = os.getenv("REVIEWER_UID", "reviewer-demo-user")


def guard_demo_user(user_id: Optional[str]):
    """Raise 403 if the user is the demo account. Call this in write endpoints."""
    if user_id and user_id == DEMO_USER_ID:
        raise HTTPException(
            status_code=403,
            detail="Demo account is read-only. Create your own account to save changes."
        )


def extract_user_id(user: Optional[Dict[str, Any]]) -> Optional[str]:
    """
    Extract user ID from user information dict
    
    Args:
        user: User information dict from get_current_user functions
        
    Returns:
        User ID string or None if not available
    """
    if not user:
        return None
    
    return user.get('uid')

def extract_user_email(user: Optional[Dict[str, Any]]) -> Optional[str]:
    """
    Extract user email from user information dict
    
    Args:
        user: User information dict from get_current_user functions
        
    Returns:
        User email string or None if not available
    """
    if not user:
        return None
    
    return user.get('email')

def is_user_verified(user: Optional[Dict[str, Any]]) -> bool:
    """
    Check if user's email is verified
    
    Args:
        user: User information dict from get_current_user functions
        
    Returns:
        True if user's email is verified, False otherwise
    """
    if not user:
        return False
    
    return user.get('email_verified', False)