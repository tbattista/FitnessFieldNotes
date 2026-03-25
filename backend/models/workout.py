from pydantic import BaseModel, Field
from typing import Any, Dict, Optional, List
from uuid import uuid4


class ExerciseGroup(BaseModel):
    """Model for exercise group within a workout"""

    group_id: str = Field(
        default_factory=lambda: f"group-{uuid4().hex[:8]}",
        description="Unique identifier for the exercise group"
    )

    exercises: Dict[str, str] = Field(
        default_factory=dict,
        description="Dictionary of exercises in this group (e.g., {'a': 'Bench Press', 'b': 'Incline Press'})",
        example={"a": "Bench Press", "b": "Incline Press", "c": "Flyes"}
    )

    sets: str = Field(
        default="3",
        description="Number of sets for this exercise group",
        example="3"
    )

    reps: str = Field(
        default="8-12",
        description="Rep range for this exercise group",
        example="8-12"
    )

    rest: str = Field(
        default="60s",
        description="Rest period between sets",
        example="60s"
    )

    # Weight tracking fields (Hybrid approach: stored in template + synced from history)
    default_weight: Optional[str] = Field(
        default=None,
        description="Current/default weight for this exercise (auto-syncs from workout history). Supports numeric (135) or text (4x45, BW+25) values."
    )

    default_weight_unit: str = Field(
        default="lbs",
        description="Weight unit: 'lbs', 'kg', or 'other'",
        example="lbs"
    )

    group_type: str = Field(
        default="standard",
        description="Type of exercise group: 'standard' (single exercise with optional alternates), 'block' (grouped exercises performed sequentially), or 'cardio' (cardio activity)"
    )

    group_name: Optional[str] = Field(
        default=None,
        description="User-defined name for exercise blocks (e.g., 'Superset A', 'Chest Circuit', 'Warmup Block'). Auto-labeled 'Block N' if null."
    )

    cardio_config: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Cardio-specific configuration: {activity_type, duration_minutes, distance, distance_unit, target_pace}"
    )

    interval_config: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Interval timer configuration: {mode, work_seconds, rest_seconds, rounds}"
    )

    block_id: Optional[str] = Field(
        default=None,
        description="Shared ID linking exercises in the same block group. All ExerciseGroups with the same block_id are displayed as visually linked cards."
    )


class SectionExercise(BaseModel):
    """Single exercise within a section."""
    exercise_id: str = Field(
        default_factory=lambda: f"ex-{uuid4().hex[:8]}",
        description="Unique identifier for the exercise"
    )
    name: str = Field(
        ...,
        description="Primary exercise name",
        example="Bench Press"
    )
    alternates: List[str] = Field(
        default_factory=list,
        description="Alternative exercise names (replaces the old exercises dict 'b', 'c', etc.)"
    )
    sets: str = Field(default="3", description="Number of sets")
    reps: str = Field(default="10", description="Rep range")
    rest: str = Field(default="60s", description="Rest period between sets")
    default_weight: Optional[str] = Field(
        default=None,
        description="Current/default weight for this exercise"
    )
    default_weight_unit: str = Field(
        default="lbs",
        description="Weight unit: 'lbs', 'kg', or 'other'"
    )
    group_type: str = Field(
        default="standard",
        description="Exercise type: 'standard', 'cardio', 'block'"
    )
    cardio_config: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Cardio-specific configuration: {activity_type, duration_minutes, distance, distance_unit, target_pace}"
    )
    interval_config: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Interval timer configuration: {mode, work_seconds, rest_seconds, rounds}"
    )


class WorkoutSection(BaseModel):
    """Container for exercises. Replaces block_id-based grouping."""
    section_id: str = Field(
        default_factory=lambda: f"section-{uuid4().hex[:8]}",
        description="Unique section identifier"
    )
    type: str = Field(
        default="standard",
        description="Section type: 'standard', 'superset', 'circuit', 'tabata', 'emom', 'amrap'"
    )
    name: Optional[str] = Field(
        default=None,
        description="User-defined label (null = default/unnamed)"
    )
    description: Optional[str] = Field(
        default=None,
        max_length=500,
        description="User notes/description for this section"
    )
    config: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Type-specific config (tabata: {work:20, rest:10}, emom: {interval:60})"
    )
    exercises: List[SectionExercise] = Field(
        default_factory=list,
        description="Exercises in this section"
    )


def migrate_exercise_groups_to_sections(exercise_groups: List[ExerciseGroup]) -> List[WorkoutSection]:
    """Convert legacy exercise_groups + block_id format to sections format.

    - Standalone exercises (no block_id) -> individual "standard" sections
    - Exercises sharing a block_id -> one "superset" section containing all of them
    - Maintains original order (first appearance of each block determines section position)
    """
    sections = []
    seen_block_ids = {}  # block_id -> index in sections list

    for eg in exercise_groups:
        # Extract primary exercise name and alternates from exercises dict
        primary_name = eg.exercises.get('a', '')
        alternates = [v for k, v in sorted(eg.exercises.items()) if k != 'a' and v]

        section_exercise = SectionExercise(
            exercise_id=eg.group_id,
            name=primary_name,
            alternates=alternates,
            sets=eg.sets,
            reps=eg.reps,
            rest=eg.rest,
            default_weight=eg.default_weight,
            default_weight_unit=eg.default_weight_unit,
            group_type=eg.group_type,
            cardio_config=eg.cardio_config,
            interval_config=eg.interval_config
        )

        if eg.block_id and eg.block_id in seen_block_ids:
            # Add to existing section
            sections[seen_block_ids[eg.block_id]].exercises.append(section_exercise)
        elif eg.block_id:
            # Create new superset section for this block
            section = WorkoutSection(
                section_id=f"section-{eg.block_id}",
                type="superset",
                name=eg.group_name,
                exercises=[section_exercise]
            )
            seen_block_ids[eg.block_id] = len(sections)
            sections.append(section)
        else:
            # Standalone exercise -> individual standard section
            section = WorkoutSection(
                section_id=f"section-{eg.group_id}",
                type="standard",
                exercises=[section_exercise]
            )
            sections.append(section)

    return sections


def migrate_sections_to_exercise_groups(sections: List[WorkoutSection]) -> List[ExerciseGroup]:
    """Convert sections format back to legacy exercise_groups + block_id format.

    Reverse of migrate_exercise_groups_to_sections(). Ensures exercise_groups
    is always populated for consumers that only read the legacy format.
    """
    groups = []

    for section in sections:
        is_named = section.type != 'standard'
        block_id = section.section_id if is_named else None

        for ex in section.exercises:
            exercises_dict = {}
            if ex.name:
                exercises_dict['a'] = ex.name
            for i, alt in enumerate(ex.alternates or []):
                if alt:
                    exercises_dict[chr(98 + i)] = alt  # b, c, d, ...

            # Preserve exercise-level group_type (cardio, interval) over section inference
            effective_group_type = ex.group_type if ex.group_type not in ('standard', None) else ('block' if is_named else 'standard')

            group = ExerciseGroup(
                group_id=ex.exercise_id,
                exercises=exercises_dict if exercises_dict else {'a': ''},
                sets=ex.sets,
                reps=ex.reps,
                rest=ex.rest,
                default_weight=ex.default_weight,
                default_weight_unit=ex.default_weight_unit,
                group_type=effective_group_type,
                group_name=section.name if is_named else None,
                block_id=block_id,
                cardio_config=ex.cardio_config,
                interval_config=ex.interval_config
            )
            groups.append(group)

    return groups
