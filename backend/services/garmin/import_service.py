"""
Garmin import: preview an uploaded FIT file against the user's data, then save
it as a merge, a session on an existing workout, or a new log-only session.
Every import can be undone.

Firestore layout:
  users/{uid}/garmin_exercise_map/{garmin_key with '/' -> '__'}
      { garmin_key, exercise_name, updated_at }
  Imported sessions carry external_id and import_meta:
      { type: 'created', workout_id? }  or  { type: 'merge', snapshot, merged_at }
"""

import logging
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from ...models import (
    CreateAndCompleteSessionRequest,
    CreateCardioSessionRequest,
    CreateWorkoutRequest,
    ExerciseGroup,
    SectionExercise,
    WorkoutSection,
    UpdateWorkoutRequest,
)
from ...models.garmin import (
    GarminPrepareSessionRequest,
    GarminSessionPrefill,
    GarminImportConfirmRequest,
    GarminImportPreview,
    GarminImportResult,
    ParsedGarminActivity,
)
from ..firestore_data_service import firestore_data_service as fds
from . import matching
from .matching import SET_KINDS
from .exercise_mapper import apply_mappings, map_key_to_doc_id, normalize
from .fit_parser import parse_activity

logger = logging.getLogger(__name__)

HISTORY_LOOKBACK = 100


class GarminImportError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def _user(user_id: str):
    return fds.db.collection("users").document(user_id)


# ── reads ────────────────────────────────────────────────────────────────────

async def load_exercise_map(user_id: str) -> Dict[str, str]:
    out = {}
    for doc in _user(user_id).collection("garmin_exercise_map").stream():
        d = doc.to_dict() or {}
        if d.get("garmin_key") and d.get("exercise_name"):
            out[d["garmin_key"]] = d["exercise_name"]
    return out


async def save_exercise_map(user_id: str, mappings: Dict[str, str]) -> Dict[str, str]:
    col = _user(user_id).collection("garmin_exercise_map")
    for key, name in mappings.items():
        ref = col.document(map_key_to_doc_id(key))
        name = (name or "").strip()
        if not name:
            ref.delete()
        else:
            ref.set({"garmin_key": key, "exercise_name": name[:100],
                     "updated_at": datetime.now(timezone.utc)})
    return await load_exercise_map(user_id)


async def find_duplicate(user_id: str, external_id: str) -> Optional[Tuple[str, str]]:
    """(session_type, session_id) of an earlier import of the same file."""
    for col, kind in (("workout_sessions", "workout"), ("cardio_sessions", "cardio")):
        docs = list(_user(user_id).collection(col).where("external_id", "==", external_id).limit(1).stream())
        if docs:
            return kind, docs[0].id
    return None


def _workout_exercises(workout) -> List[Tuple[str, str]]:
    """(exercise name, group id) pairs from either workout layout."""
    pairs = []
    for g in workout.exercise_groups or []:
        for name in (g.exercises or {}).values():
            pairs.append((name, g.group_id))
    for section in workout.sections or []:
        for ex in getattr(section, "exercises", None) or []:
            pairs.append((ex.name, getattr(ex, "exercise_id", None) or section.section_id))
    return pairs


async def _context(user_id: str, activity: ParsedGarminActivity):
    workouts = [w for w in await fds.get_user_workouts(user_id, limit=HISTORY_LOOKBACK) if not w.is_archived]
    if activity.kind in SET_KINDS:
        raw = await fds.get_user_sessions(user_id, limit=HISTORY_LOOKBACK)
        sessions = [s.model_dump() for s in raw if s.status == "completed"]
        for s in sessions:
            s["name"] = s.get("workout_name")
    else:
        raw = await fds.get_user_cardio_sessions(user_id, limit=HISTORY_LOOKBACK)
        sessions = [s.model_dump() for s in raw]
        for s in sessions:
            s["name"] = s.get("activity_name") or s.get("activity_type")
    return workouts, sessions


def _known_names(workouts, sessions) -> List[str]:
    names = []
    for w in workouts:
        names.extend(n for n, _ in _workout_exercises(w))
    for s in sessions:
        names.extend(e.get("exercise_name") for e in s.get("exercises_performed") or [])
    seen, out = set(), []
    for n in names:
        if n and normalize(n) not in seen:
            seen.add(normalize(n))
            out.append(n)
    return sorted(out, key=str.lower)


