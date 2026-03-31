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
import secrets
import random
from pathlib import Path
from datetime import datetime, timezone, timedelta

# Add project root to path for imports
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from dotenv import load_dotenv
load_dotenv(project_root / '.env')

DEMO_USER_ID = "reviewer-demo-user"

# ── ID Generation ──────────────────────────────────────────────────────────

def generate_id(prefix="item"):
    return f"{prefix}-{secrets.token_hex(4)}"


# ── Exercise Group Helper ──────────────────────────────────────────────────

def make_group(exercises, sets, reps, rest):
    """Create an exercise group dict.
    exercises: dict like {'a': 'Bench Press'} or list of names (auto-keyed a,b,c...)
    """
    if isinstance(exercises, list):
        exercises = {chr(97 + i): name for i, name in enumerate(exercises)}

    return {
        'group_id': generate_id('group'),
        'exercises': exercises,
        'sets': sets,
        'reps': reps,
        'rest': rest,
        'default_weight': None,
        'default_weight_unit': 'lbs',
        'group_type': 'standard',
        'group_name': None,
        'block_id': None,
        'cardio_config': None,
        'interval_config': None,
    }


def make_workout(name, description, tags, groups):
    """Create a full workout template dict."""
    workout_id = generate_id('workout')
    now = datetime.now(timezone.utc).isoformat()

    return {
        'id': workout_id,
        'name': name,
        'description': description,
        'exercise_groups': groups,
        'sections': None,
        'template_notes': [],
        'is_template': True,
        'tags': tags,
        'created_date': now,
        'modified_date': now,
        'is_favorite': False,
        'is_archived': False,
    }


# ── Workout Templates ─────────────────────────────────────────────────────

def build_workouts():
    """Build 5 workout templates for the demo user."""
    workouts = []

    # 1. Push Day
    workouts.append(make_workout(
        'Push Day',
        'Chest, shoulders, and triceps. Classic PPL push session with compound-first ordering.',
        ['push', 'ppl', 'intermediate', 'chest', 'shoulders'],
        [
            make_group(['Barbell Bench Press'], '4', '6-8', '2min'),
            make_group(['Dumbbell Incline Bench Press'], '3', '8-10', '90s'),
            make_group(['Dumbbell Fly'], '3', '10-12', '60s'),
            make_group(['Dumbbell Lateral Raise'], '3', '12-15', '60s'),
            make_group(['Cable One Arm Tricep Pushdown'], '3', '10-12', '60s'),
        ]
    ))

    # 2. Pull Day
    workouts.append(make_workout(
        'Pull Day',
        'Back and biceps. Heavy pulling followed by isolation work for balanced upper back development.',
        ['pull', 'ppl', 'intermediate', 'back', 'biceps'],
        [
            make_group(['Barbell Deadlift'], '3', '5', '3min'),
            make_group(['Barbell Bent Over Row'], '4', '6-8', '2min'),
            make_group(['Cable Pulldown (Pro Lat Bar)'], '3', '8-12', '90s'),
            make_group(['Dumbbell Hammer Curl'], '3', '10-12', '60s'),
            make_group(['Dumbbell Rear Lateral Raise'], '3', '12-15', '60s'),
        ]
    ))

    # 3. Leg Day
    workouts.append(make_workout(
        'Leg Day',
        'Quads, glutes, and hamstrings. Squat-dominant with posterior chain balance.',
        ['legs', 'ppl', 'intermediate', 'quads', 'glutes'],
        [
            make_group(['Barbell Full Squat'], '4', '6-8', '3min'),
            make_group(['Barbell Romanian Deadlift'], '3', '8-10', '2min'),
            make_group(['Sled 45\u00b0 Leg Press (Back Pov)'], '3', '10-12', '90s'),
            make_group(['Lever Leg Extension'], '3', '12-15', '60s'),
            make_group(['Lever Seated Leg Curl'], '3', '10-12', '60s'),
        ]
    ))

    # 4. Upper Body
    workouts.append(make_workout(
        'Upper Body',
        'Balanced upper body session hitting shoulders, chest, back, and arms.',
        ['upper', 'strength', 'intermediate', 'shoulders', 'back'],
        [
            make_group(['Dumbbell Seated Shoulder Press'], '4', '8-10', '2min'),
            make_group(['Chin-up'], '3', 'AMRAP', '90s'),
            make_group(['Dumbbell Bench Press'], '3', '10-12', '90s'),
            make_group(['Cable Seated Row'], '3', '10-12', '90s'),
            make_group(['Barbell Curl'], '3', '10-12', '60s'),
        ]
    ))

    # 5. Core & Conditioning
    workouts.append(make_workout(
        'Core & Conditioning',
        'Complete core training circuit targeting upper abs, lower abs, and obliques.',
        ['core', 'abs', 'circuit', 'conditioning'],
        [
            make_group(['Jackknife Sit-up'], '3', '15-20', '30s'),
            make_group(['Hanging Leg Raise'], '3', '10-12', '45s'),
            make_group(['Russian Twist'], '3', '20', '30s'),
            make_group(['Decline Crunch'], '3', '15-20', '30s'),
            make_group(['Cable Kneeling Crunch'], '3', '12-15', '45s'),
        ]
    ))

    return workouts


