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
from datetime import datetime, timedelta, timezone
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


# Garmin exercise categories that are cardio machines/movement, and the app
# activity type each becomes (an activity card in the builder).
CARDIO_CATEGORIES = {
    "run": "running", "run_indoor": "running", "bike": "cycling", "bike_outdoor": "cycling",
    "indoor_bike": "cycling", "indoor_row": "rowing", "elliptical": "elliptical",
    "stair_stepper": "stair_climber", "floor_climb": "stair_climber",
}
# Categories normally done with body weight: shown as "Body" when no weight was recorded.
BODYWEIGHT_CATEGORIES = {
    "push_up", "pull_up", "sit_up", "crunch", "plank", "core", "leg_raise", "hyperextension",
    "plyo", "warm_up", "hip_stability", "shoulder_stability",
}
# Garmin activity types (activity list typeKey) -> app activity type.
ACTIVITY_TYPES = {
    "running": "running", "treadmill_running": "running", "indoor_running": "running",
    "trail_running": "trail_running", "cycling": "cycling", "indoor_cycling": "cycling",
    "virtual_ride": "cycling", "indoor_rowing": "rowing", "rowing": "rowing",
    "elliptical": "elliptical", "stair_climbing": "stair_climber", "walking": "walking",
    "hiking": "hiking", "lap_swimming": "swimming", "open_water_swimming": "swimming",
}
NEARBY = timedelta(minutes=90)


def _nearby_cardio(user_id: str, activity: ParsedGarminActivity) -> List[Dict[str, Any]]:
    """Synced Garmin cardio activities (still to review) done just before or after this one."""
    out = []
    start, end = matching.to_utc(activity.started_at), matching.to_utc(activity.completed_at)
    for doc in _user(user_id).collection("garmin_activities").stream():
        d = doc.to_dict() or {}
        if d.get("status") != "review" or d.get("kind") != "cardio":
            continue
        s = matching.to_utc(d.get("started_at"))
        if not s:
            continue
        e = s + timedelta(minutes=d.get("duration_minutes") or 0)
        if e >= start - NEARBY and s <= end + NEARBY:
            out.append({**d, "id": doc.id, "_start": s})
    out.sort(key=lambda d: d["_start"])
    return out


def _cardio_row(row_id: str, activity_type: str, minutes: float, distance_m: Optional[float]) -> Dict[str, Any]:
    cfg = {"activity_type": activity_type, "duration_minutes": max(1, round(minutes or 0))}
    if distance_m:
        cfg.update({"distance": round(distance_m / 1609.344, 2), "distance_unit": "mi"})
    return {"exercise_id": row_id, "name": activity_type, "alternates": [], "group_type": "cardio",
            "sets": "", "reps": "", "rest": "", "default_weight": None, "default_weight_unit": "lbs",
            "cardio_config": cfg}


def _section(exercise: Dict[str, Any], kind: str = "standard", name: Optional[str] = None,
             config: Optional[Dict[str, Any]] = None, exercises: Optional[List[Dict[str, Any]]] = None):
    section = {"section_id": f"section-{exercise['exercise_id']}", "type": kind, "name": name,
               "exercises": exercises or [exercise]}
    if config:
        section["config"] = config
    return section


