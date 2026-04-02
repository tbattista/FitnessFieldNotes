"""
Demo Provisioner Service
Creates and manages per-visitor demo accounts with isolated sandbox data.
"""

import secrets
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any

from .demo_data_builder import generate_demo_data

logger = logging.getLogger(__name__)

DEMO_UID_PREFIX = "demo-"
DEMO_TTL_HOURS = 24


def generate_demo_uid() -> str:
    """Generate a unique demo user UID."""
    return f"{DEMO_UID_PREFIX}{secrets.token_hex(4)}"


def is_demo_uid(uid: str) -> bool:
    """Check if a UID belongs to a demo user."""
    return uid is not None and uid.startswith(DEMO_UID_PREFIX)


def provision_demo_user(db, uid: str) -> Dict[str, Any]:
    """Write a complete set of demo data into Firestore for the given UID.
    Uses batch writes for speed (~47 docs in one commit).
    Returns summary dict of what was written.
    """
    data = generate_demo_data()
    now = data['now']
    expires_at = now + timedelta(hours=DEMO_TTL_HOURS)

    user_ref = db.collection('users').document(uid)
    batch = db.batch()

    # User profile with expiry metadata
    batch.set(user_ref, {
        'displayName': 'Demo User',
        'is_demo': True,
        'expires_at': expires_at,
        'created_at': now,
        'updated_at': now,
        'preferences': {'theme': 'dark', 'defaultUnits': 'imperial'},
        'active_program_id': data['program']['id'],
    })

    # Workouts
    for w in data['workouts']:
        batch.set(user_ref.collection('workouts').document(w['id']), w)

    # Program
    batch.set(user_ref.collection('programs').document(data['program']['id']), data['program'])

    # Sessions
    for s in data['sessions']:
        batch.set(user_ref.collection('workout_sessions').document(s['id']), s)

    # Exercise history
    for eh in data['exercise_history']:
        batch.set(user_ref.collection('exercise_history').document(eh['id']), eh)

    # Cardio sessions
    for cs in data['cardio_sessions']:
        batch.set(user_ref.collection('cardio_sessions').document(cs['id']), cs)

    # Personal records
    batch.set(user_ref.collection('data').document('personal_records'), data['personal_records'])

    batch.commit()

    return {
        'uid': uid,
        'expires_at': expires_at.isoformat(),
        'workouts': len(data['workouts']),
        'programs': 1,
        'sessions': len(data['sessions']),
        'exercise_history': len(data['exercise_history']),
        'cardio_sessions': len(data['cardio_sessions']),
        'personal_records': data['personal_records']['count'],
    }


def cleanup_expired_demo_users(db) -> Dict[str, Any]:
    """Find and delete all demo users whose expires_at has passed.
    Deletes Firestore data and Firebase Auth records.
    Returns summary of cleanup.
    """
    now = datetime.now(timezone.utc)

    users_ref = db.collection('users')
    expired_query = (
        users_ref
        .where('is_demo', '==', True)
        .where('expires_at', '<', now)
        .limit(100)
    )

    expired_docs = expired_query.stream()
    deleted_count = 0
    errors = []

    for doc in expired_docs:
        uid = doc.id
        try:
            _delete_user_data(db, uid)

            # Delete Firebase Auth user record
            try:
                from firebase_admin import auth as firebase_auth
                firebase_auth.delete_user(uid)
            except Exception:
                pass  # Auth user may not exist if token was never exchanged

            deleted_count += 1
            logger.info(f"Cleaned up expired demo user: {uid}")
        except Exception as e:
            errors.append(f"{uid}: {str(e)}")
            logger.error(f"Failed to clean up demo user {uid}: {e}")

    return {
        'deleted': deleted_count,
        'errors': errors,
    }


def _delete_user_data(db, uid: str):
    """Delete all Firestore data for a user (subcollections + profile)."""
    user_ref = db.collection('users').document(uid)

    subcollections = ['workouts', 'programs', 'workout_sessions',
                      'exercise_history', 'cardio_sessions']

    for sub_name in subcollections:
        for doc in user_ref.collection(sub_name).limit(500).stream():
            doc.reference.delete()

    # Delete data/personal_records singleton
    pr_ref = user_ref.collection('data').document('personal_records')
    pr_doc = pr_ref.get()
    if pr_doc.exists:
        pr_ref.delete()

    # Delete user profile document
    user_ref.delete()
