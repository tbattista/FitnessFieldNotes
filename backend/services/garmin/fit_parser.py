"""
Read a Garmin activity FIT file (or the ZIP Garmin Connect wraps it in) into a
ParsedGarminActivity.

Strength sessions become ordered exercises with their active sets; cardio
sessions keep the session summary (duration, distance, heart rate, calories).

Exercise names come from fitdecode's bundled FIT profile at runtime.
"""

import io
import zipfile
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import fitdecode
from fitdecode.profile import FIELD_TYPES

from ...models.garmin import ParsedGarminActivity, ParsedGarminExercise, ParsedGarminSet

MAX_FIT_BYTES = 10 * 1024 * 1024

# A set with no reps that lasted less than this is a misfire (watch started a
# set by accident). Longer zero-rep sets are kept: planks and holds.
MISFIRE_MAX_SECONDS = 15

UNKNOWN_CATEGORY = "unknown"

# Garmin (sport, sub_sport) -> app cardio activity type. Checked sub_sport first.
_SUB_SPORT_TYPES = {
    "treadmill": "running",
    "indoor_running": "running",
    "trail": "trail_running",
    "indoor_cycling": "cycling",
    "spin": "cycling",
    "virtual_activity": "cycling",
    "indoor_rowing": "rowing",
    "elliptical": "elliptical",
    "stair_climbing": "stair_climber",
    "lap_swimming": "swimming",
    "open_water": "swimming",
    "indoor_walking": "walking",
    "hiit": "hiit",
    "yoga": "yoga",
    "pilates": "pilates",
}
_SPORT_TYPES = {
    "running": "running",
    "cycling": "cycling",
    "swimming": "swimming",
    "rowing": "rowing",
    "walking": "walking",
    "hiking": "hiking",
    "hiit": "hiit",
    "training": "hiit",
}

_DISPLAY_NAMES = {
    "treadmill": "Treadmill Run",
    "indoor_running": "Indoor Run",
    "trail": "Trail Run",
    "indoor_cycling": "Indoor Cycling",
    "spin": "Spin",
    "virtual_activity": "Virtual Ride",
    "indoor_rowing": "Indoor Row",
    "elliptical": "Elliptical",
    "stair_climbing": "Stair Stepper",
    "lap_swimming": "Pool Swim",
    "open_water": "Open Water Swim",
    "indoor_walking": "Indoor Walk",
    "hiit": "HIIT",
    "yoga": "Yoga",
    "pilates": "Pilates",
    "strength_training": "Strength",
}


class FitParseError(ValueError):
    """The upload is not a readable Garmin activity file."""


def humanize(name: Optional[str]) -> str:
    if not name:
        return "Unknown Exercise"
    return " ".join(w.capitalize() for w in str(name).replace("-", "_").split("_") if w)


def category_name(value: Any) -> str:
    if value is None:
        return UNKNOWN_CATEGORY
    if isinstance(value, str):
        return value
    return FIELD_TYPES["exercise_category"].enum.get(int(value), UNKNOWN_CATEGORY)


def exercise_name(category: str, subtype: Any) -> Optional[str]:
    if subtype is None or category == UNKNOWN_CATEGORY:
        return None
    if isinstance(subtype, str):
        return subtype
    table = FIELD_TYPES.get(f"{category}_exercise_name")
    if table is None or not getattr(table, "enum", None):
        return None
    return table.enum.get(int(subtype))


def _first(value: Any) -> Any:
    """FIT stores the watch's top guesses as an array; the first is its pick."""
    if isinstance(value, (list, tuple)):
        for v in value:
            if v is not None:
                return v
        return None
    return value


