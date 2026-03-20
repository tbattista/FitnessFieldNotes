/**
 * Ghost Gym - Workout Session Offcanvas Components
 * Creates session-lifecycle offcanvas: weight edit, complete, completion summary, resume session
 *
 * @module offcanvas-workout-session
 * @version 1.0.0
 * @date 2026-02-27
 */

import { createOffcanvas, escapeHtml } from './offcanvas-helpers.js';

/* ============================================
   WEIGHT EDIT OFFCANVAS (from WorkoutOffcanvasFactory)
   ============================================ */

/**
 * Create weight edit offcanvas
 * @param {string} exerciseName - Exercise name
 * @param {Object} data - Weight data
 * @returns {Object} Offcanvas instance
 */
export function createWeightEdit(exerciseName, data) {
    const {
        currentWeight = '',
        currentUnit = 'lbs',
        lastWeight = '',
        lastWeightUnit = 'lbs',
        lastSessionDate = '',
        isSessionActive = false
    } = data;

    const modalContent = `
        <div class="weight-modal-content">
            <div class="mb-3">
                <label class="form-label"><i class="bx bx-dumbbell me-2"></i>Weight</label>
                <div class="d-flex gap-2">
                    <input
                        type="text"
                        class="form-control weight-input"
                        id="modalWeightInput"
                        data-exercise-name="${escapeHtml(exerciseName)}"
                        value="${currentWeight || ''}"
                        placeholder="135 or 4x45 plates"
                        maxlength="50"
                        ${!isSessionActive ? 'readonly disabled' : ''}
                        style="flex: 1;">
                    <select class="form-select weight-unit-select" id="modalWeightUnit" data-exercise-name="${escapeHtml(exerciseName)}" ${!isSessionActive ? 'disabled' : ''} style="width: 100px;">
                        <option value="lbs" ${currentUnit === 'lbs' ? 'selected' : ''}>lbs</option>
                        <option value="kg" ${currentUnit === 'kg' ? 'selected' : ''}>kg</option>
                        <option value="other" ${currentUnit === 'other' ? 'selected' : ''}>DIY</option>
                    </select>
                </div>
                <small class="text-muted">Enter weight as number or description (e.g., "4x45 plates", "135", "BW+25")</small>
            </div>
            ${lastWeight && lastSessionDate ? `
                <div class="alert alert-info mb-0">
                    <i class="bx bx-history me-2"></i>Last: ${lastWeight} ${lastWeightUnit} (${lastSessionDate})
                </div>
            ` : ''}
            ${!isSessionActive ? `
                <div class="alert alert-warning mb-0 mt-3">
                    <i class="bx bx-lock-alt me-2"></i>Start workout to edit weights
                </div>
            ` : ''}
        </div>
    `;

    const offcanvasHtml = `
        <div class="offcanvas offcanvas-bottom offcanvas-bottom-base" tabindex="-1" id="weightEditOffcanvas" aria-labelledby="weightEditOffcanvasLabel" data-bs-scroll="false">
            <div class="offcanvas-header border-bottom">
                <h5 class="offcanvas-title" id="weightEditOffcanvasLabel">
                    <i class="bx bx-edit-alt me-2"></i>Edit Weight
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
            </div>
            <div class="offcanvas-body">
                <h6 class="mb-3">${escapeHtml(exerciseName)}</h6>
                ${modalContent}
                <div class="d-flex gap-2 mt-4">
                    <button type="button" class="btn btn-outline-secondary flex-fill" data-bs-dismiss="offcanvas">Cancel</button>
                    ${isSessionActive ? '<button type="button" class="btn btn-primary flex-fill" id="saveWeightBtn">Save</button>' : ''}
                </div>
            </div>
        </div>
    `;

    return createOffcanvas('weightEditOffcanvas', offcanvasHtml, (offcanvas, offcanvasElement) => {
        if (isSessionActive) {
            setupWeightEditListeners(offcanvasElement, offcanvas, exerciseName);
        }
    });
}

