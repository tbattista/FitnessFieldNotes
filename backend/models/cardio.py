from pydantic import BaseModel, Field
from typing import Any, Dict, Optional, List
from datetime import datetime, timezone
from uuid import uuid4


class CardioSession(BaseModel):
    """A logged cardio activity session (running, cycling, rowing, etc.)"""

    # Identity
    id: str = Field(
        default_factory=lambda: f"cardio-{datetime.now().strftime('%Y%m%d-%H%M%S')}-{uuid4().hex[:6]}",
        description="Unique cardio session identifier"
    )
    activity_type: str = Field(
        ...,
        description="Type of cardio activity: running, cycling, rowing, swimming, elliptical, stair_climber, walking, hiking, other"
    )
    activity_name: Optional[str] = Field(
        None,
        max_length=100,
        description="Custom name for the session (e.g., 'Morning Run', 'Trail Hike')"
    )

    # Timing
    started_at: datetime = Field(..., description="When the session started")
    completed_at: Optional[datetime] = Field(None, description="When the session ended")
    duration_minutes: Optional[int] = Field(
        None, ge=1, le=1440,
        description="Total duration in minutes"
    )

    # Distance
    distance: Optional[float] = Field(None, ge=0, description="Distance covered")
    distance_unit: str = Field(default="mi", description="Distance unit: 'mi', 'km', 'm', 'yd'")
    pace_per_unit: Optional[str] = Field(
        None,
        description="Pace as string, e.g., '8:30' (min/mile or min/km)"
    )

    # Heart Rate
    avg_heart_rate: Optional[int] = Field(None, ge=30, le=250, description="Average heart rate in BPM")
    max_heart_rate: Optional[int] = Field(None, ge=30, le=250, description="Maximum heart rate in BPM")

    # Effort
    calories: Optional[int] = Field(None, ge=0, le=10000, description="Estimated calories burned")
    rpe: Optional[int] = Field(None, ge=1, le=10, description="Rate of Perceived Exertion (1-10)")

    # Elevation
    elevation_gain: Optional[int] = Field(None, ge=0, description="Elevation gain")
    elevation_unit: str = Field(default="ft", description="Elevation unit: 'ft' or 'm'")

    # Activity-Specific Fields
    activity_details: Dict[str, Any] = Field(
        default_factory=dict,
        description="Activity-specific details: stroke_rate (rowing), cadence_rpm (cycling), laps (swimming), incline_percent (elliptical/stair)"
    )

    # Notes
    notes: Optional[str] = Field(None, max_length=500, description="Session notes")

    # External Data Source (future-proof for imports)
    source: str = Field(default="manual", description="Data source: 'manual', 'strava', 'garmin', 'apple_health'")
    external_id: Optional[str] = Field(None, description="ID from external source for deduplication")

    # Metadata
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="When this record was created")
    status: str = Field(default="completed", description="Session status: 'completed' or 'abandoned'")


# Request Models for Cardio Sessions

class CreateCardioSessionRequest(BaseModel):
    """Request to log a new cardio session"""

    activity_type: str = Field(..., description="Type of cardio activity")
    activity_name: Optional[str] = Field(None, max_length=100, description="Custom session name")
    started_at: Optional[datetime] = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="Start time (defaults to now UTC)"
    )
    completed_at: Optional[datetime] = Field(None, description="End time")
    duration_minutes: int = Field(..., ge=1, le=1440, description="Total duration in minutes")
    distance: Optional[float] = Field(None, ge=0, description="Distance covered")
    distance_unit: str = Field(default="mi", description="Distance unit")
    pace_per_unit: Optional[str] = Field(None, description="Pace string")
    avg_heart_rate: Optional[int] = Field(None, ge=30, le=250, description="Average HR")
    max_heart_rate: Optional[int] = Field(None, ge=30, le=250, description="Max HR")
    calories: Optional[int] = Field(None, ge=0, le=10000, description="Calories burned")
    rpe: Optional[int] = Field(None, ge=1, le=10, description="RPE (1-10)")
    elevation_gain: Optional[int] = Field(None, ge=0, description="Elevation gain")
    elevation_unit: str = Field(default="ft", description="Elevation unit")
    activity_details: Dict[str, Any] = Field(default_factory=dict, description="Activity-specific fields")
    notes: Optional[str] = Field(None, max_length=500, description="Session notes")

class UpdateCardioSessionRequest(BaseModel):
    """Request to update a cardio session"""

    activity_type: Optional[str] = Field(None, description="Type of cardio activity")
    activity_name: Optional[str] = Field(None, max_length=100, description="Custom session name")
    duration_minutes: Optional[int] = Field(None, ge=1, le=1440, description="Duration in minutes")
    distance: Optional[float] = Field(None, ge=0, description="Distance covered")
    distance_unit: Optional[str] = Field(None, description="Distance unit")
    pace_per_unit: Optional[str] = Field(None, description="Pace string")
    avg_heart_rate: Optional[int] = Field(None, ge=30, le=250, description="Average HR")
    max_heart_rate: Optional[int] = Field(None, ge=30, le=250, description="Max HR")
    calories: Optional[int] = Field(None, ge=0, le=10000, description="Calories burned")
    rpe: Optional[int] = Field(None, ge=1, le=10, description="RPE (1-10)")
    elevation_gain: Optional[int] = Field(None, ge=0, description="Elevation gain")
    elevation_unit: Optional[str] = Field(None, description="Elevation unit")
    activity_details: Optional[Dict[str, Any]] = Field(None, description="Activity-specific fields")
    notes: Optional[str] = Field(None, max_length=500, description="Session notes")


class CardioSessionListResponse(BaseModel):
    """Response model for cardio session list"""

    sessions: List[CardioSession] = Field(..., description="List of cardio sessions")
    total_count: int = Field(..., description="Total number of sessions")
    page: int = Field(default=1, description="Current page number")
    page_size: int = Field(default=20, description="Number of items per page")