def _first_pair(category_value: Any, subtype_value: Any):
    """First guessed category, and the subtype at the same position."""
    cats = list(category_value) if isinstance(category_value, (list, tuple)) else [category_value]
    subs = list(subtype_value) if isinstance(subtype_value, (list, tuple)) else [subtype_value]
    for i, c in enumerate(cats):
        if c is not None:
            return c, subs[i] if i < len(subs) else None
    return None, None


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def extract_fit_bytes(blob: bytes) -> bytes:
    """Accept a raw .fit file or the ZIP Garmin Connect downloads."""
    if len(blob) > MAX_FIT_BYTES:
        raise FitParseError("File is too large for an activity file.")
    if blob[:2] == b"PK":
        try:
            with zipfile.ZipFile(io.BytesIO(blob)) as zf:
                names = [n for n in zf.namelist() if n.lower().endswith(".fit")]
                if not names:
                    raise FitParseError("The ZIP has no .fit file in it.")
                info = zf.getinfo(names[0])
                if info.file_size > MAX_FIT_BYTES:
                    raise FitParseError("File is too large for an activity file.")
                return zf.read(names[0])
        except zipfile.BadZipFile:
            raise FitParseError("The ZIP file is damaged.")
    if len(blob) >= 12 and blob[8:12] == b".FIT":
        return blob
    raise FitParseError("This isn't a FIT file. Export the activity's original file from Garmin Connect.")


def _read_messages(fit: bytes) -> Dict[str, List[Dict[str, Any]]]:
    wanted = {"file_id", "session", "set", "record"}
    out: Dict[str, List[Dict[str, Any]]] = {k: [] for k in wanted}
    try:
        with fitdecode.FitReader(io.BytesIO(fit), check_crc=fitdecode.CrcCheck.WARN) as reader:
            for frame in reader:
                if isinstance(frame, fitdecode.FitDataMessage) and frame.name in wanted:
                    if frame.name == "record":
                        # Only heart rate over time is needed from the per-second samples.
                        ts, hr = frame.get_value("timestamp", fallback=None), frame.get_value("heart_rate", fallback=None)
                        if ts is not None and hr:
                            out["record"].append({"timestamp": ts, "heart_rate": hr})
                        continue
                    out[frame.name].append({f.name: f.value for f in frame.fields})
    except fitdecode.FitError as e:
        raise FitParseError(f"Couldn't read the FIT file: {e}")
    return out


def _external_id(file_id: Dict[str, Any], started_at: datetime) -> str:
    serial = file_id.get("serial_number")
    created = _aware(file_id.get("time_created")) or started_at
    return f"garmin:{serial or 'connect'}:{int(created.timestamp())}"


class _HeartRate:
    """Heart-rate samples, for averaging over a time window."""

    def __init__(self, records: List[Dict[str, Any]]):
        self.samples = sorted((_aware(r["timestamp"]), int(r["heart_rate"])) for r in records)

    def window(self, start: Optional[datetime], seconds: Optional[float]):
        if not self.samples or start is None or not seconds:
            return None, None
        end = start + timedelta(seconds=float(seconds))
        values = [hr for ts, hr in self.samples if start <= ts <= end]
        if not values:
            return None, None
        return round(sum(values) / len(values)), max(values)


def _group_sets(raw_sets: List[Dict[str, Any]], hr: Optional["_HeartRate"] = None):
    """Active sets -> consecutive runs of the same exercise. Returns (exercises, dropped).

    Each set also gets the rest recorded after it, and its average/max heart rate.
    """
    hr = hr or _HeartRate([])
    exercises: List[ParsedGarminExercise] = []
    dropped = 0
    last: Optional[ParsedGarminSet] = None
    for s in raw_sets:
        if str(s.get("set_type")) not in ("active", "1"):
            rest = s.get("duration")
            if last is not None and isinstance(rest, (int, float)) and last.rest_s is None:
                last.rest_s = round(float(rest), 1)
            continue
        reps = s.get("repetitions")
        duration = s.get("duration")
        if (not reps) and (duration is None or duration < MISFIRE_MAX_SECONDS):
            dropped += 1
            continue

        cat_raw, sub_raw = _first_pair(s.get("category"), s.get("category_subtype"))
        cat = category_name(cat_raw)
        sub = exercise_name(cat, sub_raw)
        key = f"{cat}/{sub}" if sub else cat
        label = humanize(sub or cat)

        weight = s.get("weight")
        start = _aware(s.get("start_time"))
        avg_hr, max_hr = hr.window(start, duration)
        parsed = ParsedGarminSet(
            reps=reps,
            weight_kg=round(float(weight), 3) if isinstance(weight, (int, float)) and weight > 0 else None,
            duration_s=round(float(duration), 1) if isinstance(duration, (int, float)) else None,
            start_time=start,
            avg_heart_rate=avg_hr,
            max_heart_rate=max_hr,
        )
        last = parsed
        if exercises and exercises[-1].garmin_key == key:
            exercises[-1].sets.append(parsed)
        else:
            exercises.append(ParsedGarminExercise(garmin_key=key, garmin_label=label, category=cat, sets=[parsed]))

    for ex in exercises:   # exercise heart rate: time-weighted over its sets
        timed = [(st.avg_heart_rate, st.duration_s or 0) for st in ex.sets if st.avg_heart_rate]
        total = sum(d for _, d in timed)
        if timed:
            ex.avg_heart_rate = round(sum(h * d for h, d in timed) / total) if total else round(
                sum(h for h, _ in timed) / len(timed))
            ex.max_heart_rate = max(st.max_heart_rate for st in ex.sets if st.max_heart_rate)
    return exercises, dropped


