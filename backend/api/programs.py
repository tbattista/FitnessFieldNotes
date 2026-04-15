"""
Program Management and Document Generation
Handles program CRUD, workout associations, and multi-page document generation
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, HTMLResponse
from typing import List, Optional, Dict, Tuple
from datetime import date, timedelta
import logging
from ..models import (
    Program, CreateProgramRequest, UpdateProgramRequest,
    ProgramListResponse, ProgramWithWorkoutsResponse,
    AddWorkoutToProgramRequest, GenerateProgramDocumentRequest,
    ProgramProgressResponse
)
from ..services.data_service import DataService
from ..services.firestore_data_service import firestore_data_service
from ..services.firebase_service import firebase_service
from ..services.v2.document_service_v2 import DocumentServiceV2
from ..api.dependencies import get_data_service, get_document_service
from ..middleware.auth import get_current_user_optional, extract_user_id

router = APIRouter(prefix="/api/v3/programs", tags=["Programs"])
logger = logging.getLogger(__name__)


# Local Storage Endpoints

@router.post("", response_model=Program)
async def create_program(
    program_request: CreateProgramRequest,
    data_service: DataService = Depends(get_data_service)
):
    """Create a new program (local storage)"""
    try:
        program = data_service.create_program(program_request)
        return program
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating program: {str(e)}")


@router.get("", response_model=ProgramListResponse)
async def get_programs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    data_service: DataService = Depends(get_data_service)
):
    """Get all programs with optional search (local storage)"""
    try:
        if search:
            programs = data_service.search_programs(search)
            total_count = len(programs)
            # Apply pagination to search results
            start_idx = (page - 1) * page_size
            end_idx = start_idx + page_size
            programs = programs[start_idx:end_idx]
        else:
            programs = data_service.get_all_programs(page=page, page_size=page_size)
            total_count = data_service.get_program_count()
        
        return ProgramListResponse(
            programs=programs,
            total_count=total_count,
            page=page,
            page_size=page_size
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving programs: {str(e)}")


@router.get("/{program_id}", response_model=Program)
async def get_program(
    program_id: str,
    data_service: DataService = Depends(get_data_service)
):
    """Get a specific program (local storage)"""
    program = data_service.get_program(program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    return program


@router.get("/{program_id}/details", response_model=ProgramWithWorkoutsResponse)
async def get_program_with_workouts(
    program_id: str,
    data_service: DataService = Depends(get_data_service)
):
    """Get a program with full workout details (local storage)"""
    program_data = data_service.get_program_with_workout_details(program_id)
    if not program_data:
        raise HTTPException(status_code=404, detail="Program not found")
    
    return ProgramWithWorkoutsResponse(
        program=program_data["program"],
        workout_details=program_data["workout_details"]
    )


@router.put("/{program_id}", response_model=Program)
async def update_program(
    program_id: str,
    update_request: UpdateProgramRequest,
    data_service: DataService = Depends(get_data_service)
):
    """Update a program (local storage)"""
    program = data_service.update_program(program_id, update_request)
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    return program


@router.delete("/{program_id}")
async def delete_program(
    program_id: str,
    data_service: DataService = Depends(get_data_service)
):
    """Delete a program (local storage)"""
    success = data_service.delete_program(program_id)
    if not success:
        raise HTTPException(status_code=404, detail="Program not found")
    return {"message": "Program deleted successfully"}


@router.post("/{program_id}/workouts", response_model=Program)
async def add_workout_to_program(
    program_id: str,
    request: AddWorkoutToProgramRequest,
    data_service: DataService = Depends(get_data_service)
):
    """Add a workout to a program (local storage)"""
    program = data_service.add_workout_to_program(
        program_id=program_id,
        workout_id=request.workout_id,
        order_index=request.order_index,
        custom_name=request.custom_name,
        custom_date=request.custom_date
    )
    if not program:
        raise HTTPException(status_code=404, detail="Program or workout not found")
    return program


@router.delete("/{program_id}/workouts/{workout_id}")
async def remove_workout_from_program(
    program_id: str,
    workout_id: str,
    data_service: DataService = Depends(get_data_service)
):
    """Remove a workout from a program (local storage)"""
    program = data_service.remove_workout_from_program(program_id, workout_id)
    if not program:
        raise HTTPException(status_code=404, detail="Program or workout not found")
    return {"message": "Workout removed from program successfully"}


@router.put("/{program_id}/workouts/reorder")
async def reorder_program_workouts(
    program_id: str,
    workout_order: List[str],
    data_service: DataService = Depends(get_data_service)
):
    """Reorder workouts in a program (local storage)"""
    program = data_service.reorder_program_workouts(program_id, workout_order)
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    return program


# Program Document Generation

@router.post("/{program_id}/generate-html")
async def generate_program_html(
    program_id: str,
    request: GenerateProgramDocumentRequest,
    data_service: DataService = Depends(get_data_service),
    document_service: DocumentServiceV2 = Depends(get_document_service)
):
    """Generate HTML document for entire program"""
    try:
        # Get program with workout details
        program_data = data_service.get_program_with_workout_details(program_id)
        if not program_data:
            raise HTTPException(status_code=404, detail="Program not found")
        
        # Generate multi-page HTML document
        html_path = document_service.generate_program_html_file(
            program_data["program"],
            program_data["workout_details"],
            request
        )
        
        # Return the file for download
        filename = f"program_{program_data['program'].name.replace(' ', '_')}.html"
        
        return FileResponse(
            path=html_path,
            filename=filename,
            media_type="text/html"
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating program HTML: {str(e)}")


@router.post("/{program_id}/generate-pdf")
async def generate_program_pdf(
    program_id: str,
    request: GenerateProgramDocumentRequest,
    data_service: DataService = Depends(get_data_service),
    document_service: DocumentServiceV2 = Depends(get_document_service)
):
    """Generate PDF document for entire program"""
    try:
        logger.info(f"PDF generation requested for program {program_id}")
        
        # Check if Gotenberg is available
        gotenberg_available = document_service.is_gotenberg_available()
        logger.info(f"Gotenberg service availability: {gotenberg_available}")
        
        if not gotenberg_available:
            logger.error("PDF generation failed: Gotenberg service is not running")
            raise HTTPException(
                status_code=503,
                detail="PDF generation is not available. Gotenberg service is not running. Please start the Gotenberg service or use HTML format instead."
            )
        
        # Get program with workout details
        program_data = data_service.get_program_with_workout_details(program_id)
        if not program_data:
            logger.error(f"Program not found: {program_id}")
            raise HTTPException(status_code=404, detail="Program not found")
        
        logger.info(f"Generating PDF for program: {program_data['program'].name}")
        
        # Generate multi-page PDF document
        pdf_path = document_service.generate_program_pdf_file(
            program_data["program"],
            program_data["workout_details"],
            request
        )
        
        # Return the file for download
        filename = f"program_{program_data['program'].name.replace(' ', '_')}.pdf"
        logger.info(f"PDF generated successfully: {filename}")
        
        return FileResponse(
            path=pdf_path,
            filename=filename,
            media_type="application/pdf"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating program PDF: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error generating program PDF: {str(e)}")


@router.post("/{program_id}/preview-html")
async def preview_program_html(
    program_id: str,
    request: GenerateProgramDocumentRequest,
    data_service: DataService = Depends(get_data_service),
    document_service: DocumentServiceV2 = Depends(get_document_service)
):
    """Generate HTML preview for entire program"""
    try:
        # Get program with workout details
        program_data = data_service.get_program_with_workout_details(program_id)
        if not program_data:
            raise HTTPException(status_code=404, detail="Program not found")
        
        # Generate HTML content
        html_content = document_service.generate_program_html_document(
            program_data["program"],
            program_data["workout_details"],
            request
        )
        
        # Return HTML content directly
        return HTMLResponse(content=html_content)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating program HTML preview: {str(e)}")


# Firebase Dual-Mode Endpoints

# Create a separate router for firebase endpoints to avoid path conflicts
firebase_router = APIRouter(prefix="/api/v3/firebase/programs", tags=["Programs"])

@firebase_router.post("", response_model=Program)
async def create_program_firebase(
    program_request: CreateProgramRequest,
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """Create a new program (Firebase-enabled with fallback)"""
    try:
        user_id = extract_user_id(current_user)

        if user_id and firebase_service.is_available():
            # Authenticated user - use Firestore data service
            program = await firestore_data_service.create_program(user_id, program_request)
            if program:
                logger.info(f"✅ Program created in Firestore: {program.name}")
                return program
            else:
                # Fallback to local storage
                logger.warning("Firebase program creation failed, falling back to local storage")
        
        # Anonymous user or Firebase unavailable - use local storage
        data_service = DataService()
        program = data_service.create_program(program_request)
        return program
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating program: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error creating program: {str(e)}")


@firebase_router.get("", response_model=ProgramListResponse)
async def get_programs_firebase(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """Get programs (Firebase-enabled with fallback)"""
    try:
        user_id = extract_user_id(current_user)
        
        if user_id and firebase_service.is_available():
            # Authenticated user - get from Firestore
            if search:
                programs = await firestore_data_service.search_programs(user_id, search, limit=page_size)
            else:
                programs = await firestore_data_service.get_user_programs(user_id, limit=page_size)
            
            total_count = len(programs)
            
            # Apply pagination
            start_idx = (page - 1) * page_size
            end_idx = start_idx + page_size
            programs = programs[start_idx:end_idx]
        else:
            # Anonymous user or Firebase unavailable - use local storage
            data_service = DataService()
            if search:
                programs = data_service.search_programs(search)
                total_count = len(programs)
                start_idx = (page - 1) * page_size
                end_idx = start_idx + page_size
                programs = programs[start_idx:end_idx]
            else:
                programs = data_service.get_all_programs(page=page, page_size=page_size)
                total_count = data_service.get_program_count()
        
        return ProgramListResponse(
            programs=programs,
            total_count=total_count,
            page=page,
            page_size=page_size
        )
        
    except Exception as e:
        logger.error(f"Error retrieving programs: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving programs: {str(e)}")


@firebase_router.get("/{program_id}/details", response_model=ProgramWithWorkoutsResponse)
async def get_program_with_workouts_firebase(
    program_id: str,
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """Get a program with full workout details (Firebase-enabled with fallback)"""
    try:
        user_id = extract_user_id(current_user)
        
        if user_id and firebase_service.is_available():
            # Authenticated user - get from Firestore
            program_data = await firestore_data_service.get_program_with_workout_details(user_id, program_id)
            if program_data:
                return ProgramWithWorkoutsResponse(
                    program=program_data["program"],
                    workout_details=program_data["workout_details"]
                )
            else:
                raise HTTPException(status_code=404, detail="Program not found")
        else:
            # Anonymous user or Firebase unavailable - use local storage
            data_service = DataService()
            program_data = data_service.get_program_with_workout_details(program_id)
            if not program_data:
                raise HTTPException(status_code=404, detail="Program not found")
            
            return ProgramWithWorkoutsResponse(
                program=program_data["program"],
                workout_details=program_data["workout_details"]
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving program details: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving program details: {str(e)}")


@firebase_router.post("/{program_id}/workouts", response_model=Program)
async def add_workout_to_program_firebase(
    program_id: str,
    request: AddWorkoutToProgramRequest,
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """Add a workout to a program (Firebase-enabled with fallback)"""
    try:
        user_id = extract_user_id(current_user)
        
        if user_id and firebase_service.is_available():
            # Authenticated user - use Firestore
            program = await firestore_data_service.add_workout_to_program(
                user_id=user_id,
                program_id=program_id,
                workout_id=request.workout_id,
                order_index=request.order_index,
                custom_name=request.custom_name,
                custom_date=request.custom_date
            )
            if not program:
                raise HTTPException(status_code=404, detail="Program or workout not found")
            return program
        else:
            # Anonymous user or Firebase unavailable - use local storage
            data_service = DataService()
            program = data_service.add_workout_to_program(
                program_id=program_id,
                workout_id=request.workout_id,
                order_index=request.order_index,
                custom_name=request.custom_name,
                custom_date=request.custom_date
            )
            if not program:
                raise HTTPException(status_code=404, detail="Program or workout not found")
            return program
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding workout to program: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error adding workout to program: {str(e)}")


@firebase_router.delete("/{program_id}/workouts/{workout_id}")
async def remove_workout_from_program_firebase(
    program_id: str,
    workout_id: str,
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """Remove a workout from a program (Firebase-enabled with fallback)"""
    try:
        user_id = extract_user_id(current_user)

        if user_id and firebase_service.is_available():
            # Authenticated user - use Firestore
            program = await firestore_data_service.remove_workout_from_program(user_id, program_id, workout_id)
            if not program:
                raise HTTPException(status_code=404, detail="Program or workout not found")
            return {"message": "Workout removed from program successfully"}
        else:
            # Anonymous user or Firebase unavailable - use local storage
            data_service = DataService()
            program = data_service.remove_workout_from_program(program_id, workout_id)
            if not program:
                raise HTTPException(status_code=404, detail="Program or workout not found")
            return {"message": "Workout removed from program successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing workout from program: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error removing workout from program: {str(e)}")


@firebase_router.put("/{program_id}", response_model=Program)
async def update_program_firebase(
    program_id: str,
    update_request: UpdateProgramRequest,
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """Update a program (Firebase-enabled with fallback)"""
    try:
        user_id = extract_user_id(current_user)

        if user_id and firebase_service.is_available():
            # Authenticated user - use Firestore
            program = await firestore_data_service.update_program(user_id, program_id, update_request)
            if not program:
                raise HTTPException(status_code=404, detail="Program not found")
            logger.info(f"✅ Program updated in Firestore: {program.name}")
            return program
        else:
            # Anonymous user or Firebase unavailable - use local storage
            data_service = DataService()
            program = data_service.update_program(program_id, update_request)
            if not program:
                raise HTTPException(status_code=404, detail="Program not found")
            return program

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating program: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating program: {str(e)}")


@firebase_router.get("/{program_id}/progress", response_model=ProgramProgressResponse)
async def get_program_progress_firebase(
    program_id: str,
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """Get progress stats for a program (sessions completed, streaks, activity)"""
    try:
        user_id = extract_user_id(current_user)

        if not user_id or not firebase_service.is_available():
            raise HTTPException(status_code=401, detail="Authentication required for program progress")

        # Get the program to know its workouts
        program = await firestore_data_service.get_program(user_id, program_id)
        if not program:
            raise HTTPException(status_code=404, detail="Program not found")

        program_workout_ids = [pw.workout_id for pw in (program.workouts or [])]

        # Resolve real workout names so tracking survives workout-id drift
        # (duplicate/recreate scenarios). We collect both the underlying
        # workout's .name and any custom_name the user set in the program.
        program_workout_names: List[str] = []
        for pw in (program.workouts or []):
            if getattr(pw, 'custom_name', None):
                program_workout_names.append(pw.custom_name)
            try:
                w = await firestore_data_service.get_workout(user_id, pw.workout_id)
                if w and getattr(w, 'name', None):
                    program_workout_names.append(w.name)
            except Exception:
                pass

        progress = await firestore_data_service.get_program_progress(
            user_id=user_id,
            program_id=program_id,
            program_name=program.name,
            program_workout_ids=program_workout_ids,
            program_workout_names=program_workout_names
        )

        return ProgramProgressResponse(**progress)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting program progress: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting program progress: {str(e)}")


def _compute_program_adherence(program, sessions, session_name_matches_workout):
    """Compute week-by-week adherence for a scheduled (weekly) program.

    Uses loose / credit-the-week matching: a scheduled slot counts as completed
    if there's any completed session in the same calendar week with a matching
    workout_id OR matching workout_name.
    """
    if program.schedule_type != 'weekly' or not program.schedule or not program.start_date:
        return {
            "schedule_type": getattr(program, 'schedule_type', 'flat'),
            "weeks": [],
            "current_week": 0,
            "total_scheduled": 0,
            "total_completed": 0,
            "adherence_percentage": 0.0,
        }

    try:
        start = date.fromisoformat(program.start_date)
    except Exception:
        return {
            "schedule_type": "weekly",
            "weeks": [],
            "current_week": 0,
            "total_scheduled": 0,
            "total_completed": 0,
            "adherence_percentage": 0.0,
        }

    duration_weeks = program.duration_weeks or program.weeks_in_cycle or 1
    weeks_in_cycle = program.weeks_in_cycle or 1

    # Bucket completed sessions by ISO (year, week)
    sessions_by_week: Dict[Tuple[int, int], list] = {}
    for s in sessions:
        ts = getattr(s, 'completed_at', None) or getattr(s, 'started_at', None)
        if not ts or not hasattr(ts, 'isocalendar'):
            continue
        iso_y, iso_w, _ = ts.isocalendar()
        sessions_by_week.setdefault((iso_y, iso_w), []).append(s)

    weeks_out = []
    for wi in range(duration_weeks):
        week_start = start + timedelta(days=wi * 7)
        iso_y, iso_w, _ = week_start.isocalendar()
        cycle_week = (wi % weeks_in_cycle) + 1
        week_slots = [e for e in program.schedule if e.week_number == cycle_week]
        week_sessions = sessions_by_week.get((iso_y, iso_w), [])

        entries = []
        for slot in week_slots:
            matched_id = None
            for sess in week_sessions:
                if getattr(sess, 'workout_id', None) == slot.workout_id:
                    matched_id = sess.id
                    break
                # Name fallback: same-named workout done in the same week
                if slot.custom_name and getattr(sess, 'workout_name', None) == slot.custom_name:
                    matched_id = sess.id
                    break
                if session_name_matches_workout(sess, slot.workout_id):
                    matched_id = sess.id
                    break
            entries.append({
                "workout_id": slot.workout_id,
                "day_of_week": slot.day_of_week,
                "custom_name": slot.custom_name,
                "completed": matched_id is not None,
                "session_id": matched_id,
            })

        weeks_out.append({
            "week_index": wi + 1,
            "week_start": week_start.isoformat(),
            "scheduled_count": len(week_slots),
            "completed_count": sum(1 for e in entries if e["completed"]),
            "entries": entries,
        })

    total_scheduled = sum(w["scheduled_count"] for w in weeks_out)
    total_completed = sum(w["completed_count"] for w in weeks_out)

    today = date.today()
    days_since_start = (today - start).days
    if days_since_start < 0:
        current_week = 0
    else:
        current_week = min(duration_weeks, days_since_start // 7 + 1)

    return {
        "schedule_type": "weekly",
        "start_date": program.start_date,
        "weeks_in_cycle": weeks_in_cycle,
        "duration_weeks": duration_weeks,
        "weeks": weeks_out,
        "current_week": current_week,
        "total_scheduled": total_scheduled,
        "total_completed": total_completed,
        "adherence_percentage": round(
            (total_completed / total_scheduled * 100) if total_scheduled else 0, 1
        ),
    }


@firebase_router.get("/{program_id}/adherence")
async def get_program_adherence_firebase(
    program_id: str,
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """Return week-by-week adherence for a scheduled (weekly) program.

    Uses ISO-week loose matching so the user gets credit for a scheduled
    workout as long as they completed a matching workout somewhere in the
    same calendar week.
    """
    try:
        user_id = extract_user_id(current_user)
        if not user_id or not firebase_service.is_available():
            raise HTTPException(status_code=401, detail="Authentication required")

        program = await firestore_data_service.get_program(user_id, program_id)
        if not program:
            raise HTTPException(status_code=404, detail="Program not found")

        # Resolve workout names for the ID-drift fallback
        workout_id_to_names: Dict[str, List[str]] = {}
        program_workout_names: List[str] = []
        schedule_workout_ids = list({e.workout_id for e in (program.schedule or [])})
        for wid in schedule_workout_ids:
            try:
                w = await firestore_data_service.get_workout(user_id, wid)
                if w and getattr(w, 'name', None):
                    workout_id_to_names.setdefault(wid, []).append(w.name)
                    program_workout_names.append(w.name)
            except Exception:
                pass

        sessions = await firestore_data_service.get_program_sessions(
            user_id=user_id,
            program_id=program_id,
            program_workout_ids=schedule_workout_ids,
            program_workout_names=program_workout_names,
        )

        def _session_name_matches_workout(sess, workout_id: str) -> bool:
            names = workout_id_to_names.get(workout_id) or []
            return getattr(sess, 'workout_name', None) in names

        return _compute_program_adherence(program, sessions, _session_name_matches_workout)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting program adherence: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting program adherence: {str(e)}")


@firebase_router.delete("/{program_id}")
async def delete_program_firebase(
    program_id: str,
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """Delete a program (Firebase-enabled with fallback)"""
    try:
        user_id = extract_user_id(current_user)

        if user_id and firebase_service.is_available():
            # Authenticated user - use Firestore
            success = await firestore_data_service.delete_program(user_id, program_id)
            if not success:
                raise HTTPException(status_code=404, detail="Program not found")
            logger.info(f"✅ Program deleted from Firestore: {program_id}")
            return {"message": "Program deleted successfully"}
        else:
            # Anonymous user or Firebase unavailable - use local storage
            data_service = DataService()
            success = data_service.delete_program(program_id)
            if not success:
                raise HTTPException(status_code=404, detail="Program not found")
            return {"message": "Program deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting program: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting program: {str(e)}")


# Export both routers
__all__ = ['router', 'firebase_router']