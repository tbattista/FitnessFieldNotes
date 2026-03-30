/**
 * Ghost Gym - Workout Data Manager
 * Manages exercise data collection, transformation, and template updates
 * @version 1.0.0
 * @date 2026-01-05
 * 
 * Phase 4: Exercise Data Management
 * Extracted from WorkoutModeController to provide:
 * - Clean separation of data logic from UI logic
 * - Reusable data operations across different contexts
 * - Foundation for session lifecycle management (Phase 5)
 */

class WorkoutDataManager {
    constructor(options) {
        this.sessionService = options.sessionService;
        this.dataManager = options.dataManager;
        
        console.log('📊 Workout Data Manager initialized');
    }
    
    /**
     * Find exercise group by exercise name
     * @param {string} exerciseName - Exercise name to find
     * @param {Object} workout - Current workout object
     * @returns {Object|null} Exercise group or null if not found
     */
    findExerciseByName(exerciseName, workout) {
        // Check regular exercise groups
        if (workout?.exercise_groups) {
            const group = workout.exercise_groups.find(g => g.exercises?.a === exerciseName);
            if (group) return group;
        }
        
        return null;
    }
    
    /**
     * Get current exercise data from appropriate source
     * Priority: Active Session > Pre-Session Edits > Template
     * @param {string} exerciseName - Exercise name
     * @param {Object} workout - Current workout object
     * @param {number} index - Exercise index (for fallback lookup)
     * @returns {Object} Exercise data
     */
    getCurrentExerciseData(exerciseName, workout, index = null) {
        // Find the exercise group
        let exerciseGroup = null;
        
        if (index !== null && workout?.exercise_groups && index < workout.exercise_groups.length) {
            exerciseGroup = workout.exercise_groups[index];
        } else {
            exerciseGroup = this.findExerciseByName(exerciseName, workout);
        }
        
        // Check if session is active
        if (this.sessionService.isSessionActive()) {
            // ACTIVE SESSION: Get from session data
            const exerciseData = this.sessionService.getExerciseWeight(exerciseName);
            
            return {
                exerciseName,
                sets: exerciseData?.target_sets || exerciseGroup?.sets || '3',
                reps: exerciseData?.target_reps || exerciseGroup?.reps || '8-12',
                rest: exerciseData?.rest || exerciseGroup?.rest || '60s',
                weight: exerciseData?.weight || exerciseGroup?.default_weight || '',
                weightUnit: exerciseData?.weight_unit || exerciseGroup?.default_weight_unit || 'lbs'
            };
        } else {
            // PRE-SESSION: Check pre-session edits first, then template
            const preSessionEdit = this.sessionService.getPreSessionEdits(exerciseName);
            
            return {
                exerciseName,
                sets: preSessionEdit?.target_sets || exerciseGroup?.sets || '3',
                reps: preSessionEdit?.target_reps || exerciseGroup?.reps || '8-12',
                rest: preSessionEdit?.rest || exerciseGroup?.rest || '60s',
                weight: preSessionEdit?.weight || exerciseGroup?.default_weight || '',
                weightUnit: preSessionEdit?.weight_unit || exerciseGroup?.default_weight_unit || 'lbs'
            };
        }
    }
    
    /**
     * Build exercise list from workout groups
     * @param {Object} workout - Current workout object
     * @returns {Array} Combined exercise list
     */
    buildExerciseList(workout) {
        const allExercises = [];
        
        // Add regular exercises
        if (workout.exercise_groups) {
            workout.exercise_groups.forEach((group) => {
                const mainExercise = group.exercises?.a;
                if (mainExercise) {
                    allExercises.push({
                        type: 'regular',
                        data: group,
                        name: mainExercise
                    });
                }
            });
        }
        
        return allExercises;
    }
    
    /**
     * Apply custom order to exercise list
     * @param {Array} exercises - Exercise list
     * @returns {Array} Ordered exercise list
     */
    applyCustomOrder(exercises) {
        const customOrder = this.sessionService.getExerciseOrder();
        
        if (customOrder.length === 0) {
            return exercises;
        }
        
        console.log('📋 Applying custom exercise order:', customOrder);
        
        // Reorder exercises based on custom order
        const orderedExercises = [];
        customOrder.forEach(name => {
            const exercise = exercises.find(ex => ex.name === name);
            if (exercise) {
                orderedExercises.push(exercise);
            }
        });
        
        // Add any exercises not in custom order (shouldn't happen, but safety)
        exercises.forEach(ex => {
            if (!customOrder.includes(ex.name)) {
                orderedExercises.push(ex);
            }
        });
        
        return orderedExercises;
    }
    