def _preferred_unit(sessions) -> str:
    units = Counter(e.get("weight_unit") for s in sessions for e in s.get("exercises_performed") or []
                    if e.get("weight_unit") in ("lbs", "kg"))
    return units.most_common(1)[0][0] if units else "lbs"


# ── preview ──────────────────────────────────────────────────────────────────

async def build_preview(user_id: str, blob: bytes) -> GarminImportPreview:
    return await build_preview_for_activity(user_id, parse_activity(blob))


async def build_preview_for_activity(user_id: str, activity: ParsedGarminActivity) -> GarminImportPreview:
    workouts, sessions = await _context(user_id, activity)
    known = _known_names(workouts, sessions)
    unit = _preferred_unit(sessions) if activity.kind in SET_KINDS else "lbs"

    if activity.kind in SET_KINDS:
        apply_mappings(activity.exercises, await load_exercise_map(user_id), known)

    dup = await find_duplicate(user_id, activity.external_id)
    kind = "workout_session" if activity.kind in SET_KINDS else "cardio_session"
    s_cands = matching.session_candidates(activity, sessions, kind)
    w_cands = []
    if activity.kind in SET_KINDS:
        mapped = [ex.mapped_name for ex in activity.exercises if ex.mapped_name]
        w_cands = matching.workout_candidates(
            mapped, [{"id": w.id, "name": w.name, "exercises": [n for n, _ in _workout_exercises(w)]}
                     for w in workouts])
    proposed = matching.propose(activity, s_cands, w_cands, dup[1] if dup else None)

    merge_notes: List[str] = []
    if proposed.action == "merge":
        target = next(s for s in sessions if s["id"] == proposed.target_id)
        if activity.kind in SET_KINDS:
            perfs = matching.build_performances(activity, {}, unit)
            _, _, merge_notes = matching.merge_strength(target, perfs, activity)
        else:
            _, _, merge_notes = matching.merge_cardio(target, matching.cardio_fields(activity))

    return GarminImportPreview(
        activity=activity,
        proposed=proposed,
        session_candidates=s_cands[:5],
        workout_candidates=w_cands[:5],
        duplicate_of=dup[1] if dup else None,
        auto_importable=matching.auto_importable(activity, proposed),
        known_exercises=known,
        weight_unit=unit,
        merge_notes=merge_notes,
    )


# ── workout format ───────────────────────────────────────────────────────────

def workout_request_for(activity: ParsedGarminActivity, perfs, unit: str) -> CreateWorkoutRequest:
    """The app workout a Garmin activity becomes when it matches no existing workout.

    Strength: one exercise group per exercise. Interval (HIIT): one Tabata section
    with the watch's typical work/rest time and the most sets of any exercise as rounds.
    """
    date_label = f"{activity.started_at:%b} {activity.started_at.day}"
    name = f"Garmin {activity.name} {date_label}"[:50]
    if activity.kind == "interval":
        rounds = max((p.sets_completed for p in perfs), default=1) or 1
        section = WorkoutSection(
            type="tabata", name="HIIT",
            config={"work_seconds": activity.work_seconds or 20, "rest_seconds": activity.rest_seconds or 10,
                    "rounds": rounds},
            exercises=[SectionExercise(exercise_id=p.group_id, name=p.exercise_name, sets=p.target_sets,
                                       reps=p.target_reps, rest=f"{activity.rest_seconds or 10}s",
                                       default_weight=p.weight, default_weight_unit=unit)
                       for p in perfs])
        return CreateWorkoutRequest(name=name, description="Imported from Garmin (HIIT)", sections=[section],
                                    workout_type="tabata", tags=[])
    groups = [ExerciseGroup(group_id=p.group_id, exercises={"a": p.exercise_name}, sets=p.target_sets,
                            reps=p.target_reps, default_weight=p.weight, default_weight_unit=unit)
              for p in perfs]
    return CreateWorkoutRequest(name=name, description="Imported from Garmin", exercise_groups=groups, tags=[])


# ── open in the session screen ───────────────────────────────────────────────

