/**
 * Workout Mode Action Manager
 * Routes data-action button clicks to controller methods via event delegation.
 * Also manages the kebab settings menu.
 * @version 3.0.0
 * @date 2026-03-19
 */

class WorkoutModeFabManager {
    constructor() {
        this._initialized = false;

        // Action map: data-action value → handler
        this._actions = {
            'end':           () => window.workoutModeController?.handleCompleteWorkout(),
            'add-exercise':  () => window.workoutModeController?.showAddExerciseForm(),
            'add-note':      () => window.workoutModeController?.handleAddNote(),
            'reorder':       () => window.workoutModeController?.showReorderOffcanvas(),
            'options':       () => this.openSettingsMenu()
        };

        // Event delegation on document body for all [data-action] clicks
        document.addEventListener('click', (e) => this._handleDelegatedClick(e));

        console.log('🎯 Workout Mode Action Manager created (event delegation active)');
    }

    /**
     * Initialize (idempotent)
     */
    initialize() {
        if (this._initialized) return;
        this._initialized = true;
        console.log('✅ Workout Mode Action Manager initialized');
    }

    /**
     * Delegated click handler — routes [data-action] clicks
     * @param {Event} e - Click event
     * @private
     */
    async _handleDelegatedClick(e) {
        const actionEl = e.target.closest('[data-action]');
        if (!actionEl) return;

        const action = actionEl.dataset.action;
        const handler = this._actions[action];
        if (!handler) return;

        try {
            await handler();
        } catch (error) {
            console.error(`❌ Action "${action}" failed:`, error);
        }
    }

    /**
     * Open options menu offcanvas (triggered from bottom bar ••• button)
     */
    openSettingsMenu() {
        if (!window.UnifiedOffcanvasFactory) {
            console.error('❌ UnifiedOffcanvasFactory not loaded');
            return;
        }

        const restTimerEnabled = localStorage.getItem('workoutRestTimerEnabled') !== 'false';
        const soundEnabled = localStorage.getItem('workoutSoundEnabled') !== 'false';
        const isBuildMode = window.workoutModeController?.isBuildMode || false;

        const menuItems = [
            {
                type: 'toggle',
                icon: 'bx-time-five',
                title: 'Rest Timer',
                description: 'Show rest timer between sets',
                checked: restTimerEnabled,
                storageKey: 'workoutRestTimerEnabled',
                onChange: (enabled) => {
                    if (window.globalRestTimer) window.globalRestTimer.setEnabled(enabled);
                }
            },
            {
                type: 'toggle',
                icon: soundEnabled ? 'bx-volume-full' : 'bx-volume-mute',
                title: 'Sound',
                description: 'Play sounds for timer alerts',
                checked: soundEnabled,
                storageKey: 'workoutSoundEnabled',
                onChange: (enabled) => {
                    if (window.workoutModeController) {
                        window.workoutModeController.soundEnabled = enabled;
                    }
                }
            },
            { type: 'divider' },
            {
                icon: 'bx-note',
                title: 'Add Note',
                description: 'Add a note to this session',
                onClick: () => window.workoutModeController?.handleAddNote()
            },
            {
                icon: 'bx-run',
                title: 'Add Activity',
                description: 'Log cardio or other activity',
                onClick: () => {
                    window.location.href = 'activity-log.html?returnTo=workout-mode';
                }
            },
            {
                icon: 'bx-sort',
                title: 'Reorder Exercises',
                description: 'Change exercise order',
                onClick: () => window.workoutModeController?.showReorderOffcanvas()
            }
        ];

        // Show "Save as Template" only in build-as-you-go mode
        if (isBuildMode) {
            menuItems.push({
                icon: 'bx-save',
                title: 'Save as Template',
                description: 'Save exercises as a reusable workout',
                onClick: () => {
                    if (window.workoutModeController?.handleSaveAsTemplate) {
                        window.workoutModeController.handleSaveAsTemplate();
                    }
                }
            });
        }

        menuItems.push(
            { type: 'divider' },
            {
                icon: 'bx-x-circle',
                title: 'Discard Session',
                description: 'Cancel without saving',
                variant: 'danger',
                onClick: () => {
                    if (window.workoutModeController?.handleCancelWorkout) {
                        window.workoutModeController.handleCancelWorkout();
                    }
                }
            }
        );

        window.UnifiedOffcanvasFactory.createMenuOffcanvas({
            id: 'workoutModeSettingsOffcanvas',
            title: 'Workout Options',
            icon: 'bx-dots-horizontal-rounded',
            menuItems
        });
    }
}

// Make globally available
window.WorkoutModeFabManager = WorkoutModeFabManager;

console.log('📦 Workout Mode Action Manager loaded');
