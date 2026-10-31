"""
Fill the public workout library with AI-generated Tabata workouts and Spin rides.

Needs GEMINI_API_KEY and the FIREBASE_* variables (same as the server). The
same fill can be started from /library-admin ("Fill library") on the live site.

Usage:
    python backend/scripts/seed_library.py                     # random 10-30 of each
    python backend/scripts/seed_library.py --tabata 20 --spin 15
    python backend/scripts/seed_library.py --dry-run           # show the plan only
"""

import argparse
import random
import sys
from pathlib import Path

project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from dotenv import load_dotenv
load_dotenv(project_root / '.env')


def main(tabata, spin, dry_run, email):
    from backend.services.firebase_service import firebase_service
    from backend.services.library_seeder import (
        SeedJob, random_count, run_seed, spin_requests, tabata_requests, _default_generators,
    )

    rng = random.Random()
    tabata = tabata if tabata is not None else random_count(rng)
    spin = spin if spin is not None else random_count(rng)
    print(f"Plan: {tabata} Tabata workouts + {spin} Spin rides")

    if dry_run:
        preview = random.Random(rng.random())
        for r in tabata_requests(tabata, preview):
            print(f"  tabata  {r['protocol']}  {r['sets']}x{r['rounds_per_set']}  "
                  f"{r['focus_areas'][0]:<12} {r['exercise_variety']}")
        for r in spin_requests(spin, preview):
            print(f"  spin    {r['duration_minutes']} min  {r['difficulty']:<9} "
                  f"all-outs={'yes' if r['include_all_outs'] else 'no'}")
        return 0

    if not firebase_service.is_available():
        print("Firestore is not available. Check the FIREBASE_* environment variables.")
        return 1
    if not all(g.is_available() for g in _default_generators().values()):
        print("GEMINI_API_KEY is not set.")
        return 1

    job = run_seed(SeedJob(tabata, spin), email, rng)
    for p in job.published:
        print(f"  + /{p['type']}-workouts/{p['slug']}")
    for e in job.errors:
        print(f"  ✗ {e}")
    print(f"\nPublished {job.done - job.failed} of {job.total} ({job.failed} failed).")
    return 0 if job.failed < job.total else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Fill the public workout library')
    parser.add_argument('--tabata', type=int, default=None, help='Tabata workouts (default: random 10-30)')
    parser.add_argument('--spin', type=int, default=None, help='Spin rides (default: random 10-30)')
    parser.add_argument('--email', default='tbattista@gmail.com', help='Recorded as the creator')
    parser.add_argument('--dry-run', action='store_true', help='Print what would be generated')
    args = parser.parse_args()
    sys.exit(main(args.tabata, args.spin, args.dry_run, args.email))
