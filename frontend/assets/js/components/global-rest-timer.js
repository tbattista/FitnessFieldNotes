/**
 * Ghost Gym - Global Rest Timer Component
 * Renders rest timer inside the bottom bar, above the action buttons.
 * @version 2.0.0
 * @date 2026-03-26
 */

/**
 * Global Rest Timer Class
 * Extends the base RestTimer with bottom-bar inline UI
 */
class GlobalRestTimer extends RestTimer {
    constructor() {
        super('global-rest-timer', 60); // Default 60 seconds, will be updated from workout
        this.currentExerciseIndex = null;
        this.isExpanded = false;
        this.floatingElement = null;
        // Load enabled state from localStorage (default: true)
        this.enabled = localStorage.getItem('workoutRestTimerEnabled') !== 'false';
    }

    /**
     * Set enabled state
     * @param {boolean} enabled - Whether rest timer is enabled
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        localStorage.setItem('workoutRestTimerEnabled', enabled);

        console.log(`🕐 Rest timer ${enabled ? 'enabled' : 'disabled'}`);

        // If disabled while running, reset
        if (!enabled && (this.state === 'counting' || this.state === 'paused')) {
            this.reset();
        }

        // Update visibility
        this.updateVisibility();
    }

    /**
     * Check if timer is enabled
     * @returns {boolean} Whether timer is enabled
     */
    isEnabled() {
        return this.enabled;
    }

    /**
     * Update visibility based on enabled state
     */
    updateVisibility() {
        const timerContainer = document.getElementById('globalRestTimerButton');
        if (timerContainer) {
            timerContainer.style.display = this.enabled ? 'flex' : 'none';
        }
    }

    /**
     * Sync with the currently expanded exercise card
     * @param {number} exerciseIndex - Index of the expanded exercise
     * @param {number} restSeconds - Rest time for this exercise
     */
    syncWithCard(exerciseIndex, restSeconds) {
        this.currentExerciseIndex = exerciseIndex;
        this.totalSeconds = restSeconds;

        if (this.state === 'counting' || this.state === 'paused') {
            // Reset timer if it was running for a different exercise
            this.reset();
        } else {
            // In ready/done state, update remainingSeconds so display reflects new time
            this.remainingSeconds = restSeconds;
        }

        // Always render if enabled so the display updates
        if (this.enabled) {
            this.render();
        }
    }

    /**
     * Override start method to check enabled state and notify timer manager
     */
    start() {
        if (!this.enabled) {
            console.log('🕐 Rest timer is disabled, not starting');
            return;
        }

        // Notify timer manager to stop all other timers (single-timer enforcement)
        if (window.workoutModeController?.timerManager) {
            window.workoutModeController.timerManager.notifyGlobalTimerStart();
        }

        super.start();
    }

    /**
     * Render timer inside the bottom bar row
     */
    render() {
        this.floatingElement = document.getElementById('globalRestTimerButton');
        if (!this.floatingElement) return;

        const container = this.floatingElement;

        // Clear existing content
        container.innerHTML = '';

        switch (this.state) {
            case 'ready':
                this.renderReadyState(container);
                break;
            case 'counting':
                this.renderCountingState(container);
                break;
            case 'paused':
                this.renderPausedState(container);
                break;
            case 'done':
                this.renderDoneState(container);
                break;
        }
    }

    /**
     * Render ready state - time display on left, start button on right
     */
    renderReadyState(container) {
        const timeDisplay = this.formatTime(this.totalSeconds);

        container.innerHTML = `
            <span class="wm-timer-time-display" onclick="event.stopPropagation(); window.globalRestTimer.showTimeEdit();" title="Tap to edit rest time">
                <i class="bx bx-time-five me-1"></i>${timeDisplay}
            </span>
            <button class="btn btn-sm btn-outline-success wm-timer-start-btn" onclick="window.globalRestTimer.start()">
                <i class="bx bx-play me-1"></i>Start Rest
            </button>
        `;
    }