async def prepare_session(user_id: str, req: GarminPrepareSessionRequest) -> GarminSessionPrefill:
    """Find or create the workout and return the values to pre-fill the session screen.

    Nothing is logged here: the session is saved by the session screen when the
    user finishes it, carrying source/external_id/import_meta from this prefill.
    """
    activity, unit = req.activity, req.weight_unit
    if activity.kind not in SET_KINDS or not activity.exercises:
        raise GarminImportError("Only strength and HIIT activities with sets open in the session screen.")
    if await find_duplicate(user_id, activity.external_id):
        raise GarminImportError("This activity was already imported. Undo that import first.", 409)

    named = {ex.garmin_key: matching.resolved_name(ex, req.exercise_mappings) for ex in activity.exercises}
    if req.save_mappings:
        await save_exercise_map(user_id, {k: v for k, v in named.items() if k.split("/")[0] != "unknown" and v})

    created_workout_id = None
    if req.action == "attach":
        workout = await fds.get_workout(user_id, req.target_id or "-")
        if not workout:
            raise GarminImportError("That workout no longer exists.", 404)
        group_ids = {normalize(n): gid for n, gid in _workout_exercises(workout) if gid}
        perfs = matching.build_performances(activity, named, unit, group_ids)
    else:
        perfs = matching.build_performances(activity, named, unit)
        workout = await fds.create_workout(user_id, workout_request_for(activity, perfs, unit))
        if not workout:
            raise GarminImportError("Couldn't create the workout record.", 500)
        await fds.update_workout(user_id, workout.id, UpdateWorkoutRequest(is_archived=True))
        created_workout_id = workout.id

    meta = _created_meta(created_workout_id)
    meta["garmin_started_at"] = activity.started_at
    meta["opened_in_session_screen"] = True
    return GarminSessionPrefill(
        workout_id=workout.id, workout_name=workout.name,
        exercises=[p.model_dump(mode="json") for p in perfs],
        started_at=activity.started_at, completed_at=activity.completed_at,
        duration_minutes=max(1, round(activity.duration_minutes or 1)),
        calories=activity.calories, avg_heart_rate=activity.avg_heart_rate, max_heart_rate=activity.max_heart_rate,
        external_id=activity.external_id, import_meta=jsonable(meta), pending_id=req.pending_id,
        activity_name=activity.name, kind=activity.kind,
    )


def jsonable(d: Dict[str, Any]) -> Dict[str, Any]:
    return {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in d.items()}


# ── confirm ──────────────────────────────────────────────────────────────────

def _created_meta(workout_id: Optional[str] = None) -> Dict[str, Any]:
    meta = {"type": "created", "imported_at": datetime.now(timezone.utc)}
    if workout_id:
        meta["workout_id"] = workout_id
    return meta


def _merge_meta(snapshot: Dict[str, Any], previous_external_id: Optional[str],
                garmin_started_at: datetime) -> Dict[str, Any]:
    return {"type": "merge", "snapshot": snapshot, "previous_external_id": previous_external_id,
            "garmin_started_at": garmin_started_at, "merged_at": datetime.now(timezone.utc)}


async def confirm(user_id: str, req: GarminImportConfirmRequest) -> GarminImportResult:
    activity = req.activity
    if req.action == "skip":
        return GarminImportResult(success=True, action="skip", message="Skipped")

    dup = await find_duplicate(user_id, activity.external_id)
    if dup:
        raise GarminImportError("This activity was already imported. Undo that import first.", 409)

    if activity.kind in SET_KINDS:
        if not activity.exercises and req.action != "merge":
            raise GarminImportError("This activity has no sets to import.")
        named = {ex.garmin_key: matching.resolved_name(ex, req.exercise_mappings) for ex in activity.exercises}
        if req.save_mappings and named:
            await save_exercise_map(user_id, {k: v for k, v in named.items()
                                              if k.split("/")[0] != "unknown" and v})
        return await _confirm_strength(user_id, req, named)
    return await _confirm_cardio(user_id, req)


