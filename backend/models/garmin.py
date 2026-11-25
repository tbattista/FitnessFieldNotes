"""
Garmin import models: a parsed watch activity, the import preview shown to the
user, and the confirm request that saves it.
"""

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class ParsedGarminSet(BaseModel):
    """One active set recorded by the watch."""

    reps: Optional[int] = Field(None, ge=0)
    weight_kg: Optional[float] = Field(None, ge=0)
    duration_s: Optional[float] = Field(None, ge=0)
    start_time: Optional[datetime] = None
    rest_s: Optional[float] = Field(None, ge=0, description="Rest the watch recorded after this set")
    avg_heart_rate: Optional[int] = Field(None, description="Average heart rate during the set")
    max_heart_rate: Optional[int] = Field(None, description="Highest heart rate during the set")
    # Set on timeline entries (ParsedGarminActivity.timeline)
    index: Optional[int] = Field(None, description="Position among the watch's active sets, in time order")
    garmin_key: Optional[str] = Field(None, description="Watch's exercise guess, e.g. 'squat' or 'unknown'")
    garmin_label: Optional[str] = None
    category: Optional[str] = None
    accidental: bool = Field(False, description="Looks like a misfire: no reps and only a few seconds")


class ParsedGarminExercise(BaseModel):
    """Consecutive sets of the same Garmin exercise, plus how it maps to the app."""

    garmin_key: str = Field(..., description="Stable key, e.g. 'deadlift/straight_leg_deadlift' or 'squat'")
    garmin_label: str = Field(..., description="Readable Garmin name, e.g. 'Straight Leg Deadlift'")
    category: str = Field(..., description="Garmin exercise category, e.g. 'deadlift' or 'unknown'")
    sets: List[ParsedGarminSet] = Field(default_factory=list)
    avg_heart_rate: Optional[int] = Field(None, description="Average heart rate across this exercise's sets")
    max_heart_rate: Optional[int] = Field(None, description="Highest heart rate across this exercise's sets")

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
    kind: Literal["strength", "interval", "cardio"] = Field(
        ..., description="strength: sets with reps/weight; interval: timed work/rest sets (HIIT); cardio: no sets")
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
    timeline: List[ParsedGarminSet] = Field(
        default_factory=list,
        description="Every active set the watch recorded, in time order, nothing merged or dropped")
    work_seconds: Optional[int] = Field(None, description="Interval: typical work time per set")
    rest_seconds: Optional[int] = Field(None, description="Interval: typical rest between sets")


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
    pending_id: Optional[str] = Field(
        None, description="Garmin activity ID from the Garmin page; marked imported on success")


class GarminSetLogRequest(BaseModel):
    """Open a Garmin activity as an editable set log. Give the activity (file upload) or its Garmin page ID."""

    activity: Optional[ParsedGarminActivity] = None
    pending_id: Optional[str] = Field(None, description="Garmin activity ID from the Garmin page")
    weight_unit: Optional[Literal["lbs", "kg"]] = None


class GarminSetLog(BaseModel):
    """A Garmin activity as a time-ordered, editable list of sets (plus nearby cardio). Nothing is saved."""

    activity: ParsedGarminActivity
    pending_id: Optional[str] = None
    session_id: Optional[str] = Field(None, description="Set when reopening an already imported session")
    weight_unit: Literal["lbs", "kg"] = "lbs"
    items: List[Dict[str, Any]] = Field(
        ..., description="In time order. type 'set': id, started_at, garmin_key, garmin_label, exercise_name, "
                         "name_source, reps, weight, weight_kg, bodyweight, duration_s, rest_s, avg_heart_rate, "
                         "max_heart_rate, accidental, included. type 'cardio': a nearby Garmin cardio activity.")
    workout_options: List[Dict[str, Any]] = Field(
        default_factory=list, description="Workouts to log against: [{id, name, score, exercises: [{name, sets, reps, "
                                          "weight, weight_unit}]}], best match first")
    target_id: Optional[str] = Field(None, description="Suggested (or stored) workout; None = new workout")
    workout_name: str = ""
    known_exercises: List[str] = Field(default_factory=list)


