"""
Backend tests for the Garmin FIT import: parser, exercise mapping, matching,
merge rules, and the preview -> confirm -> undo flow against an in-memory
Firestore stand-in. Fixtures are synthetic FIT files (tests/garmin_fit_builder.py).

    python tests/test_garmin_import.py      (also collectable by pytest)
"""

import asyncio
import io
import sys
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from garmin_fit_builder import cardio_file, strength_file  # noqa: E402

from backend.models import WorkoutSession, WorkoutTemplate  # noqa: E402
from backend.models.cardio import CardioSession  # noqa: E402
from backend.models.garmin import GarminImportConfirmRequest  # noqa: E402
from backend.services.firestore_session_ops import _is_before  # noqa: E402
from backend.services.garmin import import_service, matching  # noqa: E402
from backend.services.garmin.exercise_mapper import apply_mappings  # noqa: E402
from backend.services.garmin.fit_parser import FitParseError, parse_activity  # noqa: E402

START = datetime(2026, 11, 18, 22, 27, 26, tzinfo=timezone.utc)

# The owner's 11/18 session, re-created synthetically (no real file used).
SESSION_SETS = [
    dict(category=28, alt_category=17, reps=8, weight_kg=74.8125, duration_s=57),
    dict(set_type="rest", duration_s=90),
    dict(category=28, reps=9, weight_kg=74.8125, duration_s=60),
    dict(category=28, reps=7, weight_kg=97.5, duration_s=60),
    dict(category=65534, reps=0, weight_kg=97.5, duration_s=10.7),   # misfire
    dict(category=28, reps=7, weight_kg=97.5, duration_s=60),
    dict(category=8, subtype=25, reps=10, weight_kg=97.5, duration_s=36),
    dict(category=8, subtype=0, reps=9, weight_kg=97.5, duration_s=34),
    dict(category=8, subtype=0, reps=9, weight_kg=97.5, duration_s=43),
]


def strength_activity():
    return parse_activity(strength_file(START, SESSION_SETS))


# ── in-memory Firestore and data service ─────────────────────────────────────

class _Doc:
    def __init__(self, store, path):
        self.store, self.path, self.id = store, path, path[-1]

    def get(self):
        return _Snap(self.id, self.store.get(self.path))

    def set(self, data):
        self.store[self.path] = dict(data)

    def update(self, data):
        if self.path not in self.store:
            raise KeyError(self.path)
        self.store[self.path].update(data)

    def delete(self):
        self.store.pop(self.path, None)

    def collection(self, name):
        return _Col(self.store, self.path + (name,))


class _Snap:
    def __init__(self, id_, data):
        self.id, self._data = id_, data

    @property
    def exists(self):
        return self._data is not None

    def to_dict(self):
        return dict(self._data) if self._data is not None else None


class _Col:
    def __init__(self, store, path, filters=(), limit=None):
        self.store, self.path, self.filters, self._limit = store, path, filters, limit

    def document(self, id_):
        return _Doc(self.store, self.path + (id_,))

    def where(self, field, op, value):
        return _Col(self.store, self.path, self.filters + ((field, value),), self._limit)

    def limit(self, n):
        return _Col(self.store, self.path, self.filters, n)

    def stream(self):
        out = []
        for path, data in self.store.items():
            if path[:-1] == self.path and all(data.get(f) == v for f, v in self.filters):
                out.append(_Snap(path[-1], data))
        return out[: self._limit] if self._limit else out


class FakeDB:
    def __init__(self):
        self.store = {}

    def collection(self, name):
        return _Col(self.store, (name,))


class FakeFDS:
    """The subset of firestore_data_service the import uses."""

    def __init__(self):
        self.db = FakeDB()

    def _col(self, uid, name):
        return self.db.collection("users").document(uid).collection(name)

    async def get_user_workouts(self, uid, limit=50):
        return [WorkoutTemplate(**s.to_dict()) for s in self._col(uid, "workouts").stream()]

    async def get_workout(self, uid, wid):
        snap = self._col(uid, "workouts").document(wid).get()
        return WorkoutTemplate(**snap.to_dict()) if snap.exists else None

    async def create_workout(self, uid, req):
        w = WorkoutTemplate(name=req.name, description=req.description, exercise_groups=req.exercise_groups)
        self._col(uid, "workouts").document(w.id).set(w.model_dump())
        return w

    async def update_workout(self, uid, wid, req):
        self._col(uid, "workouts").document(wid).update(req.model_dump(exclude_unset=True))

    async def delete_workout(self, uid, wid):
        self._col(uid, "workouts").document(wid).delete()
        return True

    async def get_user_sessions(self, uid, limit=20):
        return [WorkoutSession(**s.to_dict()) for s in self._col(uid, "workout_sessions").stream()]

    async def get_user_cardio_sessions(self, uid, limit=20):
        return [CardioSession(**s.to_dict()) for s in self._col(uid, "cardio_sessions").stream()]

    async def create_and_complete_workout_session(self, uid, req):
        data = req.model_dump()
        data["exercises_performed"] = [e.model_dump() for e in req.exercises_performed]
        s = WorkoutSession(**{**data, "status": "completed"})
        self._col(uid, "workout_sessions").document(s.id).set(s.model_dump())
        return s

    async def create_cardio_session(self, uid, req):
        s = CardioSession(**req.model_dump())
        self._col(uid, "cardio_sessions").document(s.id).set(s.model_dump())
        return s


