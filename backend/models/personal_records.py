from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict
from datetime import datetime


class PersonalRecord(BaseModel):
    """A single personal record entry"""

    id: str = Field(..., description="Unique PR ID: '{pr_type}_{normalized_name}'")
    pr_type: str = Field(..., description="Type: 'weight', 'distance', 'duration', 'pace'")
    exercise_name: str = Field(..., description="Exercise or activity name")
    activity_type: Optional[str] = Field(None, description="Cardio activity type if applicable")
    value: str = Field(..., description="The PR value as string (e.g., '225', '5.0', '45', '7:30')")
    value_unit: str = Field(default="lbs", description="Unit: 'lbs', 'kg', 'mi', 'km', 'min', 'min/mi', etc.")
    session_id: Optional[str] = Field(None, description="Session ID where PR was achieved")
    session_date: Optional[datetime] = Field(None, description="Date of the session")
    workout_name: Optional[str] = Field(None, description="Workout name for display")
    sets_reps: Optional[str] = Field(None, description="Sets x Reps context (e.g., '3x8')")
    marked_at: datetime = Field(default_factory=datetime.now, description="When user marked this as PR")
    is_manual: bool = Field(default=True, description="True if user-marked, False if auto-detected")


class UserPersonalRecords(BaseModel):
    """User's personal records collection (single Firestore document)"""

    recordIds: List[str] = Field(default_factory=list, description="Array of PR IDs for quick lookup")
    records: Dict[str, PersonalRecord] = Field(default_factory=dict, description="PR data keyed by PR ID")
    lastUpdated: datetime = Field(default_factory=datetime.now)
    count: int = Field(default=0, ge=0)


class MarkPersonalRecordRequest(BaseModel):
    """Request model for marking a personal record"""

    pr_type: str = Field(..., description="Type: 'weight', 'distance', 'duration', 'pace'")
    exercise_name: str = Field(..., description="Exercise or activity name")
    activity_type: Optional[str] = Field(default=None, description="Cardio activity type")
    value: str = Field(..., description="The PR value")
    value_unit: str = Field(default="lbs", description="Unit for the value")
    session_id: Optional[str] = Field(default=None, description="Session ID where PR was achieved")
    session_date: Optional[datetime] = Field(default=None, description="Date of the session")
    workout_name: Optional[str] = Field(default=None, description="Workout name")
    sets_reps: Optional[str] = Field(default=None, description="Sets x Reps context")

    @field_validator('value', mode='before')
    @classmethod
    def convert_value_to_string(cls, v):
        """Convert numeric values to strings (frontend may send numbers)"""
        if v is not None and not isinstance(v, str):
            return str(v)
        return v


class UpdatePersonalRecordRequest(BaseModel):
    """Request model for updating a PR value"""

    value: str = Field(..., description="The new PR value")
    value_unit: Optional[str] = Field(None, description="Unit for the value (optional, keeps existing if not provided)")
    session_id: Optional[str] = Field(None, description="Session ID if from a session")
    session_date: Optional[datetime] = Field(None, description="Date of the session")


class ReorderPersonalRecordsRequest(BaseModel):
    """Request model for reordering personal records"""

    recordIds: List[str] = Field(..., description="Ordered list of PR IDs")


class PersonalRecordsResponse(BaseModel):
    """Response model for user's personal records"""

    records: List[PersonalRecord] = Field(..., description="List of personal records")
    recordIds: List[str] = Field(default_factory=list, description="Ordered list of PR IDs for display order")
    count: int = Field(..., description="Total number of PRs")
    lastUpdated: datetime = Field(..., description="When PRs were last updated")
