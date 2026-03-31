"""
Cron/Scheduled Task Endpoints
Handles automated tasks like daily workout generation.
Protected by a secret token for security.
"""

import os
import logging
from fastapi import APIRouter, HTTPException, Query
from typing import Dict, Any

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cron", tags=["cron"])

CRON_SECRET = os.environ.get("CRON_SECRET", "")


def _verify_cron_secret(token: str):
    """Verify the cron secret token."""
    if not CRON_SECRET:
        raise HTTPException(status_code=503, detail="CRON_SECRET not configured")
    if token != CRON_SECRET:
        raise HTTPException(status_code=403, detail="Invalid cron token")


@router.post("/daily-workout")
async def trigger_daily_workout(
    token: str = Query(..., description="Cron secret token"),
    count: int = Query(1, ge=1, le=5, description="Number of workouts to generate"),
    focus: str = Query(None, description="Optional workout focus/theme"),
) -> Dict[str, Any]:
    """
    Generate and insert daily workout(s) into public_workouts.

    Call with: POST /api/cron/daily-workout?token=YOUR_SECRET&count=1
    """
    _verify_cron_secret(token)

    try:
        # Import here to avoid circular imports and keep startup fast
        import sys
        from pathlib import Path
        project_root = Path(__file__).parent.parent.parent
        sys.path.insert(0, str(project_root))

        from backend.scripts.add_daily_workout import generate_workout
        from backend.config.firebase_config import get_firebase_app
        from firebase_admin import firestore
        import secrets

        app = get_firebase_app()
        if not app:
            raise HTTPException(status_code=500, detail="Firebase not available")

        db = firestore.client(app=app)
        collection = db.collection('public_workouts')

        results = []
        for _ in range(count):
            workout_doc = generate_workout(focus=focus)
            doc_id = f"public-{secrets.token_hex(4)}"
            workout_doc['created_at'] = firestore.SERVER_TIMESTAMP
            collection.document(doc_id).set(workout_doc)

            w = workout_doc['workout_data']
            results.append({
                'doc_id': doc_id,
                'name': w['name'],
                'exercises': len(w['exercise_groups']),
                'tags': w['tags'],
                'creator': workout_doc['creator_name'],
            })
            logger.info(f"🏋️ Daily workout created: {w['name']} ({doc_id})")

        return {
            'success': True,
            'message': f'Created {len(results)} workout(s)',
            'workouts': results,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Daily workout generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/seed-demo")
async def trigger_seed_demo(
    token: str = Query(..., description="Cron secret token"),
) -> Dict[str, Any]:
    """
    Re-seed the demo user account with realistic workout data.
    Used for automated screenshots and build-in-public content.

    Call with: POST /api/cron/seed-demo?token=YOUR_SECRET
    """
    _verify_cron_secret(token)

    try:
        import sys
        from pathlib import Path
        project_root = Path(__file__).parent.parent.parent
        sys.path.insert(0, str(project_root))

        from backend.scripts.seed_demo_user import seed_demo_user
        result = seed_demo_user(dry_run=False)

        logger.info(f"Demo user seeded: {result.get('message', 'done')}")
        return {
            'success': True,
            **result,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Demo user seeding failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