async def builder_draft(user_id: str, req: GarminBuilderDraftRequest) -> GarminBuilderDraft:
    """A Garmin activity as a draft in the builder's own section format. Nothing is saved.

    Strength: one section per exercise with the watch's sets x reps, rest and heaviest
    weight (Body for body-weight moves); cardio moves become activity rows.
    HIIT: one Tabata section with the watch's work/rest. Synced Garmin cardio
    activities done within 90 minutes before/after are added as activity rows.
    """
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
    perfs = matching.build_performances(activity, named, unit)

    # Per app exercise name: Garmin category, typical rest, and total work time.
    info: Dict[str, Dict[str, Any]] = {}
    for ex in activity.exercises:
        key = normalize(named[ex.garmin_key])
        entry = info.setdefault(key, {"category": ex.category, "sets": []})
        entry["sets"].extend(ex.sets)

    rows, recorded = [], {}
    for i, p in enumerate(perfs):
        meta = info.get(normalize(p.exercise_name), {"category": "", "sets": []})
        row_id = f"garmin-ex-{i}"
        recorded[row_id] = p.model_dump(mode="json")
        cardio_type = CARDIO_CATEGORIES.get(meta["category"])
        if cardio_type:
            minutes = sum(st.duration_s or 0 for st in meta["sets"]) / 60
            rows.append(_cardio_row(row_id, cardio_type, minutes, None))
            continue
        rest = _median_rest(meta["sets"])
        weight = p.weight or ("Body" if meta["category"] in BODYWEIGHT_CATEGORIES else None)
        rows.append({"exercise_id": row_id, "name": p.exercise_name, "alternates": [], "group_type": "standard",
                     "sets": p.target_sets, "reps": p.target_reps, "rest": f"{rest}s" if rest else "60s",
                     "default_weight": weight, "default_weight_unit": unit})

    if activity.kind == "interval":
        cfg = {"work_seconds": activity.work_seconds or 20, "rest_seconds": activity.rest_seconds or 10,
               "rounds": max((p.sets_completed for p in perfs), default=1) or 1}
        sections = [_section(rows[0], "tabata", f"HIIT {cfg['work_seconds']}s on / {cfg['rest_seconds']}s off",
                             cfg, exercises=rows)]
    else:
        sections = [_section(r) for r in rows]

    # Cardio done around this session: activity rows before/after, in time order.
    before, after, linked = [], [], []
    for d in _nearby_cardio(user_id, activity):
        row_id = f"garmin-act-{d['id']}"
        act_type = ACTIVITY_TYPES.get(d.get("activity_type") or "", "other")
        row = _cardio_row(row_id, act_type, d.get("duration_minutes") or 0, d.get("distance_m"))
        recorded[row_id] = {"exercise_name": d.get("name") or act_type, "activity_type": act_type,
                            "duration_minutes": d.get("duration_minutes"), "distance_m": d.get("distance_m"),
                            "avg_heart_rate": d.get("avg_heart_rate"), "calories": d.get("calories"),
                            "started_at": d["_start"].isoformat(), "garmin_activity_id": d["id"]}
        (before if d["_start"] < matching.to_utc(activity.started_at) else after).append(_section(row))
        linked.append(d["id"])
    sections = before + sections + after

    candidates = matching.workout_candidates(
        [p.exercise_name for p in perfs],
        [{"id": w.id, "name": w.name, "exercises": [n for n, _ in _workout_exercises(w)]} for w in workouts])
    options = [{"id": c.id, "name": c.name, "reason": c.reason} for c in candidates[:5]]
    if target and not any(o["id"] == target.id for o in options):
        options.insert(0, {"id": target.id, "name": target.name, "reason": "Chosen on the Garmin page"})

    name = target.name if target else f"Garmin {activity.name} {activity.started_at:%b} {activity.started_at.day}"
    return GarminBuilderDraft(
        workout={"name": name[:100], "description": _describe(activity), "tags": [], "sections": sections,
                 "workout_type": "tabata" if activity.kind == "interval" else "standard"},
        garmin_exercises=recorded,
        workout_options=options,
        target_id=target.id if target else None,
        activity=activity,
        pending_id=req.pending_id,
        linked_activity_ids=linked,
    )


def _same(a: Any, b: Any) -> bool:
    return str(a or "").strip().lower() == str(b or "").strip().lower()


def _cardio_summary(cfg: Dict[str, Any], rec: Optional[Dict[str, Any]]) -> str:
    bits = [f"{cfg.get('duration_minutes')} min"] if cfg.get("duration_minutes") else []
    if cfg.get("distance"):
        bits.append(f"{cfg['distance']} {cfg.get('distance_unit') or 'mi'}")
    if rec and rec.get("avg_heart_rate"):
        bits.append(f"{rec['avg_heart_rate']} bpm avg")
    return " · ".join(bits)