# ── Program Builder ────────────────────────────────────────────────────────

def build_program(push_id, pull_id, legs_id, now):
    """Build a PPL program referencing the first 3 workouts."""
    program_id = generate_id('program')
    six_weeks_ago = now - timedelta(weeks=6)

    return {
        'id': program_id,
        'name': 'PPL Strength Builder',
        'description': '3-day push/pull/legs rotation focused on progressive overload',
        'workouts': [
            {'workout_id': push_id, 'order_index': 0, 'custom_name': None, 'custom_date': None},
            {'workout_id': pull_id, 'order_index': 1, 'custom_name': None, 'custom_date': None},
            {'workout_id': legs_id, 'order_index': 2, 'custom_name': None, 'custom_date': None},
        ],
        'duration_weeks': 8,
        'difficulty_level': 'intermediate',
        'tags': ['ppl', 'strength', 'intermediate'],
        'created_date': six_weeks_ago.isoformat(),
        'modified_date': now.isoformat(),
        'tracker_enabled': True,
        'tracker_goal': '3/week',
        'started_at': six_weeks_ago.isoformat(),
        'is_active': True,
    }


# ── Weight Progression Config ─────────────────────────────────────────────

# Starting weights and progression rates per exercise
WEIGHT_CONFIG = {
    # Push Day
    'Barbell Bench Press': {'start': 155, 'increment': 5, 'weeks_per_bump': 2, 'type': 'upper'},
    'Dumbbell Incline Bench Press': {'start': 50, 'increment': 5, 'weeks_per_bump': 2, 'type': 'upper'},
    'Dumbbell Fly': {'start': 30, 'increment': 5, 'weeks_per_bump': 3, 'type': 'upper'},
    'Dumbbell Lateral Raise': {'start': 20, 'increment': 5, 'weeks_per_bump': 3, 'type': 'upper'},
    'Cable One Arm Tricep Pushdown': {'start': 25, 'increment': 5, 'weeks_per_bump': 3, 'type': 'upper'},
    # Pull Day
    'Barbell Deadlift': {'start': 275, 'increment': 10, 'weeks_per_bump': 2, 'type': 'lower'},
    'Barbell Bent Over Row': {'start': 155, 'increment': 5, 'weeks_per_bump': 2, 'type': 'upper'},
    'Cable Pulldown (Pro Lat Bar)': {'start': 120, 'increment': 5, 'weeks_per_bump': 2, 'type': 'upper'},
    'Dumbbell Hammer Curl': {'start': 30, 'increment': 5, 'weeks_per_bump': 3, 'type': 'upper'},
    'Dumbbell Rear Lateral Raise': {'start': 15, 'increment': 5, 'weeks_per_bump': 3, 'type': 'upper'},
    # Leg Day
    'Barbell Full Squat': {'start': 225, 'increment': 10, 'weeks_per_bump': 2, 'type': 'lower'},
    'Barbell Romanian Deadlift': {'start': 185, 'increment': 10, 'weeks_per_bump': 2, 'type': 'lower'},
    'Sled 45\u00b0 Leg Press (Back Pov)': {'start': 270, 'increment': 10, 'weeks_per_bump': 2, 'type': 'lower'},
    'Lever Leg Extension': {'start': 100, 'increment': 5, 'weeks_per_bump': 2, 'type': 'lower'},
    'Lever Seated Leg Curl': {'start': 90, 'increment': 5, 'weeks_per_bump': 2, 'type': 'lower'},
    # Upper Body
    'Dumbbell Seated Shoulder Press': {'start': 45, 'increment': 5, 'weeks_per_bump': 2, 'type': 'upper'},
    'Chin-up': {'start': 0, 'increment': 0, 'weeks_per_bump': 99, 'type': 'bodyweight'},
    'Dumbbell Bench Press': {'start': 55, 'increment': 5, 'weeks_per_bump': 2, 'type': 'upper'},
    'Cable Seated Row': {'start': 120, 'increment': 5, 'weeks_per_bump': 2, 'type': 'upper'},
    'Barbell Curl': {'start': 65, 'increment': 5, 'weeks_per_bump': 3, 'type': 'upper'},
    # Core & Conditioning
    'Jackknife Sit-up': {'start': 0, 'increment': 0, 'weeks_per_bump': 99, 'type': 'bodyweight'},
    'Hanging Leg Raise': {'start': 0, 'increment': 0, 'weeks_per_bump': 99, 'type': 'bodyweight'},
    'Russian Twist': {'start': 25, 'increment': 5, 'weeks_per_bump': 3, 'type': 'upper'},
    'Decline Crunch': {'start': 0, 'increment': 0, 'weeks_per_bump': 99, 'type': 'bodyweight'},
    'Cable Kneeling Crunch': {'start': 60, 'increment': 5, 'weeks_per_bump': 3, 'type': 'upper'},
}


