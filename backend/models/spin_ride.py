"""
Spin Ride Models - Data models for AI-generated spin bike interval workouts.
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime


class GenerateSpinRideRequest(BaseModel):
    """Request to generate a spin ride plan."""
    duration_minutes: int = Field(
        ...,
        description="Ride duration in minutes",
        ge=5,
        le=120,
    )
    include_all_outs: bool = Field(
        default=False,
        description="If true, the generator may include short max-effort 'all-out' sprint segments.",
    )
    difficulty: Optional[Literal["easy", "moderate", "hard", "intense"]] = Field(
        default=None,
        description="Requested ride difficulty. If omitted, AI chooses based on ride theme.",
    )


class SpinRideSegment(BaseModel):
    """A single interval segment within a spin ride."""
    name: str = Field(..., max_length=50, description="Segment name, e.g. 'Hill Climb 1'")
    segment_type: Literal["warmup", "flat", "climb", "sprint", "all_out", "recovery", "cooldown"] = Field(
        ..., description="Type of interval segment"
    )
    duration_seconds: int = Field(..., ge=15, le=600, description="Segment duration in seconds")
    resistance: int = Field(..., ge=1, le=10, description="Resistance level (1-10 scale)")
    rpm_low: int = Field(..., ge=50, le=130, description="Lower bound of target RPM range")
    rpm_high: int = Field(..., ge=50, le=130, description="Upper bound of target RPM range")
    cue: str = Field(default="", max_length=120, description="Brief coaching cue")


class SpinRidePlan(BaseModel):
    """A complete AI-generated spin ride plan."""
    title: str = Field(..., max_length=80, description="Ride title")
    duration_minutes: int = Field(..., description="Requested ride duration")
    total_seconds: int = Field(..., description="Sum of all segment durations")
    segments: List[SpinRideSegment] = Field(..., min_length=1, description="Ordered list of intervals")
    estimated_calories: Optional[int] = Field(None, ge=0, description="Rough calorie estimate")
    difficulty: Literal["easy", "moderate", "hard", "intense"] = Field(
        ..., description="Overall ride difficulty"
    )


# ── Saved Spin Rides (personal history) ─────────────────────────────────


class SaveSpinRideRequest(BaseModel):
    """Request to save a completed ride to the user's personal history."""
    plan: SpinRidePlan = Field(..., description="The exact plan the user just rode")
    last_actual_seconds: Optional[int] = Field(
        None, ge=0, description="How many seconds the user actually rode (paused time excluded)"
    )


class UpdateSavedSpinRideRequest(BaseModel):
    """Partial update for a saved ride — toggle favorite or bump completion."""
    is_favorite: Optional[bool] = None
    increment_completion: Optional[bool] = Field(
        None,
        description="If true, atomically increment completion_count and refresh last_ridden_at.",
    )
    last_actual_seconds: Optional[int] = Field(None, ge=0)


class SavedSpinRide(BaseModel):
    """A spin ride the user has completed at least once, kept in their history."""
    id: str = Field(..., description="Document ID (also the Firestore key)")
    plan: SpinRidePlan
    is_favorite: bool = False
    completion_count: int = Field(default=1, ge=1)
    saved_at: datetime
    last_ridden_at: datetime
    last_actual_seconds: Optional[int] = None


class SavedSpinRideListResponse(BaseModel):
    """Paged list of the user's saved rides."""
    rides: List[SavedSpinRide]
    total_count: int
    page: int
    page_size: int
