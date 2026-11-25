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

from garmin_fakes import FakeFDS  # noqa: E402
from garmin_fit_builder import cardio_file, strength_file  # noqa: E402

from backend.models import WorkoutSession, WorkoutTemplate  # noqa: E402
from backend.models.garmin import (  # noqa: E402
    GarminImportConfirmRequest,
    GarminLogSetsRequest,
)
from backend.services.firestore_session_ops import _is_before  # noqa: E402
from backend.services.garmin import import_service, matching, set_log  # noqa: E402
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


def test_parser_heart_rate_and_rest_per_set():
    # 57s squat set at 120 bpm, 90s rest at 100 bpm, then 60s set at 140 bpm.
    sets = [dict(category=28, reps=8, weight_kg=74.8125, duration_s=57), dict(set_type="rest", duration_s=90),
            dict(category=28, reps=9, weight_kg=74.8125, duration_s=60)]
    a = parse_activity(strength_file(START, sets, heart_rate=lambda s: 120 if s <= 57 else (100 if s < 147 else 140)))
    first, second = a.exercises[0].sets
    assert (first.rest_s, first.avg_heart_rate, first.max_heart_rate) == (90, 120, 120)
    assert second.avg_heart_rate == 140 and second.rest_s is None
    assert a.exercises[0].avg_heart_rate == 130 and a.exercises[0].max_heart_rate == 140   # time-weighted
    perf = matching.build_performances(a, {}, "lbs")[0]
    assert (perf.avg_heart_rate, perf.max_heart_rate) == (130, 140)
    assert (perf.set_details[0].rest_s, perf.set_details[0].avg_heart_rate) == (90, 120)


HIIT_SETS = [dict(category=27, reps=7, duration_s=40), dict(set_type="rest", duration_s=20),
             dict(category=65534, reps=0, duration_s=40), dict(set_type="rest", duration_s=20),
             dict(category=27, reps=8, duration_s=40), dict(set_type="rest", duration_s=20),
             dict(category=65534, reps=0, duration_s=40)]


def hiit_file():
    return strength_file(START, HIIT_SETS, sport="training", sub_sport="hiit", heart_rate=lambda s: 150)


def test_parser_hiit_is_an_interval_workout():
    a = parse_activity(hiit_file())
    assert (a.kind, a.name, a.work_seconds, a.rest_seconds) == ("interval", "HIIT", 40, 20)
    # Alternating moves stay in order; untimed-reps "unknown" sets are kept (40s isn't a misfire).
    assert [e.garmin_key for e in a.exercises] == ["sit_up", "unknown", "sit_up", "unknown"]
    perfs = matching.build_performances(a, {"unknown": "Mountain Climber"}, "lbs")
    assert [p.exercise_name for p in perfs] == ["Sit Up", "Mountain Climber"]
    assert (perfs[0].sets_completed, perfs[0].target_reps) == (2, "7-8")
    assert (perfs[1].sets_completed, perfs[1].target_reps, perfs[1].avg_heart_rate) == (2, "40s", 150)


def test_hiit_new_import_creates_a_tabata_workout():
    fake = fresh_service()
    preview = run(import_service.build_preview(UID, hiit_file()))
    result = run(import_service.confirm(UID, GarminImportConfirmRequest(
        activity=preview.activity, action="new", exercise_mappings={"unknown": "Mountain Climber"})))
    session = fake._col(UID, "workout_sessions").document(result.session_id).get().to_dict()
    workout = fake._col(UID, "workouts").document(session["workout_id"]).get().to_dict()
    assert workout["workout_type"] == "tabata"
    section = workout["sections"][0]
    assert section["type"] == "tabata"
    assert section["config"] == {"work_seconds": 40, "rest_seconds": 20, "rounds": 2}
    assert [e["name"] for e in section["exercises"]] == ["Sit Up", "Mountain Climber"]
    assert session["exercises_performed"][1]["avg_heart_rate"] == 150


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
    other_watch = {"id": "s4", "name": "Strength", "started_at": START + timedelta(minutes=1), "duration_minutes": 20,
                   "external_id": "garmin:99:1"}   # another Garmin activity: never a merge target
    assert matching.session_candidates(a, [other_watch], "workout_session") == []
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


# ── set log ──────────────────────────────────────────────────────────────────

# Bench, an unnamed set, bench, a 4-second misfire, dips, then bench again.
NOTEBOOK_SETS = [
    dict(category=0, reps=8, weight_kg=84, duration_s=40), dict(set_type="rest", duration_s=90),
    dict(category=65534, reps=8, weight_kg=84, duration_s=40), dict(set_type="rest", duration_s=90),
    dict(category=0, reps=7, weight_kg=84, duration_s=40), dict(set_type="rest", duration_s=30),
    dict(category=0, reps=0, weight_kg=84, duration_s=4),
    dict(category=22, reps=12, duration_s=35), dict(set_type="rest", duration_s=60),
    dict(category=0, reps=6, weight_kg=84, duration_s=40),
]


