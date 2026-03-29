"""
Program Management and Document Generation
Handles program CRUD, workout associations, and multi-page document generation
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, HTMLResponse
from typing import List, Optional
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

        progress = await firestore_data_service.get_program_progress(
            user_id=user_id,
            program_id=program_id,
            program_name=program.name,
            program_workout_ids=program_workout_ids
        )

        return ProgramProgressResponse(**progress)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting program progress: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting program progress: {str(e)}")


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