def _median(values: List[float]) -> Optional[int]:
    values = sorted(v for v in values if v)
    if not values:
        return None
    mid = len(values) // 2
    return round(values[mid] if len(values) % 2 else (values[mid - 1] + values[mid]) / 2)


def cardio_activity_type(sport: Optional[str], sub_sport: Optional[str]) -> str:
    return _SUB_SPORT_TYPES.get(sub_sport or "") or _SPORT_TYPES.get(sport or "") or "other"


def parse_activity(blob: bytes) -> ParsedGarminActivity:
    fit = extract_fit_bytes(blob)
    msgs = _read_messages(fit)
    file_id = msgs["file_id"][0] if msgs["file_id"] else {}
    if str(file_id.get("type")) not in ("activity", "4"):
        raise FitParseError("This FIT file isn't an activity (it may be a course or workout file).")
    if not msgs["session"]:
        raise FitParseError("The activity has no session summary.")
    session = msgs["session"][0]

    started_at = _aware(session.get("start_time")) or _aware(file_id.get("time_created"))
    if started_at is None:
        raise FitParseError("The activity has no start time.")
    elapsed = session.get("total_elapsed_time") or session.get("total_timer_time") or 0
    completed_at = started_at + timedelta(seconds=float(elapsed))

    sport = session.get("sport")
    sub_sport = session.get("sub_sport")
    sport = str(sport) if sport is not None else None
    sub_sport = str(sub_sport) if sub_sport is not None else None
    is_strength = sub_sport == "strength_training"
    is_hiit = sub_sport == "hiit" or sport == "hiit"

    device = file_id.get("garmin_product") or file_id.get("product")
    common = dict(
        external_id=_external_id(file_id, started_at),
        sport=sport,
        sub_sport=sub_sport,
        device=str(device) if device is not None else None,
        started_at=started_at,
        completed_at=completed_at,
        duration_minutes=round(float(elapsed) / 60.0, 2),
        calories=session.get("total_calories"),
        avg_heart_rate=session.get("avg_heart_rate"),
        max_heart_rate=session.get("max_heart_rate"),
    )

    hr = _HeartRate(msgs["record"])
    if is_strength:
        exercises, dropped = _group_sets(msgs["set"], hr)
        return ParsedGarminActivity(kind="strength", name="Strength", exercises=exercises,
                                    dropped_sets=dropped, **common)

    if is_hiit:
        exercises, dropped = _group_sets(msgs["set"], hr)
        if exercises:
            all_sets = [st for ex in exercises for st in ex.sets]
            return ParsedGarminActivity(
                kind="interval", name="HIIT", exercises=exercises, dropped_sets=dropped,
                work_seconds=_median([st.duration_s for st in all_sets]),
                rest_seconds=_median([st.rest_s for st in all_sets]),
                **common)

    distance = session.get("total_distance")
    activity_type = cardio_activity_type(sport, sub_sport)
    name = _DISPLAY_NAMES.get(sub_sport or "") or humanize(sport or "activity")
    return ParsedGarminActivity(
        kind="cardio",
        activity_type=activity_type,
        name=name,
        distance_m=round(float(distance), 1) if isinstance(distance, (int, float)) and distance > 0 else None,
        total_ascent_m=session.get("total_ascent"),
        laps=session.get("num_laps"),
        **common,
    )
