"""
Seed Demo User Data into Firestore
Populates a demo user account with realistic workout data for automated screenshots.

Usage:
    python backend/scripts/seed_demo_user.py --dry-run     # Preview without writing
    python backend/scripts/seed_demo_user.py               # Seed all data
    python backend/scripts/seed_demo_user.py --clear-only  # Just delete existing data
"""

import sys
import argparse
from pathlib import Path
from datetime import datetime, timezone

# Add project root to path for imports
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from dotenv import load_dotenv
load_dotenv(project_root / '.env')

from backend.services.demo_data_builder import (
    build_workouts, build_program, build_sessions,
    build_exercise_history, build_cardio_sessions,
    build_personal_records,
)

DEMO_USER_ID = "reviewer-demo-user"


# ── Clear Function ─────────────────────────────────────────────────────────

def clear_demo_user_data(db, dry_run=False):
    """Delete all subcollection docs and reset profile for the demo user."""
    prefix = "[DRY RUN] " if dry_run else ""
    user_ref = db.collection('users').document(DEMO_USER_ID)

    subcollections = ['workouts', 'programs', 'workout_sessions', 'exercise_history', 'cardio_sessions']

    for sub_name in subcollections:
        sub_ref = user_ref.collection(sub_name)
        docs = sub_ref.limit(500).stream()
        count = 0
        for doc in docs:
            count += 1
            if not dry_run:
                doc.reference.delete()
        print(f"  {prefix}Cleared {count} docs from {sub_name}")

    # Delete personal_records doc
    pr_ref = user_ref.collection('data').document('personal_records')
    pr_doc = pr_ref.get()
    if pr_doc.exists:
        if not dry_run:
            pr_ref.delete()
        print(f"  {prefix}Cleared data/personal_records")
    else:
        print(f"  {prefix}No data/personal_records to clear")

    # Reset user profile doc
    if not dry_run:
        user_doc = user_ref.get()
        if user_doc.exists:
            user_ref.delete()
    print(f"  {prefix}Reset user profile doc")


# ── Main Seed Function ────────────────────────────────────────────────────

