from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from datetime import datetime


class FavoriteExercise(BaseModel):
    """Denormalized favorite exercise data for quick display"""

    exerciseId: str = Field(..., description="ID of the favorited exercise")
    name: str = Field(..., description="Exercise name")
    targetMuscleGroup: Optional[str] = Field(None, description="Primary muscle group")
    primaryEquipment: Optional[str] = Field(None, description="Primary equipment needed")
    isGlobal: bool = Field(True, description="Whether this is a global or custom exercise")
    favoritedAt: datetime = Field(
        default_factory=datetime.now,
        description="When the exercise was favorited"
    )

class UserFavorites(BaseModel):
    """User's favorite exercises collection"""

    exerciseIds: List[str] = Field(
        default_factory=list,
        description="Array of favorited exercise IDs for quick lookup"
    )
    exercises: Dict[str, FavoriteExercise] = Field(
        default_factory=dict,
        description="Denormalized exercise data keyed by exercise ID"
    )
    lastUpdated: datetime = Field(
        default_factory=datetime.now,
        description="When favorites were last modified"
    )
    count: int = Field(
        default=0,
        ge=0,
        description="Total number of favorites"
    )

class AddFavoriteRequest(BaseModel):
    """Request model for adding exercise to favorites"""

    exerciseId: str = Field(..., description="ID of exercise to favorite")

class FavoritesResponse(BaseModel):
    """Response model for user's favorites"""

    favorites: List[FavoriteExercise] = Field(..., description="List of favorite exercises")
    count: int = Field(..., description="Total number of favorites")
    lastUpdated: datetime = Field(..., description="When favorites were last updated")