def open_log(fake=None, sets=NOTEBOOK_SETS):
    preview = run(import_service.build_preview(UID, strength_file(START, sets, heart_rate=lambda s: 120)))
    return run(set_log.build(UID, preview.activity, pending_id="555"))


def test_parser_timeline_keeps_every_set_in_time_order():
    a = parse_activity(strength_file(START, NOTEBOOK_SETS))
    assert [st.garmin_key for st in a.timeline] == ["bench_press", "unknown", "bench_press", "bench_press",
                                                    "push_up", "bench_press"]
    assert [st.accidental for st in a.timeline] == [False, False, False, True, False, False]
    assert [st.index for st in a.timeline] == list(range(6))
    times = [st.start_time for st in a.timeline]
    assert times == sorted(times) and times[0] == START
    assert a.dropped_sets == 1 and sum(len(e.sets) for e in a.exercises) == 5     # grouped view unchanged


def test_set_log_lists_every_set_with_guesses():
    fresh_service()
    log = open_log()
    sets = [i for i in log.items if i["type"] == "set"]
    assert len(sets) == 6 and [s["id"] for s in sets] == [f"set-{n}" for n in range(6)]
    assert sets[0]["exercise_name"] == "Barbell Bench Press - Medium Grip" and sets[0]["name_source"] == "suggested"
    # The unnamed set between bench sets is assumed to be bench; the misfire is shown but excluded.
    assert (sets[1]["exercise_name"], sets[1]["name_source"]) == (sets[0]["exercise_name"], "neighbor")
    assert (sets[3]["accidental"], sets[3]["included"]) == (True, False)
    assert (sets[0]["reps"], sets[0]["weight"], sets[0]["rest_s"], sets[0]["avg_heart_rate"]) == (8, 185.0, 90, 120)
    assert sets[4]["bodyweight"] is True and sets[4]["weight"] is None
    assert sets[0]["started_at"] == START.isoformat()
    assert log.weight_unit == "lbs" and log.pending_id == "555" and log.workout_name.startswith("Garmin Strength")


def test_set_log_suggests_matching_workout():
    fake = fresh_service()
    chest = add_workout(fake, "Chest Day", ["Dumbbell Bench Press", "Machine Seated Dips", "Push Ups"])
    add_workout(fake, "Leg Day", ["Back Squat", "Leg Press"])
    log = open_log()
    assert [o["name"] for o in log.workout_options] == ["Chest Day", "Leg Day"]
    assert log.target_id == chest.id and log.workout_options[0]["score"] == 1.0
    assert log.workout_options[0]["exercises"][0] == {
        "name": "Dumbbell Bench Press", "sets": "3", "reps": "8", "weight": None, "weight_unit": "lbs",
        "group_id": chest.exercise_groups[0].group_id}
    assert set_log.template_match("Bench Press", ["Incline Bench Press", "Dumbbell Bench Press", "Dips"]) \
        == "Incline Bench Press"
    assert set_log.template_match("push up", ["Push Up", "Boso Ball Push Ups"]) == "Push Up"
    assert set_log.template_match("Squat", ["Deadlift"]) is None


def test_log_sets_against_a_workout_keeps_every_set_with_its_time():
    fake = fresh_service()
    chest = add_workout(fake, "Chest Day", ["Dumbbell Bench Press", "Dips"])
    log = open_log()
    items = [dict(i) for i in log.items]
    for it in items:                                   # what the editor does: use the workout's names
        if it["garmin_key"] in ("bench_press", "unknown"):
            it["exercise_name"] = "Dumbbell Bench Press"
        elif it["garmin_key"] == "push_up":
            it["exercise_name"] = "Dips"
    items[2]["reps"], items[2]["weight"] = 8, 190       # corrected by hand
    items.append({"id": "added-1", "type": "set", "exercise_name": "Dips", "reps": 10, "weight": None,
                  "bodyweight": True, "included": True, "started_at": None})
    result = run(set_log.save(UID, GarminLogSetsRequest(
        activity=log.activity, pending_id="555", items=items, target_id=chest.id)))
    assert result.action == "attach" and result.message == "Logged to Chest Day"
    session = fake._col(UID, "workout_sessions").document(result.session_id).get().to_dict()
    assert session["workout_id"] == chest.id and session["source"] == "garmin"
    bench, dips = session["exercises_performed"]
    assert (bench["exercise_name"], bench["sets_completed"], bench["weight"], bench["target_reps"]) == \
        ("Dumbbell Bench Press", 4, "190", "6-8")
    assert bench["group_id"] == chest.exercise_groups[0].group_id
    assert [(d["reps_completed"], d["weight"]) for d in bench["set_details"]] == \
        [(8, 185.0), (8, 185.0), (8, 190.0), (6, 185.0)]
    # Time order survives: bench's 4th set happened after the dips.
    assert bench["set_details"][3]["started_at"] > dips["set_details"][0]["started_at"]
    assert (dips["sets_completed"], dips["weight"], dips["set_details"][1]["started_at"]) == (2, "Body", None)
    assert bench["avg_heart_rate"] == 120
    # The edited log and the original watch data are stored for reopening; the template is untouched.
    meta = session["import_meta"]
    assert len(meta["set_log"]["items"]) == 7 and len(meta["activity"]["timeline"]) == 6
    assert len(fake._col(UID, "workouts").stream()) == 1
    # The watch's guess is remembered only where every set with it got one name.
    assert run(import_service.load_exercise_map(UID)) == {"bench_press": "Dumbbell Bench Press", "push_up": "Dips"}


