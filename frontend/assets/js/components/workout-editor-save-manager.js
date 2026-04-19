/**
 * Ghost Gym - Workout Editor Save Manager
 * Save pipeline and exercise auto-creation for workout builder
 * Extracted from workout-editor.js
 * @version 1.0.0
 */

/**
 * sectionsToExerciseGroups is now provided by exercise-data-utils.js
 * via window.sectionsToExerciseGroups = ExerciseDataUtils.sectionsToExerciseGroups
 * The save pipeline at line ~169 calls it via the window global.
 */

/**
 * Auto-create custom exercises for any unknown exercise names in groups
 * @param {Array} exerciseGroups - Array of exercise group objects
 * @returns {Promise<void>}
 */
async function autoCreateExercisesInGroups(exerciseGroups) {
    if (!exerciseGroups || exerciseGroups.length === 0) {
        console.log('ℹ️ WORKOUT SAVE DEBUG: No exercise groups to process');
        return;
    }
    if (!window.exerciseCacheService) {
        console.warn('⚠️ ExerciseCacheService not available');
        return;
    }
    if (!window.dataManager || !window.dataManager.isUserAuthenticated()) {
        console.log('ℹ️ User not authenticated, skipping auto-create');
        return;
    }

    try {
        console.log(`📋 WORKOUT SAVE DEBUG: Processing ${exerciseGroups.length} exercise group(s)`);

        // Get user ID from auth service
        const userId = window.authService?.currentUser?.uid ||
                      window.dataManager?.currentUser?.uid ||
                      'anonymous';

        console.log(`📋 WORKOUT SAVE DEBUG: User ID: ${userId}`);

        const allExerciseNames = new Set();

        // Collect all unique exercise names from all groups
        exerciseGroups.forEach((group, groupIndex) => {
            console.log(`📋 WORKOUT SAVE DEBUG: Group ${groupIndex + 1}:`, group);
            if (group.exercises) {
                Object.entries(group.exercises).forEach(([key, name]) => {
                    console.log(`   Exercise ${key}: "${name}" (${name ? name.length : 0} chars)`);
                    if (name && name.trim()) {
                        allExerciseNames.add(name.trim());
                    }
                });
            }
        });

        if (allExerciseNames.size === 0) {
            console.log('ℹ️ WORKOUT SAVE DEBUG: No exercise names to process after filtering');
            return;
        }

        console.log(`🔍 WORKOUT SAVE DEBUG: Found ${allExerciseNames.size} unique exercise name(s):`);
        allExerciseNames.forEach(name => console.log(`   - "${name}" (${name.length} chars)`));

        // Auto-create each exercise if needed (parallel processing)
        const createPromises = Array.from(allExerciseNames).map(exerciseName =>
            window.exerciseCacheService.autoCreateIfNeeded(exerciseName, userId)
        );

        const results = await Promise.allSettled(createPromises);

        // Count results
        const created = results.filter(r => r.status === 'fulfilled' && r.value && !r.value.isGlobal).length;
        const existing = results.filter(r => r.status === 'fulfilled' && r.value && r.value.isGlobal).length;
        const failed = results.filter(r => r.status === 'rejected').length;

        if (created > 0) {
            console.log(`✅ Auto-created ${created} custom exercise(s)`);
        }
        if (existing > 0) {
            console.log(`ℹ️ ${existing} exercise(s) already exist in database`);
        }
        if (failed > 0) {
            console.warn(`⚠️ Failed to process ${failed} exercise(s)`);
        }

    } catch (error) {
        console.error('❌ Error in autoCreateExercisesInGroups:', error);
        // Don't throw - allow workout save to continue even if auto-create fails
    }
}

/**
 * Save workout from editor
 * @param {boolean} silent - If true, don't show alerts or update button (for autosave)
 */
