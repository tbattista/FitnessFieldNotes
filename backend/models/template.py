from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from uuid import uuid4

from .workout import ExerciseGroup, WorkoutSection


class TemplateNote(BaseModel):
    """Inline note within a workout template (permanent, saved with template)"""

    id: str = Field(
        default_factory=lambda: f"template-note-{int(datetime.now().timestamp() * 1000)}-{uuid4().hex[:6]}",
        description="Unique note identifier"
    )
    content: str = Field(
        default="",
        max_length=500,
        description="Note text content (max 500 chars)"
    )
    order_index: int = Field(
        default=0,
        ge=0,
        description="Position in workout item list"
    )
    created_at: datetime = Field(
        default_factory=datetime.now,
        description="When the note was created"
    )
    modified_at: Optional[datetime] = Field(
        None,
        description="When the note was last modified"
    )


class WorkoutTemplate(BaseModel):
    """Enhanced workout model for the program system"""

    id: str = Field(
        default_factory=lambda: f"workout-{uuid4().hex[:8]}",
        description="Unique identifier for the workout"
    )

    name: str = Field(
        ...,
        description="Name of the workout",
        example="Push Day A"
    )

    description: Optional[str] = Field(
        default="",
        description="Optional description of the workout",
        example="Chest, shoulders, and triceps focused workout"
    )

    exercise_groups: List[ExerciseGroup] = Field(
        default_factory=list,
        description="List of exercise groups in this workout"
    )

    sections: Optional[List[WorkoutSection]] = Field(
        default=None,
        description="Sections-based layout (new format). If present, takes precedence over exercise_groups."
    )

    template_notes: List[TemplateNote] = Field(
        default_factory=list,
        description="Inline notes within the workout template (permanent)"
    )

    is_template: bool = Field(
        default=True,
        description="Whether this workout is a reusable template"
    )

    tags: List[str] = Field(
        default_factory=list,
        description="Tags for categorizing workouts",
        example=["push", "chest", "beginner"]
    )

    created_date: datetime = Field(
        default_factory=datetime.now,
        description="When the workout was created"
    )

    modified_date: datetime = Field(
        default_factory=datetime.now,
        description="When the workout was last modified"
    )

    # Favorites support
    is_favorite: bool = Field(
        default=False,
        description="Whether this workout is marked as a favorite"
    )

    favorited_at: Optional[datetime] = Field(
        default=None,
        description="When the workout was marked as favorite"
    )

    # Archive (soft-delete) support
    is_archived: bool = Field(
        default=False,
        description="Whether this workout is archived (soft-deleted)"
    )

    archived_at: Optional[datetime] = Field(
        default=None,
        description="When the workout was archived"
    )


class CreateWorkoutRequest(BaseModel):
    """Request model for creating a new workout"""

    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(default="", max_length=500)
    exercise_groups: List[ExerciseGroup] = Field(default_factory=list)
    sections: Optional[List[WorkoutSection]] = Field(default=None)
    template_notes: List[TemplateNote] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list, max_items=10)

class UpdateWorkoutRequest(BaseModel):
    """Request model for updating a workout"""

    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    exercise_groups: Optional[List[ExerciseGroup]] = Field(None)
    sections: Optional[List[WorkoutSection]] = Field(default=None)
    template_notes: Optional[List[TemplateNote]] = Field(default=None)
    tags: Optional[List[str]] = Field(None, max_items=10)

    # Favorites support
    is_favorite: Optional[bool] = Field(None, description="Whether this workout is marked as a favorite")
    favorited_at: Optional[datetime] = Field(None, description="When the workout was marked as favorite")

    # Archive (soft-delete) support
    is_archived: Optional[bool] = Field(None, description="Whether this workout is archived")
    archived_at: Optional[datetime] = Field(None, description="When the workout was archived")


class WorkoutListResponse(BaseModel):
    """Response model for workout list"""

    workouts: List[WorkoutTemplate] = Field(..., description="List of workout templates")
    total_count: int = Field(..., description="Total number of workouts")
    page: int = Field(default=1, description="Current page number")
    page_size: int = Field(default=50, description="Number of items per page")
