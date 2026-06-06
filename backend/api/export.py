"""
Export API Endpoints
Handles workout exports: text, image, and printable PDF formats
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse, FileResponse
from typing import Optional
import logging

from ..models import WorkoutTemplate
from ..services.export_service import ExportService
from ..services.firestore_data_service import firestore_data_service
from ..middleware.auth import get_current_user_optional, extract_user_id

router = APIRouter(prefix="/api/v3/export", tags=["Export"])
logger = logging.getLogger(__name__)

# Initialize export service
export_service = ExportService()


@router.get("/text/{workout_id}", response_class=PlainTextResponse)
async def export_workout_text(
    workout_id: str,
    include_weights: bool = Query(False, description="Include exercise weights in the text"),
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """
    Export workout as plain text.
    Returns ASCII-formatted text suitable for SMS/copy-paste.
    """
    user_id = extract_user_id(current_user)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Get workout
    workout = await firestore_data_service.get_workout(user_id, workout_id)
    if not workout:
        raise HTTPException(status_code=404, detail="Workout not found")

    # Fetch exercise history for weights if requested
    exercise_weights = None
    if include_weights:
        exercise_weights = await firestore_data_service.get_exercise_history_for_workout(user_id, workout_id)

    # Generate text export
    try:
        text_content = export_service.generate_text_export(
            workout,
            include_weights=include_weights,
            exercise_weights=exercise_weights
        )
        return PlainTextResponse(content=text_content)
    except Exception as e:
        logger.error(f"Error generating text export: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate text export: {str(e)}")


@router.post("/image/{workout_id}")
async def export_workout_image(
    workout_id: str,
    include_weights: bool = Query(False, description="Include exercise weights in the image"),
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """
    Export workout as shareable image (PNG).
    Returns a 1080x1920 story-format image with dark gradient design.
    """
    user_id = extract_user_id(current_user)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Get workout
    workout = await firestore_data_service.get_workout(user_id, workout_id)
    if not workout:
        raise HTTPException(status_code=404, detail="Workout not found")

    # Fetch exercise history for weights if requested
    exercise_weights = None
    if include_weights:
        exercise_weights = await firestore_data_service.get_exercise_history_for_workout(user_id, workout_id)

    # Generate image
    try:
        image_path = export_service.generate_shareable_image(
            workout,
            include_weights=include_weights,
            exercise_weights=exercise_weights
        )
        if not image_path:
            raise HTTPException(status_code=500, detail="Failed to generate image")

        return FileResponse(
            path=str(image_path),
            filename=image_path.name,
            media_type="image/png"
        )
    except Exception as e:
        logger.error(f"Error generating image export: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate image: {str(e)}")


@router.post("/print/{workout_id}")
async def export_workout_print(
    workout_id: str,
    include_weights: bool = Query(False, description="Include exercise weights in the PDF"),
    format: str = Query("simple", description="PDF format: 'simple' (reference sheet) or 'log' (4-week gym log)"),
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """
    Export workout as printable PDF.
    format=simple: Clean reference sheet. format=log: Gym log with 4-week progress tracking.
    """
    user_id = extract_user_id(current_user)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Get workout
    workout = await firestore_data_service.get_workout(user_id, workout_id)
    if not workout:
        raise HTTPException(status_code=404, detail="Workout not found")

    # Fetch exercise history for weights if requested
    exercise_weights = None
    if include_weights:
        exercise_weights = await firestore_data_service.get_exercise_history_for_workout(user_id, workout_id)

    # Generate PDF based on format
    try:
        if format == "log":
            pdf_path = export_service.generate_gym_log_pdf(
                workout,
                include_weights=include_weights,
                exercise_weights=exercise_weights
            )
        else:
            pdf_path = export_service.generate_printable_pdf(
                workout,
                include_weights=include_weights,
                exercise_weights=exercise_weights
            )
        if not pdf_path:
            raise HTTPException(status_code=500, detail="Failed to generate PDF")

        return FileResponse(
            path=str(pdf_path),
            filename=pdf_path.name,
            media_type="application/pdf"
        )
    except Exception as e:
        logger.error(f"Error generating print export: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate PDF: {str(e)}")


@router.get("/video-base64/{filename}")
async def get_video_as_base64(filename: str):
    """Return a tutorial video as base64 for n8n Twitter upload workflow."""
    import base64
    file_path = f"frontend/assets/img/tutorials/{filename}"
    try:
        with open(file_path, "rb") as f:
            raw = f.read()
            b64 = base64.b64encode(raw).decode("utf-8")
        return {"media_data": b64, "total_bytes": len(raw)}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"File not found: {filename}")


@router.get("/status")
async def get_export_status():
    """
    Check export service availability.
    Returns which export formats are available (text always works, image/print need Gotenberg).
    """
    from ..services.v2.gotenberg_client import GotenbergClient

    client = GotenbergClient()
    gotenberg_available = client.is_available()

    return {
        "text_export": True,  # Always available
        "image_export": gotenberg_available,
        "print_export": gotenberg_available,
        "gotenberg_status": "available" if gotenberg_available else "unavailable",
        # Diagnostics: which URL was resolved and why a health check failed.
        # No secrets are exposed (only the service URL the app is targeting).
        "diagnostics": client.diagnostics(),
    }