    /**
     * Collect all exercise data for the current session
     * Respects custom order from session
     * @param {Object} workout - Current workout object
     * @returns {Array} Array of exercise data objects
     */
    collectExerciseData(workout) {
        const exercisesPerformed = [];
        let orderIndex = 0;
        
        console.log('📊 Collecting exercise data for session...');
        
        // Build exercise list in display order
        let allExercises = this.buildExerciseList(workout);
        
        // Apply custom order if exists
        allExercises = this.applyCustomOrder(allExercises);
        
        // Collect data in display order
        allExercises.forEach((exercise, index) => {
            const mainExercise = exercise.name;
            const group = exercise.data;
            
            const exerciseData = this.sessionService.getExerciseWeight(mainExercise);
            const history = this.sessionService.getExerciseHistory(mainExercise);
            
            // Use nullish coalescing to preserve template defaults
            // Support both numeric and text weights (Body, BW+25, 4x45, etc.)
            const finalWeight = exerciseData?.weight ?? group.default_weight ?? null;
            const finalUnit = exerciseData?.weight_unit || group.default_weight_unit || 'lbs';
            
            // Read sets/reps/rest from session first, then fall back to template
            const finalSets = exerciseData?.target_sets || group.sets || '3';
            const finalReps = exerciseData?.target_reps || group.reps || '8-12';
            const finalRest = exerciseData?.rest || group.rest || '60s';
            
            // Calculate weight change properly
            const previousWeight = history?.last_weight || null;
            let weightChange = null;
            if (finalWeight !== null && previousWeight !== null && typeof finalWeight === 'number' && typeof previousWeight === 'number') {
                weightChange = finalWeight - previousWeight;
            }
            
            // Get direction being saved
            const directionToSave = exerciseData?.next_weight_direction || null;
            console.log(`🔍 [SAVE] Exercise ${index}: "${mainExercise}"`);
            console.log(`  📝 Direction to save:`, directionToSave);
            console.log(`  📊 Exercise data:`, exerciseData);
            
            // Backend expects Optional[str] for weight fields — coerce non-null values to strings
            const toStr = v => (v != null && !Number.isNaN(v) ? String(v) : null);

            exercisesPerformed.push({
                exercise_name: mainExercise,
                exercise_id: null,
                group_id: group.group_id || `group-${index}`,
                sets_completed: parseInt(finalSets) || 0,
                target_sets: String(finalSets),
                target_reps: String(finalReps),
                weight: toStr(finalWeight),
                weight_unit: finalUnit,
                previous_weight: toStr(previousWeight),
                weight_change: toStr(weightChange),
                order_index: orderIndex++,
                is_modified: exerciseData?.is_modified || false,
                is_skipped: exerciseData?.is_skipped || false,
                skip_reason: exerciseData?.skip_reason || null,
                notes: exerciseData?.notes || null,
                calories_burned: exerciseData?.calories_burned || null,
                next_weight_direction: directionToSave,  // Weight Progression Indicator
                original_weight: toStr(exerciseData?.original_weight ?? null),
                original_sets: toStr(exerciseData?.original_sets ?? null),
                original_reps: toStr(exerciseData?.original_reps ?? null)
            });
        });
        
        console.log('📊 Total exercises collected:', exercisesPerformed.length);
        
        return exercisesPerformed;
    }
    
    /**
     * Update workout template with final weights from session
     * Ensures builder shows most recent weights
     * @param {Object} workout - Current workout object
     * @param {Array} exercisesPerformed - Completed exercise data
     * @returns {Promise<boolean>} Success status
     */
    async updateWorkoutTemplate(workout, exercisesPerformed) {
        try {
            if (!workout || !exercisesPerformed || exercisesPerformed.length === 0) {
                console.log('⏭️ Skipping template weight update - no data to update');
                return false;
            }
            
            console.log('🔄 Updating workout template with final weights...');
            
            // Create a map of exercise names to their weights
            const weightMap = new Map();
            exercisesPerformed.forEach(exercise => {
                if (exercise.weight) {
                    weightMap.set(exercise.exercise_name, {
                        weight: exercise.weight,
                        weight_unit: exercise.weight_unit || 'lbs'
                    });
                }
            });
            
            // Update exercise groups with new weights
            let updated = false;
            if (workout.exercise_groups) {
                workout.exercise_groups.forEach(group => {
                    const mainExercise = group.exercises?.a;
                    if (mainExercise && weightMap.has(mainExercise)) {
                        const weightData = weightMap.get(mainExercise);
                        group.default_weight = weightData.weight;
                        group.default_weight_unit = weightData.weight_unit;
                        updated = true;
                        console.log(`✅ Updated ${mainExercise}: ${weightData.weight} ${weightData.weight_unit}`);
                    }
                });
            }
            
            // Save updated workout template to database
            if (updated) {
                await this.dataManager.updateWorkout(workout.id, workout);
                console.log('✅ Workout template weights updated successfully');
                return true;
            } else {
                console.log('ℹ️ No weights to update in template');
                return false;
            }
            
        } catch (error) {
            console.error('❌ Error updating workout template weights:', error);
            // Don't throw - this is a non-critical enhancement
            // The workout completion should still succeed even if template update fails
            return false;
        }
    }
    