async function saveWorkoutFromEditor(silent = false) {
    console.log('💾 ========== SAVE WORKOUT START ==========');
    console.log('💾 Saving workout from editor...', silent ? '(autosave)' : '(manual)');

    // Collect template notes from state and update order indices based on DOM order
    const templateNotes = window.collectTemplateNotes();

    // Flush any focused section inputs before collecting data
    document.querySelectorAll('.section-name-input:focus, .section-description-input:focus')
        .forEach(input => input.blur());

    // Flush any active desktop inline edit before collecting data
    if (window.desktopCardRenderer?.activeEdit) {
        window.desktopCardRenderer.finishInlineEdit(window.desktopCardRenderer.activeEdit, true);
    }

    // Check if we're in sections mode
    const useSections = window.SectionManager && window.SectionManager.isSectionsMode();

    // Preserve workout_type across save: prefer the builder state (set by URL
    // ?mode=tabata or by loadWorkoutIntoEditor), fall back to the loaded workout.
    const workoutType = window.ffn?.workoutBuilder?.workoutType
        || window.ffn?.workoutBuilder?.currentWorkout?.workout_type
        || 'standard';

    const workoutData = {
        name: document.getElementById('workoutName').value.trim(),
        description: document.getElementById('workoutDescription').value.trim(),
        tags: document.getElementById('workoutTags').value
            .split(',').map(t => t.trim()).filter(t => t),
        exercise_groups: collectExerciseGroups(),
        workout_type: workoutType,
        template_notes: templateNotes
    };

    // If in sections mode, also collect sections data and regenerate exercise_groups from it
    if (useSections) {
        workoutData.sections = window.SectionManager.collectSections();
        // Regenerate exercise_groups from sections to ensure block structure is preserved.
        // The DOM-based collectExerciseGroups() loses block_id/group_type; sections is authoritative.
        workoutData.exercise_groups = window.ExerciseDataUtils
            ? ExerciseDataUtils.sectionsToExerciseGroups(workoutData.sections)
            : (workoutData.sections || []).flatMap(s => (s.exercises || []).map(e => ({
                group_id: e.exercise_id,
                exercises: { a: e.name },
                sets: e.sets || '3', reps: e.reps || '8-12', rest: e.rest || '60s'
            })));
    }

    console.log('📊 SAVE DEBUG: Collected workout data:', {
        name: workoutData.name,
        exerciseGroupCount: workoutData.exercise_groups.length
    });
    console.log('📊 SAVE DEBUG: Exercise groups:', workoutData.exercise_groups);

    // Validate
    if (!workoutData.name) {
        if (!silent) {
            showAlert('Workout name is required', 'danger');
            document.getElementById('workoutName').focus();
        }
        return;
    }

    // Allow workouts with only notes (no exercise groups required)
    // But if there are no exercise groups AND no notes, show a warning
    const hasExercises = workoutData.exercise_groups.length > 0 ||
        (workoutData.sections && workoutData.sections.some(s => s.exercises.length > 0));
    if (!hasExercises && workoutData.template_notes.length === 0) {
        if (!silent) {
            showAlert('Add at least one exercise or note to save', 'warning');
        }
        return;
    }

    try {
        // CLIENT-SIDE VALIDATION: Check exercise groups structure before API call
        console.log('🔍 VALIDATION: Checking exercise groups structure...');
        const validationErrors = [];

        workoutData.exercise_groups.forEach((group, index) => {
            // Check for group_id (required by backend)
            if (!group.group_id) {
                validationErrors.push(`Group ${index + 1}: Missing group_id field`);
            }

            // Check for exercises object
            if (!group.exercises || typeof group.exercises !== 'object') {
                validationErrors.push(`Group ${index + 1}: Invalid or missing exercises object`);
            }

            // Check for required fields (skip for cardio groups which don't use sets/reps/rest)
            if (group.group_type !== 'cardio') {
                if (!group.sets) validationErrors.push(`Group ${index + 1}: Missing sets`);
                if (!group.reps) validationErrors.push(`Group ${index + 1}: Missing reps`);
                if (!group.rest) validationErrors.push(`Group ${index + 1}: Missing rest`);
            }
        });

        if (validationErrors.length > 0) {
            console.error('❌ VALIDATION FAILED:');
            validationErrors.forEach(err => console.error(`   - ${err}`));
            throw new Error('Workout data validation failed: ' + validationErrors.join(', '));
        }

        console.log('✅ VALIDATION: Exercise groups structure is valid');

        console.log('🚀 SAVE DEBUG: About to call autoCreateExercisesInGroups...');
        // Auto-create custom exercises for any unknown exercise names
        await autoCreateExercisesInGroups(workoutData.exercise_groups);
        console.log('✅ SAVE DEBUG: autoCreateExercisesInGroups completed');

        // Show saving status
        window.updateSaveStatus('saving');

        // Update bottom action bar button state (save button is right-0)
        if (window.bottomActionBar && !silent) {
            window.bottomActionBar.updateButtonState('right-0', 'saving');
        }

        // Only update hidden button for manual saves
        const saveBtn = document.getElementById('saveWorkoutBtn');
        if (!silent && saveBtn) {
            saveBtn.innerHTML = '<i class="bx bx-loader-alt bx-spin me-1"></i>Saving...';
            saveBtn.disabled = true;
        }

        let savedWorkout;
        const workoutId = window.ffn.workoutBuilder.selectedWorkoutId;

        // Check if this is a shared workout (temporary ID starting with "shared-")
        const isSharedWorkout = workoutId && workoutId.startsWith('shared-');

        if (isSharedWorkout) {
            // Shared workout: Create a new workout (save as copy to user's library)
            console.log('📋 Saving shared workout as new workout in user library');
            savedWorkout = await window.dataManager.createWorkout(workoutData);

            // Add to local array
            window.ffn.workouts.unshift(savedWorkout);

            // Update to the new workout ID
            window.ffn.workoutBuilder.selectedWorkoutId = savedWorkout.id;

            // Update localStorage to track the new workout ID
            try {
                localStorage.setItem('currentEditingWorkoutId', savedWorkout.id);
                console.log('💾 Updated localStorage with new workout ID:', savedWorkout.id);
            } catch (error) {
                console.warn('⚠️ Could not update localStorage:', error);
            }

            if (!silent) {
                showAlert(`Workout "${savedWorkout.name}" saved to your library!`, 'success');
            }
        } else if (workoutId) {
            // Update existing workout
            savedWorkout = await window.dataManager.updateWorkout(workoutId, workoutData);

            // Update in local array
            const index = window.ffn.workouts.findIndex(w => w.id === workoutId);
            if (index !== -1) {
                window.ffn.workouts[index] = savedWorkout;
            }

            if (!silent) {
                showAlert(`Workout "${savedWorkout.name}" updated successfully!`, 'success');
            }
        } else {
            // Create new workout
            savedWorkout = await window.dataManager.createWorkout(workoutData);
            window.ffn.workouts.unshift(savedWorkout);
            window.ffn.workoutBuilder.selectedWorkoutId = savedWorkout.id;

            if (!silent) {
                showAlert(`Workout "${savedWorkout.name}" created successfully!`, 'success');
            }
        }

        // Update state
        window.ffn.workoutBuilder.isDirty = false;
        window.ffn.workoutBuilder.currentWorkout = { ...savedWorkout };

        // Refresh library
        if (window.renderWorkoutsView) {
            window.renderWorkoutsView();
        }

        // Update save status
        window.updateSaveStatus('saved');

        // Save success toast notification
        if (!silent && window.toastNotifications) {
            window.toastNotifications.saved();
        }

        // Update bottom action bar button state (save button is right-0)
        if (window.bottomActionBar && !silent) {
            window.bottomActionBar.updateButtonState('right-0', 'saved');
        }

        // Flash save FAB to show success
        const saveFab = document.getElementById('mobileSaveFab');
        if (saveFab && !silent) {
            saveFab.classList.add('saved');
            const icon = saveFab.querySelector('i');
            if (icon) icon.className = 'bx bx-check';
            setTimeout(() => {
                saveFab.classList.remove('saved');
                if (icon) icon.className = 'bx bx-save';
            }, 1500);
        }

        // Show delete button now that workout is saved (if it exists)
        const deleteBtn = document.getElementById('deleteWorkoutBtn');
        if (deleteBtn) {
            deleteBtn.style.display = 'inline-block';
        }

        console.log('✅ Workout saved successfully');

    } catch (error) {
        console.error('❌ Error saving workout:', error);

        // Show error alert for manual saves
        if (!silent) {
            showAlert('Failed to save workout: ' + error.message, 'danger');
        }

        window.updateSaveStatus('error');

        // Save failure toast notification
        if (!silent && window.toastNotifications) {
            window.toastNotifications.saveFailed(error.message);
        }

        // Update bottom action bar button state (save button is right-0)
        if (window.bottomActionBar && !silent) {
            window.bottomActionBar.updateButtonState('right-0', 'error');
        }

        throw error; // Re-throw for autosave error handling
    } finally {
        // Reset button (only for manual saves)
        if (!silent) {
            const saveBtn = document.getElementById('saveWorkoutBtn');
            if (saveBtn) {
                saveBtn.innerHTML = '<i class="bx bx-save me-1"></i>Save Workout';
                saveBtn.disabled = false;
            }
        }
    }
}

// Make functions globally available
window.saveWorkoutFromEditor = saveWorkoutFromEditor;
window.autoCreateExercisesInGroups = autoCreateExercisesInGroups;
// Note: window.sectionsToExerciseGroups is now provided by exercise-data-utils.js

console.log('📦 Workout Editor Save Manager loaded');