class GarminLogSetsRequest(BaseModel):
    """Save an edited set log as a session linked to its Garmin activity."""

    activity: ParsedGarminActivity
    pending_id: Optional[str] = None
    session_id: Optional[str] = Field(None, description="Update this already imported session instead of creating one")
    items: List[Dict[str, Any]] = Field(..., description="All items as edited, in order, including excluded ones")
    target_id: Optional[str] = Field(None, description="Existing workout to log against; None = new workout")
    workout_name: str = Field("", max_length=100)
    save_as_template: bool = Field(False, description="New workout: keep it in the library as a template")
    save_mappings: bool = Field(True, description="Remember exercise names chosen for the watch's guesses")
    weight_unit: Literal["lbs", "kg"] = "lbs"


class GarminImportResult(BaseModel):
    success: bool
    linked_activity_ids: List[str] = Field(
        default_factory=list, description="Other Garmin activities saved into the same session")
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


class GarminConnectionUpdate(BaseModel):
    auto_import: Optional[bool] = Field(
        None, description="Import clear matches automatically instead of listing them for review")


class GarminSyncLogEntry(BaseModel):
    """What sync did with one Garmin activity, and why."""

    garmin_activity_id: str
    name: str
    activity_type: Optional[str] = Field(None, description="Garmin type, e.g. strength_training")
    started_at: Optional[datetime] = None
    outcome: Literal["imported", "review", "skipped", "error"]
    detail: str = ""
    synced_at: Optional[datetime] = None


class GarminConnectionStatus(BaseModel):
    allowed: bool = Field(..., description="Whether this account may use key-based sync")
    connected: bool = False
    status: Optional[Literal["connected", "needs_attention"]] = None
    key_hint: Optional[str] = Field(None, description="Last 4 characters of the key")
    connected_at: Optional[datetime] = None
    key_expires_at: Optional[datetime] = None
    days_until_expiry: Optional[int] = None
    auto_import: bool = False
    last_sync_at: Optional[datetime] = None
    last_error: Optional[str] = None
    last_summary: Optional[Dict[str, int]] = None
    pending_count: int = Field(0, description="Garmin activities waiting for review")


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
    details: List[GarminSyncLogEntry] = Field(default_factory=list, description="Outcome per activity in this sync")


GarminActivityStatus = Literal["review", "imported", "dismissed", "skipped"]


class GarminActivityItem(BaseModel):
    """One Garmin activity on the Garmin page: synced, or uploaded as a file."""

    id: str = Field(..., description="Garmin activity ID for synced items; 'session:<type>:<id>' for uploads")
    source: Literal["sync", "upload"] = "sync"
    status: GarminActivityStatus
    name: str
    kind: Literal["strength", "interval", "cardio"]
    activity_type: Optional[str] = Field(None, description="Garmin type, e.g. strength_training, hiit")
    started_at: Optional[datetime] = None
    duration_minutes: Optional[float] = None
    calories: Optional[int] = None
    avg_heart_rate: Optional[int] = None
    distance_m: Optional[float] = None
    summary: str = Field("", description="e.g. 'Squat 4 sets, Deadlift 3 sets'")
    detail: str = Field("", description="Why it has this status, e.g. 'Entered by hand in Garmin Connect'")
    action: Optional[ImportAction] = Field(None, description="How it was imported")
    session_id: Optional[str] = None
    session_type: Optional[Literal["workout", "cardio"]] = None
    decided_at: Optional[datetime] = None
    editable: bool = Field(False, description="Imported through the set log, so it can be reopened and corrected")


class GarminActivityStatusUpdate(BaseModel):
    status: Literal["review", "dismissed"] = Field(..., description="Dismiss, or put a dismissed one back")