/**
 * Setup weight edit event listeners
 */
export function setupWeightEditListeners(offcanvasElement, offcanvas, exerciseName) {
    const saveBtn = document.getElementById('saveWeightBtn');
    const weightInput = document.getElementById('modalWeightInput');
    const unitSelect = document.getElementById('modalWeightUnit');

    if (!saveBtn || !weightInput || !unitSelect) return;

    saveBtn.addEventListener('click', async () => {
        const weight = weightInput.value.trim();
        const unit = unitSelect.value;

        window.workoutSessionService.updateExerciseWeight(exerciseName, weight, unit);

        try {
            await window.workoutModeController.autoSave(null);
            console.log('✅ Weight saved successfully:', exerciseName, weight, unit);
        } catch (error) {
            console.error('❌ Failed to save weight:', error);
            alert('Failed to save weight. Please try again.');
            return;
        }

        offcanvas.hide();
        window.workoutModeController.renderWorkout();
    });

    weightInput.addEventListener('input', (e) => {
        const weight = e.target.value.trim();
        const unit = unitSelect.value;
        window.workoutSessionService.updateExerciseWeight(exerciseName, weight, unit);
    });

    unitSelect.addEventListener('change', (e) => {
        const weight = weightInput.value.trim();
        const unit = e.target.value;
        window.workoutSessionService.updateExerciseWeight(exerciseName, weight, unit);
    });
}

/* ============================================
   COMPLETE WORKOUT CONFIRMATION
   ============================================ */

/**
 * Create complete workout confirmation offcanvas
 * Notebook-style design: clean, calm, save-first hierarchy
 * @param {Object} data - Session and workout data
 * @param {Function} onConfirm - Callback when user confirms completion (receives durationMinutes)
 * @returns {Object} Offcanvas instance
 */
