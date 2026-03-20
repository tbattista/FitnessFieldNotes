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
     * Open settings menu offcanvas (triggered from header options button)
     */
    openSettingsMenu() {
        if (!window.UnifiedOffcanvasFactory) {
            console.error('❌ UnifiedOffcanvasFactory not loaded');
            return;
        }

        const restTimerEnabled = localStorage.getItem('workoutRestTimerEnabled') !== 'false';
        const soundEnabled = localStorage.getItem('workoutSoundEnabled') !== 'false';

        window.UnifiedOffcanvasFactory.createMenuOffcanvas({
            id: 'workoutModeSettingsOffcanvas',
            title: 'Workout Settings',
            icon: 'bx-cog',
            menuItems: [
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
                    icon: 'bx-share-alt',
                    title: 'Share Workout',
                    description: 'Share publicly or create private link',
                    onClick: () => {
                        if (window.workoutModeController?.initializeShareButton) {
                            window.workoutModeController.initializeShareButton();
                        }
                    }
                },
                {
                    icon: 'bx-edit',
                    title: 'Edit Workout',
                    description: 'Modify workout template',
                    onClick: () => {
                        if (window.workoutModeController?.handleEditWorkout) {
                            window.workoutModeController.handleEditWorkout();
                        }
                    }
                },
                {
                    icon: 'bx-refresh',
                    title: 'Change Workout',
                    description: 'Switch to different workout',
                    onClick: () => {
                        if (window.workoutModeController?.handleChangeWorkout) {
                            window.workoutModeController.handleChangeWorkout();
                        }
                    }
                },
                {
                    icon: 'bx-x-circle',
                    title: 'Cancel Workout',
                    description: 'Discard session and exit',
                    variant: 'danger',
                    onClick: () => {
                        if (window.workoutModeController?.handleCancelWorkout) {
                            window.workoutModeController.handleCancelWorkout();
                        }
                    }
                }
            ]
        });
    }
}

// Make globally available
window.WorkoutModeFabManager = WorkoutModeFabManager;

console.log('📦 Workout Mode Action Manager loaded');
