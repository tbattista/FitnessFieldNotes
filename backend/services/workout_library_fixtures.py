"""
Fixture workouts for the in-memory library store (local dev + Playwright).

Never used when Firestore is available. Three of the Tabata workouts share the
same criteria (20/10, full body, 3 × 8, mixed) so the reuse-before-generate
path has a big enough pool to exercise.
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

FULL_BODY_CRITERIA = {
    "protocol": "20/10",
    "focus_areas": ["full_body"],
    "sets": 3,
    "rounds_per_set": 8,
    "exercise_variety": "mixed",
}


def _tabata_plan(title: str, moves: List[str], focus: List[str], sets: int = 3,
                 rounds: int = 8, protocol: str = "20/10") -> Dict[str, Any]:
    work, rest = (int(x) for x in protocol.split("/"))
    segments = []
    for s in range(sets):
        for r in range(rounds):
            move = moves[(s * 2 + r) % len(moves)]
            segments.append({"name": move, "segment_type": "work", "duration_seconds": work,
                             "exercise": move, "cue": "Brace, then drive", "set_index": s + 1,
                             "round_index": r})
            segments.append({"name": "Rest", "segment_type": "rest", "duration_seconds": rest,
                             "exercise": "", "cue": "Breathe", "set_index": s + 1, "round_index": r})
        if s < sets - 1:
            segments.append({"name": "Set Rest", "segment_type": "set_rest", "duration_seconds": 60,
                             "exercise": "", "cue": "Shake it out", "set_index": s + 1,
                             "round_index": rounds})
    total = sum(seg["duration_seconds"] for seg in segments)
    return {"title": title, "protocol": protocol, "focus_areas": focus, "sets": sets,
            "rounds_per_set": rounds, "total_seconds": total, "segments": segments,
            "estimated_calories": round(total / 60 * 10), "exercise_variety": "mixed"}


def _spin_plan(title: str, minutes: int, difficulty: str, blocks: List[tuple]) -> Dict[str, Any]:
    segments = []
    for name, kind, seconds, resistance, rpm_low, rpm_high, cue in blocks:
        segments.append({"name": name, "segment_type": kind, "duration_seconds": seconds,
                         "resistance": resistance,
                         "rpm_low": rpm_low, "rpm_high": rpm_high, "cue": cue})
    total = sum(s["duration_seconds"] for s in segments)
    return {"title": title, "duration_minutes": minutes, "total_seconds": total,
            "segments": segments, "estimated_calories": minutes * 11, "difficulty": difficulty}


def build_fixture_entries() -> List[Dict[str, Any]]:
    from .workout_library_service import fallback_seo, criteria_from_plan, slugify

    base = datetime(2026, 10, 1, tzinfo=timezone.utc)
    raw = [
        ("tabata", _tabata_plan("Full Body Kettlebell Tabata Burner",
                                ["KB Swing", "Goblet Squat", "KB Clean & Press", "KB Row"], ["full_body"]),
         FULL_BODY_CRITERIA),
        ("tabata", _tabata_plan("Swing and Squat Full Body Tabata",
                                ["KB Swing", "Goblet Squat", "KB Thruster", "KB Deadlift"], ["full_body"]),
         FULL_BODY_CRITERIA),
        ("tabata", _tabata_plan("Total Body Kettlebell Tabata Circuit",
                                ["KB Snatch", "KB Lunge", "KB Push Press", "KB High Pull"], ["full_body"]),
         FULL_BODY_CRITERIA),
        ("tabata", _tabata_plan("Kettlebell Core Crusher Tabata",
                                ["KB Russian Twist", "KB Halo", "KB Dead Bug Press", "KB Windmill"], ["core"],
                                sets=2),
         None),
        ("spin", _spin_plan("30-Minute Rolling Hills Ride", 30, "moderate", [
            ("Warm Up", "warmup", 300, 3, 80, 90, "Easy spin, loosen up"),
            ("Hill Climb 1", "climb", 240, 6, 65, 75, "Seated climb, steady breath"),
            ("Recovery", "recovery", 120, 3, 85, 95, "Spin it out"),
            ("Hill Climb 2", "climb", 300, 7, 60, 70, "Out of the saddle for the last minute"),
            ("Recovery", "recovery", 120, 3, 85, 95, "Drop the load"),
            ("Tempo Push", "flat", 360, 5, 90, 100, "Hold the pace"),
            ("Hill Climb 3", "climb", 240, 8, 60, 70, "Heaviest climb — grind it"),
            ("Cool Down", "cooldown", 120, 2, 75, 85, "Easy legs"),
        ]), None),
        ("spin", _spin_plan("45-Minute Hard Interval Ride", 45, "hard", [
            ("Warm Up", "warmup", 420, 3, 80, 90, "Build gradually"),
            ("Sprint Set 1", "sprint", 180, 6, 100, 110, "Fast legs, light bounce"),
            ("Recovery", "recovery", 180, 3, 80, 90, "Recover fully"),
            ("Climb Block", "climb", 600, 8, 60, 70, "Long grind"),
            ("Recovery", "recovery", 180, 3, 80, 90, "Breathe"),
            ("Sprint Set 2", "sprint", 240, 7, 100, 115, "Everything you have"),
            ("Tempo", "flat", 600, 5, 90, 100, "Strong and steady"),
            ("Cool Down", "cooldown", 300, 2, 75, 85, "Spin it out"),
        ]), None),
    ]
    entries = []
    for i, (wtype, plan, criteria) in enumerate(raw):
        seo = fallback_seo(wtype, plan)
        created = base + timedelta(days=i)
        entries.append({
            "id": f"fixture-{wtype}-{i}",
            "type": wtype,
            "slug": slugify(seo["title"]),
            "status": "published",
            "plan": plan,
            "criteria": criteria or criteria_from_plan(wtype, plan),
            "seo": seo,
            "source": "seed",
            "created_by": None,
            "created_at": created,
            "updated_at": created,
            "times_served": 0,
            "times_completed": 0,
        })
    return entries