def seed_demo_user(dry_run=False):
    """Seed the demo user with realistic workout data.

    Returns a result dict summarizing what was seeded.
    """
    from backend.config.firebase_config import get_firebase_app
    from firebase_admin import firestore

    prefix = "[DRY RUN] " if dry_run else ""

    print(f"{prefix}Seeding demo user: {DEMO_USER_ID}")
    print("=" * 60)

    app = get_firebase_app()
    if not app:
        print("ERROR: Firebase initialization failed. Check .env variables.")
        return {'error': 'Firebase initialization failed'}

    db = firestore.client(app=app)
    user_ref = db.collection('users').document(DEMO_USER_ID)
    now = datetime.now(timezone.utc)

    # ── Step 1: Clear existing data ──
    print("\n1. Clearing existing demo user data...")
    clear_demo_user_data(db, dry_run=dry_run)

    # ── Step 2: Build all data ──
    print(f"\n2. Building workout templates...")
    workouts = build_workouts()
    for w in workouts:
        groups = w['exercise_groups']
        print(f"  {prefix}{w['name']} ({len(groups)} exercises)")
        for g in groups:
            print(f"    - {g['exercises']['a']} ({g['sets']}x{g['reps']}, {g['rest']})")

    print(f"\n3. Building program...")
    program = build_program(workouts[0]['id'], workouts[1]['id'], workouts[2]['id'], now)
    print(f"  {prefix}{program['name']} — {len(program['workouts'])} workouts, "
          f"{program['duration_weeks']} weeks, {program['difficulty_level']}")

    print(f"\n4. Building workout sessions...")
    sessions = build_sessions(workouts, program['id'], now)
    print(f"  {prefix}{len(sessions)} sessions over 6 weeks")
    for s in sessions:
        date_str = s['started_at'].strftime('%Y-%m-%d %a')
        print(f"    - {date_str}: {s['workout_name']} ({s['duration_minutes']}min, "
              f"{s['session_mode']})")

    print(f"\n5. Building exercise history...")
    exercise_history = build_exercise_history(sessions)
    print(f"  {prefix}{len(exercise_history)} exercise history records")
    for eh in exercise_history:
        print(f"    - {eh['exercise_name']}: {eh['total_sessions']} sessions, "
              f"best {eh['best_weight']}lbs, last {eh['last_weight']}lbs")

    print(f"\n6. Building cardio sessions...")
    cardio_sessions = build_cardio_sessions(now)
    for cs in cardio_sessions:
        date_str = cs['started_at'].strftime('%Y-%m-%d')
        print(f"  {prefix}{cs['activity_name']} — {date_str}, "
              f"{cs['distance']}{cs['distance_unit']}, {cs['duration_minutes']}min")

    print(f"\n7. Building personal records...")
    personal_records = build_personal_records(sessions, now)
    for pr_id, pr in personal_records['records'].items():
        print(f"  {prefix}{pr['exercise_name']}: {pr['value']}lbs ({pr['sets_reps']})")

    # ── Step 3: Write to Firestore ──
    if dry_run:
        print(f"\n{'=' * 60}")
        print(f"[DRY RUN] Would write:")
        print(f"  - 1 user profile")
        print(f"  - {len(workouts)} workout templates")
        print(f"  - 1 program")
        print(f"  - {len(sessions)} workout sessions")
        print(f"  - {len(exercise_history)} exercise history records")
        print(f"  - {len(cardio_sessions)} cardio sessions")
        print(f"  - 1 personal records doc ({personal_records['count']} PRs)")
        return {
            'dry_run': True,
            'workouts': len(workouts),
            'programs': 1,
            'sessions': len(sessions),
            'exercise_history': len(exercise_history),
            'cardio_sessions': len(cardio_sessions),
            'personal_records': personal_records['count'],
        }

    print(f"\n{'=' * 60}")
    print("Writing to Firestore...")

    # Write user profile
    print("  Writing user profile...")
    user_ref.set({
        'displayName': 'Demo User',
        'preferences': {
            'theme': 'dark',
            'defaultUnits': 'imperial',
        },
        'active_program_id': program['id'],
        'created_at': now,
        'updated_at': now,
    })

    # Write workouts
    print(f"  Writing {len(workouts)} workouts...")
    for w in workouts:
        user_ref.collection('workouts').document(w['id']).set(w)

    # Write program
    print("  Writing program...")
    user_ref.collection('programs').document(program['id']).set(program)

    # Write sessions
    print(f"  Writing {len(sessions)} sessions...")
    for s in sessions:
        user_ref.collection('workout_sessions').document(s['id']).set(s)

    # Write exercise history
    print(f"  Writing {len(exercise_history)} exercise history records...")
    for eh in exercise_history:
        user_ref.collection('exercise_history').document(eh['id']).set(eh)

    # Write cardio sessions
    print(f"  Writing {len(cardio_sessions)} cardio sessions...")
    for cs in cardio_sessions:
        user_ref.collection('cardio_sessions').document(cs['id']).set(cs)

    # Write personal records
    print("  Writing personal records...")
    user_ref.collection('data').document('personal_records').set(personal_records)

    print(f"\n{'=' * 60}")
    print(f"Done! Demo user '{DEMO_USER_ID}' seeded successfully.")
    print(f"  Workouts:         {len(workouts)}")
    print(f"  Programs:         1")
    print(f"  Sessions:         {len(sessions)}")
    print(f"  Exercise History: {len(exercise_history)}")
    print(f"  Cardio Sessions:  {len(cardio_sessions)}")
    print(f"  Personal Records: {personal_records['count']}")

    return {
        'dry_run': False,
        'user_id': DEMO_USER_ID,
        'workouts': len(workouts),
        'programs': 1,
        'sessions': len(sessions),
        'exercise_history': len(exercise_history),
        'cardio_sessions': len(cardio_sessions),
        'personal_records': personal_records['count'],
    }


# ── CLI Entry Point ───────────────────────────────────────────────────────

if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='Seed demo user data into Firestore for automated screenshots'
    )
    parser.add_argument('--dry-run', action='store_true',
                        help='Preview without writing to Firestore')
    parser.add_argument('--clear-only', action='store_true',
                        help='Only clear existing demo user data, do not re-seed')
    args = parser.parse_args()

    if args.clear_only:
        from backend.config.firebase_config import get_firebase_app
        from firebase_admin import firestore

        print(f"Clearing all data for demo user: {DEMO_USER_ID}")
        app = get_firebase_app()
        if not app:
            print("ERROR: Firebase initialization failed. Check .env variables.")
            sys.exit(1)
        db = firestore.client(app=app)
        clear_demo_user_data(db, dry_run=args.dry_run)
        print("Done!")
    else:
        result = seed_demo_user(dry_run=args.dry_run)
        if result.get('error'):
            sys.exit(1)
