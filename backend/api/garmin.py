"""
Garmin import API: upload a FIT file, review the proposed match, save, undo.
All endpoints require sign-in.
"""

import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from ..middleware.auth import extract_user_id, get_current_user
from ..models.garmin import (
    GarminExerciseMapUpdate,
    GarminImportConfirmRequest,
    GarminImportPreview,
    GarminImportResult,
    GarminUndoRequest,
)
from ..services.firebase_service import firebase_service
from ..services.garmin import import_service
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
    logger.info(f"Garmin import for {user_id}: {result.action} -> {result.session_id}")
    return result


@router.post("/import/undo")
async def undo_import(req: GarminUndoRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    user_id = _require(current_user)
    try:
        return await import_service.undo(user_id, req.session_id, req.session_type)
    except import_service.GarminImportError as e:
        _raise(e)


@router.get("/exercise-map")
async def get_exercise_map(current_user: Dict[str, Any] = Depends(get_current_user)):
    user_id = _require(current_user)
    return {"mappings": await import_service.load_exercise_map(user_id)}


@router.put("/exercise-map")
async def put_exercise_map(req: GarminExerciseMapUpdate, current_user: Dict[str, Any] = Depends(get_current_user)):
    user_id = _require(current_user)
    return {"mappings": await import_service.save_exercise_map(user_id, req.mappings)}
