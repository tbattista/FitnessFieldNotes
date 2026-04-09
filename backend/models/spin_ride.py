"""
Spin Ride Models - Data models for AI-generated spin bike interval workouts.
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Literal


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
