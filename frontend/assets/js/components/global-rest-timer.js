/**
 * Ghost Gym - Global Rest Timer Component
 * Extends RestTimer functionality for global floating button
 * @version 1.1.0
 * @date 2026-01-06
 */

/**
 * Global Rest Timer Class
 * Extends the base RestTimer with morphing UI and global state management
 */
class GlobalRestTimer extends RestTimer {
    constructor() {
        super('global-rest-timer', 60); // Default 60 seconds, will be updated from workout
        this.currentExerciseIndex = null;
        this.isExpanded = false;
        this.floatingElement = null;
        this.morphStates = {
            ready: 'Rest {time}',
            counting: '{time}',
            paused: '{time}',
            done: 'Done!'
        };
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
        
        // Reset timer if it was running for a different exercise
        if (this.state === 'counting' || this.state === 'paused') {
            this.reset();
        }
        
        // Only render if enabled
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
     * Override render method for floating button UI
     */
    render() {
        this.floatingElement = document.getElementById('globalRestTimerButton');
        if (!this.floatingElement) return;

        const container = this.floatingElement;
        const isMobile = window.innerWidth < 768;
        
        // Clear existing content
        container.innerHTML = '';
        container.className = 'global-rest-timer-button';
        
        switch (this.state) {
            case 'ready':
                this.renderReadyState(container, isMobile);
                break;
            case 'counting':
                this.renderCountingState(container, isMobile);
                break;
            case 'paused':
                this.renderPausedState(container, isMobile);
                break;
            case 'done':
                this.renderDoneState(container, isMobile);
                break;
        }
    }

    /**
     * Render ready state - shows "Rest {time}" button with editable time
     */
    renderReadyState(container, isMobile) {
        container.classList.add('ready');
        const timeDisplay = this.formatTime(this.totalSeconds);

        container.innerHTML = `
            <button class="btn btn-primary global-timer-btn" onclick="window.globalRestTimer.start()">
                <i class="bx bx-time-five me-1"></i>
                <span>Rest</span>
            </button>
            <span class="global-timer-edit-time" onclick="event.stopPropagation(); window.globalRestTimer.showTimeEdit();" title="Tap to edit rest time">${timeDisplay}</span>
        `;
    }

    /**
     * Show inline time editor
     */
    showTimeEdit() {
        const container = document.getElementById('globalRestTimerButton');
        if (!container) return;

        const currentSeconds = this.totalSeconds;
        const editHtml = `
            <div class="global-timer-edit-container">
                <input type="number" class="global-timer-edit-input" id="globalTimerEditInput"
                       value="${currentSeconds}" min="5" max="600" step="5"
                       onclick="event.stopPropagation();"
                       onkeydown="if(event.key==='Enter') window.globalRestTimer.applyTimeEdit();">
                <span class="global-timer-edit-unit">sec</span>
                <button class="btn btn-sm btn-success global-timer-edit-save" onclick="window.globalRestTimer.applyTimeEdit();">
                    <i class="bx bx-check"></i>
                </button>
                <button class="btn btn-sm btn-outline-secondary global-timer-edit-cancel" onclick="window.globalRestTimer.render();">
                    <i class="bx bx-x"></i>
                </button>
            </div>
        `;

        container.innerHTML = editHtml;
        container.className = 'global-rest-timer-button editing';

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
     * Render counting state - shows countdown with pause option
     */
    renderCountingState(container, isMobile) {
        container.classList.add('counting');
        
        const displayClass = this.remainingSeconds <= 5 ? 'text-danger' : 'text-primary';
        
        const timeDisplay = this.formatTime(this.remainingSeconds);
        
        if (isMobile) {
            // Mobile: compact countdown with pause button on right
            container.innerHTML = `
                <div class="global-timer-countdown-mobile">
                    <div class="global-timer-time ${displayClass}">${timeDisplay}</div>
                    <button class="btn btn-outline-secondary global-timer-pause-btn ms-2" onclick="window.globalRestTimer.pause()">
                        <i class="bx bx-pause"></i>
                    </button>
                </div>
            `;
        } else {
            // Desktop: larger countdown with pause button on right
            container.innerHTML = `
                <div class="global-timer-countdown">
                    <div class="global-timer-time ${displayClass}">${timeDisplay}</div>
                    <button class="btn btn-outline-secondary global-timer-pause-btn ms-2" onclick="window.globalRestTimer.pause()">
                        <i class="bx bx-pause"></i>
                    </button>
                </div>
            `;
        }
    }

    /**
     * Render paused state - shows countdown with reset and resume buttons
     */
    renderPausedState(container, isMobile) {
        container.classList.add('paused');
        
        const timeDisplay = this.formatTime(this.remainingSeconds);
        
        if (isMobile) {
            // Mobile: compact layout with reset/resume buttons on right
            container.innerHTML = `
                <div class="global-timer-paused-mobile">
                    <div class="global-timer-time text-primary">${timeDisplay}</div>
                    <div class="global-timer-controls ms-2">
                        <button class="btn btn-outline-secondary btn-sm" onclick="window.globalRestTimer.reset()">
                            <i class="bx bx-reset"></i>
                        </button>
                        <button class="btn btn-primary btn-sm ms-1" onclick="window.globalRestTimer.resume()">
                            <i class="bx bx-play"></i>
                        </button>
                    </div>
                </div>
            `;
        } else {
            // Desktop: larger layout with reset/resume buttons on right
            container.innerHTML = `
                <div class="global-timer-paused">
                    <div class="global-timer-time text-primary">${timeDisplay}</div>
                    <div class="global-timer-controls ms-2">
                        <button class="btn btn-outline-secondary" onclick="window.globalRestTimer.reset()">
                            <i class="bx bx-reset me-1"></i>Reset
                        </button>
                        <button class="btn btn-primary ms-1" onclick="window.globalRestTimer.resume()">
                            <i class="bx bx-play me-1"></i>Resume
                        </button>
                    </div>
                </div>
            `;
        }
    }

    /**
     * Render done state - shows completion with restart option
     */
    renderDoneState(container, isMobile) {
        container.classList.add('done');
        
        const buttonText = isMobile ? '✓' : 'Done!';
        
        container.innerHTML = `
            <button class="btn btn-primary global-timer-btn" onclick="window.globalRestTimer.reset()">
                <i class="bx bx-check-circle me-${isMobile ? '0' : '1'}"></i>
                <span class="${isMobile ? 'd-none' : ''}">${buttonText}</span>
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
     * Initialize the floating button element
     */
    initialize() {
        // The button is now created by bottom-action-bar-service.js
        // Just ensure it exists and render initial state
        const container = document.getElementById('globalRestTimerButton');
        if (container) {
            console.log('✅ Global rest timer button found in DOM');
            this.updateVisibility();
            if (this.enabled) {
                this.render();
            }
        } else {
            console.warn('⚠️ Global rest timer button not found - will be created by bottom action bar service');
        }
    }

    /**
     * Cleanup method
     */
    destroy() {
        this.stopCountdown();
        const element = document.getElementById('globalRestTimerButton');
        if (element) {
            element.remove();
        }
    }
}

/**
 * Export the GlobalRestTimer class
 */
window.GlobalRestTimer = GlobalRestTimer;

console.log('📦 Global Rest Timer component loaded');