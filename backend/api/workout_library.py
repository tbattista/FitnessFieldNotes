"""
Workout Library API — public Tabata + Spin workouts.

Public:  list / fetch library workouts (used by the players' "Do This Workout"
         hand-off) and record a completion.
Admin:   list everything (incl. hidden) and edit status / SEO text.
Publishing itself happens server-side when the admin generates a workout
(see publish_admin_generation) or via backend/scripts/backfill_library_from_admin.py.
"""

import logging
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..middleware.auth import (
    extract_user_email,
    extract_user_id,
    get_current_user,
    get_current_user_optional,
)
from ..services.workout_library_service import (
    entry_path,
    is_admin_email,
    length_bucket,
    plan_minutes,
    player_path,
    workout_library_service,
)

router = APIRouter(prefix="/api/v3/library", tags=["Workout Library"])
logger = logging.getLogger(__name__)


def card(entry: Dict[str, Any]) -> Dict[str, Any]:
    """Compact public view of a library entry (no plan)."""
    seo = entry.get("seo") or {}
    minutes = plan_minutes(entry.get("plan") or {})
    return {
        "id": entry["id"],
        "type": entry["type"],
        "slug": entry["slug"],
        "status": entry.get("status"),
        "title": seo.get("title") or (entry.get("plan") or {}).get("title"),
        "summary": seo.get("summary", ""),
        "category": seo.get("category", ""),
        "minutes": minutes,
        "length": length_bucket(minutes),
        "url": entry_path(entry),
        "play_url": player_path(entry),
        "times_completed": entry.get("times_completed") or 0,
        "times_served": entry.get("times_served") or 0,
    }


def require_admin(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if not is_admin_email(extract_user_email(current_user)):
        raise HTTPException(status_code=403, detail="Admin only")
    return current_user


@router.get("")
async def list_library(type: Optional[Literal["tabata", "spin"]] = Query(None)) -> Dict[str, Any]:
    workouts = [card(e) for e in workout_library_service.list_published(type)]
    return {"workouts": workouts, "total": len(workouts)}


@router.get("/workouts/{entry_id}")
async def get_library_workout(
    entry_id: str,
    current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
) -> Dict[str, Any]:
    entry = workout_library_service.get(entry_id)
    visible = entry and (entry.get("status") == "published"
                         or is_admin_email(extract_user_email(current_user)))
    if not visible:
        raise HTTPException(status_code=404, detail="Workout not found")
    return {**card(entry), "plan": entry["plan"]}


@router.post("/workouts/{entry_id}/completed")
async def record_library_completion(
    entry_id: str,
    current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
) -> Dict[str, Any]:
    if not workout_library_service.get(entry_id):
        raise HTTPException(status_code=404, detail="Workout not found")
    workout_library_service.record_event(entry_id, "completed", extract_user_id(current_user))
    return {"ok": True}


# ── Admin ─────────────────────────────────────────────────────────────────


class UpdateLibraryWorkoutRequest(BaseModel):
    status: Optional[Literal["published", "hidden"]] = None
    title: Optional[str] = Field(None, min_length=5, max_length=80)
    summary: Optional[str] = Field(None, min_length=20, max_length=300)
    intro: Optional[List[str]] = Field(None, max_length=5)
    category: Optional[str] = Field(None, min_length=2, max_length=40)


@router.get("/admin/all")
async def admin_list_library(_: Dict[str, Any] = Depends(require_admin)) -> Dict[str, Any]:
    entries = workout_library_service.all_entries()
    return {"workouts": [{**card(e), "seo": e.get("seo") or {}, "source": e.get("source")}
                         for e in entries]}


@router.patch("/workouts/{entry_id}")
async def admin_update_library_workout(
    entry_id: str,
    request: UpdateLibraryWorkoutRequest,
    _: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    updated = workout_library_service.update(entry_id, request.model_dump(exclude_none=True))
    if not updated:
        raise HTTPException(status_code=404, detail="Workout not found")
    return {**card(updated), "seo": updated.get("seo") or {}}


class SeedLibraryRequest(BaseModel):
    """Counts to generate; omitted counts are random between 10 and 30."""
    tabata: Optional[int] = Field(None, ge=0, le=60)
    spin: Optional[int] = Field(None, ge=0, le=60)


@router.post("/admin/seed")
async def admin_seed_library(
    request: SeedLibraryRequest,
    current_user: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    """Start a background run that generates + publishes a batch of workouts."""
    from ..services.library_seeder import _default_generators, start_background_seed
    if not workout_library_service.is_available():
        raise HTTPException(status_code=503, detail="Library storage (Firestore) is not available")
    if not all(g.is_available() for g in _default_generators().values()):
        raise HTTPException(status_code=503, detail="AI generation is not available (GEMINI_API_KEY not set)")
    try:
        job = start_background_seed(request.tabata, request.spin, extract_user_email(current_user))
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return job.snapshot()


@router.get("/admin/seed")
async def admin_seed_status(_: Dict[str, Any] = Depends(require_admin)) -> Dict[str, Any]:
    from ..services.library_seeder import current_job
    job = current_job()
    return job.snapshot() if job else {"running": False, "total": 0, "done": 0}


# ── Publishing hook (called from the generate endpoints) ─────────────────


def publish_admin_generation(workout_type: str, plan: Dict[str, Any],
                             criteria: Dict[str, Any], email: Optional[str]) -> None:
    """Background task: an admin's fresh generation goes straight into the public library."""
    try:
        from ..services.library_seo_writer import write_seo
        seo = write_seo(workout_type, plan)
        workout_library_service.publish(workout_type, plan, criteria, "admin_generated",
                                        seo=seo, created_by=email)
    except Exception as e:
        logger.error(f"library: auto-publish failed: {type(e).__name__}: {e}", exc_info=True)
