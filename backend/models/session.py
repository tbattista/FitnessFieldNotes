from pydantic import BaseModel, Field, field_validator
from typing import Any, Dict, Optional, List
from datetime import datetime, timezone
from uuid import uuid4


class SetDetail(BaseModel):
    """Optional per-set tracking for detailed workout logging"""

    set_number: int = Field(..., ge=1, description="Set number (1, 2, 3, etc.)")
    reps_completed: Optional[int] = Field(None, ge=0, description="Actual reps completed")
    weight: Optional[float] = Field(None, ge=0, description="Weight used for this set")
    notes: Optional[str] = Field(None, max_length=200, description="Notes about this set")

class ExercisePerformance(BaseModel):
    """Exercise performance data within a workout session"""

    # Exercise Identity
    exercise_name: str = Field(..., description="Name of the exercise")
    exercise_id: Optional[str] = Field(None, description="Reference to global_exercises if applicable")
    group_id: str = Field(..., description="Links to exercise_group in workout template")

    # Performance Data
    sets_completed: int = Field(default=0, ge=0, description="Number of sets completed")
    target_sets: str = Field(default="3", description="Target sets from template")
    target_reps: str = Field(default="8-12", description="Target reps from template")

    # Weight Tracking
    weight: Optional[str] = Field(None, description="Primary weight used - supports numeric (135) or text (Body, BW+25, 4x45)")
    weight_unit: str = Field(default="lbs", description="Weight unit: 'lbs', 'kg', or 'other'")
    weight_notes: Optional[str] = Field(None, max_length=100, description="Notes about weight (e.g., 'per hand' for dumbbells)")

    # Set-by-Set Detail (Optional - for advanced tracking)
    set_details: List[SetDetail] = Field(default_factory=list, description="Optional per-set breakdown")

    # Changes from Previous Session
    previous_weight: Optional[str] = Field(None, description="Weight from last session for comparison")
    weight_change: Optional[str] = Field(None, description="Change from previous (e.g., +5, -10, or text comparison)")

    # PHASE 1: Modification Tracking
    is_modified: bool = Field(default=False, description="Whether user modified weight from template default")
    modified_at: Optional[datetime] = Field(None, description="When user last modified this exercise")

    # PHASE 2: Skip Tracking (prepared for future)
    is_skipped: bool = Field(default=False, description="Whether exercise was skipped")
    skip_reason: Optional[str] = Field(None, max_length=200, description="Reason for skipping exercise")

    # Weight Progression Indicator (NEW)
    next_weight_direction: Optional[str] = Field(
        None,
        description="User intent for next session: 'up', 'down', or null"
    )

    # Original Template Values (for modification diff display)
    original_weight: Optional[str] = Field(None, description="Original template weight before modification")
    original_sets: Optional[str] = Field(None, description="Original template sets before modification")
    original_reps: Optional[str] = Field(None, description="Original template reps before modification")

    # Calories Burned (from smartwatch or manual entry)
    calories_burned: Optional[int] = Field(None, ge=0, description="Calories burned during this exercise (from smartwatch or manual entry)")

    # Exercise Notes
    notes: Optional[str] = Field(None, max_length=500, description="User notes for this exercise during session")

    # Metadata
    order_index: int = Field(..., ge=0, description="Position in workout (0-based)")

    @field_validator('weight', 'previous_weight', 'weight_change', 'original_weight', 'original_sets', 'original_reps', mode='before')
    @classmethod
    def coerce_to_string(cls, v):
        """Coerce numeric values to strings for backward compatibility with Firestore data."""
        if v is None:
            return v
        if isinstance(v, (int, float)):
            return str(v)
        return v


class SessionNote(BaseModel):
    """Inline note within a workout session (session-only, not saved to templates)"""

    id: str = Field(
        default_factory=lambda: f"note-{int(datetime.now().timestamp() * 1000)}-{uuid4().hex[:6]}",
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
        description="Position in session item list"
    )
    created_at: datetime = Field(
        default_factory=datetime.now,
        description="When the note was created"
    )
    modified_at: Optional[datetime] = Field(
        None,
        description="When the note was last modified"
    )


