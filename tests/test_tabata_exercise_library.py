"""
Checks the Tabata generator's kettlebell exercise library: the added moves are
offered, the removed ones are ruled out, and one-sided moves get balanced
left/right rounds.

    python tests/test_tabata_exercise_library.py      (also collectable by pytest)
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.services.tabata_kettlebell_generator import (  # noqa: E402
    _build_prompt,
    _is_unilateral,
)

ADDED = [
    "Single-Arm KB Swing", "Hand-to-Hand KB Swing", "KB Dead Clean", "KB Glute Bridge",
    "KB Hip Thrust", "KB Cossack Squat", "KB Curtsy Lunge", "KB Bottoms-Up Press",
    "KB Overhead Triceps Extension", "KB Curl", "KB Hammer Curl", "KB Floor Fly",
    "KB Squeeze Push-Up", "KB Floor Pullover", "KB Swing to Row", "KB Turkish Sit-Up",
    "KB Standing Woodchop", "KB Sit-Up to Press", "KB Suitcase March", "KB Hollow Hold",
    "KB Squat Thrust", "KB Swing + Push-Up combo", "KB Clean to Press Ladder",
]
REMOVED = ["KB Turkish Get-Up ·", "KB Bent Press ·", "KB Suitcase Carry", "Chest-Supported Row",
           "KB Man Maker", "Front Squat (2 KB)"]


def test_library_offers_added_moves_and_rules_out_removed():
    prompt = _build_prompt("20/10", ["full_body"], 3, 8)
    library = prompt.split("KETTLEBELL EXERCISE LIBRARY BY FOCUS AREA")[1].split("DO NOT USE")[0]
    missing = [m for m in ADDED if m not in library]
    assert not missing, missing
    present = [m for m in REMOVED if m in library]
    assert not present, present
    assert "DO NOT USE in Tabata intervals: Turkish Get-Up" in prompt
    assert "ONE KETTLEBELL" in prompt


def test_side_handling_for_new_moves():
    one_sided = ["KB Bottoms-Up Press", "KB Cossack Squat", "KB Suitcase March", "Single-Arm KB Swing"]
    two_sided = ["Hand-to-Hand KB Swing", "KB Glute Bridge", "KB Hip Thrust", "Two-Hand KB Swing"]
    assert all(_is_unilateral(n, False) for n in one_sided)
    # Hand-to-hand swaps hands inside the interval, even if the AI marks a side
    assert not any(_is_unilateral(n, True) for n in two_sided[:1])
    assert not any(_is_unilateral(n, False) for n in two_sided)


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"✓ {t.__name__}")
    print(f"\n{len(tests)} passed")
