/**
 * Ghost Gym - Workout Editor Component
 * Orchestrator for workout builder: CRUD operations, state management, UI helpers
 * @version 2.0.0
 *
 * Delegates to:
 *   template-note-manager.js         - Template note CRUD, rendering, collection
 *   workout-editor-features.js       - Muscle summary, reorder, autocomplete init
 *   workout-editor-save-manager.js   - Save pipeline, exercise auto-creation
 *   workout-editor-listeners.js      - Event bindings, DOM initialization
 */

/**
 * Load workout into the inline editor
 * @param {string} workoutId - ID of workout to load
 */
function loadWorkoutIntoEditor(workoutId) {
    console.log('📝 Loading workout into editor:', workoutId);

    const workout = window.ffn.workouts.find(w => w.id === workoutId);
    if (!workout) {
        console.error('❌ Workout not found:', workoutId);
        return;
    }

    // Update builder state
    window.ffn.workoutBuilder.selectedWorkoutId = workoutId;
    window.ffn.workoutBuilder.isEditing = true;
    window.ffn.workoutBuilder.isDirty = false;
    window.ffn.workoutBuilder.currentWorkout = { ...workout };
    window.ffn.workoutBuilder.workoutType = workout.workout_type || 'standard';

    // Reflect tabata mode in the header (badge + button label)
    const _badge = document.getElementById('workoutTypeBadge');
    const _addBtn = document.getElementById('addExerciseGroupBtnVisible');
    if (window.ffn.workoutBuilder.workoutType === 'tabata') {
        if (_badge) _badge.classList.remove('d-none');
        if (_addBtn) _addBtn.innerHTML = '<i class="bx bx-time-five me-1"></i>Add Tabata Section';
    } else {
        if (_badge) _badge.classList.add('d-none');
        if (_addBtn) _addBtn.innerHTML = '<i class="bx bx-plus me-1"></i>Add Exercise';
    }

    // Persist workout ID to localStorage for page refresh recovery
    try {
        localStorage.setItem('currentEditingWorkoutId', workoutId);
        console.log('💾 Saved workout ID to localStorage for refresh recovery');
    } catch (error) {
        console.warn('⚠️ Could not save to localStorage:', error);
    }

    // Show "Hide Workouts" button
    const hideWorkoutsBtn = document.getElementById('hideWorkoutsBtn');
    if (hideWorkoutsBtn) {
        hideWorkoutsBtn.style.display = 'block';
    }

    // Populate form fields
    document.getElementById('workoutName').value = workout.name || '';
    document.getElementById('workoutDescription').value = workout.description || '';
    document.getElementById('workoutTags').value = workout.tags ? workout.tags.join(', ') : '';

    // Clear and populate exercises
    const exerciseGroupsContainer = document.getElementById('exerciseGroups');
    exerciseGroupsContainer.innerHTML = '';

    // Clear data storage
    window.exerciseGroupsData = {};

    if (workout.sections && workout.sections.length > 0) {
        // Sections-based rendering
        console.log('📦 Loading workout with sections:', workout.sections.length);
        window.SectionManager.renderSections(workout.sections, exerciseGroupsContainer);
        window.SectionManager.initHeaderListeners(exerciseGroupsContainer);
    } else {
        // No exercises — add default
        addExerciseGroup();
    }

    // Render template notes
    if (workout.template_notes && workout.template_notes.length > 0) {
        // Initialize template_notes in current workout
        window.ffn.workoutBuilder.currentWorkout.template_notes = [...workout.template_notes];

        // Render notes after exercise groups are rendered
        setTimeout(() => {
            if (window.renderTemplateNotes) {
                window.renderTemplateNotes(workout.template_notes);
            }
        }, 50);
    } else {
        window.ffn.workoutBuilder.currentWorkout.template_notes = [];
    }

    // Show editor, hide empty state
    document.getElementById('workoutEditorEmptyState').style.display = 'none';
    document.getElementById('workoutEditorForm').style.display = 'block';

    // Show delete button for existing workouts (if it exists)
    const deleteBtn = document.getElementById('deleteWorkoutBtn');
    if (deleteBtn) {
        deleteBtn.style.display = 'inline-block';
    }

    // Update save status
    updateSaveStatus('saved');

    // Highlight selected card in library
    highlightSelectedWorkout(workoutId);

    // Collapse workout library using the same function as the button
    // This ensures the button state updates correctly
    const expandedContent = document.getElementById('workoutLibraryExpandedContent');
    if (expandedContent && expandedContent.style.display !== 'none') {
        toggleWorkoutLibraryContent();
    }

    // Initialize autocompletes with auto-creation support
    if (window.initializeExerciseAutocompletesWithAutoCreate) {
        setTimeout(() => window.initializeExerciseAutocompletesWithAutoCreate(), 100);
    } else if (window.initializeExerciseAutocompletes) {
        setTimeout(() => window.initializeExerciseAutocompletes(), 100);
    }

    // Update card menu boundaries after cards are loaded
    if (window.builderCardMenu?.updateAllMenuBoundaries) {
        setTimeout(() => window.builderCardMenu.updateAllMenuBoundaries(), 200);
    }

    // Update exercise previews and add listeners
    setTimeout(() => {
        const groups = document.querySelectorAll('#exerciseGroups .exercise-group');
        groups.forEach(group => {
            if (window.updateExerciseGroupPreview) {
                window.updateExerciseGroupPreview(group);
            }
            // Add input listeners
            const exerciseInputs = group.querySelectorAll('.exercise-input');
            exerciseInputs.forEach(input => {
                input.addEventListener('input', () => window.updateExerciseGroupPreview(group));
                input.addEventListener('change', () => window.updateExerciseGroupPreview(group));
            });
        });
    }, 200);

    // Update metadata button states (tags and description)
    if (window.updateMetadataButtonStates) {
        setTimeout(() => window.updateMetadataButtonStates(), 250);
    }

    // Update muscle group summary
    setTimeout(() => window.updateMuscleSummary(), 300);

    console.log('✅ Workout loaded into editor');
}