    /**
     * Update a single exercise in the workout template
     * Updates sets, reps, rest, weight for a specific exercise
     * @param {Object} workout - Current workout object
     * @param {string} exerciseName - Exercise name to update
     * @param {Object} exerciseData - Updated exercise data
     * @param {string} exerciseData.sets - New sets value
     * @param {string} exerciseData.reps - New reps value
     * @param {string} exerciseData.rest - New rest value
     * @param {string} exerciseData.weight - New weight value
     * @param {string} exerciseData.weightUnit - New weight unit
     * @returns {Promise<boolean>} Success status
     */
    async updateExerciseInTemplate(workout, exerciseName, exerciseData) {
        try {
            if (!workout || !exerciseName || !exerciseData) {
                console.log('⏭️ Skipping template exercise update - missing data');
                return false;
            }
            
            console.log('🔄 Updating exercise in workout template:', exerciseName, exerciseData);
            
            let updated = false;
            
            // Find and update the exercise in exercise_groups
            if (workout.exercise_groups) {
                workout.exercise_groups.forEach(group => {
                    const mainExercise = group.exercises?.a;
                    if (mainExercise === exerciseName) {
                        // Update all provided fields
                        if (exerciseData.sets !== undefined) {
                            group.sets = exerciseData.sets;
                            console.log(`  ✅ Updated sets: ${exerciseData.sets}`);
                        }
                        if (exerciseData.reps !== undefined) {
                            group.reps = exerciseData.reps;
                            console.log(`  ✅ Updated reps: ${exerciseData.reps}`);
                        }
                        if (exerciseData.rest !== undefined) {
                            group.rest = exerciseData.rest;
                            console.log(`  ✅ Updated rest: ${exerciseData.rest}`);
                        }
                        if (exerciseData.weight !== undefined && exerciseData.weight !== '') {
                            group.default_weight = exerciseData.weight;
                            console.log(`  ✅ Updated weight: ${exerciseData.weight}`);
                        }
                        if (exerciseData.weightUnit !== undefined) {
                            group.default_weight_unit = exerciseData.weightUnit;
                            console.log(`  ✅ Updated weight unit: ${exerciseData.weightUnit}`);
                        }
                        updated = true;
                    }
                });
            }
            
            // Save updated workout template to database
            if (updated) {
                // Update modified date
                workout.modified_date = new Date().toISOString();
                
                await this.dataManager.updateWorkout(workout.id, workout);
                console.log('✅ Workout template exercise updated successfully:', exerciseName);
                return true;
            } else {
                console.log('ℹ️ Exercise not found in template:', exerciseName);
                return false;
            }
            
        } catch (error) {
            console.error('❌ Error updating exercise in workout template:', error);
            // Don't throw - this is a non-critical enhancement
            return false;
        }
    }
    /**
     * Fetch last completed date for a workout
     * Finds the most recent session date across all exercises
     * @param {Object} workout - Current workout object
     * @param {Object} authService - Auth service instance
     * @returns {Promise<Date|null>} Most recent completion date or null
     */
    async fetchLastCompleted(workout, authService) {
        try {
            if (!workout || !authService.isUserAuthenticated()) {
                console.log('ℹ️ No workout or not authenticated, skipping last completed fetch');
                return null;
            }

            const token = await authService.getIdToken();
            if (!token) {
                console.log('ℹ️ No auth token, skipping last completed fetch');
                return null;
            }

            const url = window.config.api.getUrl(`/api/v3/workout-sessions/history/workout/${workout.id}`);
            console.log('📡 Fetching workout history from:', url);

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                console.warn('⚠️ Could not fetch last completed date, status:', response.status);
                return null;
            }

            const historyData = await response.json();
            console.log('📊 History data received:', historyData);

            if (historyData.exercises && Object.keys(historyData.exercises).length > 0) {
                let mostRecentDate = null;
                for (const exerciseName in historyData.exercises) {
                    const exerciseHistory = historyData.exercises[exerciseName];
                    if (exerciseHistory.last_session_date) {
                        const sessionDate = new Date(exerciseHistory.last_session_date);
                        if (!mostRecentDate || sessionDate > mostRecentDate) {
                            mostRecentDate = sessionDate;
                        }
                    }
                }

                if (mostRecentDate) {
                    console.log('✅ Found most recent session date:', mostRecentDate);
                    return mostRecentDate;
                }
            }

            console.log('ℹ️ No session history found for this workout');
            return null;
        } catch (error) {
            console.error('❌ Error fetching last completed:', error);
            return null;
        }
    }
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WorkoutDataManager;
}

console.log('📦 Workout Data Manager loaded');
