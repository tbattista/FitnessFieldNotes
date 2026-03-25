from pydantic import BaseModel, Field
from typing import Dict


class WorkoutData(BaseModel):
    """Data model for workout information"""

    workout_name: str = Field(
        ...,
        description="Name of the workout (e.g., 'Push Day', 'Pull Day')",
        example="Push Day"
    )

    workout_date: str = Field(
        ...,
        description="Date of the workout in YYYY-MM-DD format",
        example="2025-01-07"
    )

    template_name: str = Field(
        ...,
        description="Name of the template file to use",
        example="master_doc.docx"
    )

    exercises: Dict[str, str] = Field(
        ...,
        description="Dictionary of exercise names keyed by exercise ID",
        example={
            "exercise-1a": "Bench Press",
            "exercise-1b": "Incline Press",
            "exercise-1c": "Flyes",
            "exercise-2a": "Squats",
            "exercise-2b": "Leg Press",
            "exercise-2c": "Lunges"
        }
    )

    sets: Dict[str, str] = Field(
        default_factory=dict,
        description="Dictionary of sets data keyed by group ID",
        example={
            "sets-1": "3",
            "sets-2": "4",
            "sets-3": "3"
        }
    )

    reps: Dict[str, str] = Field(
        default_factory=dict,
        description="Dictionary of reps data keyed by group ID",
        example={
            "reps-1": "8-12",
            "reps-2": "10",
            "reps-3": "6-8"
        }
    )

    rest: Dict[str, str] = Field(
        default_factory=dict,
        description="Dictionary of rest periods keyed by group ID",
        example={
            "rest-1": "60s",
            "rest-2": "90s",
            "rest-3": "2min"
        }
    )

class TemplateInfo(BaseModel):
    """Information about available templates"""

    templates: list[str] = Field(
        ...,
        description="List of available template filenames"
    )

    count: int = Field(
        ...,
        description="Number of available templates"
    )

class HealthResponse(BaseModel):
    """Health check response"""

    status: str = Field(
        ...,
        description="Health status",
        example="healthy"
    )

    message: str = Field(
        ...,
        description="Health status message",
        example="Gym Log API is running"
    )

class ErrorResponse(BaseModel):
    """Error response model"""

    detail: str = Field(
        ...,
        description="Error message details"
    )

class UploadResponse(BaseModel):
    """Template upload response"""

    message: str = Field(
        ...,
        description="Upload status message"
    )

    filename: str = Field(
        ...,
        description="Name of the uploaded file"
    )