export function createCompleteWorkout(data, onConfirm) {
    const { workoutName, minutes, totalExercises, isBuildMode = false } = data;

    // Format current date/time for display
    const now = new Date();
    const formattedDateTime = now.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });

    const durationValue = minutes || '';
    const durationPlaceholder = '';

    const offcanvasHtml = `
        <div class="offcanvas offcanvas-bottom offcanvas-bottom-base" tabindex="-1" id="completeWorkoutOffcanvas" aria-labelledby="completeWorkoutOffcanvasLabel" data-bs-scroll="false">
            <div class="offcanvas-header border-bottom">
                <h5 class="offcanvas-title" id="completeWorkoutOffcanvasLabel">
                    <i class="bx bx-check-circle me-2"></i>Session Complete
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
            </div>
            <div class="offcanvas-body">
                <!-- Workout info - simple, left-aligned, notebook style -->
                <div class="session-complete-header mb-4">
                    <h5 class="mb-1">${escapeHtml(workoutName)}</h5>
                    <small class="text-muted">${formattedDateTime}</small>
                </div>

                <!-- Stats row - horizontal, neutral, inline editable duration -->
                <div class="session-stats-row mb-4">
                    <div class="session-stat editable" title="Click to edit duration">
                        <i class="bx bx-time-five"></i>
                        <input type="number"
                               id="sessionDurationInput"
                               value="${durationValue}"
                               placeholder="${durationPlaceholder}"
                               min="1"
                               max="600">
                        <span>min</span>
                        <i class="bx bx-pencil edit-hint"></i>
                    </div>
                    <div class="session-stat">
                        <i class="bx bx-list-check"></i>
                        <span class="stat-value">${totalExercises}</span>
                        <span>exercise${totalExercises !== 1 ? 's' : ''}</span>
                    </div>
                </div>

                ${isBuildMode ? `
                <!-- Build & Log: Save as Template option -->
                <div class="mb-3">
                    <div class="form-check form-switch">
                        <input class="form-check-input" type="checkbox" id="saveAsTemplateToggle">
                        <label class="form-check-label" for="saveAsTemplateToggle">
                            Save as reusable template
                        </label>
                    </div>
                    <div id="templateNameGroup" class="mt-2" style="display: none;">
                        <input type="text" class="form-control form-control-sm" id="templateNameInput"
                               value="${escapeHtml(workoutName)}" placeholder="Workout name" maxlength="50">
                        <small class="text-muted">This workout will appear in your library</small>
                    </div>
                </div>
                ` : ''}

                <!-- Primary action - Save Session (first and prominent) -->
                <button type="button" class="btn btn-primary w-100 mb-3" id="confirmCompleteBtn">
                    <i class="bx bx-save me-1"></i>Save Session
                </button>

                <!-- Secondary actions - subtle text links -->
                <div class="d-flex justify-content-center gap-4">
                    <button type="button" class="btn btn-link text-muted" data-bs-dismiss="offcanvas">
                        Resume
                    </button>
                    <button type="button" class="btn btn-link text-danger" id="cancelDiscardBtn">
                        Discard
                    </button>
                </div>

                <!-- Helper text - calm reassurance (replaces info banner) -->
                <small class="text-muted d-block text-center mt-3">
                    Session will be added to your training log.
                </small>
            </div>
        </div>
    `;

    return createOffcanvas('completeWorkoutOffcanvas', offcanvasHtml, (offcanvas) => {
        const confirmBtn = document.getElementById('confirmCompleteBtn');
        const cancelDiscardBtn = document.getElementById('cancelDiscardBtn');

        // Build & Log: wire up "Save as Template" toggle
        const saveToggle = document.getElementById('saveAsTemplateToggle');
        const nameGroup = document.getElementById('templateNameGroup');
        if (saveToggle && nameGroup) {
            saveToggle.addEventListener('change', () => {
                nameGroup.style.display = saveToggle.checked ? 'block' : 'none';
            });
        }

        // Handle save session button
        confirmBtn.addEventListener('click', async () => {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';

            try {
                // Get the manual duration from input
                let durationMinutes = null;
                const durationInput = document.getElementById('sessionDurationInput');

                if (durationInput && durationInput.value) {
                    durationMinutes = parseInt(durationInput.value, 10);
                    if (isNaN(durationMinutes) || durationMinutes < 1) {
                        durationMinutes = null;
                    }
                }

                // Build & Log: collect template save preference
                const templateOpts = {};
                if (isBuildMode && saveToggle?.checked) {
                    const nameInput = document.getElementById('templateNameInput');
                    templateOpts.saveAsTemplate = true;
                    templateOpts.templateName = nameInput?.value?.trim() || workoutName;
                }

                await onConfirm(durationMinutes, templateOpts);
                offcanvas.hide();
            } catch (error) {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = '<i class="bx bx-save me-1"></i>Save Session';
                throw error;
            }
        });

        // Handle discard button
        if (cancelDiscardBtn) {
            cancelDiscardBtn.addEventListener('click', () => {
                // Hide the complete workout offcanvas first
                offcanvas.hide();

                // Show confirmation offcanvas for discard
                setTimeout(() => {
                    if (window.UnifiedOffcanvasFactory?.createConfirmOffcanvas) {
                        window.UnifiedOffcanvasFactory.createConfirmOffcanvas({
                            id: 'cancelWorkoutConfirmOffcanvas',
                            title: 'Discard Session?',
                            icon: 'bx-error-circle',
                            iconColor: 'danger',
                            message: 'Are you sure you want to discard this session?',
                            subMessage: 'All progress will be permanently lost and cannot be recovered.',
                            confirmText: 'Yes, Discard',
                            confirmVariant: 'danger',
                            cancelText: 'Resume',
                            onConfirm: () => {
                                // Call the controller's reset method
                                if (window.workoutModeController?.resetToFreshState) {
                                    window.workoutModeController.resetToFreshState();
                                }
                            }
                        });
                    } else {
                        // Fallback: use modal manager confirm
                        ffnModalManager.confirm('Discard Session', 'Are you sure you want to discard this session? All progress will be lost.', () => {
                            if (window.workoutModeController?.resetToFreshState) {
                                window.workoutModeController.resetToFreshState();
                            }
                        }, { confirmText: 'Discard', confirmClass: 'btn-danger', size: 'sm' });
                    }
                }, 300); // Small delay to let the first offcanvas hide
            });
        }
    });
}