/**
 * Create new workout in editor
 * Auto-saves a new workout with default name so it persists on refresh
 */
async function createNewWorkoutInEditor() {
    console.log('📝 Creating new workout in editor');

    try {
        // Show loading state
        updateSaveStatus('saving');

        // Create a new workout with default name and one exercise group
        const timestamp = new Date().toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });

        // Check for exercises from exercise database cart
        let cartExercises = [];
        try {
            const cartData = sessionStorage.getItem('exerciseCart');
            if (cartData) {
                cartExercises = JSON.parse(cartData);
                sessionStorage.removeItem('exerciseCart');
            }
        } catch (e) { /* ignore */ }

        const exerciseGroups = cartExercises.length > 0
            ? cartExercises.map(ex => ({
                exercises: { a: ex.name },
                sets: '3',
                reps: '8-12',
                rest: '60s',
                default_weight: null,
                default_weight_unit: 'lbs'
            }))
            : [{
                exercises: { a: '' },
                sets: '3',
                reps: '8-12',
                rest: '60s',
                default_weight: null,
                default_weight_unit: 'lbs'
            }];

        const isTabataMode = window.ffn?.workoutBuilder?.workoutType === 'tabata';

        // For tabata workouts, seed one tabata section instead of a standard
        // exercise group so the user lands on the timing config immediately.
        const tabataDefaults = (window.TabataSegmentExpander && window.TabataSegmentExpander.DEFAULTS) || {
            work_seconds: 20, rest_seconds: 10, rounds: 8,
            set_rest_after_seconds: 60, exercise_mode: 'rotation',
        };
        const sections = isTabataMode ? [{
            section_id: `section-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            type: 'tabata',
            name: 'Tabata',
            description: null,
            config: { ...tabataDefaults },
            exercises: cartExercises.length > 0
                ? cartExercises.map((ex, i) => ({
                    exercise_id: `ex-${Date.now()}-${i}`,
                    name: ex.name, alternates: [],
                    sets: '', reps: '', rest: '',
                    default_weight: null, default_weight_unit: 'lbs'
                }))
                : [{
                    exercise_id: `ex-${Date.now()}`,
                    name: '', alternates: [],
                    sets: '', reps: '', rest: '',
                    default_weight: null, default_weight_unit: 'lbs'
                }]
        }] : undefined;

        const newWorkoutData = {
            name: `${isTabataMode ? 'New Tabata Workout' : 'New Workout'} - ${timestamp}`,
            description: '',
            tags: [],
            workout_type: isTabataMode ? 'tabata' : 'standard',
            exercise_groups: exerciseGroups,
            template_notes: []
        };
        if (sections) newWorkoutData.sections = sections;

        // Save to database
        const savedWorkout = await window.dataManager.createWorkout(newWorkoutData);
        console.log('✅ New workout auto-saved:', savedWorkout.id);

        // Initialize workouts array if it doesn't exist
        if (!window.ffn.workouts) {
            window.ffn.workouts = [];
        }

        // Add to local state
        window.ffn.workouts.unshift(savedWorkout);

        // Update builder state
        window.ffn.workoutBuilder.selectedWorkoutId = savedWorkout.id;
        window.ffn.workoutBuilder.isEditing = true;
        window.ffn.workoutBuilder.isDirty = false;
        window.ffn.workoutBuilder.currentWorkout = { ...savedWorkout };

        // Store in localStorage for refresh recovery
        try {
            localStorage.setItem('currentEditingWorkoutId', savedWorkout.id);
            console.log('💾 Saved workout ID to localStorage for refresh recovery');
        } catch (error) {
            console.warn('⚠️ Could not save to localStorage:', error);
        }

        // Collapse workout library
        const expandedContent = document.getElementById('workoutLibraryExpandedContent');
        if (expandedContent && expandedContent.style.display !== 'none') {
            toggleWorkoutLibraryContent();
        }

        // Populate form with saved workout data
        document.getElementById('workoutName').value = savedWorkout.name;
        document.getElementById('workoutDescription').value = savedWorkout.description || '';
        document.getElementById('workoutTags').value = savedWorkout.tags ? savedWorkout.tags.join(', ') : '';

        // Clear and populate exercise groups
        const exerciseGroupsContainer = document.getElementById('exerciseGroups');
        exerciseGroupsContainer.innerHTML = '';
        window.exerciseGroupsData = {};

        if (savedWorkout.sections && savedWorkout.sections.length > 0) {
            window.SectionManager.renderSections(savedWorkout.sections, exerciseGroupsContainer);
            window.SectionManager.initHeaderListeners(exerciseGroupsContainer);
        } else {
            const totalCards = savedWorkout.exercise_groups.length;
            savedWorkout.exercise_groups.forEach((group, index) => {
                const groupId = `group-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`;
                const groupNumber = index + 1;
                const cardHtml = window.createExerciseGroupCard(groupId, group, groupNumber, index, totalCards);
                exerciseGroupsContainer.insertAdjacentHTML('beforeend', cardHtml);
            });
        }

        // Show editor, hide empty state
        document.getElementById('workoutEditorEmptyState').style.display = 'none';
        document.getElementById('workoutEditorForm').style.display = 'block';

        // Show delete button (if it exists)
        const deleteBtn = document.getElementById('deleteWorkoutBtn');
        if (deleteBtn) {
            deleteBtn.style.display = 'inline-block';
        }

        // Update save status
        updateSaveStatus('saved');

        // Refresh library to show new workout
        if (window.renderWorkoutsView) {
            window.renderWorkoutsView();
        }

        // Highlight in library
        highlightSelectedWorkout(savedWorkout.id);

        // Initialize autocompletes with auto-creation support
        if (window.initializeExerciseAutocompletesWithAutoCreate) {
            setTimeout(() => window.initializeExerciseAutocompletesWithAutoCreate(), 100);
        } else if (window.initializeExerciseAutocompletes) {
            setTimeout(() => window.initializeExerciseAutocompletes(), 100);
        }

        // Update card menu boundaries after cards are loaded
        if (window.builderCardMenu?.updateAllMenuBoundaries) {
            setTimeout(() => window.builderCardMenu.updateAllMenuBoundaries(), 200);
        }

        // Focus on name input and select the text so user can easily rename
        const nameInput = document.getElementById('workoutName');
        nameInput.focus();
        nameInput.select();

        // Reset metadata button states
        if (window.updateMetadataButtonStates) {
            setTimeout(() => window.updateMetadataButtonStates(), 250);
        }

        // Update muscle group summary
        setTimeout(() => window.updateMuscleSummary(), 300);

        console.log('✅ New workout created and ready for editing');

    } catch (error) {
        console.error('❌ Failed to create new workout:', error);
        if (window.showAlert) {
            showAlert('Failed to create new workout: ' + error.message, 'danger');
        }
        updateSaveStatus('error');
    }
}

/**
 * Cancel editing and return to empty state
 */
function cancelEditWorkout() {
    const doCancel = () => {
        // Clear localStorage when user intentionally cancels
        try {
            localStorage.removeItem('currentEditingWorkoutId');
            console.log('🗑️ Cleared workout ID from localStorage (cancelled)');
        } catch (error) {
            console.warn('⚠️ Could not clear localStorage:', error);
        }

        // Reset state
        window.ffn.workoutBuilder.selectedWorkoutId = null;
        window.ffn.workoutBuilder.isEditing = false;
        window.ffn.workoutBuilder.isDirty = false;

        // Hide "Hide Workouts" button
        const hideWorkoutsBtn = document.getElementById('hideWorkoutsBtn');
        if (hideWorkoutsBtn) {
            hideWorkoutsBtn.style.display = 'none';
        }

        // Expand workout library using the same function as the button
        const expandedContent = document.getElementById('workoutLibraryExpandedContent');
        if (expandedContent && expandedContent.style.display === 'none') {
            toggleWorkoutLibraryContent();
        }

        // Hide editor, show empty state
        document.getElementById('workoutEditorForm').style.display = 'none';
        document.getElementById('workoutEditorEmptyState').style.display = 'block';

        // Clear selection in library
        document.querySelectorAll('.workout-card-compact').forEach(card => {
            card.classList.remove('selected');
        });

        console.log('✅ Edit cancelled');
    };

    if (window.ffn.workoutBuilder.isDirty) {
        ffnModalManager.confirm('Unsaved Changes', 'You have unsaved changes. Are you sure you want to cancel?', doCancel, { confirmText: 'Discard Changes', confirmClass: 'btn-danger', size: 'sm' });
    } else {
        doCancel();
    }
}

/**
 * Delete workout from editor
 */
async function deleteWorkoutFromEditor() {
    const workoutId = window.ffn.workoutBuilder.selectedWorkoutId;
    if (!workoutId) return;

    const workout = window.ffn.workouts.find(w => w.id === workoutId);
    if (!workout) return;

    ffnModalManager.confirm('Delete Workout', `Are you sure you want to delete "${workout.name}"? This action cannot be undone.`, async () => {
        try {
            // Show deleting status
            const deleteBtn = document.getElementById('deleteWorkoutBtn');
            const originalText = deleteBtn.innerHTML;
            deleteBtn.innerHTML = '<i class="bx bx-loader-alt bx-spin me-1"></i>Deleting...';
            deleteBtn.disabled = true;

            // Delete from database
            await window.dataManager.deleteWorkout(workoutId);

            // Remove from local state
            window.ffn.workouts = window.ffn.workouts.filter(w => w.id !== workoutId);

            // Refresh library
            if (window.renderWorkoutsView) {
                window.renderWorkoutsView();
            }

            // Clear localStorage before canceling (workout no longer exists)
            try {
                localStorage.removeItem('currentEditingWorkoutId');
                console.log('🗑️ Cleared workout ID from localStorage (deleted)');
            } catch (error) {
                console.warn('⚠️ Could not clear localStorage:', error);
            }

            // Return to empty state
            cancelEditWorkout();

            showAlert(`Workout "${workout.name}" deleted successfully`, 'success');

            console.log('✅ Workout deleted');

        } catch (error) {
            console.error('❌ Error deleting workout:', error);
            showAlert('Failed to delete workout: ' + error.message, 'danger');

            // Reset button on error
            const deleteBtn = document.getElementById('deleteWorkoutBtn');
            deleteBtn.innerHTML = '<i class="bx bx-trash me-1"></i>Delete';
            deleteBtn.disabled = false;
        }
    }, { confirmText: 'Delete', confirmClass: 'btn-danger', size: 'sm' });
}

/**
 * Mark editor as dirty (has unsaved changes)
 * Integrates with autosave system from workouts.js
 */
function markEditorDirty() {
    if (!window.ffn.workoutBuilder.isEditing) return;
    if (!window.ffn.workoutBuilder.selectedWorkoutId) return; // Don't autosave new workouts

    window.ffn.workoutBuilder.isDirty = true;
    updateSaveStatus('unsaved');

    // Trigger autosave if available
    if (window.scheduleAutosave) {
        window.scheduleAutosave();
    }

    // Update muscle group summary with debounce
    window.scheduleMuscleSummaryUpdate();
}

/**
 * Update save status indicator
 * @param {string} status - 'unsaved', 'saving', 'saved', 'error', or ''
 */
function updateSaveStatus(status) {
    const saveStatus = document.getElementById('saveStatus');
    if (!saveStatus) return;

    saveStatus.className = `save-status ${status}`;

    switch (status) {
        case 'unsaved':
        case 'dirty':
            saveStatus.textContent = 'Unsaved changes';
            break;
        case 'saving':
            saveStatus.textContent = 'Saving...';
            break;
        case 'saved':
            saveStatus.textContent = 'All changes saved';
            break;
        case 'error':
            saveStatus.textContent = 'Save failed';
            break;
        default:
            saveStatus.textContent = '';
    }
}

/**
 * Highlight selected workout in library
 * @param {string} workoutId - ID of workout to highlight
 */
function highlightSelectedWorkout(workoutId) {
    document.querySelectorAll('.workout-card-compact').forEach(card => {
        if (card.dataset.workoutId === workoutId) {
            card.classList.add('selected');
            // Scroll into view
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        } else {
            card.classList.remove('selected');
        }
    });
}

// Make functions globally available
window.loadWorkoutIntoEditor = loadWorkoutIntoEditor;
window.createNewWorkoutInEditor = createNewWorkoutInEditor;
window.cancelEditWorkout = cancelEditWorkout;
window.deleteWorkoutFromEditor = deleteWorkoutFromEditor;
window.markEditorDirty = markEditorDirty;
window.updateSaveStatus = updateSaveStatus;
window.highlightSelectedWorkout = highlightSelectedWorkout;

console.log('📦 Workout Editor component loaded');
