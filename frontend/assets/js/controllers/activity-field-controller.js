/**
 * Activity Field Controller
 * Manages inline editing of activity/cardio card fields in workout mode.
 * Mirrors the exercise card inline editing pattern (weight/reps) but for
 * activity-specific fields: duration, distance, pace, RPE, heart rate, calories.
 *
 * @version 1.0.0
 */

class ActivityFieldController {
    /**
     * @param {HTMLElement} cardElement - The .workout-card[data-card-type="cardio"] element
     * @param {Object} sessionService - WorkoutSessionService instance
     * @param {Function} onAutoSave - Auto-save callback
     * @param {Function} onRenderWorkout - Re-render callback
     * @param {Function} onGetCurrentWorkout - Returns current workout object
     */
    constructor(cardElement, sessionService, onAutoSave, onRenderWorkout, onGetCurrentWorkout) {
        this.cardElement = cardElement;
        this.sessionService = sessionService;
        this.onAutoSave = onAutoSave;
        this.onRenderWorkout = onRenderWorkout;
        this.onGetCurrentWorkout = onGetCurrentWorkout || (() => null);
        this.exerciseName = cardElement.dataset.exerciseName;
        this.isEditActive = false;

        this._bindElements();
        this._attachListeners();
    }

    /** Cache DOM references */
    _bindElements() {
        this.displayContainer = this.cardElement.querySelector('.activity-fields-display');
        this.editorContainer = this.cardElement.querySelector('.activity-fields-editor');
        this.saveBtn = this.cardElement.querySelector('.activity-unified-save-btn');
        this.cancelBtn = this.cardElement.querySelector('.activity-unified-cancel-btn');
        this.unifiedActions = this.cardElement.querySelector('.activity-unified-actions');
    }

    /** Attach event listeners */
    _attachListeners() {
        // Click-to-edit on display fields
        if (this.displayContainer) {
            this.displayContainer.addEventListener('click', (e) => {
                e.stopPropagation();
                this.enterEditMode();
            });
        }

        // Custom event from pen icon
        this.cardElement.addEventListener('enterActivityEditMode', (e) => {
            this.enterEditMode();
        });

        this.cardElement.addEventListener('cancelActivityEditMode', (e) => {
            this.cancelChanges();
        });

        // Save / Cancel buttons
        if (this.saveBtn) {
            this.saveBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.saveChanges();
            });
        }
        if (this.cancelBtn) {
            this.cancelBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.cancelChanges();
            });
        }

        // Keyboard shortcuts inside editors
        if (this.editorContainer) {
            this.editorContainer.addEventListener('keydown', (e) => {
                if (!this.isEditActive) return;
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.saveChanges();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    this.cancelChanges();
                }
            });
        }
    }

    /** Enter inline edit mode */
    enterEditMode() {
        if (this.isEditActive) return;

        // Block if completed
        if (this.cardElement.classList.contains('logged')) {
            if (window.showAlert) {
                window.showAlert('Uncomplete this activity first to make changes', 'warning');
            }
            return;
        }

        // Expand card
        if (!this.cardElement.classList.contains('expanded')) {
            this.cardElement.classList.add('expanded');
        }

        this.isEditActive = true;
        this.cardElement.classList.add('activity-edit-active');

        if (this.displayContainer) this.displayContainer.style.display = 'none';
        if (this.editorContainer) this.editorContainer.style.display = 'block';
        if (this.unifiedActions) this.unifiedActions.style.display = 'flex';

        // Focus first visible input
        const firstInput = this.editorContainer?.querySelector('input:not([style*="display: none"])');
        if (firstInput) {
            setTimeout(() => firstInput.focus(), 50);
        }
    }

    /** Exit edit mode (shared cleanup) */
    _exitEditMode() {
        this.isEditActive = false;
        this.cardElement.classList.remove('activity-edit-active');

        if (this.displayContainer) this.displayContainer.style.display = '';
        if (this.editorContainer) this.editorContainer.style.display = 'none';
        if (this.unifiedActions) this.unifiedActions.style.display = 'none';
    }

    /** Gather field values from the editor inputs */
    _gatherValues() {
        const val = (sel) => {
            const el = this.editorContainer?.querySelector(sel);
            return el ? el.value.trim() : '';
        };

        const numOrNull = (sel) => {
            const v = val(sel);
            const n = parseFloat(v);
            return isNaN(n) ? null : n;
        };

        return {
            duration_minutes: numOrNull('.activity-edit-duration'),
            distance: numOrNull('.activity-edit-distance'),
            distance_unit: val('.activity-edit-distance-unit') || 'mi',
            target_pace: val('.activity-edit-pace') || null,
            target_rpe: numOrNull('.activity-edit-rpe'),
            target_heart_rate: numOrNull('.activity-edit-hr'),
            target_calories: numOrNull('.activity-edit-calories'),
            notes: val('.activity-edit-notes') || null
        };
    }

    /** Save inline edits */
    async saveChanges() {
        const values = this._gatherValues();

        // Merge with existing config to preserve fields we don't show inline
        // (activity_type, activity_details, elevation, etc.)
        const existing = this._getCurrentConfig();
        const merged = { ...existing, ...values };

        // Remove null values so they don't override existing non-null ones
        // unless user explicitly cleared them
        Object.keys(values).forEach(k => {
            if (values[k] === null) {
                // Check if user cleared a previously set value
                const input = this.editorContainer?.querySelector(`[data-field="${k}"]`);
                if (input && input.value === '') {
                    merged[k] = null;
                }
            }
        });

        this.sessionService.updateActivityDetails(this.exerciseName, merged);
        this._exitEditMode();

        try {
            await this.onAutoSave();
        } catch (err) {
            console.error('Failed to auto-save activity edits:', err);
        }

        // Re-render to show updated values
        this.onRenderWorkout();

        const Registry = window.ActivityTypeRegistry;
        const name = Registry?.getName(this.exerciseName) || 'Activity';
        if (window.showAlert) {
            window.showAlert(`${name} updated`, 'success');
        }
    }

    /** Cancel edits and revert */
    cancelChanges() {
        // Reset inputs to current config values
        const config = this._getDisplayConfig();
        this._populateEditorFields(config);
        this._exitEditMode();
    }

    /** Get the effective config (session override or template) */
    _getCurrentConfig() {
        const sessionConfig = this.sessionService?.getActivitySessionConfig?.(this.exerciseName);
        if (sessionConfig) return { ...sessionConfig };

        // Fall back to template config
        const workout = this.onGetCurrentWorkout();
        const group = workout?.exercise_groups?.find(g =>
            g.group_type === 'cardio' && g.exercises?.a === this.exerciseName
        );
        return { ...(group?.cardio_config || {}) };
    }

    /** Get the display config (same logic as render) */
    _getDisplayConfig() {
        return this._getCurrentConfig();
    }

    /** Populate editor fields from config */
    _populateEditorFields(config) {
        const set = (sel, val) => {
            const el = this.editorContainer?.querySelector(sel);
            if (el) el.value = val ?? '';
        };
        set('.activity-edit-duration', config.duration_minutes || '');
        set('.activity-edit-distance', config.distance || '');
        set('.activity-edit-distance-unit', config.distance_unit || 'mi');
        set('.activity-edit-pace', config.target_pace || '');
        set('.activity-edit-rpe', config.target_rpe || '');
        set('.activity-edit-hr', config.target_heart_rate || '');
        set('.activity-edit-calories', config.target_calories || '');
        set('.activity-edit-notes', config.notes || '');
    }
}

// Export globally
window.ActivityFieldController = ActivityFieldController;