/* ============================================
   COMPLETION SUMMARY (Success Screen)
   ============================================ */

/**
 * Create completion summary offcanvas (success screen)
 * @param {Object} data - Completed session data
 * @returns {Object} Offcanvas instance
 */
export function createCompletionSummary(data) {
    const { duration, exerciseCount, workoutId } = data;

    // Build history URL with workout ID if available
    const historyUrl = workoutId
        ? `workout-history.html?id=${encodeURIComponent(workoutId)}`
        : 'workout-database.html';

    const offcanvasHtml = `
        <div class="offcanvas offcanvas-bottom offcanvas-bottom-base" tabindex="-1" id="completionSummaryOffcanvas"
             aria-labelledby="completionSummaryOffcanvasLabel" data-bs-backdrop="static" data-bs-keyboard="false">
            <div class="offcanvas-header border-bottom">
                <h5 class="offcanvas-title" id="completionSummaryOffcanvasLabel">
                    <i class="bx bx-trophy me-2"></i>Workout Complete!
                </h5>
            </div>
            <div class="offcanvas-body">
                <div class="text-center mb-4">
                    <div class="mb-3">
                        <i class="bx bx-trophy" style="font-size: 4rem; color: var(--bs-success);"></i>
                    </div>
                    <h4 class="mb-2">Great Job! 🎉</h4>
                    <p class="text-muted">You've successfully completed your workout</p>
                </div>

                <div class="row g-3 mb-4">
                    <div class="col-6">
                        <div class="card bg-label-success">
                            <div class="card-body text-center py-3">
                                <div class="h3 mb-0">${duration}</div>
                                <small class="text-muted">Minutes</small>
                            </div>
                        </div>
                    </div>
                    <div class="col-6">
                        <div class="card bg-label-primary">
                            <div class="card-body text-center py-3">
                                <div class="h3 mb-0">${exerciseCount}</div>
                                <small class="text-muted">Exercises</small>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="alert alert-success d-flex align-items-start mb-4">
                    <i class="bx bx-check-circle me-2 mt-1"></i>
                    <div>
                        <strong>Progress Saved!</strong>
                        <p class="mb-0 small">Your workout data has been recorded and is ready to view in your history.</p>
                    </div>
                </div>

                <div class="d-flex flex-column gap-2">
                    <button type="button" class="btn btn-primary" onclick="window.location.href='workout-mode.html'">
                        <i class="bx bx-dumbbell me-1"></i>Start Another Workout
                    </button>
                    <button type="button" class="btn btn-outline-primary" onclick="window.location.href='${historyUrl}'">
                        <i class="bx bx-history me-1"></i>View History
                    </button>
                    <button type="button" class="btn btn-outline-secondary" onclick="window.location.href='index.html'">
                        <i class="bx bx-home me-1"></i>Dashboard
                    </button>
                </div>
            </div>
        </div>
    `;

    return createOffcanvas('completionSummaryOffcanvas', offcanvasHtml);
}

/* ============================================
   RESUME SESSION PROMPT
   ============================================ */

/**
 * Create resume session prompt offcanvas
 * @param {Object} data - Persisted session data
 * @param {Function} onResume - Callback when user chooses to resume
 * @param {Function} onStartFresh - Callback when user chooses to start fresh
 * @param {Function} onCancel - Callback when user chooses to cancel workout
 * @returns {Object} Offcanvas instance
 */
