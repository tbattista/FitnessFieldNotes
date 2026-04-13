"""
Validate an AI-generated spin ride plan against our rule set.

Usage:
    # Validate a JSON file:
    python scripts/validate_spin_ride.py path/to/plan.json

    # Validate from stdin:
    cat plan.json | python scripts/validate_spin_ride.py -

    # Tell the validator whether all-outs were requested (affects count checks):
    python scripts/validate_spin_ride.py plan.json --all-outs
    python scripts/validate_spin_ride.py plan.json --no-all-outs

    # Generate a ride live via the API and validate the response:
    python scripts/validate_spin_ride.py --generate 30 --difficulty hard --all-outs

Exit codes:
    0 = no errors (warnings allowed)
    1 = validation errors
    2 = usage / IO error
"""

import argparse
import json
import os
import sys

# Add parent directory to path so `backend` is importable when running as a script.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.services.spin_ride_validator import validate_spin_ride_plan  # noqa: E402


def _load_plan_from_path(path: str) -> dict:
    if path == "-":
        return json.load(sys.stdin)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _generate_plan(duration: int, difficulty: str, include_all_outs: bool) -> dict:
    """Call the generator directly (requires GEMINI_API_KEY)."""
    from dotenv import load_dotenv
    load_dotenv()
    from backend.services.spin_ride_generator import get_spin_ride_generator

    gen = get_spin_ride_generator()
    if not gen.is_available():
        print("ERROR: GEMINI_API_KEY is not configured — cannot generate.", file=sys.stderr)
        sys.exit(2)
    return gen.generate(
        duration_minutes=duration,
        include_all_outs=include_all_outs,
        difficulty=difficulty,
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate a spin ride plan against our rules.",
    )
    parser.add_argument(
        "path",
        nargs="?",
        help="Path to a JSON plan file, or '-' for stdin. Omit when using --generate.",
    )

    all_out_group = parser.add_mutually_exclusive_group()
    all_out_group.add_argument(
        "--all-outs",
        dest="include_all_outs",
        action="store_true",
        default=None,
        help="Assert that all-outs were requested (enables count checks).",
    )
    all_out_group.add_argument(
        "--no-all-outs",
        dest="include_all_outs",
        action="store_false",
        help="Assert that all-outs were NOT requested (any all_out is an error).",
    )

    parser.add_argument(
        "--generate",
        type=int,
        metavar="MINUTES",
        help="Generate a fresh ride of this duration via Gemini and validate it.",
    )
    parser.add_argument(
        "--difficulty",
        choices=["easy", "moderate", "hard", "intense"],
        default="moderate",
        help="Difficulty to use with --generate (default: moderate).",
    )
    parser.add_argument(
        "-n", "--runs",
        type=int,
        default=1,
        help="Number of generations to validate when using --generate (default: 1).",
    )

    args = parser.parse_args()

    if args.generate is None and not args.path:
        parser.error("provide a JSON path (or '-' for stdin), or use --generate MINUTES")

    # --- Path mode --------------------------------------------------------
    if args.generate is None:
        try:
            plan = _load_plan_from_path(args.path)
        except (OSError, json.JSONDecodeError) as e:
            print(f"ERROR: could not load plan: {e}", file=sys.stderr)
            return 2

        result = validate_spin_ride_plan(plan, include_all_outs=args.include_all_outs)
        print(result.summary())
        return 0 if result.ok else 1

    # --- Generate mode ----------------------------------------------------
    include = True if args.include_all_outs is None else args.include_all_outs
    total_errors = 0
    for i in range(args.runs):
        print(f"\n=== Run {i + 1}/{args.runs} — {args.generate}min {args.difficulty} "
              f"{'(with all-outs)' if include else '(no all-outs)'} ===")
        try:
            plan = _generate_plan(args.generate, args.difficulty, include)
        except Exception as e:  # noqa: BLE001 — surface any generator failure
            print(f"ERROR: generation failed: {type(e).__name__}: {e}", file=sys.stderr)
            total_errors += 1
            continue

        print(f"Title: {plan.get('title')!r}")
        print(f"Segments: {len(plan.get('segments', []))}")
        result = validate_spin_ride_plan(plan, include_all_outs=include)
        print(result.summary())
        if not result.ok:
            total_errors += 1

    return 0 if total_errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
