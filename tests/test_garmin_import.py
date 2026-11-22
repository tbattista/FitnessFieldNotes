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
    GarminBuilderDraftRequest,
    GarminImportConfirmRequest,
    GarminLogFromBuilderRequest,
)
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


def rows_of(draft):
    """Exercise rows of a builder draft, in order."""
    return [ex for sec in draft.workout["sections"] for ex in sec["exercises"]]


def test_builder_draft_against_a_template():
    fake = fresh_service()
    w = add_workout(fake, "Lower Body", ["Squat", "Straight Leg Deadlift", "Barbell Deadlift"])
    sets = [dict(category=28, reps=8, weight_kg=74.8125, duration_s=57), dict(set_type="rest", duration_s=90),
            dict(category=28, reps=9, weight_kg=97.5, duration_s=60), dict(set_type="rest", duration_s=90),
            dict(category=8, subtype=0, reps=9, weight_kg=97.5, duration_s=43)]
    preview = run(import_service.build_preview(UID, strength_file(START, sets)))
    draft = run(import_service.builder_draft(UID, GarminBuilderDraftRequest(
        activity=preview.activity, action="attach", target_id=w.id, pending_id="25137407059")))
    assert draft.target_id == w.id and draft.workout["name"] == "Lower Body"
    assert draft.workout_options[0]["id"] == w.id
    # The builder's own format: one standard section per exercise, rows keyed by exercise_id.
    assert [sec["type"] for sec in draft.workout["sections"]] == ["standard", "standard"]
    squat, dl = rows_of(draft)
    assert (squat["exercise_id"], squat["name"], squat["sets"], squat["reps"], squat["rest"], squat["default_weight"]) \
        == ("garmin-ex-0", "Squat", "2", "8-9", "90s", "215")
    assert dl["rest"] == "60s"                                  # no rest recorded after the last set
    assert draft.workout["description"].startswith("From Garmin: Wed Nov 18")
    assert draft.garmin_exercises["garmin-ex-0"]["set_details"][0]["weight"] == 165.0
    assert len(fake._col(UID, "workout_sessions").stream()) == 0     # nothing saved yet
    assert len(fake._col(UID, "workouts").stream()) == 1


def test_builder_draft_row_types():
    fresh_service()
    sets = [dict(category=47, reps=0, duration_s=300),                   # stair stepper -> activity row
            dict(category=22, reps=15, duration_s=40),                   # push-ups, no weight -> Body
            dict(category=19, reps=0, duration_s=60),                    # plank: timed
            dict(category=28, reps=8, weight_kg=60, duration_s=45)]      # squat with weight
    preview = run(import_service.build_preview(UID, strength_file(START, sets)))
    draft = run(import_service.builder_draft(UID, GarminBuilderDraftRequest(activity=preview.activity, action="new")))
    stairs, push, plank, squat = rows_of(draft)
    assert stairs["group_type"] == "cardio"
    assert stairs["cardio_config"] == {"activity_type": "stair_climber", "duration_minutes": 5}
    assert (push["group_type"], push["default_weight"], push["reps"]) == ("standard", "Body", "15")
    assert (plank["default_weight"], plank["reps"]) == ("Body", "60s")
    assert squat["default_weight"] == "132.5"


def test_builder_draft_adds_nearby_cardio_and_logging_links_it():
    fake = fresh_service()
    acts = fake._col(UID, "garmin_activities")
    acts.document("777").set({"status": "review", "kind": "cardio", "activity_type": "stair_climbing",
                              "name": "Stair Stepper", "started_at": START - timedelta(minutes=25),
                              "duration_minutes": 20, "avg_heart_rate": 140, "calories": 285})
    acts.document("888").set({"status": "review", "kind": "cardio", "activity_type": "running", "name": "Run",
                              "started_at": START - timedelta(hours=6), "duration_minutes": 30})   # too far away
    acts.document("999").set({"status": "review", "kind": "strength", "name": "Strength", "started_at": START})
    preview = run(import_service.build_preview(UID, strength_file(START, SESSION_SETS)))
    draft = run(import_service.builder_draft(UID, GarminBuilderDraftRequest(activity=preview.activity, action="new")))
    first = rows_of(draft)[0]
    assert first["exercise_id"] == "garmin-act-777" and first["cardio_config"]["activity_type"] == "stair_climber"
    assert draft.linked_activity_ids == ["777"]

    result = run(import_service.log_from_builder(UID, GarminLogFromBuilderRequest(
        activity=draft.activity, workout_name="Leg Day", sections=draft.workout["sections"],
        garmin_exercises=draft.garmin_exercises)))
    assert result.linked_activity_ids == ["777"]
    session = fake._col(UID, "workout_sessions").document(result.session_id).get().to_dict()
    cardio = session["exercises_performed"][0]
    assert (cardio["exercise_name"], cardio["target_reps"], cardio["avg_heart_rate"], cardio["calories_burned"]) == \
        ("stair_climber", "20 min", 140, 285)
    assert "20 min · 140 bpm avg" in cardio["notes"]
    workout = fake._col(UID, "workouts").document(session["workout_id"]).get().to_dict()
    assert workout["sections"][0]["exercises"][0]["group_type"] == "cardio"