export function createResumeSession(data, onResume, onStartFresh, onCancel, onEnd) {
    const { workoutName, elapsedDisplay, exercisesWithWeights, totalExercises } = data;

    const offcanvasHtml = `
        <div class="offcanvas offcanvas-bottom offcanvas-bottom-base" tabindex="-1" id="resumeSessionOffcanvas"
             aria-labelledby="resumeSessionOffcanvasLabel" data-bs-backdrop="static" data-bs-keyboard="false" data-bs-scroll="false">
            <div class="offcanvas-header border-bottom">
                <h5 class="offcanvas-title" id="resumeSessionOffcanvasLabel">
                    <i class="bx bx-history me-2"></i>Resume Workout?
                </h5>
            </div>
            <div class="offcanvas-body">
                <div class="text-center mb-4">
                    <div class="mb-3">
                        <i class="bx bx-dumbbell" style="font-size: 3rem; color: var(--bs-primary);"></i>
                    </div>
                    <h5 class="mb-2">${escapeHtml(workoutName)}</h5>
                    <p class="text-muted mb-0">You have an active workout session</p>
                </div>

                <div class="row g-3 mb-4">
                    <div class="col-6">
                        <div class="card bg-label-primary">
                            <div class="card-body text-center py-3">
                                <div class="h5 mb-0">${elapsedDisplay}</div>
                                <small class="text-muted">Started</small>
                            </div>
                        </div>
                    </div>
                    <div class="col-6">
                        <div class="card bg-label-success">
                            <div class="card-body text-center py-3">
                                <div class="h5 mb-0">${exercisesWithWeights}/${totalExercises}</div>
                                <small class="text-muted">Weights Set</small>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="alert alert-info d-flex align-items-start mb-4">
                    <i class="bx bx-info-circle me-2 mt-1"></i>
                    <div>
                        <strong>Your progress is saved</strong>
                        <p class="mb-0 small">Resume to continue where you left off, or start fresh to begin a new session.</p>
                    </div>
                </div>

                <div class="d-flex flex-column gap-2">
                    <button type="button" class="btn btn-primary" id="resumeSessionBtn">
                        <i class="bx bx-play me-1"></i>Resume Workout
                    </button>
                    <button type="button" class="btn btn-success" id="endSessionBtn">
                        <i class="bx bx-check me-1"></i>End Workout
                    </button>
                    <button type="button" class="btn btn-outline-secondary" id="startFreshBtn">
                        <i class="bx bx-refresh me-1"></i>Start Fresh
                    </button>
                    <button type="button" class="btn btn-outline-danger" id="cancelWorkoutBtn">
                        <i class="bx bx-x me-1"></i>Cancel Workout
                    </button>
                </div>
            </div>
        </div>
    `;

    return createOffcanvas('resumeSessionOffcanvas', offcanvasHtml, (offcanvas) => {
        const resumeBtn = document.getElementById('resumeSessionBtn');
        const endBtn = document.getElementById('endSessionBtn');
        const startFreshBtn = document.getElementById('startFreshBtn');
        const cancelBtn = document.getElementById('cancelWorkoutBtn');

        resumeBtn.addEventListener('click', async () => {
            resumeBtn.disabled = true;
            resumeBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Resuming...';

            try {
                await onResume();
                offcanvas.hide();
            } catch (error) {
                resumeBtn.disabled = false;
                resumeBtn.innerHTML = '<i class="bx bx-play me-1"></i>Resume Workout';
                throw error;
            }
        });

        if (endBtn && onEnd) {
            endBtn.addEventListener('click', async () => {
                endBtn.disabled = true;
                endBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Ending...';
                try {
                    offcanvas.hide();
                    await onEnd();
                } catch (error) {
                    endBtn.disabled = false;
                    endBtn.innerHTML = '<i class="bx bx-check me-1"></i>End Workout';
                    throw error;
                }
            });
        }

        startFreshBtn.addEventListener('click', () => {
            onStartFresh();
            offcanvas.hide();
        });

        // Cancel workout button handler
        if (cancelBtn && onCancel) {
            cancelBtn.addEventListener('click', () => {
                // Hide offcanvas first (will trigger cleanup via hidden.bs.offcanvas event)
                offcanvas.hide();
                // Call onCancel callback which will show confirmation modal
                onCancel();
            });
        }
    });
}

console.log('📦 Offcanvas workout session components loaded');
