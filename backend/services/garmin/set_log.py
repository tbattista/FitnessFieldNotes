"""
The Garmin set log: a watch activity as a time-ordered, editable list of sets.

The set is the unit. Every set the watch recorded is shown in time order,
nothing merged or dropped (accidental-looking ones are flagged and excluded by
default). The user corrects exercises, reps and weights, matches the session to
one of their workouts or builds a new one, and saves. The saved session keeps
every set with its timestamp, plus the edited log and the original watch data
(import_meta.set_log / import_meta.activity) so it can be reopened later.
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from ...models import CreateAndCompleteSessionRequest, ExercisePerformance, UpdateWorkoutRequest
from ...models.garmin import (
    GarminImportResult,
    GarminLogSetsRequest,
    GarminSetLog,
    ParsedGarminActivity,
    ParsedGarminExercise,
)
from ...models.session import SetDetail
from . import import_service as imp
from . import matching
from .exercise_mapper import apply_mappings, normalize
from .import_service import GarminImportError

SUGGEST_MIN_SCORE = 0.5
MAX_WORKOUT_OPTIONS = 50


# ── matching exercise names to a workout ─────────────────────────────────────

def _words(name: str) -> frozenset:
    """Words of a name with plurals folded ("Push Ups" = "Push Up", but "Press" stays)."""
    return frozenset(w[:-1] if len(w) > 2 and w.endswith("s") and not w.endswith("ss") else w
                     for w in normalize(name).split())


def template_match(name: str, template_names: List[str]) -> Optional[str]:
    """The workout exercise a (Garmin or user) name most likely means.

    Exact match first; otherwise a name whose words contain, or are contained
    in, the given name ("Bench Press" ~ "Dumbbell Bench Press"), closest first.
    The same rule is mirrored in garmin-set-log.js.
    """
    words = _words(name)
    if not words:
        return None
    best, best_diff = None, None
    for t in template_names:
        tw = _words(t)
        if tw == words:
            return t
        if tw and (words <= tw or tw <= words):
            diff = len(words ^ tw)
            if best is None or diff < best_diff:
                best, best_diff = t, diff
    return best


def match_set(item: Dict[str, Any], template_names: List[str]) -> Optional[str]:
    """Workout exercise for a set: by its name, or by the watch's own label when
    the name is only a guess (not one the user saved or already uses)."""
    hit = template_match(item.get("exercise_name") or "", template_names)
    if not hit and item.get("name_source") not in ("saved", "exact"):
        hit = template_match(item.get("garmin_label") or "", template_names)
    return hit


def _workout_option(workout, sets: List[Dict[str, Any]]) -> Dict[str, Any]:
    exercises = []
    for g in workout.exercise_groups or []:
        name = (g.exercises or {}).get("a")
        if name and getattr(g, "group_type", "standard") in (None, "standard"):
            exercises.append({"name": name, "sets": g.sets, "reps": g.reps, "weight": g.default_weight,
                              "weight_unit": g.default_weight_unit, "group_id": g.group_id})
    if not exercises:
        for section in workout.sections or []:
            for ex in section.exercises or []:
                if ex.name and getattr(ex, "group_type", "standard") in (None, "standard"):
                    exercises.append({"name": ex.name, "sets": ex.sets, "reps": ex.reps,
                                      "weight": ex.default_weight, "weight_unit": ex.default_weight_unit,
                                      "group_id": ex.exercise_id})
    names = [e["name"] for e in exercises]
    distinct = {normalize(it.get("exercise_name") or ""): it for it in sets if it.get("exercise_name")}
    hit = sum(1 for it in distinct.values() if match_set(it, names))
    return {"id": workout.id, "name": workout.name, "exercises": exercises,
            "score": round(hit / len(distinct), 2) if distinct else 0.0}


async def _workout_options(user_id: str, sets: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    workouts = [w for w in await imp.fds.get_user_workouts(user_id, limit=imp.HISTORY_LOOKBACK) if not w.is_archived]
    options = [o for o in (_workout_option(w, sets) for w in workouts) if o["exercises"]]
    options.sort(key=lambda o: -o["score"])
    return options[:MAX_WORKOUT_OPTIONS]


# ── building the log ─────────────────────────────────────────────────────────

def _timeline(activity: ParsedGarminActivity):
    """Every set in time order. Activities cached before timelines existed fall back to their grouped sets."""
    if activity.timeline:
        return activity.timeline
    sets = []
    for ex in activity.exercises:
        for st in ex.sets:
            sets.append(st.model_copy(update={"garmin_key": ex.garmin_key, "garmin_label": ex.garmin_label,
                                              "category": ex.category}))
    sets.sort(key=lambda st: (st.start_time is None, st.start_time or datetime.min.replace(tzinfo=timezone.utc)))
    for i, st in enumerate(sets):
        st.index = i
    return sets


async def build(user_id: str, activity: ParsedGarminActivity, pending_id: Optional[str] = None,
                weight_unit: Optional[str] = None) -> GarminSetLog:
    if activity.kind not in matching.SET_KINDS:
        raise GarminImportError("Only strength and HIIT activities have sets to edit.")
    sets = _timeline(activity)
    if not sets:
        raise GarminImportError("The watch recorded no sets for this activity.")
    if await imp.find_duplicate(user_id, activity.external_id):
        raise GarminImportError("This activity was already imported. Open it from the Imported list.", 409)

    workouts, sessions = await imp._context(user_id, activity)
    known = imp._known_names(workouts, sessions)
    unit = weight_unit or imp._preferred_unit(sessions)

    # Resolve the watch's guesses to exercise names, once per distinct guess.
    by_key: Dict[str, ParsedGarminExercise] = {}
    for st in sets:
        by_key.setdefault(st.garmin_key, ParsedGarminExercise(
            garmin_key=st.garmin_key, garmin_label=st.garmin_label or "Unknown", category=st.category or "unknown"))
    apply_mappings(list(by_key.values()), await imp.load_exercise_map(user_id), known)

    items: List[Dict[str, Any]] = []
    for st in sets:
        ex = by_key[st.garmin_key]
        name, source = ex.mapped_name, ex.mapping_source
        weight = matching.convert_weight(st.weight_kg, unit)
        items.append({
            "id": f"set-{st.index}", "type": "set",
            "started_at": st.start_time.isoformat() if st.start_time else None,
            "garmin_key": st.garmin_key, "garmin_label": st.garmin_label,
            "exercise_name": name, "name_source": source if name else None,
            "reps": st.reps or None, "weight": weight, "weight_kg": st.weight_kg,
            "bodyweight": weight is None and (st.category in imp.BODYWEIGHT_CATEGORIES),
            "duration_s": st.duration_s, "rest_s": st.rest_s,
            "avg_heart_rate": st.avg_heart_rate, "max_heart_rate": st.max_heart_rate,
            "accidental": st.accidental, "included": not st.accidental,
        })

    # A set the watch couldn't name most likely belongs with its neighbours.
    for i, it in enumerate(items):
        if it["exercise_name"]:
            continue
        before = next((x for x in reversed(items[:i]) if x["exercise_name"] and x["included"]), None)
        after = next((x for x in items[i + 1:] if x["exercise_name"] and x["name_source"] != "neighbor"
                      and x["included"]), None)
        guess = before or after
        if guess:
            it["exercise_name"], it["name_source"] = guess["exercise_name"], "neighbor"
        else:
            it["exercise_name"], it["name_source"] = "Unknown Exercise", "garmin"

    # Garmin cardio done just before/after (e.g. a stair-climber warm-up), in time order.
    for d in imp._nearby_cardio(user_id, activity):
        items.append({
            "id": f"act-{d['id']}", "type": "cardio", "started_at": d["_start"].isoformat(),
            "garmin_activity_id": d["id"], "name": d.get("name") or "Cardio",
            "activity_type": imp.ACTIVITY_TYPES.get(d.get("activity_type") or "", "other"),
            "duration_minutes": d.get("duration_minutes"), "distance_m": d.get("distance_m"),
            "avg_heart_rate": d.get("avg_heart_rate"), "calories": d.get("calories"), "included": True,
        })
    items.sort(key=lambda it: (it["started_at"] is None, it["started_at"] or ""))

    options = await _workout_options(user_id, [it for it in items if it["type"] == "set" and it["included"]])
    target = options[0]["id"] if options and options[0]["score"] >= SUGGEST_MIN_SCORE else None
    return GarminSetLog(
        activity=activity, pending_id=pending_id, weight_unit=unit, items=items, workout_options=options,
        target_id=target, known_exercises=known,
        workout_name=f"Garmin {activity.name} {activity.started_at:%b} {activity.started_at.day}",
    )


async def reopen(user_id: str, session_id: str) -> GarminSetLog:
    """The stored set log of an already imported session, for corrections."""
    snap = imp._user(user_id).collection("workout_sessions").document(session_id).get()
    if not snap.exists:
        raise GarminImportError("Session not found.", 404)
    data = snap.to_dict()
    meta = data.get("import_meta") or {}
    stored = meta.get("set_log")
    if not stored or not meta.get("activity"):
        raise GarminImportError("This session wasn't imported through the set log, so it can't be reopened here. "
                                "Undo the import and review it again to edit its sets.")
    activity = ParsedGarminActivity(**meta["activity"])
    workouts, sessions = await imp._context(user_id, activity)
    return GarminSetLog(
        activity=activity, session_id=session_id, weight_unit=stored.get("weight_unit") or "lbs",
        items=stored.get("items") or [], workout_options=[], target_id=None,
        workout_name=data.get("workout_name") or "", known_exercises=imp._known_names(workouts, sessions),
    )


# ── saving ───────────────────────────────────────────────────────────────────

def _num(value: Any) -> Optional[float]:
    try:
        n = float(value)
        return n if n >= 0 else None
    except (TypeError, ValueError):
        return None


def _when(value: Any) -> Optional[datetime]:
    return matching.to_utc(value)


def build_performances(items: List[Dict[str, Any]], unit: str, group_ids: Dict[str, str]):
    """Included items -> one ExercisePerformance per exercise (first-appearance order).

    Each set keeps its own reps, weight and timestamp in set_details, so the
    time order of the whole session can always be rebuilt.
    Returns (performances, linked Garmin cardio activity ids).
    """
    order: List[str] = []
    blocks: Dict[str, Dict[str, Any]] = {}
    linked: List[str] = []
    for it in items:
        if not it.get("included"):
            continue
        if it.get("type") == "cardio":
            key = f"cardio:{it.get('id')}"
            blocks[key] = {"cardio": it}
            order.append(key)
            if it.get("garmin_activity_id"):
                linked.append(str(it["garmin_activity_id"]))
            continue
        name = (it.get("exercise_name") or "").strip()
        if not name:
            raise GarminImportError("Every set needs an exercise name.")
        key = normalize(name)
        if key not in blocks:
            blocks[key] = {"name": name, "sets": []}
            order.append(key)
        blocks[key]["sets"].append(it)

    perfs: List[ExercisePerformance] = []
    for i, key in enumerate(order):
        block = blocks[key]
        if "cardio" in block:
            c = block["cardio"]
            minutes = round(c.get("duration_minutes") or 0)
            cfg = {"duration_minutes": minutes or None}
            if c.get("distance_m"):
                cfg.update({"distance": round(c["distance_m"] / 1609.344, 2), "distance_unit": "mi"})
            perfs.append(ExercisePerformance(
                exercise_name=c.get("activity_type") or "other", group_id=str(c.get("id")), sets_completed=1,
                target_sets="1", target_reps=f"{minutes} min", weight=None, weight_unit=unit,
                notes=imp._cardio_summary(cfg, c) or None, avg_heart_rate=c.get("avg_heart_rate"),
                calories_burned=c.get("calories"), order_index=i))
            continue
        sets = block["sets"]
        weights = [_num(s.get("weight")) for s in sets]
        reps = [int(r) for r in (_num(s.get("reps")) for s in sets) if r]
        details = [SetDetail(
            set_number=n, reps_completed=int(_num(s.get("reps"))) if _num(s.get("reps")) is not None else None,
            weight=w, started_at=_when(s.get("started_at")), duration_s=_num(s.get("duration_s")),
            rest_s=_num(s.get("rest_s")), avg_heart_rate=s.get("avg_heart_rate"),
            max_heart_rate=s.get("max_heart_rate")) for n, (s, w) in enumerate(zip(sets, weights), start=1)]
        top = max((w for w in weights if w is not None), default=None)
        if reps and min(reps) != max(reps):
            target_reps = f"{min(reps)}-{max(reps)}"
        elif reps:
            target_reps = str(reps[0])
        else:
            secs = sorted(round(d) for d in (_num(s.get("duration_s")) for s in sets) if d)
            target_reps = f"{secs[len(secs) // 2]}s" if secs else "0"
        timed = [(s["avg_heart_rate"], _num(s.get("duration_s")) or 0) for s in sets if s.get("avg_heart_rate")]
        total = sum(d for _, d in timed)
        avg_hr = (round(sum(h * d for h, d in timed) / total) if total
                  else (round(sum(h for h, _ in timed) / len(timed)) if timed else None))
        perfs.append(ExercisePerformance(
            exercise_name=block["name"], group_id=group_ids.get(key) or f"garmin-{i}",
            sets_completed=len(sets), target_sets=str(len(sets)), target_reps=target_reps,
            weight=matching.format_weight(top) if top is not None else (
                "Body" if any(s.get("bodyweight") for s in sets) else None),
            weight_unit=unit, set_details=details, avg_heart_rate=avg_hr,
            max_heart_rate=max((s["max_heart_rate"] for s in sets if s.get("max_heart_rate")), default=None),
            order_index=i))
    return perfs, linked


def _mappings_from(items: List[Dict[str, Any]]) -> Dict[str, str]:
    """Watch guess -> exercise name, where every included set with that guess got the same name."""
    names: Dict[str, set] = {}
    for it in items:
        key = it.get("garmin_key")
        if it.get("type") == "set" and it.get("included") and key and key.split("/")[0] != "unknown":
            names.setdefault(key, set()).add((it.get("exercise_name") or "").strip())
    return {k: next(iter(v)) for k, v in names.items() if len(v) == 1 and next(iter(v))}


async def save(user_id: str, req: GarminLogSetsRequest) -> GarminImportResult:
    activity, unit = req.activity, req.weight_unit
    stored_log = {"items": req.items, "weight_unit": unit, "saved_at": datetime.now(timezone.utc)}

    # Correcting an already imported session: replace its exercises and log in place.
    if req.session_id:
        ref = imp._user(user_id).collection("workout_sessions").document(req.session_id)
        snap = ref.get()
        if not snap.exists:
            raise GarminImportError("Session not found.", 404)
        data = snap.to_dict()
        meta = dict(data.get("import_meta") or {})
        if data.get("external_id") != activity.external_id or "set_log" not in meta:
            raise GarminImportError("This session can't be edited from the Garmin page.")
        existing_ids = {normalize(e.get("exercise_name", "")): e.get("group_id")
                        for e in data.get("exercises_performed") or []}
        perfs, _ = build_performances(req.items, unit, {k: v for k, v in existing_ids.items() if v})
        if not perfs:
            raise GarminImportError("Include at least one set.")
        meta["set_log"] = stored_log
        ref.update({"exercises_performed": [p.model_dump() for p in perfs], "import_meta": meta})
        return GarminImportResult(success=True, action="attach", session_id=req.session_id, session_type="workout",
                                  message="Session updated")

    if await imp.find_duplicate(user_id, activity.external_id):
        raise GarminImportError("This activity was already imported. Open it from the Imported list.", 409)

    created_workout_id = None
    if req.target_id:
        workout = await imp.fds.get_workout(user_id, req.target_id)
        if not workout:
            raise GarminImportError("That workout no longer exists.", 404)
        group_ids = {normalize(n): gid for n, gid in imp._workout_exercises(workout) if gid}
        perfs, linked = build_performances(req.items, unit, group_ids)
    else:
        perfs, linked = build_performances(req.items, unit, {})
    if not perfs:
        raise GarminImportError("Include at least one set.")

    if not req.target_id:
        request = imp.workout_request_for(activity, [p for p in perfs if p.set_details], unit)
        if req.workout_name.strip():
            request.name = req.workout_name.strip()[:100]
        request.description = imp._describe(activity)
        workout = await imp.fds.create_workout(user_id, request)
        if not workout:
            raise GarminImportError("Couldn't create the workout.", 500)
        if not req.save_as_template:
            await imp.fds.update_workout(user_id, workout.id, UpdateWorkoutRequest(is_archived=True))
            created_workout_id = workout.id     # undo removes it again

    if req.save_mappings:
        await imp.save_exercise_map(user_id, _mappings_from(req.items))

    meta = imp._created_meta(created_workout_id)
    meta.update({"garmin_started_at": activity.started_at, "set_log": stored_log,
                 "activity": activity.model_dump(mode="json")})
    if linked:
        meta["linked_garmin_activity_ids"] = linked
    session = await imp.fds.create_and_complete_workout_session(user_id, CreateAndCompleteSessionRequest(
        workout_id=workout.id, workout_name=workout.name,
        started_at=activity.started_at, completed_at=activity.completed_at,
        exercises_performed=perfs, session_mode="quick_log",
        duration_minutes=max(1, round(activity.duration_minutes)) if activity.duration_minutes else None,
        calories=activity.calories, avg_heart_rate=activity.avg_heart_rate,
        max_heart_rate=activity.max_heart_rate, source="garmin", external_id=activity.external_id,
        import_meta=meta,
        notes=f"Imported from Garmin ({activity.device})" if activity.device else "Imported from Garmin",
    ))
    if not session:
        raise GarminImportError("Couldn't save the session.", 500)
    return GarminImportResult(success=True, action="attach" if req.target_id else "new", session_id=session.id,
                              session_type="workout", message=f"Logged to {workout.name}",
                              linked_activity_ids=linked)
