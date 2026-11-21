"""
Map Garmin exercises to the user's exercise names.

Order: the user's saved mapping, then an exact match against names the user
already logs, then a small alias table of common lifts, then Garmin's own name.
Only 'saved' and 'exact' count as confirmed; the rest need review once.
"""

import re
from typing import Dict, Iterable, List

from ...models.garmin import ParsedGarminExercise

# Garmin label (lowercase) -> standard exercise DB name. Same naming the
# history aggregator uses (frontend/.../workout-history-exercise-aggregator.js).
GARMIN_ALIASES: Dict[str, str] = {
    "squat": "Barbell Full Squat",
    "barbell back squat": "Barbell Full Squat",
    "back squat": "Barbell Full Squat",
    "front squat": "Barbell Front Squat",
    "barbell front squat": "Barbell Front Squat",
    "goblet squat": "Dumbbell Goblet Squat",
    "bench press": "Barbell Bench Press - Medium Grip",
    "barbell bench press": "Barbell Bench Press - Medium Grip",
    "incline barbell bench press": "Barbell Incline Bench Press",
    "decline barbell bench press": "Barbell Decline Bench Press",
    "deadlift": "Barbell Deadlift",
    "barbell deadlift": "Barbell Deadlift",
    "sumo deadlift": "Barbell Sumo Deadlift",
    "romanian deadlift": "Barbell Romanian Deadlift",
    "straight leg deadlift": "Barbell Stiff Leg Deadlift",
    "overhead press": "Barbell Standing Military Press",
    "barbell shoulder press": "Barbell Standing Military Press",
    "military press": "Barbell Standing Military Press",
    "pull up": "Pull Up",
    "chin up": "Chin-Up",
    "lat pulldown": "Cable Lat Pulldown",
    "bent over row": "Barbell Bent Over Row",
    "barbell row": "Barbell Bent Over Row",
    "curl": "Barbell Curl",
    "barbell biceps curl": "Barbell Curl",
    "dip": "Chest Dip",
    "triceps dip": "Chest Dip",
}


def normalize(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (name or "").lower()).strip()


def map_key_to_doc_id(garmin_key: str) -> str:
    """Firestore document IDs can't contain '/'."""
    return garmin_key.replace("/", "__")


def apply_mappings(
    exercises: List[ParsedGarminExercise],
    saved: Dict[str, str],
    known_names: Iterable[str],
) -> List[ParsedGarminExercise]:
    known = {}
    for n in known_names:
        if n:
            known.setdefault(normalize(n), n)

    for ex in exercises:
        if ex.garmin_key in saved and saved[ex.garmin_key]:
            ex.mapped_name, ex.mapping_source = saved[ex.garmin_key], "saved"
            continue
        label = normalize(ex.garmin_label)
        if ex.category != "unknown" and label in known:
            ex.mapped_name, ex.mapping_source = known[label], "exact"
            continue
        alias = GARMIN_ALIASES.get(label)
        if alias:
            # Always a suggestion: Garmin's "Squat" could be any squat, so the
            # user confirms it once and the choice is saved.
            ex.mapped_name = known.get(normalize(alias), alias)
            ex.mapping_source = "suggested"
            continue
        ex.mapped_name = ex.garmin_label if ex.category != "unknown" else None
        ex.mapping_source = "garmin"
    return exercises