async def log_from_builder(user_id: str, req: GarminLogFromBuilderRequest) -> GarminImportResult:
    """Save the builder's (possibly edited) workout as a session linked to the Garmin activity.

    Rows keep their Garmin link through edits, drags and regrouping via their
    exercise_id. Per-set watch detail is kept for a row only while its sets, reps
    and weight are unchanged; heart rate is always kept.
    """
    activity, unit = req.activity, req.weight_unit
    if await find_duplicate(user_id, activity.external_id):
        raise GarminImportError("This activity was already imported. Undo that import first.", 409)
    sections = [s for s in req.sections if s.get("exercises")]
    rows = [ex for s in sections for ex in s["exercises"]
            if ex.get("group_type") == "cardio" or (ex.get("name") or "").strip()]
    if not rows:
        raise GarminImportError("Add at least one exercise before logging.")

    created_workout_id = None
    if req.target_id:
        workout = await fds.get_workout(user_id, req.target_id)
        if not workout:
            raise GarminImportError("That workout no longer exists.", 404)
        template_ids = {normalize(n): gid for n, gid in _workout_exercises(workout) if gid}
    else:
        workout = await fds.create_workout(user_id, CreateWorkoutRequest(
            name=req.workout_name.strip()[:100],
            description=_describe(activity),
            sections=[WorkoutSection(**{k: v for k, v in s.items() if v is not None}) for s in sections],
            workout_type="tabata" if any(s.get("type") == "tabata" for s in sections) else "standard",
            tags=[],
        ))
        if not workout:
            raise GarminImportError("Couldn't create the workout.", 500)
        if not req.save_as_template:
            await fds.update_workout(user_id, workout.id, UpdateWorkoutRequest(is_archived=True))
            created_workout_id = workout.id     # undo removes it again
        template_ids = {}

    perfs, linked = [], []
    for i, ex in enumerate(rows):
        row_id = ex.get("exercise_id") or f"row-{i}"
        rec = req.garmin_exercises.get(row_id)
        if ex.get("group_type") == "cardio":
            cfg = ex.get("cardio_config") or {}
            name = cfg.get("activity_type") or ex.get("name") or "other"
            perfs.append(ExercisePerformance(
                exercise_name=name, group_id=template_ids.get(normalize(name)) or row_id,
                sets_completed=1, target_sets="1", target_reps=f"{cfg.get('duration_minutes') or ''} min".strip(),
                weight=None, weight_unit=unit, notes=_cardio_summary(cfg, rec) or None,
                avg_heart_rate=(rec or {}).get("avg_heart_rate"), calories_burned=(rec or {}).get("calories"),
                order_index=i))
            if rec and rec.get("garmin_activity_id"):
                linked.append(rec["garmin_activity_id"])
            continue
        name = ex["name"].strip()
        unchanged = bool(rec) and _same(ex.get("sets"), rec.get("target_sets")) and _same(
            ex.get("reps"), rec.get("target_reps")) and (
            _same(ex.get("default_weight"), rec.get("weight")) or not rec.get("weight"))
        sets = str(ex.get("sets") or "")
        weight = ex.get("default_weight")
        perfs.append(ExercisePerformance(
            exercise_name=name,
            group_id=template_ids.get(normalize(name)) or row_id,
            sets_completed=int(sets) if sets.isdigit() else len((rec or {}).get("set_details") or []),
            target_sets=sets or "1",
            target_reps=str(ex.get("reps") or ""),
            weight=str(weight) if weight not in (None, "") else None,
            weight_unit=ex.get("default_weight_unit") or unit,
            set_details=((rec or {}).get("set_details") or []) if unchanged else [],
            avg_heart_rate=(rec or {}).get("avg_heart_rate"),
            max_heart_rate=(rec or {}).get("max_heart_rate"),
            order_index=i,
        ))

    meta = _created_meta(created_workout_id)
    meta["garmin_started_at"] = activity.started_at
    meta["edited_in_builder"] = True
    if linked:
        meta["linked_garmin_activity_ids"] = linked
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
                              session_type="workout", message=f"Logged to {workout.name}",
                              linked_activity_ids=linked)


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