def get_weight_for_week(exercise_name, week_number):
    """Calculate the weight for an exercise at a given week (0-indexed)."""
    config = WEIGHT_CONFIG.get(exercise_name)
    if not config or config['start'] == 0:
        return '0'  # bodyweight
    bumps = week_number // config['weeks_per_bump']
    weight = config['start'] + (bumps * config['increment'])
    return str(weight)


# ── Session Notes Pool ─────────────────────────────────────────────────────

SESSION_NOTES = [
    'Felt strong today, good energy throughout.',
    'Slightly fatigued from yesterday, kept intensity moderate.',
    'New PR on the main lift! Progressive overload is working.',
    'Focused on mind-muscle connection today.',
    'Quick session, kept rest times tight.',
    'Great pump, nutrition has been dialed in this week.',
    'Shoulder felt a little tight during pressing, stretched extra.',
    'Solid session, all sets hit target reps.',
]


# ── Session Builder ────────────────────────────────────────────────────────

def build_sessions(workouts, program_id, now):
    """Build 18-22 completed workout sessions over the last 6 weeks.

    Rotates Push (Mon) -> Pull (Wed) -> Legs (Fri), skipping 2-3 random days.
    """
    push_workout = workouts[0]
    pull_workout = workouts[1]
    legs_workout = workouts[2]

    rotation = [
        (push_workout, 'Monday'),
        (pull_workout, 'Wednesday'),
        (legs_workout, 'Friday'),
    ]

    # Build all possible session dates over the last 42+ days
    # Start from the Monday on or before 7 weeks ago to ensure enough full weeks
    start_date = now - timedelta(days=49)  # 7 weeks back
    start_of_week = start_date - timedelta(days=start_date.weekday())  # align to Monday

    scheduled_dates = []
    for week in range(9):  # 9 weeks of candidates to cover the full range
        week_start = start_of_week + timedelta(weeks=week)
        for workout, day_name in rotation:
            day_offsets = {'Monday': 0, 'Wednesday': 2, 'Friday': 4}
            session_date = week_start + timedelta(days=day_offsets[day_name])
            # Only include dates within our window (last ~7 weeks) up to now
            if start_date <= session_date <= now:
                scheduled_dates.append((session_date, workout, week))

    # Skip 2-3 random days for realism, targeting 18-22 final count
    total_candidates = len(scheduled_dates)
    target_min, target_max = 18, 22
    skip_count = max(0, total_candidates - random.randint(target_min, target_max))
    # Don't skip the most recent sessions (last 3) to keep data fresh
    skippable = list(range(len(scheduled_dates) - 3))
    skip_indices = set(random.sample(skippable, min(skip_count, len(skippable))))

    sessions = []
    for i, (date, workout, week) in enumerate(scheduled_dates):
        if i in skip_indices:
            continue

        session_id = generate_id('session')
        duration = random.randint(35, 65)

        # Session time: randomize start between 6am-7pm
        hour = random.choice([6, 7, 8, 9, 10, 16, 17, 18, 19])
        minute = random.randint(0, 59)
        started_at = date.replace(hour=hour, minute=minute, second=0, microsecond=0,
                                  tzinfo=timezone.utc)
        completed_at = started_at + timedelta(minutes=duration)

        # Build exercise performances
        exercises_performed = []
        for order_idx, group in enumerate(workout['exercise_groups']):
            exercise_name = group['exercises']['a']
            target_sets = group['sets']
            target_reps = group['reps']
            weight = get_weight_for_week(exercise_name, week)

            # Calculate previous weight for comparison
            previous_weight = None
            weight_change = None
            if week > 0:
                prev_weight = get_weight_for_week(exercise_name, week - 1)
                if prev_weight != '0':
                    previous_weight = prev_weight
                    diff = int(weight) - int(prev_weight)
                    if diff > 0:
                        weight_change = f'+{diff}'
                    elif diff == 0:
                        weight_change = '0'

            # Occasionally complete fewer sets than target (5% chance)
            sets_completed = int(target_sets)
            if random.random() < 0.05 and sets_completed > 1:
                sets_completed -= 1

            next_weight_dir = None
            if weight != '0' and random.random() < 0.3:
                next_weight_dir = 'up'

            exercises_performed.append({
                'exercise_name': exercise_name,
                'exercise_id': None,
                'group_id': group['group_id'],
                'sets_completed': sets_completed,
                'target_sets': target_sets,
                'target_reps': target_reps,
                'weight': weight,
                'weight_unit': 'lbs',
                'weight_notes': None,
                'set_details': [],
                'previous_weight': previous_weight,
                'weight_change': weight_change,
                'is_modified': False,
                'modified_at': None,
                'is_skipped': False,
                'skip_reason': None,
                'next_weight_direction': next_weight_dir,
                'original_weight': None,
                'original_sets': None,
                'original_reps': None,
                'calories_burned': None,
                'notes': None,
                'order_index': order_idx,
            })

        # Add notes to ~30% of sessions
        notes = None
        if random.random() < 0.3:
            notes = random.choice(SESSION_NOTES)

        session_mode = 'timed' if random.random() < 0.8 else 'quick_log'

        sessions.append({
            'id': session_id,
            'workout_id': workout['id'],
            'workout_name': workout['name'],
            'started_at': started_at,
            'completed_at': completed_at,
            'duration_minutes': duration,
            'exercises_performed': exercises_performed,
            'notes': notes,
            'session_notes': [],
            'exercise_order': None,
            'program_id': program_id,
            'status': 'completed',
            'session_mode': session_mode,
            'created_at': started_at,
            'version': 1,
            'sync_status': 'synced',
        })

    return sessions


