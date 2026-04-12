"""
Tabata Kettlebell Models - Data models for AI-generated tabata kettlebell workouts.

Terminology (Tabata standard):
  - Work Interval  = 20s (or 40s) all-out effort
  - Rest Interval  = 10s (or 20s) recovery between rounds
  - Round          = one Work Interval + one Rest Interval
  - Set            = a group of rounds (classic Tabata = 8 rounds = 1 set = 4 minutes)
  - Set Rest       = recovery between Tabata sets
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
    sets: int = Field(
        ...,
        ge=1,
        le=12,
        description="Number of Tabata sets. One set = rounds_per_set rounds (classic = 8).",
    )
    rounds_per_set: int = Field(
        default=8,
        ge=4,
        le=12,
        description="Rounds per set. One round = one work interval + one rest interval. Default 8 (classic tabata).",
    )


class TabataKettlebellSegment(BaseModel):
    """A single segment within a tabata kettlebell workout (work interval, rest interval, or set rest)."""
    name: str = Field(..., max_length=60, description="Segment name / exercise name")
    segment_type: Literal["work", "rest", "set_rest"] = Field(
        ..., description="Type of segment"
    )
    duration_seconds: int = Field(..., ge=5, le=600, description="Segment duration in seconds")
    exercise: str = Field(default="", max_length=60, description="Kettlebell exercise name (work intervals only)")
    cue: str = Field(default="", max_length=140, description="Brief coaching cue")
    side: Optional[Literal["left", "right", "both"]] = Field(
        default=None, description="Which side for unilateral exercises"
    )
    set_index: int = Field(default=1, ge=1, description="1-based Tabata set index")
    round_index: int = Field(default=0, ge=0, description="0-based round index within the set")


class TabataKettlebellPlan(BaseModel):
    """A complete AI-generated tabata kettlebell workout plan."""
    title: str = Field(..., max_length=80, description="Workout title")
    protocol: Protocol = Field(..., description="Work/rest protocol used")
    focus_areas: List[FocusArea] = Field(..., description="Focus areas for this workout")
    sets: int = Field(..., description="Number of Tabata sets")
    rounds_per_set: int = Field(..., description="Rounds per set (1 round = 1 work + 1 rest interval)")
    total_seconds: int = Field(..., description="Sum of all segment durations")
    segments: List[TabataKettlebellSegment] = Field(
        ..., min_length=1, description="Ordered list of segments (work, rest, set_rest)"
    )
    estimated_calories: Optional[int] = Field(None, ge=0, description="Rough calorie estimate")