def fresh_service():
    fake = FakeFDS()
    import_service.fds = fake
    return fake


def run(coro):
    return asyncio.run(coro)


UID = "user-1"


def add_workout(fake, name, exercises):
    w = WorkoutTemplate(name=name, exercise_groups=[
        {"exercises": {"a": e}, "sets": "3", "reps": "8"} for e in exercises])
    fake._col(UID, "workouts").document(w.id).set(w.model_dump())
    return w


def add_session(fake, name, start, minutes, exercises):
    s = WorkoutSession(workout_id="w-x", workout_name=name, started_at=start,
                       completed_at=start + timedelta(minutes=minutes), status="completed",
                       duration_minutes=minutes, exercises_performed=exercises)
    fake._col(UID, "workout_sessions").document(s.id).set(s.model_dump())
    return s


# ── parser ───────────────────────────────────────────────────────────────────

def test_parser_groups_sets_and_drops_misfires():
    a = strength_activity()
    assert a.kind == "strength" and a.name == "Strength"
    assert a.external_id == f"garmin:123456789:{int(START.timestamp())}"
    assert a.dropped_sets == 1
    assert [e.garmin_key for e in a.exercises] == ["squat", "deadlift/straight_leg_deadlift", "deadlift/barbell_deadlift"]
    assert [s.reps for s in a.exercises[0].sets] == [8, 9, 7, 7]
    assert a.exercises[1].garmin_label == "Straight Leg Deadlift"
    assert (a.calories, a.avg_heart_rate, a.max_heart_rate) == (216, 127, 149)


def test_parser_cardio_and_zip():
    blob = cardio_file(START, 1831.41, 3169.22)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("1_ACTIVITY.fit", blob)
    for data in (blob, buf.getvalue()):
        c = parse_activity(data)
        assert (c.kind, c.activity_type, c.name) == ("cardio", "running", "Treadmill Run")
        assert c.distance_m == 3169.2 and c.laps == 5 and round(c.duration_minutes) == 31


def test_parser_rejects_non_fit():
    for bad in (b"hello world, not a fit file", b"PK\x03\x04broken"):
        try:
            parse_activity(bad)
        except FitParseError:
            continue
        raise AssertionError("expected FitParseError")


# ── mapping and matching ─────────────────────────────────────────────────────

def test_mapping_order():
    a = strength_activity()
    apply_mappings(a.exercises, {"deadlift/barbell_deadlift": "Conventional Deadlift"}, ["Straight Leg Deadlift"])
    squat, sldl, dl = a.exercises
    assert (squat.mapped_name, squat.mapping_source) == ("Barbell Full Squat", "suggested")
    assert (sldl.mapped_name, sldl.mapping_source) == ("Straight Leg Deadlift", "exact")
    assert (dl.mapped_name, dl.mapping_source) == ("Conventional Deadlift", "saved")
    assert squat.needs_review and not sldl.needs_review and not dl.needs_review


def test_performances_convert_weights():
    a = strength_activity()
    perfs = matching.build_performances(a, {}, "lbs")
    squat = perfs[0]
    assert squat.exercise_name == "Squat" and squat.sets_completed == 4
    assert [d.weight for d in squat.set_details] == [165.0, 165.0, 215.0, 215.0]
    assert squat.weight == "215" and squat.target_reps == "7-9"
    # Two Garmin keys mapped to one app name are combined into one exercise.
    one = matching.build_performances(a, {"deadlift/straight_leg_deadlift": "Deadlift",
                                          "deadlift/barbell_deadlift": "Deadlift"}, "kg")
    assert [p.exercise_name for p in one] == ["Squat", "Deadlift"] and one[1].sets_completed == 3
    assert one[0].set_details[0].weight == 75.0


