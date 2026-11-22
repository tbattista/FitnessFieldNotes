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
    ExercisePerformance,
    SectionExercise,
    WorkoutSection,
    UpdateWorkoutRequest,
)
from ...models.garmin import (
    GarminBuilderDraft,
    GarminBuilderDraftRequest,
    GarminLogFromBuilderRequest,
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


# ── edit in the workout builder ──────────────────────────────────────────────

def _median_rest(ex_sets) -> Optional[int]:
    rests = sorted(round(st.rest_s) for st in ex_sets if st.rest_s)
    return rests[len(rests) // 2] if rests else None


def _describe(activity: ParsedGarminActivity) -> str:
    bits = [f"{activity.started_at:%a %b} {activity.started_at.day}", f"{round(activity.duration_minutes or 0)} min"]
    if activity.avg_heart_rate:
        bits.append(f"{activity.avg_heart_rate} bpm avg")
    if activity.calories:
        bits.append(f"{activity.calories} cal")
    return "From Garmin: " + " · ".join(bits)


async def builder_draft(user_id: str, req: GarminBuilderDraftRequest) -> GarminBuilderDraft:
    """A Garmin activity as a workout-builder draft: one row per exercise with the
    watch's sets x reps, rest and heaviest weight. Nothing is saved."""
    activity, unit = req.activity, req.weight_unit
    if activity.kind not in SET_KINDS or not activity.exercises:
        raise GarminImportError("Only strength and HIIT activities with sets can be edited in the builder.")
    if await find_duplicate(user_id, activity.external_id):
        raise GarminImportError("This activity was already imported. Undo that import first.", 409)

    named = {ex.garmin_key: matching.resolved_name(ex, req.exercise_mappings) for ex in activity.exercises}
    if req.save_mappings:
        await save_exercise_map(user_id, {k: v for k, v in named.items() if k.split("/")[0] != "unknown" and v})

    workouts = [w for w in await fds.get_user_workouts(user_id, limit=HISTORY_LOOKBACK) if not w.is_archived]
    target = None
    if req.action == "attach":
        target = next((w for w in workouts if w.id == req.target_id), None) or (
            await fds.get_workout(user_id, req.target_id or "-"))
        if not target:
            raise GarminImportError("That workout no longer exists.", 404)
    group_ids = {normalize(n): gid for n, gid in _workout_exercises(target) if gid} if target else {}
    perfs = matching.build_performances(activity, named, unit, group_ids)

    # Rest per exercise, from the sets that make it up (same order as build_performances).
    rest_by_name: Dict[str, int] = {}
    for ex in activity.exercises:
        rest = _median_rest(ex.sets)
        if rest is not None:
            rest_by_name.setdefault(normalize(named[ex.garmin_key]), rest)

    block = None
    if activity.kind == "interval":
        block = {"block_id": "garmin-hiit",
                 "group_name": f"HIIT {activity.work_seconds or 20}s on / {activity.rest_seconds or 10}s off"}
    groups = []
    for p in perfs:
        rest = rest_by_name.get(normalize(p.exercise_name))
        group = {"group_id": p.group_id, "group_type": "standard", "exercises": {"a": p.exercise_name},
                 "sets": p.target_sets, "reps": p.target_reps, "rest": f"{rest}s" if rest else "60s",
                 "default_weight": p.weight or "", "default_weight_unit": unit}
        if block:
            group.update(block)
        groups.append(group)

    candidates = matching.workout_candidates(
        [p.exercise_name for p in perfs],
        [{"id": w.id, "name": w.name, "exercises": [n for n, _ in _workout_exercises(w)]} for w in workouts])
    options = [{"id": c.id, "name": c.name, "reason": c.reason} for c in candidates[:5]]
    if target and not any(o["id"] == target.id for o in options):
        options.insert(0, {"id": target.id, "name": target.name, "reason": "Chosen on the Garmin page"})

    name = target.name if target else f"Garmin {activity.name} {activity.started_at:%b} {activity.started_at.day}"
    return GarminBuilderDraft(
        workout={"name": name[:100], "description": _describe(activity), "tags": [], "exercise_groups": groups},
        garmin_exercises=[p.model_dump(mode="json") for p in perfs],
        workout_options=options,
        target_id=target.id if target else None,
        activity=activity,
        pending_id=req.pending_id,
    )


def _same(a: Any, b: Any) -> bool:
    return str(a or "").strip().lower() == str(b or "").strip().lower()


async def log_from_builder(user_id: str, req: GarminLogFromBuilderRequest) -> GarminImportResult:
    """Save the builder's (possibly edited) workout as a session linked to the Garmin activity.

    Per-set detail from the watch is kept for an exercise only while its sets, reps
    and weight are unchanged; heart rate is always kept.
    """
    activity, unit = req.activity, req.weight_unit
    if await find_duplicate(user_id, activity.external_id):
        raise GarminImportError("This activity was already imported. Undo that import first.", 409)
    groups = [g for g in req.exercise_groups
              if g.get("group_type") != "note" and (g.get("exercises") or {}).get("a")]
    if not groups:
        raise GarminImportError("Add at least one exercise before logging.")

    created_workout_id = None
    if req.target_id:
        workout = await fds.get_workout(user_id, req.target_id)
        if not workout:
            raise GarminImportError("That workout no longer exists.", 404)
        template_ids = {normalize(n): gid for n, gid in _workout_exercises(workout) if gid}
    else:
        allowed = set(ExerciseGroup.model_fields)
        workout = await fds.create_workout(user_id, CreateWorkoutRequest(
            name=req.workout_name.strip()[:100],
            description=_describe(activity),
            exercise_groups=[ExerciseGroup(**{k: v for k, v in g.items() if k in allowed and v is not None})
                             for g in groups],
            workout_type="tabata" if activity.kind == "interval" else "standard",
            tags=[],
        ))
        if not workout:
            raise GarminImportError("Couldn't create the workout.", 500)
        if not req.save_as_template:
            await fds.update_workout(user_id, workout.id, UpdateWorkoutRequest(is_archived=True))
            created_workout_id = workout.id     # undo removes it again
        template_ids = {normalize(g.exercises.get("a", "")): g.group_id for g in workout.exercise_groups}

    perfs = []
    for i, g in enumerate(groups):
        name = g["exercises"]["a"].strip()
        idx = g.get("garmin_index")
        ge = req.garmin_exercises[idx] if isinstance(idx, int) and 0 <= idx < len(req.garmin_exercises) else None
        unchanged = bool(ge) and _same(g.get("sets"), ge.get("target_sets")) and _same(
            g.get("reps"), ge.get("target_reps")) and _same(g.get("default_weight"), ge.get("weight"))
        sets = str(g.get("sets") or "")
        perfs.append(ExercisePerformance(
            exercise_name=name,
            group_id=template_ids.get(normalize(name)) or g.get("group_id") or f"garmin-{i}",
            sets_completed=int(sets) if sets.isdigit() else len((ge or {}).get("set_details") or []),
            target_sets=sets or "1",
            target_reps=str(g.get("reps") or ""),
            weight=str(g["default_weight"]) if g.get("default_weight") not in (None, "") else None,
            weight_unit=g.get("default_weight_unit") or unit,
            set_details=(ge or {}).get("set_details") or [] if unchanged else [],
            avg_heart_rate=(ge or {}).get("avg_heart_rate"),
            max_heart_rate=(ge or {}).get("max_heart_rate"),
            order_index=i,
        ))

    meta = _created_meta(created_workout_id)
    meta["garmin_started_at"] = activity.started_at
    meta["edited_in_builder"] = True
    session = await fds.create_and_complete_workout_session(user_id, CreateAndCompleteSessionRequest(
        workout_id=workout.id,
        workout_name=workout.name,
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
        import_meta=meta,
        notes=f"Imported from Garmin ({activity.device})" if activity.device else "Imported from Garmin",
    ))
    if not session:
        raise GarminImportError("Couldn't save the session.", 500)
    return GarminImportResult(success=True, action="attach" if req.target_id else "new", session_id=session.id,
                              session_type="workout", message=f"Logged to {workout.name}")


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