async def _confirm_strength(user_id: str, req: GarminImportConfirmRequest,
                            named: Dict[str, str]) -> GarminImportResult:
    activity, unit = req.activity, req.weight_unit

    if req.action == "merge":
        ref = _user(user_id).collection("workout_sessions").document(req.target_id or "-")
        doc = ref.get()
        if not doc.exists:
            raise GarminImportError("The session to merge into no longer exists.", 404)
        existing = doc.to_dict()
        perfs = matching.build_performances(activity, named, unit)
        update, snapshot, notes = matching.merge_strength(existing, perfs, activity)
        update["external_id"] = activity.external_id
        update["import_meta"] = _merge_meta(snapshot, existing.get("external_id"), activity.started_at)
        ref.update(update)
        return GarminImportResult(success=True, action="merge", session_id=doc.id, session_type="workout",
                                  message="; ".join(notes))

    workout_id = workout_name = None
    created_workout_id = None
    group_ids: Dict[str, str] = {}
    if req.action == "attach":
        workout = await fds.get_workout(user_id, req.target_id or "-")
        if not workout:
            raise GarminImportError("That workout no longer exists.", 404)
        workout_id, workout_name = workout.id, workout.name
        group_ids = {normalize(n): gid for n, gid in _workout_exercises(workout) if gid}
    perfs = matching.build_performances(activity, named, unit, group_ids)

    if req.action == "new":
        workout = await fds.create_workout(user_id, workout_request_for(activity, perfs, unit))
        if not workout:
            raise GarminImportError("Couldn't create the workout record.", 500)
        await fds.update_workout(user_id, workout.id, UpdateWorkoutRequest(is_archived=True))
        workout_id, workout_name, created_workout_id = workout.id, workout.name, workout.id

    session = await fds.create_and_complete_workout_session(user_id, CreateAndCompleteSessionRequest(
        workout_id=workout_id,
        workout_name=workout_name,
        started_at=activity.started_at,
        completed_at=activity.completed_at,
        exercises_performed=perfs,
        session_mode="quick_log",
        duration_minutes=max(1, round(activity.duration_minutes)) if activity.duration_minutes else None,
        calories=activity.calories,
        avg_heart_rate=activity.avg_heart_rate,
        max_heart_rate=activity.max_heart_rate,
        source="garmin",
        external_id=activity.external_id,
        import_meta=_created_meta(created_workout_id),
        notes=f"Imported from Garmin ({activity.device})" if activity.device else "Imported from Garmin",
    ))
    if not session:
        raise GarminImportError("Couldn't save the session.", 500)
    return GarminImportResult(success=True, action=req.action, session_id=session.id, session_type="workout",
                              message=f"Saved to {workout_name}")


async def _confirm_cardio(user_id: str, req: GarminImportConfirmRequest) -> GarminImportResult:
    activity = req.activity
    fields = matching.cardio_fields(activity)

    if req.action == "merge":
        ref = _user(user_id).collection("cardio_sessions").document(req.target_id or "-")
        doc = ref.get()
        if not doc.exists:
            raise GarminImportError("The session to merge into no longer exists.", 404)
        existing = doc.to_dict()
        update, snapshot, notes = matching.merge_cardio(existing, fields)
        update["external_id"] = activity.external_id
        update["import_meta"] = _merge_meta(snapshot, existing.get("external_id"), activity.started_at)
        ref.update(update)
        return GarminImportResult(success=True, action="merge", session_id=doc.id, session_type="cardio",
                                  message="; ".join(notes))

    if req.action != "new":
        raise GarminImportError("Cardio activities can be merged or saved as new.")
    session = await fds.create_cardio_session(user_id, CreateCardioSessionRequest(
        **fields, notes="Imported from Garmin", source="garmin",
        external_id=activity.external_id, import_meta=_created_meta()))
    if not session:
        raise GarminImportError("Couldn't save the session.", 500)
    return GarminImportResult(success=True, action="new", session_id=session.id, session_type="cardio",
                              message=f"Saved {activity.name}")


# ── undo ─────────────────────────────────────────────────────────────────────

async def undo(user_id: str, session_id: str, session_type: str) -> Dict[str, Any]:
    col = "workout_sessions" if session_type == "workout" else "cardio_sessions"
    ref = _user(user_id).collection(col).document(session_id)
    doc = ref.get()
    if not doc.exists:
        raise GarminImportError("Session not found.", 404)
    data = doc.to_dict()
    meta = data.get("import_meta") or {}

    if meta.get("type") == "merge":
        restore = dict(meta.get("snapshot") or {})
        restore["external_id"] = meta.get("previous_external_id")
        restore["import_meta"] = None
        ref.update(restore)
        return {"success": True, "undone": "merge", "session_id": session_id}

    if meta.get("type") == "created" and data.get("source") == "garmin":
        ref.delete()
        workout_id = meta.get("workout_id")
        if workout_id:
            workout = await fds.get_workout(user_id, workout_id)
            if workout and workout.is_archived:
                await fds.delete_workout(user_id, workout_id)
        return {"success": True, "undone": "created", "session_id": session_id}

    raise GarminImportError("This session wasn't imported from Garmin.")
