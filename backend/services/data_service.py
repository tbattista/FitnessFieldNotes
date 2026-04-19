import json
import os
from pathlib import Path
from typing import List, Optional, Dict, Any
from datetime import datetime
from ..models import Program, WorkoutTemplate, CreateWorkoutRequest, CreateProgramRequest, UpdateWorkoutRequest, UpdateProgramRequest, migrate_exercise_groups_to_sections, migrate_sections_to_exercise_groups

class DataService:
    """JSON-based data persistence service for programs and workouts"""
    
    def __init__(self, data_dir: str = "backend/data"):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(exist_ok=True)
        
        # Create separate files for different data types
        self.programs_file = self.data_dir / "programs.json"
        self.workouts_file = self.data_dir / "workouts.json"
        
        # Initialize files if they don't exist
        self._initialize_files()
    
    def _initialize_files(self):
        """Initialize JSON files with empty data structures"""
        if not self.programs_file.exists():
            self._write_json(self.programs_file, {"programs": []})
        
        if not self.workouts_file.exists():
            self._write_json(self.workouts_file, {"workouts": []})
    
    def _read_json(self, file_path: Path) -> Dict[str, Any]:
        """Read and parse JSON file"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return {}
    
    def _write_json(self, file_path: Path, data: Dict[str, Any]):
        """Write data to JSON file"""
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False, default=str)
    
    # Workout CRUD Operations
    
    def create_workout(self, workout_request: CreateWorkoutRequest) -> WorkoutTemplate:
        """Create a new workout template"""
        workout = WorkoutTemplate(
            name=workout_request.name,
            description=workout_request.description,
            exercise_groups=workout_request.exercise_groups,
            tags=workout_request.tags,
            sections=workout_request.sections if hasattr(workout_request, 'sections') else None,
            workout_type=getattr(workout_request, 'workout_type', 'standard') or 'standard',
            template_notes=workout_request.template_notes if hasattr(workout_request, 'template_notes') else []
        )

        # Auto-migrate between formats to keep both in sync
        if not workout.sections and workout.exercise_groups:
            workout.sections = migrate_exercise_groups_to_sections(workout.exercise_groups)
        elif workout.sections and not workout.exercise_groups:
            workout.exercise_groups = migrate_sections_to_exercise_groups(workout.sections)

        # Load existing workouts
        data = self._read_json(self.workouts_file)
        workouts = data.get("workouts", [])
        
        # Add new workout
        workouts.append(workout.dict())
        
        # Save back to file
        self._write_json(self.workouts_file, {"workouts": workouts})
        
        return workout
    
    def get_workout(self, workout_id: str) -> Optional[WorkoutTemplate]:
        """Get a workout by ID"""
        data = self._read_json(self.workouts_file)
        workouts = data.get("workouts", [])
        
        for workout_data in workouts:
            if workout_data.get("id") == workout_id:
                workout = WorkoutTemplate(**workout_data)
                # Auto-migrate to sections if missing
                if not workout.sections and workout.exercise_groups:
                    workout.sections = migrate_exercise_groups_to_sections(workout.exercise_groups)
                return workout

        return None
    
    def get_all_workouts(self, tags: Optional[List[str]] = None, page: int = 1, page_size: int = 50) -> List[WorkoutTemplate]:
        """Get all workouts with optional filtering and pagination"""
        data = self._read_json(self.workouts_file)
        workouts = data.get("workouts", [])
        
        # Convert to WorkoutTemplate objects
        workout_objects = [WorkoutTemplate(**w) for w in workouts]

        # Auto-migrate to sections if missing
        for workout in workout_objects:
            if not workout.sections and workout.exercise_groups:
                workout.sections = migrate_exercise_groups_to_sections(workout.exercise_groups)

        # Filter by tags if provided
        if tags:
            workout_objects = [
                w for w in workout_objects 
                if any(tag in w.tags for tag in tags)
            ]
        
        # Sort by modified date (newest first)
        workout_objects.sort(key=lambda x: x.modified_date, reverse=True)
        
        # Apply pagination
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        
        return workout_objects[start_idx:end_idx]
    
    def update_workout(self, workout_id: str, update_request: UpdateWorkoutRequest) -> Optional[WorkoutTemplate]:
        """Update an existing workout"""
        data = self._read_json(self.workouts_file)
        workouts = data.get("workouts", [])
        
        for i, workout_data in enumerate(workouts):
            if workout_data.get("id") == workout_id:
                # Create workout object for updating
                workout = WorkoutTemplate(**workout_data)
                
                # Update fields that were provided
                update_data = update_request.dict(exclude_unset=True)
                for field, value in update_data.items():
                    setattr(workout, field, value)
                
                # Update modified date
                workout.modified_date = datetime.now()
                
                # Save back to list
                workouts[i] = workout.dict()
                
                # Write to file
                self._write_json(self.workouts_file, {"workouts": workouts})
                
                return workout
        
        return None
    
    def delete_workout(self, workout_id: str) -> bool:
        """Soft-delete (archive) a workout"""
        data = self._read_json(self.workouts_file)
        workouts = data.get("workouts", [])

        for workout in workouts:
            if workout.get("id") == workout_id:
                workout["is_archived"] = True
                workout["archived_at"] = datetime.now().isoformat()
                workout["modified_date"] = datetime.now().isoformat()
                self._write_json(self.workouts_file, {"workouts": workouts})
                return True

        return False

    def restore_workout(self, workout_id: str) -> bool:
        """Restore an archived workout"""
        data = self._read_json(self.workouts_file)
        workouts = data.get("workouts", [])

        for workout in workouts:
            if workout.get("id") == workout_id:
                workout["is_archived"] = False
                workout["archived_at"] = None
                workout["modified_date"] = datetime.now().isoformat()
                self._write_json(self.workouts_file, {"workouts": workouts})
                return True

        return False

    def permanent_delete_workout(self, workout_id: str) -> bool:
        """Permanently delete a workout (no recovery)"""
        data = self._read_json(self.workouts_file)
        workouts = data.get("workouts", [])

        original_length = len(workouts)
        workouts = [w for w in workouts if w.get("id") != workout_id]

        if len(workouts) < original_length:
            self._write_json(self.workouts_file, {"workouts": workouts})
            return True

        return False
    
    def duplicate_workout(self, workout_id: str, new_name: str) -> Optional[WorkoutTemplate]:
        """Duplicate an existing workout with a new name"""
        original_workout = self.get_workout(workout_id)
        if not original_workout:
            return None
        
        # Create new workout request from original
        duplicate_request = CreateWorkoutRequest(
            name=new_name,
            description=f"Copy of {original_workout.description}",
            exercise_groups=original_workout.exercise_groups,
            tags=original_workout.tags + ["duplicate"],
            sections=original_workout.sections,
            template_notes=original_workout.template_notes if original_workout.template_notes else []
        )

        return self.create_workout(duplicate_request)
    
    # Program CRUD Operations
    
    def create_program(self, program_request: CreateProgramRequest) -> Program:
        """Create a new program"""
        program = Program(
            name=program_request.name,
            description=program_request.description,
            duration_weeks=program_request.duration_weeks,
            difficulty_level=program_request.difficulty_level,
            tags=program_request.tags
        )
        
        # Load existing programs
        data = self._read_json(self.programs_file)
        programs = data.get("programs", [])
        
        # Add new program
        programs.append(program.dict())
        
        # Save back to file
        self._write_json(self.programs_file, {"programs": programs})
        
        return program
    
    def get_program(self, program_id: str) -> Optional[Program]:
        """Get a program by ID"""
        data = self._read_json(self.programs_file)
        programs = data.get("programs", [])
        
        for program_data in programs:
            if program_data.get("id") == program_id:
                return Program(**program_data)
        
        return None
    
    def get_all_programs(self, page: int = 1, page_size: int = 20) -> List[Program]:
        """Get all programs with pagination"""
        data = self._read_json(self.programs_file)
        programs = data.get("programs", [])
        
        # Convert to Program objects
        program_objects = [Program(**p) for p in programs]
        
        # Sort by modified date (newest first)
        program_objects.sort(key=lambda x: x.modified_date, reverse=True)
        
        # Apply pagination
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        
        return program_objects[start_idx:end_idx]
    
    def update_program(self, program_id: str, update_request: UpdateProgramRequest) -> Optional[Program]:
        """Update an existing program"""
        data = self._read_json(self.programs_file)
        programs = data.get("programs", [])
        
        for i, program_data in enumerate(programs):
            if program_data.get("id") == program_id:
                # Create program object for updating
                program = Program(**program_data)
                
                # Update fields that were provided
                update_data = update_request.dict(exclude_unset=True)
                for field, value in update_data.items():
                    setattr(program, field, value)
                
                # Update modified date
                program.modified_date = datetime.now()
                
                # Save back to list
                programs[i] = program.dict()
                
                # Write to file
                self._write_json(self.programs_file, {"programs": programs})
                
                return program
        
        return None
    
    def delete_program(self, program_id: str) -> bool:
        """Delete a program"""
        data = self._read_json(self.programs_file)
        programs = data.get("programs", [])
        
        original_length = len(programs)
        programs = [p for p in programs if p.get("id") != program_id]
        
        if len(programs) < original_length:
            self._write_json(self.programs_file, {"programs": programs})
            return True
        
        return False
    
    def add_workout_to_program(self, program_id: str, workout_id: str, order_index: Optional[int] = None, 
                              custom_name: Optional[str] = None, custom_date: Optional[str] = None) -> Optional[Program]:
        """Add a workout to a program"""
        program = self.get_program(program_id)
        if not program:
            return None
        
        # Verify workout exists
        if not self.get_workout(workout_id):
            return None
        
        # Determine order index
        if order_index is None:
            order_index = len(program.workouts)
        
        # Create program workout entry
        from ..models import ProgramWorkout
        program_workout = ProgramWorkout(
            workout_id=workout_id,
            order_index=order_index,
            custom_name=custom_name,
            custom_date=custom_date
        )
        
        # Insert at specified position
        program.workouts.insert(order_index, program_workout)
        
        # Reorder indices to maintain consistency
        for i, pw in enumerate(program.workouts):
            pw.order_index = i
        
        # Update program
        update_request = UpdateProgramRequest(workouts=program.workouts)
        return self.update_program(program_id, update_request)
    
    def remove_workout_from_program(self, program_id: str, workout_id: str) -> Optional[Program]:
        """Remove a workout from a program"""
        program = self.get_program(program_id)
        if not program:
            return None
        
        # Remove workout
        original_length = len(program.workouts)
        program.workouts = [pw for pw in program.workouts if pw.workout_id != workout_id]
        
        if len(program.workouts) == original_length:
            return None  # Workout not found in program
        
        # Reorder indices
        for i, pw in enumerate(program.workouts):
            pw.order_index = i
        
        # Update program
        update_request = UpdateProgramRequest(workouts=program.workouts)
        return self.update_program(program_id, update_request)
    
    def reorder_program_workouts(self, program_id: str, workout_order: List[str]) -> Optional[Program]:
        """Reorder workouts in a program"""
        program = self.get_program(program_id)
        if not program:
            return None
        
        # Create new workout list in specified order
        workout_dict = {pw.workout_id: pw for pw in program.workouts}
        new_workouts = []
        
        for i, workout_id in enumerate(workout_order):
            if workout_id in workout_dict:
                pw = workout_dict[workout_id]
                pw.order_index = i
                new_workouts.append(pw)
        
        program.workouts = new_workouts
        
        # Update program
        update_request = UpdateProgramRequest(workouts=program.workouts)
        return self.update_program(program_id, update_request)
    
    def get_program_with_workout_details(self, program_id: str) -> Optional[Dict[str, Any]]:
        """Get program with full workout details"""
        program = self.get_program(program_id)
        if not program:
            return None
        
        workout_details = []
        for pw in program.workouts:
            workout = self.get_workout(pw.workout_id)
            if workout:
                workout_details.append(workout)
        
        return {
            "program": program,
            "workout_details": workout_details
        }
    
    # Utility Methods
    
    def get_workout_count(self) -> int:
        """Get total number of workouts"""
        data = self._read_json(self.workouts_file)
        return len(data.get("workouts", []))
    
    def get_program_count(self) -> int:
        """Get total number of programs"""
        data = self._read_json(self.programs_file)
        return len(data.get("programs", []))
    
    def search_workouts(self, query: str) -> List[WorkoutTemplate]:
        """Search workouts by name, description, or tags"""
        data = self._read_json(self.workouts_file)
        workouts = data.get("workouts", [])
        
        query_lower = query.lower()
        matching_workouts = []
        
        for workout_data in workouts:
            workout = WorkoutTemplate(**workout_data)
            # Auto-migrate to sections if missing
            if not workout.sections and workout.exercise_groups:
                workout.sections = migrate_exercise_groups_to_sections(workout.exercise_groups)

            # Search in name, description, and tags
            if (query_lower in workout.name.lower() or
                query_lower in workout.description.lower() or
                any(query_lower in tag.lower() for tag in workout.tags)):
                matching_workouts.append(workout)

        return matching_workouts
    
    def search_programs(self, query: str) -> List[Program]:
        """Search programs by name, description, or tags"""
        data = self._read_json(self.programs_file)
        programs = data.get("programs", [])
        
        query_lower = query.lower()
        matching_programs = []
        
        for program_data in programs:
            program = Program(**program_data)
            
            # Search in name, description, and tags
            if (query_lower in program.name.lower() or 
                query_lower in program.description.lower() or
                any(query_lower in tag.lower() for tag in program.tags)):
                matching_programs.append(program)
        
        return matching_programs
    
    def backup_data(self, backup_dir: str = "backend/backups") -> str:
        """Create a backup of all data"""
        backup_path = Path(backup_dir)
        backup_path.mkdir(exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_file = backup_path / f"gym_data_backup_{timestamp}.json"
        
        # Combine all data
        programs_data = self._read_json(self.programs_file)
        workouts_data = self._read_json(self.workouts_file)
        
        backup_data = {
            "backup_timestamp": timestamp,
            "programs": programs_data.get("programs", []),
            "workouts": workouts_data.get("workouts", [])
        }
        
        self._write_json(backup_file, backup_data)
        return str(backup_file)
    
    def restore_data(self, backup_file: str) -> bool:
        """Restore data from backup"""
        try:
            backup_data = self._read_json(Path(backup_file))
            
            # Restore programs
            programs_data = {"programs": backup_data.get("programs", [])}
            self._write_json(self.programs_file, programs_data)
            
            # Restore workouts
            workouts_data = {"workouts": backup_data.get("workouts", [])}
            self._write_json(self.workouts_file, workouts_data)
            
            return True
        except Exception:
            return False