class WorkoutSession(BaseModel):
    """Completed or in-progress workout session"""

    # Identity
    id: str = Field(
        default_factory=lambda: f"session-{datetime.now().strftime('%Y%m%d-%H%M%S')}-{uuid4().hex[:6]}",
        description="Unique session identifier"
    )
    workout_id: str = Field(..., description="Reference to workout template ID")
    workout_name: str = Field(..., description="Denormalized workout name for quick display")

    # Timing
    started_at: datetime = Field(..., description="When the workout session started")
    completed_at: Optional[datetime] = Field(None, description="When the workout was completed")
    duration_minutes: Optional[int] = Field(None, ge=0, description="Total workout duration in minutes")

    # Session Data
    exercises_performed: List[ExercisePerformance] = Field(
        default_factory=list,
        description="List of exercises performed in this session"
    )
    notes: Optional[str] = Field(None, max_length=500, description="Session notes")
    calories: Optional[int] = Field(None, ge=0, le=99999, description="Total calories burned during session")

    # Session Notes (inline notes interspersed with exercises)
    session_notes: List[SessionNote] = Field(
        default_factory=list,
        description="Inline notes within the session (session-only, not saved to templates)"
    )

    # Custom Exercise Order (Phase 3 - Exercise Reordering)
    exercise_order: Optional[List[str]] = Field(
        None,
        description="Custom order of exercises and notes (list of names/IDs). If present, overrides template order."
    )

    @field_validator('exercise_order', mode='before')
    @classmethod
    def validate_exercise_order_unique(cls, v):
        """Ensure exercise order contains unique exercise names."""
        if v is None:
            return v
        if len(v) != len(set(v)):
            raise ValueError("Exercise order must contain unique exercise names")
        return v

    # Program Tracking
    program_id: Optional[str] = Field(None, description="ID of the program this session belongs to (auto-linked from active program)")

    # Status
    status: str = Field(
        default="in_progress",
        description="Session status: 'in_progress', 'completed', or 'abandoned'"
    )

    # Session Mode (Quick Log Feature)
    session_mode: str = Field(
        default="timed",
        description="Session mode: 'timed' (real-time tracking with timer) or 'quick_log' (retrospective logging without timer)"
    )

    # Metadata
    created_at: datetime = Field(default_factory=datetime.now, description="When session was created")
    version: int = Field(default=1, description="Workout template version at time of session")
    sync_status: str = Field(default="synced", description="Sync status: 'synced', 'pending', 'error'")

class ExerciseHistory(BaseModel):
    """Quick lookup index for last used weights per exercise in a workout"""

    # Composite Key: {workout_id}_{exercise_name}
    id: str = Field(..., description="Composite ID: '{workout_id}_{exercise_name}'")
    workout_id: str = Field(..., description="Workout template ID")
    exercise_name: str = Field(..., description="Exercise name")

    # Last Session Data
    last_weight: Optional[str] = Field(None, description="Last weight used - supports numeric or text")
    last_weight_unit: str = Field(default="lbs", description="Unit for last weight")
    last_session_id: Optional[str] = Field(None, description="Reference to last workout session")
    last_session_date: Optional[datetime] = Field(None, description="Date of last session")

    # Weight Progression Indicator (NEW)
    last_weight_direction: Optional[str] = Field(
        None,
        description="Weight direction from last session: 'up', 'down', or null"
    )

    # Historical Tracking
    total_sessions: int = Field(default=0, ge=0, description="Total number of sessions logged")
    first_session_date: Optional[datetime] = Field(None, description="Date of first logged session")
    best_weight: Optional[str] = Field(None, description="Personal record weight - supports numeric or text")
    best_weight_date: Optional[datetime] = Field(None, description="Date PR was set")

    # Recent Sessions (last 5 for trend analysis)
    recent_sessions: List[Dict[str, Any]] = Field(
        default_factory=list,
        max_items=5,
        description="Last 5 sessions with date, weight, sets"
    )

    # Metadata
    updated_at: datetime = Field(default_factory=datetime.now, description="Last update timestamp")

    @field_validator('last_weight', 'best_weight', mode='before')
    @classmethod
    def convert_weight_to_string(cls, v):
        """Convert numeric weights to strings for backward compatibility with Firestore data"""
        if v is None:
            return v
        if isinstance(v, (int, float)):
            return str(v)
        return str(v) if v else None


# Request Models for Workout Sessions

class CreateSessionRequest(BaseModel):
    """Request to create/start a new workout session"""

    workout_id: str = Field(..., description="ID of the workout template")
    workout_name: str = Field(..., description="Name of the workout")
    started_at: Optional[datetime] = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="Start time (defaults to now UTC)"
    )
    session_mode: str = Field(
        default="timed",
        description="Session mode: 'timed' (real-time tracking) or 'quick_log' (retrospective logging)"
    )
    program_id: Optional[str] = Field(None, description="ID of the program this session belongs to")

class UpdateSessionRequest(BaseModel):
    """Request to update session progress (auto-save during workout)"""

    exercises_performed: Optional[List[ExercisePerformance]] = Field(
        None,
        description="Updated list of exercises performed"
    )
    notes: Optional[str] = Field(None, max_length=500, description="Session notes")
    status: Optional[str] = Field(None, description="Session status")

class CompleteSessionRequest(BaseModel):
    """Request to finalize a workout session"""

    completed_at: Optional[datetime] = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="Completion time (defaults to now UTC)"
    )
    exercises_performed: List[ExercisePerformance] = Field(
        ...,
        description="Final list of all exercises performed"
    )
    notes: Optional[str] = Field(None, max_length=500, description="Final session notes")
    session_notes: List[SessionNote] = Field(
        default_factory=list,
        description="Inline notes within the session"
    )
    exercise_order: Optional[List[str]] = Field(
        None,
        description="Custom order of exercises (list of exercise names). Saves user's preferred exercise sequence."
    )
    duration_minutes: Optional[int] = Field(
        None,
        ge=1,
        le=600,
        description="Manual duration for quick_log sessions (in minutes). If provided, overrides auto-calculated duration."
    )
    calories: Optional[int] = Field(
        None,
        ge=0,
        le=99999,
        description="Total calories burned during session (from user input at session completion)"
    )

    @field_validator('exercise_order', mode='before')
    @classmethod
    def validate_exercise_order_unique(cls, v):
        """Ensure exercise order contains unique exercise names."""
        if v is None:
            return v
        if len(v) != len(set(v)):
            raise ValueError("Exercise order must contain unique exercise names")
        return v


