from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime
from uuid import uuid4


class Exercise(BaseModel):
    """Model for exercise in the global database"""

    id: str = Field(
        default_factory=lambda: f"exercise-{uuid4().hex[:8]}",
        description="Unique identifier for the exercise"
    )

    # Core Information
    name: str = Field(
        ...,
        description="Name of the exercise",
        example="Barbell Bench Press"
    )

    nameSearchTokens: List[str] = Field(
        default_factory=list,
        description="Tokenized name for search optimization",
        example=["barbell", "bench", "press"]
    )

    # Video Links
    shortVideoUrl: Optional[str] = Field(
        default=None,
        description="URL to short demonstration video"
    )

    detailedVideoUrl: Optional[str] = Field(
        default=None,
        description="URL to detailed explanation video"
    )

    # ExerciseDB Integration
    gifUrl: Optional[str] = Field(
        default=None,
        description="URL to animated GIF demonstration (from ExerciseDB)"
    )

    exerciseDbId: Optional[str] = Field(
        default=None,
        description="ExerciseDB API exercise ID for image lookup"
    )

    instructions: List[str] = Field(
        default_factory=list,
        description="Step-by-step exercise instructions"
    )

    # Classification
    difficultyLevel: Optional[str] = Field(
        default=None,
        description="Difficulty level of the exercise",
        example="Beginner"
    )

    @field_validator('difficultyLevel', mode='before')
    @classmethod
    def convert_difficulty_to_string(cls, v):
        """Convert integer difficulty levels to strings for backward compatibility"""
        if v is None:
            return v
        if isinstance(v, int):
            # Map integer values to string difficulty levels
            difficulty_map = {
                1: "Beginner",
                2: "Intermediate",
                3: "Advanced"
            }
            return difficulty_map.get(v, "Intermediate")
        return str(v) if v else None

    targetMuscleGroup: Optional[str] = Field(
        default=None,
        description="Primary target muscle group",
        example="Chest"
    )

    primeMoverMuscle: Optional[str] = Field(
        default=None,
        description="Prime mover muscle",
        example="Pectoralis Major"
    )

    secondaryMuscle: Optional[str] = Field(
        default=None,
        description="Secondary muscle involved"
    )

    tertiaryMuscle: Optional[str] = Field(
        default=None,
        description="Tertiary muscle involved"
    )

    # Equipment
    primaryEquipment: Optional[str] = Field(
        default=None,
        description="Primary equipment needed",
        example="Barbell"
    )

    primaryEquipmentCount: Optional[int] = Field(
        default=None,
        description="Number of primary equipment items needed"
    )

    secondaryEquipment: Optional[str] = Field(
        default=None,
        description="Secondary equipment needed"
    )

    secondaryEquipmentCount: Optional[int] = Field(
        default=None,
        description="Number of secondary equipment items needed"
    )

    # Movement Details
    posture: Optional[str] = Field(
        default=None,
        description="Body posture during exercise",
        example="Supine"
    )

    armType: Optional[str] = Field(
        default=None,
        description="Single or double arm movement",
        example="Double Arm"
    )

    armPattern: Optional[str] = Field(
        default=None,
        description="Continuous or alternating arm pattern",
        example="Continuous"
    )

    grip: Optional[str] = Field(
        default=None,
        description="Type of grip used",
        example="Pronated"
    )

    loadPosition: Optional[str] = Field(
        default=None,
        description="Position of load at end of movement"
    )

    footElevation: Optional[str] = Field(
        default=None,
        description="Whether feet are elevated",
        example="No Elevation"
    )

    # Exercise Classification
    combinationExercise: Optional[str] = Field(
        default=None,
        description="Whether exercise is single or combination",
        example="Single Exercise"
    )

    movementPattern1: Optional[str] = Field(
        default=None,
        description="Primary movement pattern",
        example="Horizontal Push"
    )

    movementPattern2: Optional[str] = Field(
        default=None,
        description="Secondary movement pattern"
    )

    movementPattern3: Optional[str] = Field(
        default=None,
        description="Tertiary movement pattern"
    )

    planeOfMotion1: Optional[str] = Field(
        default=None,
        description="Primary plane of motion",
        example="Sagittal Plane"
    )

    planeOfMotion2: Optional[str] = Field(
        default=None,
        description="Secondary plane of motion"
    )

    planeOfMotion3: Optional[str] = Field(
        default=None,
        description="Tertiary plane of motion"
    )

    # Categories
    bodyRegion: Optional[str] = Field(
        default=None,
        description="Body region targeted",
        example="Upper Body"
    )

    forceType: Optional[str] = Field(
        default=None,
        description="Type of force applied",
        example="Push"
    )

    mechanics: Optional[str] = Field(
        default=None,
        description="Exercise mechanics type",
        example="Compound"
    )

    laterality: Optional[str] = Field(
        default=None,
        description="Laterality of movement",
        example="Bilateral"
    )

    classification: Optional[str] = Field(
        default=None,
        description="Primary exercise classification",
        example="Strength"
    )

    # Metadata
    isGlobal: bool = Field(
        default=True,
        description="Whether this is a global exercise or user-specific"
    )

    linkedExerciseId: Optional[str] = Field(
        default=None,
        description="ID of a global exercise this custom exercise is linked to, for inheriting rich data"
    )

    # NEW: Popularity and Favorites tracking
    popularityScore: Optional[int] = Field(
        default=50,
        ge=0,
        le=100,
        description="Popularity score for search ranking (0-100). Higher = more popular."
    )

    favoriteCount: Optional[int] = Field(
        default=0,
        ge=0,
        description="Number of users who favorited this exercise"
    )

    # NEW: Exercise Classification System
    foundationalScore: Optional[int] = Field(
        default=50,
        ge=0,
        le=100,
        description="Foundational score (0-100). Higher = more foundational/standard. 90-100 = Tier 1 (Foundation)"
    )

    exerciseTier: Optional[int] = Field(
        default=2,
        ge=1,
        le=3,
        description="Exercise tier: 1=Foundation (Essential), 2=Standard (Common), 3=Specialized (Advanced/Unique)"
    )

    isFoundational: bool = Field(
        default=False,
        description="Quick flag for Tier 1 foundational exercises (score >= 90)"
    )

    classificationTags: List[str] = Field(
        default_factory=list,
        description="Classification tags like 'big-5', 'compound', 'beginner-friendly', 'equipment-free'"
    )

    createdAt: datetime = Field(
        default_factory=datetime.now,
        description="When the exercise was created"
    )

    updatedAt: datetime = Field(
        default_factory=datetime.now,
        description="When the exercise was last updated"
    )