# ── Exercise History Builder ───────────────────────────────────────────────

def build_exercise_history(sessions):
    """Build exercise history records from completed sessions.

    ID format: {workout_id}_{exercise_name}
    """
    # Group sessions by (workout_id, exercise_name)
    history_map = {}  # key: (workout_id, exercise_name) -> list of session data

    for session in sessions:
        workout_id = session['workout_id']
        for ep in session['exercises_performed']:
            key = (workout_id, ep['exercise_name'])
            if key not in history_map:
                history_map[key] = []
            history_map[key].append({
                'session': session,
                'performance': ep,
            })

    records = []
    for (workout_id, exercise_name), entries in history_map.items():
        # Sort by session date
        entries.sort(key=lambda e: e['session']['started_at'])

        first_entry = entries[0]
        last_entry = entries[-1]

        # Find best weight
        best_weight = '0'
        best_weight_date = first_entry['session']['started_at']
        for entry in entries:
            w = entry['performance']['weight']
            if w and int(w) > int(best_weight):
                best_weight = w
                best_weight_date = entry['session']['started_at']

        # Build recent_sessions (last 5)
        recent = entries[-5:]
        recent_sessions = []
        for entry in recent:
            recent_sessions.append({
                'date': entry['session']['started_at'].isoformat(),
                'weight': entry['performance']['weight'],
                'sets_completed': entry['performance']['sets_completed'],
                'session_id': entry['session']['id'],
            })

        last_perf = last_entry['performance']
        last_dir = last_perf.get('next_weight_direction')

        record_id = f"{workout_id}_{exercise_name}"
        records.append({
            'id': record_id,
            'workout_id': workout_id,
            'exercise_name': exercise_name,
            'last_weight': last_perf['weight'],
            'last_weight_unit': 'lbs',
            'last_session_id': last_entry['session']['id'],
            'last_session_date': last_entry['session']['started_at'],
            'last_weight_direction': last_dir,
            'total_sessions': len(entries),
            'first_session_date': first_entry['session']['started_at'],
            'best_weight': best_weight,
            'best_weight_date': best_weight_date,
            'recent_sessions': recent_sessions,
            'updated_at': last_entry['session']['started_at'],
        })

    return records


