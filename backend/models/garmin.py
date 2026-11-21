"""
Garmin import models: a parsed watch activity, the import preview shown to the
user, and the confirm request that saves it.
"""

from datetime import datetime
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class ParsedGarminSet(BaseModel):
    """One active set recorded by the watch."""

    reps: Optional[int] = Field(None, ge=0)
    weight_kg: Optional[float] = Field(None, ge=0)
    duration_s: Optional[float] = Field(None, ge=0)
    start_time: Optional[datetime] = None


class ParsedGarminExercise(BaseModel):
    """Consecutive sets of the same Garmin exercise, plus how it maps to the app."""

    garmin_key: str = Field(..., description="Stable key, e.g. 'deadlift/straight_leg_deadlift' or 'squat'")
    garmin_label: str = Field(..., description="Readable Garmin name, e.g. 'Straight Leg Deadlift'")
    category: str = Field(..., description="Garmin exercise category, e.g. 'deadlift' or 'unknown'")
    sets: List[ParsedGarminSet] = Field(default_factory=list)

    # Filled in by the exercise mapper
    mapped_name: Optional[str] = Field(None, description="App exercise name this will be saved as")
    mapping_source: Optional[Literal["saved", "exact", "suggested", "garmin"]] = Field(
        None,
        description="saved = user's saved mapping, exact = matches a name the user already uses, "
                    "suggested = alias table guess, garmin = Garmin's own name",
    )

    @property
    def needs_review(self) -> bool:
        return self.mapping_source not in ("saved", "exact")


class ParsedGarminActivity(BaseModel):
    """A watch activity read from a FIT file."""

    external_id: str = Field(..., description="Stable ID: 'garmin:<serial>:<created epoch>'")
    kind: Literal["strength", "cardio"]
    sport: Optional[str] = None
    sub_sport: Optional[str] = None
    activity_type: Optional[str] = Field(None, description="App cardio activity type (cardio only)")
    name: str = Field(..., description="Display name, e.g. 'Strength' or 'Treadmill Run'")
    device: Optional[str] = None

    started_at: datetime
    completed_at: datetime
    duration_minutes: float = Field(..., ge=0)
    calories: Optional[int] = None
    avg_heart_rate: Optional[int] = None
    max_heart_rate: Optional[int] = None

    # Cardio
    distance_m: Optional[float] = None
    total_ascent_m: Optional[float] = None
    laps: Optional[int] = None

    # Strength
    exercises: List[ParsedGarminExercise] = Field(default_factory=list)
    dropped_sets: int = Field(0, description="Sets discarded as misfires (0 reps, a few seconds)")


ImportAction = Literal["merge", "attach", "new", "skip"]


class MatchCandidate(BaseModel):
    """Something the activity could be merged into or attached to."""

    kind: Literal["workout_session", "cardio_session", "workout"]
    id: str
    name: str
    started_at: Optional[datetime] = None
    score: float = 0.0
    reason: str = ""


class ProposedAction(BaseModel):
    action: ImportAction
    target_id: Optional[str] = None
    target_name: Optional[str] = None
    confidence: Literal["high", "low"] = "low"
    reason: str = ""


class GarminImportPreview(BaseModel):
    activity: ParsedGarminActivity
    proposed: ProposedAction
    session_candidates: List[MatchCandidate] = Field(default_factory=list)
    workout_candidates: List[MatchCandidate] = Field(default_factory=list)
    duplicate_of: Optional[str] = Field(None, description="Session ID already imported from this file")
    auto_importable: bool = Field(False, description="Safe to import with no review (used by sync)")
    known_exercises: List[str] = Field(default_factory=list, description="Exercise names the user already uses")
    weight_unit: Literal["lbs", "kg"] = "lbs"
    merge_notes: List[str] = Field(default_factory=list, description="What a merge into the proposed session would change")


class GarminImportConfirmRequest(BaseModel):
    activity: ParsedGarminActivity
    action: ImportAction
    target_id: Optional[str] = Field(None, description="Session to merge into, or workout to attach to")
    exercise_mappings: Dict[str, str] = Field(
        default_factory=dict, description="garmin_key -> app exercise name chosen in the review"
    )
    save_mappings: bool = Field(True, description="Remember the chosen mappings for future imports")
    weight_unit: Literal["lbs", "kg"] = "lbs"
    pending_id: Optional[str] = Field(None, description="Synced activity waiting for review, cleared on success")


class GarminImportResult(BaseModel):
    success: bool
    action: ImportAction
    session_id: Optional[str] = None
    session_type: Optional[Literal["workout", "cardio"]] = None
    message: str = ""


class GarminUndoRequest(BaseModel):
    session_id: str
    session_type: Literal["workout", "cardio"]


class GarminExerciseMapUpdate(BaseModel):
    mappings: Dict[str, str] = Field(..., description="garmin_key -> app exercise name; empty name deletes")


# ── Personal API sync (Phase 2) ──────────────────────────────────────────────

class GarminConnectRequest(BaseModel):
    api_key: str = Field(..., min_length=10, max_length=4096, description="Garmin Personal API key")
    expires_in_days: Optional[int] = Field(
        None, ge=1, le=366, description="Expiry chosen when the key was created, for reminders")
    sync_from: Optional[datetime] = Field(
        None, description="Import activities that started at or after this time (default: now)")


class GarminConnectionUpdate(BaseModel):
    review_all: Optional[bool] = Field(None, description="Send every synced activity to review")


class GarminConnectionStatus(BaseModel):
    allowed: bool = Field(..., description="Whether this account may use key-based sync")
    connected: bool = False
    status: Optional[Literal["connected", "needs_attention"]] = None
    key_hint: Optional[str] = Field(None, description="Last 4 characters of the key")
    connected_at: Optional[datetime] = None
    sync_from: Optional[datetime] = None
    key_expires_at: Optional[datetime] = None
    days_until_expiry: Optional[int] = None
    review_all: bool = False
    last_sync_at: Optional[datetime] = None
    last_error: Optional[str] = None
    last_summary: Optional[Dict[str, int]] = None
    pending_count: int = 0


class GarminSyncImported(BaseModel):
    garmin_activity_id: str
    name: str
    started_at: Optional[datetime] = None
    action: ImportAction
    session_id: Optional[str] = None
    session_type: Optional[Literal["workout", "cardio"]] = None


class GarminSyncResult(BaseModel):
    imported: List[GarminSyncImported] = Field(default_factory=list)
    pending: int = Field(0, description="New activities waiting for review in this run")
    pending_total: int = Field(0, description="All activities waiting for review")
    skipped: int = Field(0, description="Already imported, or entered by hand in Garmin Connect")
    errors: List[str] = Field(default_factory=list)
    more: bool = Field(False, description="More new activities remain; sync again")
    last_sync_at: Optional[datetime] = None


class GarminPendingItem(BaseModel):
    id: str
    name: str
    kind: Literal["strength", "cardio"]
    started_at: Optional[datetime] = None
    reason: str = ""
