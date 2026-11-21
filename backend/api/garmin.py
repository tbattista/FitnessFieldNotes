"""
Garmin import API: upload a FIT file, review the proposed match, save, undo.
All endpoints require sign-in.
"""

import logging
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from ..middleware.auth import extract_user_email, extract_user_id, get_current_user
from ..models.garmin import (
    GarminActivityItem,
    GarminActivityStatusUpdate,
    GarminConnectionStatus,
    GarminConnectionUpdate,
    GarminConnectRequest,
    GarminExerciseMapUpdate,
    GarminImportConfirmRequest,
    GarminImportPreview,
    GarminImportResult,
    GarminPrepareSessionRequest,
    GarminSessionPrefill,
    GarminSyncResult,
    GarminUndoRequest,
)
from ..services.firebase_service import firebase_service
from ..services.garmin import import_service, sync_service
from ..services.garmin.secret_box import SecretBoxError
from ..services.garmin.fit_parser import MAX_FIT_BYTES, FitParseError

router = APIRouter(prefix="/api/v3/garmin", tags=["Garmin"])
logger = logging.getLogger(__name__)


def _require(current_user: Dict[str, Any]) -> str:
    user_id = extract_user_id(current_user)
    if not user_id:
        raise HTTPException(status_code=401, detail="Sign in to import Garmin activities")
    if not firebase_service.is_available():
        raise HTTPException(status_code=503, detail="Import is temporarily unavailable")
    return user_id


def _raise(e: import_service.GarminImportError):
    raise HTTPException(status_code=e.status_code, detail=str(e))


@router.post("/import/parse-file", response_model=GarminImportPreview)
async def parse_file(file: UploadFile = File(...), current_user: Dict[str, Any] = Depends(get_current_user)):
    """Read a .fit (or Garmin Connect .zip) file and propose how to import it. Saves nothing."""
    user_id = _require(current_user)
    blob = await file.read(MAX_FIT_BYTES + 1)
    if not blob:
        raise HTTPException(status_code=400, detail="The file is empty")
    try:
        return await import_service.build_preview(user_id, blob)
    except FitParseError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except import_service.GarminImportError as e:
        _raise(e)


@router.post("/import/confirm", response_model=GarminImportResult)
async def confirm_import(req: GarminImportConfirmRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    user_id = _require(current_user)
    try:
        result = await import_service.confirm(user_id, req)
    except import_service.GarminImportError as e:
        _raise(e)
    if req.pending_id:
        await sync_service.mark_imported(user_id, req.pending_id, result)
    logger.info(f"Garmin import for {user_id}: {result.action} -> {result.session_id}")
    return result


@router.post("/import/prepare-session", response_model=GarminSessionPrefill)
async def prepare_session(req: GarminPrepareSessionRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Find or create the workout and return values to pre-fill the session screen. Saves no session."""
    user_id = _require(current_user)
    try:
        return await import_service.prepare_session(user_id, req)
    except import_service.GarminImportError as e:
        _raise(e)


@router.post("/import/undo")
async def undo_import(req: GarminUndoRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    user_id = _require(current_user)
    try:
        result = await import_service.undo(user_id, req.session_id, req.session_type)
    except import_service.GarminImportError as e:
        _raise(e)
    await sync_service.after_undo(user_id, req.session_id)
    return result


@router.get("/exercise-map")
async def get_exercise_map(current_user: Dict[str, Any] = Depends(get_current_user)):
    user_id = _require(current_user)
    return {"mappings": await import_service.load_exercise_map(user_id)}


@router.put("/exercise-map")
async def put_exercise_map(req: GarminExerciseMapUpdate, current_user: Dict[str, Any] = Depends(get_current_user)):
    user_id = _require(current_user)
    return {"mappings": await import_service.save_exercise_map(user_id, req.mappings)}


# ── Personal API key sync (owner only: Garmin's Personal API terms) ─────────

def _require_sync(current_user: Dict[str, Any]) -> str:
    user_id = _require(current_user)
    if not sync_service.is_allowed(extract_user_email(current_user)):
        raise HTTPException(status_code=403, detail="Garmin sync isn't available for this account. "
                                                    "You can still import files from History.")
    return user_id


@router.get("/connection", response_model=GarminConnectionStatus)
async def get_connection(current_user: Dict[str, Any] = Depends(get_current_user)):
    user_id = _require(current_user)
    return await sync_service.status(user_id, extract_user_email(current_user))


@router.put("/connection", response_model=GarminConnectionStatus)
async def put_connection(req: GarminConnectRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    user_id = _require_sync(current_user)
    try:
        return await sync_service.connect(user_id, extract_user_email(current_user), req)
    except import_service.GarminImportError as e:
        _raise(e)
    except SecretBoxError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.patch("/connection", response_model=GarminConnectionStatus)
async def patch_connection(req: GarminConnectionUpdate, current_user: Dict[str, Any] = Depends(get_current_user)):
    user_id = _require_sync(current_user)
    try:
        return await sync_service.update(user_id, extract_user_email(current_user), req.auto_import)
    except import_service.GarminImportError as e:
        _raise(e)


@router.delete("/connection")
async def delete_connection(current_user: Dict[str, Any] = Depends(get_current_user)):
    user_id = _require(current_user)   # anyone may remove their own stored key
    await sync_service.disconnect(user_id)
    return {"success": True}


@router.post("/sync", response_model=GarminSyncResult)
async def run_sync(current_user: Dict[str, Any] = Depends(get_current_user)):
    user_id = _require_sync(current_user)
    try:
        return await sync_service.sync(user_id)
    except import_service.GarminImportError as e:
        _raise(e)


# ── Garmin page ──────────────────────────────────────────────────────────────

@router.get("/activities", response_model=List[GarminActivityItem])
async def get_activities(status: str = None, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Everything from Garmin, newest first: synced activities (any status) and file uploads."""
    user_id = _require(current_user)
    return await sync_service.list_activities(user_id, status)


@router.get("/activities/{activity_id}/preview", response_model=GarminImportPreview)
async def get_activity_preview(activity_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    user_id = _require_sync(current_user)
    try:
        return await sync_service.activity_preview(user_id, activity_id)
    except import_service.GarminImportError as e:
        _raise(e)


@router.patch("/activities/{activity_id}", response_model=GarminActivityItem)
async def patch_activity(activity_id: str, req: GarminActivityStatusUpdate,
                         current_user: Dict[str, Any] = Depends(get_current_user)):
    """Dismiss an activity, or put a dismissed one back on the review list."""
    user_id = _require_sync(current_user)
    try:
        return await sync_service.set_status(user_id, activity_id, req.status)
    except import_service.GarminImportError as e:
        _raise(e)


@router.post("/activities/dismiss-all")
async def dismiss_all(current_user: Dict[str, Any] = Depends(get_current_user)):
    user_id = _require_sync(current_user)
    return {"success": True, "dismissed": await sync_service.dismiss_all(user_id)}
