from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from uuid import uuid4

from .template import WorkoutTemplate


class ProgramWorkout(BaseModel):
    """Association model for workouts within a program"""

    workout_id: str = Field(
        ...,
        description="ID of the workout template"
    )

    order_index: int = Field(
        ...,
        description="Order of this workout in the program",
        ge=0
    )

    custom_name: Optional[str] = Field(
        default=None,
        description="Custom name for this workout instance in the program",
        example="Week 1 - Push Day"
    )

    custom_date: Optional[str] = Field(
        default=None,
        description="Custom date for this workout instance",
        example="2025-01-15"
    )

class Program(BaseModel):
    """Model for workout programs"""

    id: str = Field(
        default_factory=lambda: f"program-{uuid4().hex[:8]}",
        description="Unique identifier for the program"
    )

    name: str = Field(
        ...,
        description="Name of the program",
        example="Push/Pull/Legs Split"
    )

    description: Optional[str] = Field(
        default="",
        description="Description of the program",
        example="A 6-day split focusing on push, pull, and leg movements"
    )

    workouts: List[ProgramWorkout] = Field(
        default_factory=list,
        description="List of workouts in this program with their order"
    )

    duration_weeks: Optional[int] = Field(
        default=None,
        description="Planned duration of the program in weeks",
        example=12
    )

    difficulty_level: Optional[str] = Field(
        default="intermediate",
        description="Difficulty level of the program",
        example="beginner"
    )

    tags: List[str] = Field(
        default_factory=list,
        description="Tags for categorizing programs",
        example=["strength", "hypertrophy", "split"]
    )

    created_date: datetime = Field(
        default_factory=datetime.now,
        description="When the program was created"
    )

    modified_date: datetime = Field(
        default_factory=datetime.now,
        description="When the program was last modified"
    )

    # Tracker Feature
    tracker_enabled: bool = Field(
        default=False,
        description="Enable habit-style visual tracker for this program"
    )
    tracker_goal: Optional[str] = Field(
        default=None,
        description="Frequency goal for tracker, e.g. '1/day', '3/week', '5/week'",
        example="3/week"
    )
    started_at: Optional[datetime] = Field(
        default=None,
        description="When the user started this program"
    )
    is_active: bool = Field(
        default=False,
        description="Whether this is the currently active/pinned program"
    )


class CreateProgramRequest(BaseModel):
    """Request model for creating a new program"""

    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(default="", max_length=1000)
    duration_weeks: Optional[int] = Field(None, ge=1, le=52)
    difficulty_level: Optional[str] = Field(default="intermediate")
    tags: List[str] = Field(default_factory=list, max_items=10)
    tracker_enabled: bool = Field(default=False, description="Enable habit-style tracker")
    tracker_goal: Optional[str] = Field(default=None, description="Frequency goal e.g. '3/week'")

class UpdateProgramRequest(BaseModel):
    """Request model for updating a program"""

    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=1000)
    workouts: Optional[List[ProgramWorkout]] = Field(None)
    duration_weeks: Optional[int] = Field(None, ge=1, le=52)
    difficulty_level: Optional[str] = Field(None)
    tags: Optional[List[str]] = Field(None, max_items=10)
    tracker_enabled: Optional[bool] = Field(None, description="Enable habit-style tracker")
    tracker_goal: Optional[str] = Field(None, description="Frequency goal e.g. '3/week'")
    is_active: Optional[bool] = Field(None, description="Set as active/pinned program")
    started_at: Optional[datetime] = Field(None, description="When user started the program")

class AddWorkoutToProgramRequest(BaseModel):
    """Request model for adding a workout to a program"""

    workout_id: str = Field(..., description="ID of the workout to add")
    order_index: Optional[int] = Field(None, description="Position in program (defaults to end)")
    custom_name: Optional[str] = Field(None, max_length=100)
    custom_date: Optional[str] = Field(None)

class GenerateProgramDocumentRequest(BaseModel):
    """Request model for generating a program document"""

    program_id: str = Field(..., description="ID of the program to generate")
    include_cover_page: bool = Field(default=True)
    include_table_of_contents: bool = Field(default=True)
    include_progress_tracking: bool = Field(default=True)
    start_date: Optional[str] = Field(None, description="Start date for the program")


class ProgramListResponse(BaseModel):
    """Response model for program list"""

    programs: List[Program] = Field(..., description="List of programs")
    total_count: int = Field(..., description="Total number of programs")
    page: int = Field(default=1, description="Current page number")
    page_size: int = Field(default=20, description="Number of items per page")

class ProgramWithWorkoutsResponse(BaseModel):
    """Response model for program with full workout details"""

    program: Program = Field(..., description="Program information")
    workout_details: List[WorkoutTemplate] = Field(..., description="Full details of all workouts in the program")
