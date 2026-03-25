from pydantic import BaseModel, Field
from typing import Any, Dict, Optional, List
from datetime import datetime
from uuid import uuid4


class SharedWorkoutStats(BaseModel):
    """Statistics for shared workouts"""
    view_count: int = Field(default=0, ge=0)
    save_count: int = Field(default=0, ge=0)

class PublicWorkout(BaseModel):
    """Public shared workout"""
    id: str = Field(default_factory=lambda: f"public-{uuid4().hex[:8]}")
    workout_data: Dict[str, Any] = Field(..., description="Full workout snapshot")
    creator_id: str = Field(..., description="User ID of creator")
    creator_name: Optional[str] = Field(None, description="Display name (null = anonymous)")
    source_workout_id: str = Field(..., description="Original workout ID")
    created_at: datetime = Field(default_factory=datetime.now)
    is_moderated: bool = Field(default=False, description="Admin moderation flag")
    stats: SharedWorkoutStats = Field(default_factory=SharedWorkoutStats)

class PrivateShare(BaseModel):
    """Private workout share with token"""
    token: str = Field(..., description="Share token (document ID)")
    workout_data: Dict[str, Any] = Field(..., description="Full workout snapshot")
    creator_id: str = Field(..., description="User ID of creator")
    creator_name: Optional[str] = Field(None, description="Display name (null = anonymous)")
    created_at: datetime = Field(default_factory=datetime.now)
    expires_at: Optional[datetime] = Field(None, description="Optional expiration")
    view_count: int = Field(default=0, ge=0)

# Request Models
class ShareWorkoutPublicRequest(BaseModel):
    """Request to share workout publicly"""
    workout_id: str = Field(..., description="ID of workout to share")
    show_creator_name: bool = Field(default=True, description="Show creator attribution")

class ShareWorkoutPrivateRequest(BaseModel):
    """Request to create private share"""
    workout_id: str = Field(..., description="ID of workout to share")
    show_creator_name: bool = Field(default=True)
    expires_in_days: Optional[int] = Field(None, ge=1, le=365, description="Expiration in days")

class SavePublicWorkoutRequest(BaseModel):
    """Request to save public workout to user's library"""
    custom_name: Optional[str] = Field(None, description="Optional custom name")

# Response Models
class PublicWorkoutListResponse(BaseModel):
    """Response for browsing public workouts"""
    workouts: List[PublicWorkout]
    total_count: int
    page: int = 1
    page_size: int = 20

class ShareTokenResponse(BaseModel):
    """Response after creating private share"""
    token: str
    share_url: str
    expires_at: Optional[datetime] = None