# ── Cardio Sessions Builder ───────────────────────────────────────────────

def build_cardio_sessions(now):
    """Build 5 cardio sessions spread over the 6-week period."""
    six_weeks_ago = now - timedelta(weeks=6)

    cardio_definitions = [
        {
            'activity_type': 'running',
            'activity_name': 'Morning Run',
            'duration_minutes': 28,
            'distance': 3.1,
            'distance_unit': 'mi',
            'pace_per_unit': '9:02',
            'calories': 320,
            'rpe': 6,
            'notes': 'Easy pace, nice weather.',
            'day_offset': 8,  # days from start
        },
        {
            'activity_type': 'running',
            'activity_name': 'Evening Jog',
            'duration_minutes': 19,
            'distance': 2.0,
            'distance_unit': 'mi',
            'pace_per_unit': '9:30',
            'calories': 210,
            'rpe': 5,
            'notes': None,
            'day_offset': 15,
        },
        {
            'activity_type': 'cycling',
            'activity_name': 'Weekend Ride',
            'duration_minutes': 45,
            'distance': 12.0,
            'distance_unit': 'mi',
            'pace_per_unit': None,
            'calories': 420,
            'rpe': 7,
            'notes': 'Great ride through the park loop.',
            'day_offset': 20,
        },
        {
            'activity_type': 'walking',
            'activity_name': 'Recovery Walk',
            'duration_minutes': 25,
            'distance': 1.5,
            'distance_unit': 'mi',
            'pace_per_unit': None,
            'calories': 120,
            'rpe': 3,
            'notes': None,
            'day_offset': 30,
        },
        {
            'activity_type': 'rowing',
            'activity_name': 'Rowing Intervals',
            'duration_minutes': 12,
            'distance': 2000.0,
            'distance_unit': 'm',
            'pace_per_unit': None,
            'calories': 180,
            'rpe': 8,
            'notes': '500m intervals with 1min rest.',
            'day_offset': 37,
        },
    ]

    sessions = []
    for defn in cardio_definitions:
        cardio_id = generate_id('cardio')
        session_date = six_weeks_ago + timedelta(days=defn['day_offset'])
        hour = random.choice([6, 7, 8, 17, 18, 19])
        started_at = session_date.replace(hour=hour, minute=random.randint(0, 30),
                                          second=0, microsecond=0, tzinfo=timezone.utc)
        completed_at = started_at + timedelta(minutes=defn['duration_minutes'])

        sessions.append({
            'id': cardio_id,
            'activity_type': defn['activity_type'],
            'activity_name': defn['activity_name'],
            'started_at': started_at,
            'completed_at': completed_at,
            'duration_minutes': defn['duration_minutes'],
            'distance': defn['distance'],
            'distance_unit': defn['distance_unit'],
            'pace_per_unit': defn['pace_per_unit'],
            'avg_heart_rate': random.randint(130, 160) if defn['rpe'] and defn['rpe'] >= 5 else None,
            'max_heart_rate': random.randint(165, 185) if defn['rpe'] and defn['rpe'] >= 5 else None,
            'calories': defn['calories'],
            'rpe': defn['rpe'],
            'elevation_gain': None,
            'elevation_unit': 'ft',
            'activity_details': {},
            'notes': defn['notes'],
            'source': 'manual',
            'external_id': None,
            'created_at': started_at,
            'status': 'completed',
        })

    return sessions