class ExerciseReference(BaseModel):
    """Reference to an exercise used in a workout"""

    exerciseId: str = Field(
        ...,
        description="ID of the exercise"
    )

    exerciseName: str = Field(
        ...,
        description="Name of the exercise (denormalized for quick display)"
    )

    isCustom: bool = Field(
        default=False,
        description="Whether this is a custom user exercise"
    )


class CreateExerciseRequest(BaseModel):
    """Request model for creating or updating a custom exercise"""

    name: str = Field(..., min_length=1, max_length=200)
    difficultyLevel: Optional[str] = Field(None)
    targetMuscleGroup: Optional[str] = Field(None)
    primaryEquipment: Optional[str] = Field(None)
    movementPattern1: Optional[str] = Field(None)
    bodyRegion: Optional[str] = Field(None)
    mechanics: Optional[str] = Field(None)
    linkedExerciseId: Optional[str] = Field(None)
    gifUrl: Optional[str] = Field(None)
    exerciseDbId: Optional[str] = Field(None)
    instructions: Optional[List[str]] = Field(default_factory=list)

class ExerciseListResponse(BaseModel):
    """Response model for exercise list"""

    exercises: List[Exercise] = Field(..., description="List of exercises")
    total_count: int = Field(..., description="Total number of exercises")
    page: int = Field(default=1, description="Current page number")
    page_size: int = Field(default=100, description="Number of items per page")

class ExerciseSearchResponse(BaseModel):
    """Response model for exercise search"""

    exercises: List[Exercise] = Field(..., description="Matching exercises")
    query: str = Field(..., description="Search query used")
    total_results: int = Field(..., description="Total number of results")
