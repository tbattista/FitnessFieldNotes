/**
 * Ghost Gym - Skip Exercise Offcanvas Component
 * Creates skip exercise offcanvas with optional reason
 *
 * @module offcanvas-skip-exercise
 * @version 1.0.0
 */

import { createOffcanvas, escapeHtml } from './offcanvas-helpers.js';

/**
 * Create skip exercise offcanvas with optional reason
 * @param {Object} data - Exercise data
 * @param {string} data.exerciseName - Name of exercise to skip
 * @param {Function} onConfirm - Callback when user confirms skip
 * @returns {Object} Offcanvas instance
 */
export function createSkipExercise(data, onConfirm) {
    const { exerciseName } = data;

    const offcanvasHtml = `
        <div class="offcanvas offcanvas-bottom offcanvas-bottom-base" tabindex="-1"
             id="skipExerciseOffcanvas" aria-labelledby="skipExerciseOffcanvasLabel" data-bs-scroll="false">
            <div class="offcanvas-header border-bottom">
                <h5 class="offcanvas-title" id="skipExerciseOffcanvasLabel">
                    <i class="bx bx-skip-next me-2"></i>Skip Exercise
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
            </div>
            <div class="offcanvas-body">
                <div class="text-center mb-4">
                    <div class="mb-3">
                        <i class="bx bx-skip-next" style="font-size: 3rem; color: var(--bs-warning);"></i>
                    </div>
                    <h5 class="mb-2">${escapeHtml(exerciseName)}</h5>
                    <p class="text-muted mb-0">Skip this exercise for today?</p>
                </div>

                <div class="alert alert-info d-flex align-items-start mb-4">
                    <i class="bx bx-info-circle me-2 mt-1"></i>
                    <div>
                        <strong>Skipped exercises are tracked</strong>
                        <p class="mb-0 small">This will be recorded in your workout history. You can optionally add a reason below.</p>
                    </div>
                </div>

                <div class="mb-4">
                    <label class="form-label">Reason (Optional)</label>
                    <textarea class="form-control" id="skipReasonInput"
                              rows="3" maxlength="200"
                              placeholder="e.g., Equipment unavailable, Injury, Fatigue..."></textarea>
                    <small class="text-muted">Max 200 characters</small>
                </div>

                <div class="d-flex gap-2">
                    <button type="button" class="btn btn-outline-secondary flex-fill" data-bs-dismiss="offcanvas">
                        <i class="bx bx-x me-1"></i>Cancel
                    </button>
                    <button type="button" class="btn btn-warning flex-fill" id="confirmSkipBtn">
                        <i class="bx bx-check me-1"></i>Skip Exercise
                    </button>
                </div>
            </div>
        </div>
    `;

    return createOffcanvas('skipExerciseOffcanvas', offcanvasHtml, (offcanvas) => {
        const confirmBtn = document.getElementById('confirmSkipBtn');
        const reasonInput = document.getElementById('skipReasonInput');

        if (confirmBtn && reasonInput) {
            confirmBtn.addEventListener('click', async () => {
                const reason = reasonInput.value.trim();

                confirmBtn.disabled = true;
                confirmBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Skipping...';

                try {
                    await onConfirm(reason);
                    offcanvas.hide();
                } catch (error) {
                    console.error('Error skipping exercise:', error);
                    confirmBtn.disabled = false;
                    confirmBtn.innerHTML = '<i class="bx bx-check me-1"></i>Skip Exercise';
                    alert('Failed to skip exercise. Please try again.');
                }
            });

            // Allow Enter key to submit (with Shift+Enter for new line)
            reasonInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    confirmBtn.click();
                }
            });
        }
    });
}