def test_log_sets_new_workout_reopen_and_correct():
    fake = fresh_service()
    log = open_log()
    result = run(set_log.save(UID, GarminLogSetsRequest(
        activity=log.activity, items=log.items, workout_name="Chest (watch)", save_as_template=True)))
    workout = fake._col(UID, "workouts").stream()[0].to_dict()
    assert workout["name"] == "Chest (watch)" and not workout.get("is_archived")
    assert [g["exercises"]["a"] for g in workout["exercise_groups"]] == \
        ["Barbell Bench Press - Medium Grip", "Push Up"]
    assert workout["exercise_groups"][0]["sets"] == "4"

    # Same activity can't be logged twice, but the saved one can be reopened and corrected.
    try:
        run(set_log.build(UID, log.activity))
        raise AssertionError("expected duplicate error")
    except import_service.GarminImportError as e:
        assert e.status_code == 409
    again = run(set_log.reopen(UID, result.session_id))
    assert again.session_id == result.session_id and len(again.items) == 6
    items = [dict(i) for i in again.items]
    items[3]["included"], items[3]["reps"] = True, 5                 # the "misfire" was a real set after all
    items[4]["exercise_name"] = "Chest Dip"
    run(set_log.save(UID, GarminLogSetsRequest(activity=again.activity, session_id=result.session_id, items=items)))
    session = fake._col(UID, "workout_sessions").document(result.session_id).get().to_dict()
    assert [(p["exercise_name"], p["sets_completed"]) for p in session["exercises_performed"]] == \
        [("Barbell Bench Press - Medium Grip", 5), ("Chest Dip", 1)]
    assert session["import_meta"]["set_log"]["items"][3]["included"] is True
    assert len(fake._col(UID, "workout_sessions").stream()) == 1

    run(import_service.undo(UID, result.session_id, "workout"))
    assert fake._col(UID, "workout_sessions").stream() == []


def test_log_sets_includes_nearby_cardio_and_validates():
    fake = fresh_service()
    fake._col(UID, "garmin_activities").document("777").set({
        "status": "review", "kind": "cardio", "activity_type": "stair_climbing", "name": "Stair Stepper",
        "started_at": START - timedelta(minutes=25), "duration_minutes": 20, "avg_heart_rate": 140, "calories": 285})
    log = open_log()
    assert (log.items[0]["type"], log.items[0]["id"], log.items[0]["activity_type"]) == \
        ("cardio", "act-777", "stair_climber")
    result = run(set_log.save(UID, GarminLogSetsRequest(activity=log.activity, items=log.items)))
    assert result.linked_activity_ids == ["777"]
    session = fake._col(UID, "workout_sessions").document(result.session_id).get().to_dict()
    first = session["exercises_performed"][0]
    assert (first["exercise_name"], first["target_reps"], first["calories_burned"]) == ("stair_climber", "20 min", 285)

    fresh_service()
    log = open_log()
    for bad in ([dict(i, included=False) for i in log.items],
                [dict(i, exercise_name=" ") for i in log.items]):
        try:
            run(set_log.save(UID, GarminLogSetsRequest(activity=log.activity, items=bad)))
            raise AssertionError("expected validation error")
        except import_service.GarminImportError:
            pass


def test_set_log_from_activity_cached_without_timeline():
    fresh_service()
    preview = run(import_service.build_preview(UID, strength_file(START, SESSION_SETS)))
    old = preview.activity.model_copy(update={"timeline": []})
    log = run(set_log.build(UID, old))
    assert len(log.items) == 7 and log.items[0]["garmin_key"] == "squat"
    times = [i["started_at"] for i in log.items]
    assert times == sorted(times)


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