def test_matching_proposals():
    a = strength_activity()
    overlap = {"id": "s1", "name": "Leg Day", "started_at": START - timedelta(minutes=5),
               "completed_at": START + timedelta(minutes=30)}
    later = {"id": "s2", "name": "Upper", "started_at": START + timedelta(hours=4), "duration_minutes": 40}
    far = {"id": "s3", "name": "Old", "started_at": START - timedelta(days=3), "duration_minutes": 40}
    c = matching.session_candidates(a, [far, later, overlap], "workout_session")
    assert [x.id for x in c] == ["s1", "s2"] and c[0].score == 1.0
    p = matching.propose(a, c, [], None)
    assert (p.action, p.target_id, p.confidence) == ("merge", "s1", "high")
    assert matching.propose(a, c[1:], [], None).confidence == "low"
    assert matching.propose(a, c, [], "dup").action == "skip"

    w = matching.workout_candidates(["Squat", "Barbell Deadlift"],
                                    [{"id": "w1", "name": "Legs", "exercises": ["squat", "Barbell Deadlift", "Lunge"]},
                                     {"id": "w2", "name": "Arms", "exercises": ["Curl"]}])
    assert [x.id for x in w] == ["w1"]
    assert matching.propose(a, [], w, None).action == "attach"
    assert matching.propose(a, [], [], None).action == "new"


def test_auto_import_needs_confirmed_names():
    a = strength_activity()
    p = matching.propose(a, [], [], None)
    apply_mappings(a.exercises, {}, [])
    assert not matching.auto_importable(a, p)
    apply_mappings(a.exercises, {e.garmin_key: e.garmin_label for e in a.exercises}, [])
    assert matching.auto_importable(a, p)


def test_merge_app_values_win():
    a = strength_activity()
    perfs = matching.build_performances(a, {}, "lbs")
    existing = {"exercises_performed": [{"exercise_name": "squat", "weight": "185", "weight_unit": "lbs",
                                         "sets_completed": 4, "set_details": [], "group_id": "g", "order_index": 0}],
                "calories": 300, "duration_minutes": 45, "avg_heart_rate": None}
    update, snapshot, notes = matching.merge_strength(existing, perfs, a)
    squat = update["exercises_performed"][0]
    assert squat["weight"] == "185"                      # app wins
    assert len(squat["set_details"]) == 4                 # gap filled from Garmin
    assert [e["exercise_name"] for e in update["exercises_performed"]][1:] == ["Straight Leg Deadlift", "Barbell Deadlift"]
    assert "calories" not in update and update["avg_heart_rate"] == 127
    assert snapshot["exercises_performed"][0]["set_details"] == []
    assert any("Keep your 185" in n for n in notes)


def test_history_chronology_guard():
    assert _is_before(datetime(2026, 1, 1), datetime(2026, 2, 1, tzinfo=timezone.utc))
    assert not _is_before(datetime(2026, 3, 1), datetime(2026, 2, 1))
    assert not _is_before(None, datetime(2026, 2, 1))


# ── service flow ─────────────────────────────────────────────────────────────

def test_flow_new_then_duplicate_then_undo():
    fake = fresh_service()
    blob = strength_file(START, SESSION_SETS)
    preview = run(import_service.build_preview(UID, blob))
    assert preview.proposed.action == "new" and preview.duplicate_of is None

    req = GarminImportConfirmRequest(activity=preview.activity, action="new",
                                     exercise_mappings={"squat": "Back Squat"})
    result = run(import_service.confirm(UID, req))
    session = fake._col(UID, "workout_sessions").document(result.session_id).get().to_dict()
    assert session["source"] == "garmin" and session["external_id"] == preview.activity.external_id
    assert session["exercises_performed"][0]["exercise_name"] == "Back Squat"
    assert session["avg_heart_rate"] == 127
    workout_id = session["import_meta"]["workout_id"]
    assert fake._col(UID, "workouts").document(workout_id).get().to_dict()["is_archived"] is True
    assert run(import_service.load_exercise_map(UID))["squat"] == "Back Squat"

    # Same file again: preview flags it, confirm refuses it.
    again = run(import_service.build_preview(UID, blob))
    assert again.duplicate_of == result.session_id and again.proposed.action == "skip"
    try:
        run(import_service.confirm(UID, req))
        raise AssertionError("expected duplicate error")
    except import_service.GarminImportError as e:
        assert e.status_code == 409

    # Saved mapping is applied and confirmed next time.
    squat = again.activity.exercises[0]
    assert (squat.mapped_name, squat.mapping_source) == ("Back Squat", "saved")

    run(import_service.undo(UID, result.session_id, "workout"))
    assert not fake._col(UID, "workout_sessions").document(result.session_id).get().exists
    assert not fake._col(UID, "workouts").document(workout_id).get().exists


