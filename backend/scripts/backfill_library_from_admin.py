"""
Backfill the public workout library from the admin's saved spin rides.

Completed spin rides are stored with their full plan at
users/{uid}/spin_rides/{id}. This copies the admin's rides into
library_workouts (with AI-written SEO copy when GEMINI_API_KEY is set).
Rides whose title is already in the library are skipped, so it is safe to re-run.

Tabata plans were never stored server-side, so past Tabata workouts cannot be
backfilled. New admin generations publish automatically.

Usage:
    python backend/scripts/backfill_library_from_admin.py --dry-run
    python backend/scripts/backfill_library_from_admin.py
    python backend/scripts/backfill_library_from_admin.py --email someone@example.com
"""

import argparse
import sys
from pathlib import Path

project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from dotenv import load_dotenv
load_dotenv(project_root / '.env')


def main(email: str, dry_run: bool) -> int:
    from firebase_admin import auth

    from backend.models.spin_ride import SpinRidePlan
    from backend.services.firebase_service import firebase_service
    from backend.services.library_seo_writer import write_seo
    from backend.services.workout_library_service import criteria_from_plan, workout_library_service

    if not firebase_service.is_available():
        print("Firestore is not available. Check the FIREBASE_* environment variables.")
        return 1

    user = auth.get_user_by_email(email, app=firebase_service.app)
    db = firebase_service.get_firestore()
    rides = list(db.collection('users').document(user.uid).collection('spin_rides').stream())
    print(f"Found {len(rides)} saved spin rides for {email} ({user.uid})")

    existing = {(e.get('plan') or {}).get('title') for e in workout_library_service.all_entries()
                if e.get('type') == 'spin'}
    published = skipped = invalid = 0
    for doc in rides:
        data = doc.to_dict() or {}
        try:
            plan = SpinRidePlan(**(data.get('plan') or {})).model_dump()
        except Exception as e:
            invalid += 1
            print(f"  ✗ {doc.id}: invalid plan ({e.__class__.__name__})")
            continue
        if plan['title'] in existing:
            skipped += 1
            print(f"  – {plan['title']} (already in library)")
            continue
        existing.add(plan['title'])
        if dry_run:
            print(f"  + would publish: {plan['title']} ({plan['duration_minutes']} min, {plan['difficulty']})")
            published += 1
            continue
        entry = workout_library_service.publish(
            'spin', plan, criteria_from_plan('spin', plan), 'backfill',
            seo=write_seo('spin', plan), created_by=email)
        published += 1
        print(f"  + published: /spin-workouts/{entry['slug']}")

    verb = "Would publish" if dry_run else "Published"
    print(f"\n{verb} {published}, skipped {skipped} already in library, {invalid} invalid.")
    return 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Copy the admin's saved spin rides into the public library")
    parser.add_argument('--email', default='tbattista@gmail.com', help='Admin account to copy rides from')
    parser.add_argument('--dry-run', action='store_true', help='List what would be published without writing')
    args = parser.parse_args()
    sys.exit(main(args.email, args.dry_run))