# ── Personal Records Builder ──────────────────────────────────────────────

def build_personal_records(sessions, now):
    """Build personal records document from session data.

    PRs: Bench 185, Squat 275, Deadlift 315, OHP 135, Row 185
    """
    pr_definitions = [
        {'exercise_name': 'Barbell Bench Press', 'value': '185', 'sets_reps': '4x6'},
        {'exercise_name': 'Barbell Full Squat', 'value': '275', 'sets_reps': '4x6'},
        {'exercise_name': 'Barbell Deadlift', 'value': '315', 'sets_reps': '3x5'},
        {'exercise_name': 'Dumbbell Seated Shoulder Press', 'value': '135', 'sets_reps': '4x8'},
        {'exercise_name': 'Barbell Bent Over Row', 'value': '185', 'sets_reps': '4x6'},
    ]

    records = {}
    record_ids = []

    for pr_def in pr_definitions:
        exercise_name = pr_def['exercise_name']
        # Normalize name for ID: lowercase, spaces to underscores
        normalized = exercise_name.lower().replace(' ', '_').replace('(', '').replace(')', '')
        pr_id = f"weight_{normalized}"

        # Find the most recent session containing this exercise at or above PR weight
        matching_session = None
        matching_workout_name = None
        for session in reversed(sessions):
            for ep in session['exercises_performed']:
                if ep['exercise_name'] == exercise_name:
                    if int(ep['weight']) >= int(pr_def['value']):
                        matching_session = session
                        matching_workout_name = session['workout_name']
                        break
            if matching_session:
                break

        # Fallback to most recent session with this exercise
        if not matching_session:
            for session in reversed(sessions):
                for ep in session['exercises_performed']:
                    if ep['exercise_name'] == exercise_name:
                        matching_session = session
                        matching_workout_name = session['workout_name']
                        break
                if matching_session:
                    break

        session_id = matching_session['id'] if matching_session else None
        session_date = matching_session['started_at'] if matching_session else now

        records[pr_id] = {
            'id': pr_id,
            'pr_type': 'weight',
            'exercise_name': exercise_name,
            'activity_type': None,
            'value': pr_def['value'],
            'value_unit': 'lbs',
            'session_id': session_id,
            'session_date': session_date.isoformat() if isinstance(session_date, datetime) else session_date,
            'workout_name': matching_workout_name,
            'sets_reps': pr_def['sets_reps'],
            'marked_at': now.isoformat(),
            'is_manual': True,
        }
        record_ids.append(pr_id)

    return {
        'recordIds': record_ids,
        'records': records,
        'lastUpdated': now.isoformat(),
        'count': len(records),
    }


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