def test_flow_merge_and_undo():
    fake = fresh_service()
    logged = add_session(fake, "Leg Day", START - timedelta(minutes=2), 25, [
        {"exercise_name": "Squat", "group_id": "g1", "order_index": 0, "weight": "215", "weight_unit": "lbs",
         "sets_completed": 4}])
    before = fake._col(UID, "workout_sessions").document(logged.id).get().to_dict()

    preview = run(import_service.build_preview(UID, strength_file(START, SESSION_SETS)))
    assert (preview.proposed.action, preview.proposed.target_id, preview.proposed.confidence) == ("merge", logged.id, "high")
    assert preview.merge_notes

    result = run(import_service.confirm(UID, GarminImportConfirmRequest(
        activity=preview.activity, action="merge", target_id=logged.id)))
    after = fake._col(UID, "workout_sessions").document(logged.id).get().to_dict()
    assert after["external_id"] == preview.activity.external_id
    assert len(after["exercises_performed"]) == 3 and after["exercises_performed"][0]["weight"] == "215"
    assert len(after["exercises_performed"][0]["set_details"]) == 4

    run(import_service.undo(UID, result.session_id, "workout"))
    restored = fake._col(UID, "workout_sessions").document(logged.id).get().to_dict()
    for key in ("exercises_performed", "avg_heart_rate", "external_id", "import_meta"):
        assert restored.get(key) == before.get(key), key


def test_flow_attach_to_template():
    fake = fresh_service()
    w = add_workout(fake, "Lower Body", ["Squat", "Straight Leg Deadlift", "Barbell Deadlift"])
    preview = run(import_service.build_preview(UID, strength_file(START, SESSION_SETS)))
    assert (preview.proposed.action, preview.proposed.target_id) == ("attach", w.id)
    result = run(import_service.confirm(UID, GarminImportConfirmRequest(
        activity=preview.activity, action="attach", target_id=w.id)))
    s = fake._col(UID, "workout_sessions").document(result.session_id).get().to_dict()
    assert s["workout_id"] == w.id
    assert s["exercises_performed"][0]["group_id"] == w.exercise_groups[0].group_id


def test_flow_cardio_new():
    fake = fresh_service()
    preview = run(import_service.build_preview(UID, cardio_file(START, 1831.41, 3169.22)))
    assert preview.activity.kind == "cardio" and preview.proposed.action == "new"
    assert preview.auto_importable
    result = run(import_service.confirm(UID, GarminImportConfirmRequest(activity=preview.activity, action="new")))
    s = fake._col(UID, "cardio_sessions").document(result.session_id).get().to_dict()
    assert (s["activity_type"], s["distance"], s["distance_unit"], s["source"]) == ("running", 1.97, "mi", "garmin")
    assert s["pace_per_unit"] == "15:30" and s["avg_heart_rate"] == 135


# ── API ──────────────────────────────────────────────────────────────────────

def test_api_parse_file():
    import httpx
    from backend.main import app
    from backend.middleware.auth import get_current_user
    from backend.services.firebase_service import firebase_service

    fresh_service()
    app.dependency_overrides[get_current_user] = lambda: {"uid": UID}
    original = firebase_service.is_available
    firebase_service.is_available = lambda: True

    async def go():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            ok = await c.post("/api/v3/garmin/import/parse-file",
                              files={"file": ("a.fit", strength_file(START, SESSION_SETS))})
            bad = await c.post("/api/v3/garmin/import/parse-file", files={"file": ("a.fit", b"nope")})
            return ok, bad

    try:
        ok, bad = run(go())
    finally:
        app.dependency_overrides.clear()
        firebase_service.is_available = original
    assert ok.status_code == 200, ok.text
    assert ok.json()["activity"]["exercises"][0]["garmin_key"] == "squat"
    assert bad.status_code == 400


if __name__ == "__main__":
    tests = [(n, f) for n, f in list(globals().items()) if n.startswith("test_") and callable(f)]
    failed = 0
    for name, fn in tests:
        try:
            fn()
            print(f"PASS {name}")
        except Exception as e:  # noqa: BLE001
            failed += 1
            import traceback
            traceback.print_exc()
            print(f"FAIL {name}: {e}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    sys.exit(1 if failed else 0)