def test_log_from_builder_new_workout_keeps_watch_detail_until_edited():
    fake = fresh_service()
    preview = run(import_service.build_preview(UID, strength_file(START, SESSION_SETS)))
    draft = run(import_service.builder_draft(UID, GarminBuilderDraftRequest(activity=preview.activity, action="new")))
    sections = draft.workout["sections"]
    draft_names = [r["name"] for r in rows_of(draft)]
    sections[0]["exercises"][0]["name"] = "Back Squat"                    # renamed: values unchanged
    sections[2]["exercises"][0]["default_weight"] = "225"                 # corrected weight: detail dropped
    # Drag the deadlift into one block with the straight-leg deadlift (the builder's grouping).
    block = {"section_id": "s-block", "type": "superset", "name": "Deadlifts",
             "exercises": sections[1]["exercises"] + sections[2]["exercises"]}
    added = {"section_id": "s-new", "type": "standard", "name": None, "exercises": [
        {"exercise_id": "added-1", "name": "Leg Press", "sets": "3", "reps": "12", "rest": "60s",
         "default_weight": "180", "default_weight_unit": "lbs"}]}
    result = run(import_service.log_from_builder(UID, GarminLogFromBuilderRequest(
        activity=draft.activity, workout_name="Leg Day (watch)", sections=[sections[0], block, added],
        garmin_exercises=draft.garmin_exercises, target_id=None, save_as_template=False)))
    session = fake._col(UID, "workout_sessions").document(result.session_id).get().to_dict()
    workout = fake._col(UID, "workouts").document(session["workout_id"]).get().to_dict()
    assert workout["name"] == "Leg Day (watch)" and workout["is_archived"] is True
    assert [sec["type"] for sec in workout["sections"]] == ["standard", "superset", "standard"]
    perfs = session["exercises_performed"]
    assert [p["exercise_name"] for p in perfs] == ["Back Squat", draft_names[1], draft_names[2], "Leg Press"]
    assert len(perfs[0]["set_details"]) == 4 and perfs[2]["set_details"] == [] and perfs[2]["weight"] == "225"
    assert len(perfs[1]["set_details"]) == 1                              # dragged into a block: link kept
    assert perfs[3]["sets_completed"] == 3 and perfs[3]["avg_heart_rate"] is None
    assert session["source"] == "garmin" and session["import_meta"]["workout_id"] == workout["id"]
    assert session["started_at"] == START

    # Same activity again is refused; undo removes session and the hidden workout.
    try:
        run(import_service.log_from_builder(UID, GarminLogFromBuilderRequest(
            activity=draft.activity, workout_name="x", sections=sections, garmin_exercises={})))
        raise AssertionError("expected duplicate error")
    except import_service.GarminImportError as e:
        assert e.status_code == 409
    run(import_service.undo(UID, result.session_id, "workout"))
    assert fake._col(UID, "workouts").stream() == []


def test_log_from_builder_against_template_and_hiit_as_new_template():
    fake = fresh_service()
    w = add_workout(fake, "Lower Body", ["Squat", "Straight Leg Deadlift", "Barbell Deadlift"])
    preview = run(import_service.build_preview(UID, strength_file(START, SESSION_SETS)))
    draft = run(import_service.builder_draft(UID, GarminBuilderDraftRequest(
        activity=preview.activity, action="attach", target_id=w.id)))
    result = run(import_service.log_from_builder(UID, GarminLogFromBuilderRequest(
        activity=draft.activity, workout_name="ignored for templates", sections=draft.workout["sections"],
        garmin_exercises=draft.garmin_exercises, target_id=w.id)))
    session = fake._col(UID, "workout_sessions").document(result.session_id).get().to_dict()
    assert session["workout_id"] == w.id and result.action == "attach"
    assert session["exercises_performed"][0]["group_id"] == w.exercise_groups[0].group_id
    assert len(fake._col(UID, "workouts").stream()) == 1          # the template itself isn't changed

    fake2 = fresh_service()
    preview = run(import_service.build_preview(UID, hiit_file()))
    draft = run(import_service.builder_draft(UID, GarminBuilderDraftRequest(
        activity=preview.activity, action="new", exercise_mappings={"unknown": "Mountain Climber"})))
    (section,) = draft.workout["sections"]
    assert section["type"] == "tabata" and section["name"] == "HIIT 40s on / 20s off"
    assert section["config"] == {"work_seconds": 40, "rest_seconds": 20, "rounds": 2}
    assert [r["name"] for r in section["exercises"]] == ["Sit Up", "Mountain Climber"]
    run(import_service.log_from_builder(UID, GarminLogFromBuilderRequest(
        activity=draft.activity, workout_name="Core HIIT", sections=draft.workout["sections"],
        garmin_exercises=draft.garmin_exercises, save_as_template=True)))
    workout = fake2._col(UID, "workouts").stream()[0].to_dict()
    assert workout["name"] == "Core HIIT" and not workout.get("is_archived")
    assert workout["workout_type"] == "tabata" and workout["sections"][0]["type"] == "tabata"


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
