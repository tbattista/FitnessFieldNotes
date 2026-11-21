"""
Pure logic for Garmin imports: find what an activity matches, propose an
action, turn Garmin sets into app exercises, and merge into an existing
session. No Firestore access here, so it is directly testable.

Merge rule: what the user typed in the app wins; Garmin fills gaps.
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

from ...models.garmin import MatchCandidate, ParsedGarminActivity, ParsedGarminExercise, ProposedAction
from ...models.session import ExercisePerformance, SetDetail
from .exercise_mapper import normalize

KG_TO_LB = 2.20462
OVERLAP_TOLERANCE = timedelta(minutes=10)
SAME_DAY_WINDOW = timedelta(hours=12)
ATTACH_MIN_OVERLAP = 0.5


# ── time helpers ─────────────────────────────────────────────────────────────

def to_utc(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    if not isinstance(value, datetime):
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _window(session: Dict[str, Any]) -> Tuple[Optional[datetime], Optional[datetime]]:
    start = to_utc(session.get("started_at"))
    end = to_utc(session.get("completed_at"))
    if start and not end and session.get("duration_minutes"):
        end = start + timedelta(minutes=session["duration_minutes"])
    return start, end or start


# ── weights ──────────────────────────────────────────────────────────────────

def convert_weight(kg: Optional[float], unit: str) -> Optional[float]:
    if kg is None:
        return None
    if unit == "kg":
        return round(kg * 2) / 2          # nearest 0.5 kg
    return round(kg * KG_TO_LB * 2) / 2   # nearest 0.5 lb


def format_weight(value: Optional[float]) -> Optional[str]:
    if value is None:
        return None
    return str(int(value)) if float(value).is_integer() else f"{value:g}"


# ── matching ─────────────────────────────────────────────────────────────────

def session_candidates(activity: ParsedGarminActivity, sessions: Sequence[Dict[str, Any]],
                       kind: str) -> List[MatchCandidate]:
    """sessions: dicts with id, name, started_at, completed_at/duration_minutes, external_id."""
    a_start, a_end = to_utc(activity.started_at), to_utc(activity.completed_at)
    out = []
    for s in sessions:
        if s.get("external_id") and s["external_id"] == activity.external_id:
            continue  # handled as duplicate
        if str(s.get("external_id") or "").startswith("garmin:"):
            continue  # already holds another watch activity: two watch activities are never one session
        start, end = _window(s)
        if not start:
            continue
        if start - OVERLAP_TOLERANCE <= a_end and a_start <= end + OVERLAP_TOLERANCE:
            score, reason = 1.0, "Logged at the same time"
        elif abs(start - a_start) <= SAME_DAY_WINDOW:
            score, reason = 0.5, "Logged the same day"
        else:
            continue
        out.append(MatchCandidate(kind=kind, id=s["id"], name=s.get("name") or "Session",
                                  started_at=start, score=score, reason=reason))
    out.sort(key=lambda c: (-c.score, abs((c.started_at - a_start).total_seconds())))
    return out


def workout_candidates(exercise_names: Sequence[str],
                       workouts: Sequence[Dict[str, Any]]) -> List[MatchCandidate]:
    """workouts: dicts with id, name, exercises (list of names)."""
    wanted = {normalize(n) for n in exercise_names if n}
    if not wanted:
        return []
    out = []
    for w in workouts:
        names = {normalize(n) for n in w.get("exercises", []) if n}
        if not names:
            continue
        overlap = len(wanted & names) / len(wanted)
        if overlap >= ATTACH_MIN_OVERLAP:
            out.append(MatchCandidate(kind="workout", id=w["id"], name=w.get("name") or "Workout",
                                      score=round(overlap, 2),
                                      reason=f"{len(wanted & names)} of {len(wanted)} exercises match"))
    out.sort(key=lambda c: -c.score)
    return out


def propose(activity: ParsedGarminActivity, sessions: List[MatchCandidate],
            workouts: List[MatchCandidate], duplicate_of: Optional[str]) -> ProposedAction:
    if duplicate_of:
        return ProposedAction(action="skip", target_id=duplicate_of, confidence="high",
                              reason="Already imported")
    if sessions:
        top = sessions[0]
        return ProposedAction(action="merge", target_id=top.id, target_name=top.name,
                              confidence="high" if top.score >= 1.0 else "low", reason=top.reason)
    if activity.kind == "strength" and workouts:
        top = workouts[0]
        return ProposedAction(action="attach", target_id=top.id, target_name=top.name,
                              confidence="high" if top.score >= 0.8 else "low", reason=top.reason)
    return ProposedAction(action="new", confidence="high", reason="Nothing logged around this time")


def auto_importable(activity: ParsedGarminActivity, proposed: ProposedAction) -> bool:
    if proposed.action == "skip" or proposed.confidence != "high":
        return False
    if activity.kind == "strength":
        if not activity.exercises:
            return False
        return all(not ex.needs_review for ex in activity.exercises)
    return True


# ── building app data ────────────────────────────────────────────────────────

def resolved_name(ex: ParsedGarminExercise, mappings: Dict[str, str]) -> str:
    return (mappings.get(ex.garmin_key) or ex.mapped_name or ex.garmin_label or "Unknown Exercise").strip()


def build_performances(activity: ParsedGarminActivity, mappings: Dict[str, str], unit: str,
                       group_ids: Optional[Dict[str, str]] = None) -> List[ExercisePerformance]:
    """Garmin exercises -> ExercisePerformance. Same app name twice is combined."""
    group_ids = group_ids or {}
    combined: Dict[str, Dict[str, Any]] = {}
    order: List[str] = []
    for ex in activity.exercises:
        name = resolved_name(ex, mappings)
        key = normalize(name)
        if key not in combined:
            combined[key] = {"name": name, "sets": []}
            order.append(key)
        combined[key]["sets"].extend(ex.sets)

    out = []
    for i, key in enumerate(order):
        name, sets = combined[key]["name"], combined[key]["sets"]
        weights = [convert_weight(s.weight_kg, unit) for s in sets]
        reps = [s.reps for s in sets if s.reps is not None]
        top = max((w for w in weights if w is not None), default=None)
        details = [
            SetDetail(set_number=n, reps_completed=s.reps, weight=w)
            for n, (s, w) in enumerate(zip(sets, weights), start=1)
        ]
        if reps and min(reps) != max(reps):
            target_reps = f"{min(reps)}-{max(reps)}"
        else:
            target_reps = str(reps[0]) if reps else "0"
        out.append(ExercisePerformance(
            exercise_name=name,
            group_id=group_ids.get(key) or f"garmin-{i}",
            sets_completed=len(sets),
            target_sets=str(len(sets)),
            target_reps=target_reps,
            weight=format_weight(top),
            weight_unit=unit,
            set_details=details,
            order_index=i,
        ))
    return out


def merge_strength(existing: Dict[str, Any], performances: List[ExercisePerformance],
                   activity: ParsedGarminActivity) -> Tuple[Dict[str, Any], Dict[str, Any], List[str]]:
    """Returns (fields to update, snapshot of their previous values, human-readable notes)."""
    exercises = [dict(e) for e in (existing.get("exercises_performed") or [])]
    notes: List[str] = []
    by_name = {normalize(e.get("exercise_name", "")): e for e in exercises}

    for perf in performances:
        p = perf.model_dump()
        match = by_name.get(normalize(perf.exercise_name))
        if match is None:
            p["order_index"] = len(exercises)
            p["notes"] = "Added from Garmin"
            exercises.append(p)
            notes.append(f"Add {perf.exercise_name} ({perf.sets_completed} sets from Garmin)")
            continue
        changed = []
        if not match.get("set_details"):
            match["set_details"] = p["set_details"]
            changed.append("per-set reps and weights")
        if not match.get("weight") and p.get("weight"):
            match["weight"], match["weight_unit"] = p["weight"], p["weight_unit"]
            changed.append("weight")
        elif match.get("weight") and p.get("weight") and str(match["weight"]) != str(p["weight"]):
            notes.append(f"Keep your {match['weight']} {match.get('weight_unit', '')} for "
                         f"{perf.exercise_name} (Garmin: {p['weight']} {p['weight_unit']})".replace("  ", " "))
        if not match.get("sets_completed"):
            match["sets_completed"] = p["sets_completed"]
            changed.append("sets")
        if changed:
            notes.append(f"{perf.exercise_name}: add {', '.join(changed)} from Garmin")

    update: Dict[str, Any] = {"exercises_performed": exercises}
    for field, value, label in (
        ("calories", activity.calories, "calories"),
        ("avg_heart_rate", activity.avg_heart_rate, "average heart rate"),
        ("max_heart_rate", activity.max_heart_rate, "max heart rate"),
        ("duration_minutes", max(1, round(activity.duration_minutes)) if activity.duration_minutes else None,
         "duration"),
    ):
        if value is not None and existing.get(field) in (None, 0):
            update[field] = value
            notes.append(f"Add {label} from Garmin")

    snapshot = {k: existing.get(k) for k in update}
    if not notes:
        notes.append("Nothing new to add: everything Garmin recorded is already logged")
    return update, snapshot, notes


# ── cardio ───────────────────────────────────────────────────────────────────

def cardio_fields(activity: ParsedGarminActivity, distance_unit: str = "mi") -> Dict[str, Any]:
    distance = None
    pace = None
    if activity.distance_m:
        distance = round(activity.distance_m / (1609.344 if distance_unit == "mi" else 1000.0), 2)
        if distance > 0 and activity.duration_minutes:
            per = activity.duration_minutes / distance
            pace = f"{int(per)}:{int(round((per - int(per)) * 60)) % 60:02d}"
    ascent_ft = round(activity.total_ascent_m * 3.28084) if activity.total_ascent_m else None
    details = {"source_sport": activity.sport, "source_sub_sport": activity.sub_sport}
    if activity.laps:
        details["laps"] = activity.laps
    return {
        "activity_type": activity.activity_type or "other",
        "activity_name": activity.name,
        "started_at": activity.started_at,
        "completed_at": activity.completed_at,
        "duration_minutes": max(1, round(activity.duration_minutes)),
        "distance": distance,
        "distance_unit": distance_unit,
        "pace_per_unit": pace,
        "avg_heart_rate": activity.avg_heart_rate,
        "max_heart_rate": activity.max_heart_rate,
        "calories": activity.calories,
        "elevation_gain": ascent_ft,
        "elevation_unit": "ft",
        "activity_details": details,
    }


def merge_cardio(existing: Dict[str, Any], fields: Dict[str, Any]) -> Tuple[Dict[str, Any], Dict[str, Any], List[str]]:
    update: Dict[str, Any] = {}
    notes: List[str] = []
    labels = {
        "distance": "distance", "pace_per_unit": "pace", "avg_heart_rate": "average heart rate",
        "max_heart_rate": "max heart rate", "calories": "calories", "elevation_gain": "elevation",
    }
    for field, label in labels.items():
        if fields.get(field) is not None and existing.get(field) in (None, 0, ""):
            update[field] = fields[field]
            if field == "distance":
                update["distance_unit"] = fields["distance_unit"]
            notes.append(f"Add {label} from Garmin")
    details = dict(existing.get("activity_details") or {})
    for k, v in fields["activity_details"].items():
        details.setdefault(k, v)
    if details != (existing.get("activity_details") or {}):
        update["activity_details"] = details
    snapshot = {k: existing.get(k) for k in update}
    if not notes:
        notes.append("Nothing new to add: everything Garmin recorded is already logged")
    return update, snapshot, notes
