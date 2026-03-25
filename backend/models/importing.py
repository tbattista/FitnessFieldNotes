from pydantic import BaseModel, Field
from typing import Any, Dict, Optional, List
from datetime import datetime


class ImportParseRequest(BaseModel):
    """Request to parse raw workout content into structured data"""
    content: str = Field(..., min_length=1, max_length=50000, description="Raw workout content (text, CSV, or JSON)")
    format_hint: Optional[str] = Field(None, description="Optional format hint: 'text', 'csv', 'json'")

class ImportParseResponse(BaseModel):
    """Response from parsing workout content"""
    success: bool = Field(..., description="Whether parsing succeeded")
    workout_data: Optional[Dict[str, Any]] = Field(None, description="Parsed workout data (WorkoutTemplate-compatible)")
    warnings: List[str] = Field(default_factory=list, description="Non-fatal parsing issues")
    errors: List[str] = Field(default_factory=list, description="Fatal parsing errors")
    confidence: float = Field(default=0.0, ge=0.0, le=1.0, description="Parser confidence score")
    source_format: str = Field(default="unknown", description="Detected source format")

class ImportAIParseRequest(BaseModel):
    """Request to parse workout content using AI"""
    content: str = Field(..., min_length=1, max_length=100000, description="Content to parse with AI")
    anonymous_id: Optional[str] = Field(None, description="Anonymous user identifier for rate limiting")

class ImportURLRequest(BaseModel):
    """Request to parse workout from a URL"""
    url: str = Field(..., min_length=10, max_length=2000, description="URL to extract workout from")
    anonymous_id: Optional[str] = Field(None, description="Anonymous user identifier for rate limiting")


# ── Universal Logger Models ───────────────────────────────────────────────

class UniversalLogImage(BaseModel):
    """A single base64-encoded image for AI analysis"""
    data: str = Field(..., description="Base64-encoded image bytes")
    mime_type: str = Field(..., description="MIME type: image/jpeg, image/png, image/webp")

class UniversalLogQuestion(BaseModel):
    """A clarifying question returned by AI when inputs are ambiguous"""
    id: str = Field(..., description="Question identifier (used as answer key)")
    question: str = Field(..., description="Human-readable question text")
    type: str = Field(..., description="Input type: text | select | number")
    options: Optional[List[str]] = Field(None, description="Options for select type")

class ParsedCardioData(BaseModel):
    """Cardio session data extracted by AI"""
    activity_type: str = Field(default="other", description="Activity type from ActivityTypeRegistry")
    activity_name: Optional[str] = None
    duration_minutes: Optional[float] = None
    distance: Optional[float] = None
    distance_unit: str = "mi"
    avg_heart_rate: Optional[int] = None
    max_heart_rate: Optional[int] = None
    calories: Optional[int] = None
    pace_per_unit: Optional[str] = None
    rpe: Optional[int] = None
    elevation_gain: Optional[int] = None
    elevation_unit: str = "ft"
    notes: Optional[str] = None

class ParsedExerciseGroup(BaseModel):
    """Strength exercise group extracted by AI — mirrors ExerciseGroup schema"""
    exercises: Dict[str, str] = Field(..., description='Exercise dict e.g. {"a": "Bench Press"}')
    sets: str = "3"
    reps: str = "8-12"
    rest: str = "60s"
    default_weight: Optional[str] = None
    default_weight_unit: str = "lbs"

class ParsedStrengthData(BaseModel):
    """Strength workout data extracted by AI"""
    workout_name: str = "Ad-Hoc Workout"
    exercise_groups: List[ParsedExerciseGroup] = Field(default_factory=list)
    notes: Optional[str] = None

class UniversalLogParseRequest(BaseModel):
    """Request to parse activity data using AI (text + images)"""
    text: Optional[str] = Field(None, max_length=5000, description="Free-text description of the activity")
    images: List[UniversalLogImage] = Field(default_factory=list, description="Up to 5 images")
    answers: Optional[Dict[str, str]] = Field(None, description="Answers to AI clarifying questions, keyed by question id")

class UniversalLogParseResponse(BaseModel):
    """AI parse result — may contain session data or clarifying questions"""
    success: bool
    session_type: str = Field(default="unknown", description="cardio | strength | unknown")
    needs_clarification: bool = False
    questions: List[UniversalLogQuestion] = Field(default_factory=list)
    cardio_data: Optional[ParsedCardioData] = None
    strength_data: Optional[ParsedStrengthData] = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    errors: List[str] = Field(default_factory=list)

class SaveStrengthLogRequest(BaseModel):
    """Request to save a strength session from Universal Logger"""
    workout_name: str = Field(..., min_length=1, max_length=50)
    exercise_groups: List[ParsedExerciseGroup]
    duration_minutes: Optional[float] = None
    notes: Optional[str] = None
    started_at: Optional[datetime] = None
    save_as_template: bool = False