class CreateAndCompleteSessionRequest(BaseModel):
    """
    Request to atomically create and complete a workout session in one operation.
    Used for recovery scenarios where the original session was lost.
    Avoids race condition between create and complete API calls.
    """

    workout_id: str = Field(..., description="ID of the workout template")
    workout_name: str = Field(..., description="Name of the workout")
    started_at: datetime = Field(..., description="When the workout started")
    completed_at: Optional[datetime] = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="Completion time (defaults to now UTC)"
    )
    exercises_performed: List[ExercisePerformance] = Field(
        ...,
        description="Final list of all exercises performed"
    )
    session_mode: str = Field(
        default="timed",
        description="Session mode: 'timed' or 'quick_log'"
    )
    program_id: Optional[str] = Field(None, description="ID of the program this session belongs to")
    notes: Optional[str] = Field(None, max_length=500, description="Session notes")
    session_notes: List[SessionNote] = Field(
        default_factory=list,
        description="Inline notes within the session"
    )
    exercise_order: Optional[List[str]] = Field(
        None,
        description="Custom order of exercises (list of exercise names)"
    )
    duration_minutes: Optional[int] = Field(
        None,
        ge=1,
        le=600,
        description="Manual duration for quick_log sessions (in minutes)"
    )
    calories: Optional[int] = Field(
        None,
        ge=0,
        le=99999,
        description="Total calories burned during session"
    )

    @field_validator('exercise_order', mode='before')
    @classmethod
    def validate_exercise_order_unique(cls, v):
        """Ensure exercise order contains unique exercise names."""
        if v is None:
            return v
        if len(v) != len(set(v)):
            raise ValueError("Exercise order must contain unique exercise names")
        return v


class EditSessionRequest(BaseModel):
    """Request to edit a completed workout session's metadata and exercises"""

    started_at: Optional[datetime] = Field(None, description="Updated start time")
    completed_at: Optional[datetime] = Field(None, description="Updated completion time")
    duration_minutes: Optional[int] = Field(None, ge=1, le=600, description="Updated duration in minutes")
    workout_name: Optional[str] = Field(None, max_length=100, description="Updated workout name")
    notes: Optional[str] = Field(None, max_length=500, description="Updated session notes")
    exercises_performed: Optional[List[ExercisePerformance]] = Field(
        None,
        description="Updated list of exercises performed"
    )
    session_notes: Optional[List[SessionNote]] = Field(
        None,
        description="Updated inline notes"
    )


class ProgramProgressResponse(BaseModel):
    """Response model for program progress/stats"""

    program_id: str = Field(..., description="Program ID")
    program_name: str = Field(..., description="Program name")
    total_sessions: int = Field(default=0, description="Total completed sessions linked to this program")
    workouts_completed: Dict[str, int] = Field(default_factory=dict, description="Map of workout_id -> completion count")
    unique_workouts_completed: int = Field(default=0, description="Number of unique workouts completed at least once")
    total_workouts_in_program: int = Field(default=0, description="Total workouts in the program")
    completion_percentage: float = Field(default=0.0, description="Percentage of unique workouts completed (0-100)")
    total_duration_minutes: int = Field(default=0, description="Total time spent across all sessions")
    first_session_date: Optional[str] = Field(None, description="Date of first session (ISO format)")
    last_session_date: Optional[str] = Field(None, description="Date of most recent session (ISO format)")
    current_streak: int = Field(default=0, description="Current consecutive days with a session")
    best_streak: int = Field(default=0, description="Best consecutive days streak")
    daily_activity: Dict[str, int] = Field(default_factory=dict, description="Map of date string -> session count")
    weekly_summary: Dict[str, int] = Field(default_factory=dict, description="Map of ISO week -> session count")


# Response Models for Workout Sessions

class SessionListResponse(BaseModel):
    """Response model for workout session list"""

    sessions: List[WorkoutSession] = Field(..., description="List of workout sessions")
    total_count: int = Field(..., description="Total number of sessions")
    page: int = Field(default=1, description="Current page number")
    page_size: int = Field(default=20, description="Number of items per page")

class ExerciseHistoryResponse(BaseModel):
    """Response model for exercise history lookup"""

    workout_id: str = Field(..., description="Workout template ID")
    workout_name: str = Field(..., description="Workout name")
    exercises: Dict[str, ExerciseHistory] = Field(
        ...,
        description="Exercise histories keyed by exercise name"
    )
    last_exercise_order: Optional[List[str]] = Field(
        None,
        description="Custom exercise order from last completed session (Phase 3 - Exercise Reordering)"
    )
