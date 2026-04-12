"""
Tabata Kettlebell Models - Data models for AI-generated tabata kettlebell workouts.
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Literal


Protocol = Literal["20/10", "40/20"]
FocusArea = Literal[
    "upper_body",
    "lower_body",
    "chest",
    "back",
    "core",
    "full_body",
    "conditioning",
]


class GenerateTabataKettlebellRequest(BaseModel):
    """Request to generate a tabata kettlebell workout."""
    protocol: Protocol = Field(
        ...,
        description="Work/rest protocol. '20/10' = classic tabata, '40/20' = longer work window.",
    )
    focus_areas: List[FocusArea] = Field(
        ...,
        min_length=1,
        max_length=4,
        description="Muscle group or training focus for the workout.",
    )
    rounds: int = Field(
        ...,
        ge=1,
        le=12,
        description="Number of tabata rounds (one round = N intervals of work+rest).",
    )
    intervals_per_round: int = Field(
        default=8,
        ge=4,
        le=12,
        description="Intervals per round. Default 8 (classic tabata).",
    )


class TabataKettlebellSegment(BaseModel):
    """A single segment within a tabata kettlebell workout (warmup, work, rest, or round rest)."""
    name: str = Field(..., max_length=60, description="Segment name / exercise name")
    segment_type: Literal["warmup", "work", "rest", "round_rest"] = Field(
        ..., description="Type of segment"
    )
    duration_seconds: int = Field(..., ge=5, le=600, description="Segment duration in seconds")
    exercise: str = Field(default="", max_length=60, description="Kettlebell exercise name (work segments only)")
    cue: str = Field(default="", max_length=140, description="Brief coaching cue")
    side: Optional[Literal["left", "right", "both"]] = Field(
        default=None, description="Which side for unilateral exercises"
    )
    round_index: int = Field(default=0, ge=0, description="0-based round index (0 for warmup)")
    interval_index: int = Field(default=0, ge=0, description="0-based interval index within the round")


class TabataKettlebellPlan(BaseModel):
    """A complete AI-generated tabata kettlebell workout plan."""
    title: str = Field(..., max_length=80, description="Workout title")
    protocol: Protocol = Field(..., description="Work/rest protocol used")
    focus_areas: List[FocusArea] = Field(..., description="Focus areas for this workout")
    rounds: int = Field(..., description="Number of rounds")
    intervals_per_round: int = Field(..., description="Intervals per round")
    total_seconds: int = Field(..., description="Sum of all segment durations")
    segments: List[TabataKettlebellSegment] = Field(
        ..., min_length=1, description="Ordered list of segments (warmup, work, rest, round_rest)"
    )
    estimated_calories: Optional[int] = Field(None, ge=0, description="Rough calorie estimate")