    /**
     * Show inline time editor
     */
    showTimeEdit() {
        const container = document.getElementById('globalRestTimerButton');
        if (!container) return;

        const currentSeconds = this.totalSeconds;
        container.innerHTML = `
            <div class="wm-timer-edit-row">
                <input type="number" class="wm-timer-edit-input" id="globalTimerEditInput"
                       value="${currentSeconds}" min="5" max="600" step="5"
                       onclick="event.stopPropagation();"
                       onkeydown="if(event.key==='Enter') window.globalRestTimer.applyTimeEdit();">
                <span class="wm-timer-edit-unit">sec</span>
                <button class="btn btn-sm btn-success wm-timer-edit-btn" onclick="window.globalRestTimer.applyTimeEdit();">
                    <i class="bx bx-check"></i>
                </button>
                <button class="btn btn-sm btn-outline-secondary wm-timer-edit-btn" onclick="window.globalRestTimer.render();">
                    <i class="bx bx-x"></i>
                </button>
            </div>
        `;

        const input = document.getElementById('globalTimerEditInput');
        if (input) {
            input.focus();
            input.select();
        }
    }

    /**
     * Apply edited time value
     */
    applyTimeEdit() {
        const input = document.getElementById('globalTimerEditInput');
        if (!input) return;

        const newSeconds = Math.max(5, Math.min(600, parseInt(input.value) || 60));
        this.totalSeconds = newSeconds;
        this.remainingSeconds = newSeconds;
        this.render();
    }

    /**
     * Render counting state - shows countdown with pause button
     */
    renderCountingState(container) {
        const warningClass = this.remainingSeconds <= 5 ? 'danger' : (this.remainingSeconds <= 10 ? 'warning' : 'primary');
        const timeDisplay = this.formatTime(this.remainingSeconds);

        container.innerHTML = `
            <div class="wm-timer-countdown wm-timer-countdown--${warningClass}">
                <span class="wm-timer-countdown-time">${timeDisplay}</span>
                <span class="wm-timer-countdown-label">rest remaining</span>
            </div>
            <button class="btn btn-sm btn-outline-secondary wm-timer-action-btn" onclick="window.globalRestTimer.pause()">
                <i class="bx bx-pause"></i>
            </button>
            <button class="btn btn-sm btn-outline-secondary wm-timer-action-btn" onclick="window.globalRestTimer.reset()">
                <i class="bx bx-reset"></i>
            </button>
        `;
    }

    /**
     * Render paused state - shows time with resume and reset
     */
    renderPausedState(container) {
        const timeDisplay = this.formatTime(this.remainingSeconds);

        container.innerHTML = `
            <div class="wm-timer-countdown wm-timer-countdown--warning">
                <span class="wm-timer-countdown-time">${timeDisplay}</span>
                <span class="wm-timer-countdown-label">paused</span>
            </div>
            <button class="btn btn-sm btn-success wm-timer-action-btn" onclick="window.globalRestTimer.resume()">
                <i class="bx bx-play"></i>
            </button>
            <button class="btn btn-sm btn-outline-secondary wm-timer-action-btn" onclick="window.globalRestTimer.reset()">
                <i class="bx bx-reset"></i>
            </button>
        `;
    }

    /**
     * Render done state - shows completion with restart option
     */
    renderDoneState(container) {
        container.innerHTML = `
            <div class="wm-timer-countdown wm-timer-countdown--success">
                <span class="wm-timer-countdown-time">Done!</span>
                <span class="wm-timer-countdown-label">rest complete</span>
            </div>
            <button class="btn btn-sm btn-outline-secondary wm-timer-action-btn" onclick="window.globalRestTimer.reset()">
                <i class="bx bx-reset"></i> Reset
            </button>
        `;
    }

    /**
     * Override complete method to add visual feedback
     */
    complete() {
        super.complete();

        // Add pulse animation to draw attention
        if (this.floatingElement) {
            this.floatingElement.classList.add('timer-complete-pulse');
            setTimeout(() => {
                this.floatingElement.classList.remove('timer-complete-pulse');
            }, 2000);
        }
    }

    /**
     * Check if timer is currently active (counting or paused)
     */
    isActive() {
        return this.state === 'counting' || this.state === 'paused';
    }

    /**
     * Get current exercise index
     */
    getCurrentExerciseIndex() {
        return this.currentExerciseIndex;
    }

    /**
     * Initialize the timer element inside bottom bar
     */
    initialize() {
        const container = document.getElementById('globalRestTimerButton');
        if (container) {
            console.log('✅ Global rest timer found in bottom bar');
            this.updateVisibility();
            if (this.enabled) {
                this.render();
            }
        } else {
            console.warn('⚠️ Global rest timer container not found');
        }
    }

    /**
     * Cleanup method
     */
    destroy() {
        this.stopCountdown();
    }
}

/**
 * Export the GlobalRestTimer class
 */
window.GlobalRestTimer = GlobalRestTimer;

console.log('📦 Global Rest Timer component loaded');
