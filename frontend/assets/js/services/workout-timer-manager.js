/**
 * Ghost Gym - Workout Timer Manager
 * Consolidates all timer functionality for workout mode
 * @version 1.0.0
 * @date 2025-01-05
 */

class WorkoutTimerManager {
    /**
     * @param {Object} sessionService - Workout session service instance
     */
    constructor(sessionService) {
        this.sessionService = sessionService;
        this.timers = {}; // Individual exercise rest timers
        this.inlineTimers = {}; // Inline rest timers in exercise cards
        this.globalRestTimer = null; // Global rest timer from bottom action bar
        this.sessionTimerInterval = null; // Session elapsed time interval
        this.activeTimerType = null; // 'global', 'inline-{index}', or null
        this.activeTimerId = null; // ID of currently running timer
        
        console.log('⏱️ Workout Timer Manager initialized');
    }
    
    /**
     * Update timer display
     * Formats as H:MM:SS when over 1 hour, otherwise MM:SS
     */
    updateTimerDisplay() {
        const session = this.sessionService.getCurrentSession();
        if (!session) return;
        
        const elapsed = Math.floor((Date.now() - session.startedAt.getTime()) / 1000);
        const hours = Math.floor(elapsed / 3600);
        const minutes = Math.floor((elapsed % 3600) / 60);
        const seconds = elapsed % 60;
        
        // Format as H:MM:SS when >= 1 hour, otherwise MM:SS
        let timeStr;
        if (hours > 0) {
            timeStr = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        } else {
            timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        
        const headerTimer = document.getElementById('headerTimer');
        if (headerTimer) {
            headerTimer.textContent = timeStr;
        }
    }
    
    // ==================== Session Timer ====================
    
    /**
     * Start session timer to track workout duration
     * ✅ BEST PRACTICE: Uses centralized updateTimerDisplay with pause guards
     */
    startSessionTimer() {
        const session = this.sessionService.getCurrentSession();
        if (!session) return;
        
        if (this.sessionTimerInterval) {
            clearInterval(this.sessionTimerInterval);
        }
        
        // Timer updates every second, but respects pause state
        this.sessionTimerInterval = setInterval(() => {
            this.updateTimerDisplay();
        }, 1000);
        
        // Initial display update
        this.updateTimerDisplay();
    }
    
    /**
     * Stop session timer
     */
    stopSessionTimer() {
        if (this.sessionTimerInterval) {
            clearInterval(this.sessionTimerInterval);
            this.sessionTimerInterval = null;
        }
        
        const headerTimer = document.getElementById('headerTimer');
        if (headerTimer) headerTimer.textContent = '00:00';
    }
    
    /**
     * Get elapsed time in seconds
     * @returns {number} Elapsed seconds or 0 if no session
     */
    getElapsedTime() {
        const session = this.sessionService.getCurrentSession();
        if (!session) return 0;
        
        return Math.floor((Date.now() - session.startedAt.getTime()) / 1000);
    }
    
    // ==================== Rest Timers ====================
    
    /**
     * Initialize individual exercise card rest timers
     */
    initializeCardTimers() {
        const timerElements = document.querySelectorAll('.rest-timer[data-timer-id]');
        
        timerElements.forEach(element => {
            const timerId = element.getAttribute('data-timer-id');
            const restSeconds = parseInt(element.getAttribute('data-rest-seconds')) || 60;
            
            // Use existing RestTimer class from workout-mode.js
            const timer = new RestTimer(timerId, restSeconds);
            this.timers[timerId] = timer;
            timer.render();
        });
    }
    
    /**
     * Initialize global rest timer (from bottom action bar)
     */
    initializeGlobalTimer() {
        // Wait for global rest timer to be available from bottom action bar service
        if (window.globalRestTimer) {
            this.globalRestTimer = window.globalRestTimer;
            console.log('✅ Global rest timer connected to timer manager');
            
            return true;
        } else {
            // Try again after a short delay
            setTimeout(() => {
                if (window.globalRestTimer) {
                    this.globalRestTimer = window.globalRestTimer;
                    console.log('✅ Global rest timer connected to timer manager (delayed)');
                } else {
                    console.warn('⚠️ Global rest timer still not available after delay');
                }
            }, 500);
            
            return false;
        }
    }
    
    /**
     * Sync global timer with currently expanded exercise card
     * @param {number} exerciseIndex - Index of expanded exercise
     * @param {number} restSeconds - Rest time in seconds
     */
    syncWithExpandedCard(exerciseIndex, restSeconds) {
        if (!this.globalRestTimer) {
            console.warn('⚠️ Global rest timer not available for sync');
            return;
        }
        
        this.globalRestTimer.syncWithCard(exerciseIndex, restSeconds);
        console.log(`🔄 Global timer synced with exercise ${exerciseIndex}: ${restSeconds}s`);
    }
    
    /**
     * Connect to global rest timer instance
     * @param {Object} globalRestTimer - Global rest timer instance
     */
    connectGlobalTimer(globalRestTimer) {
        this.globalRestTimer = globalRestTimer;
        console.log('✅ Global rest timer manually connected');
    }
    
    /**
     * Get individual timer by ID
     * @param {string} timerId - Timer ID
     * @returns {Object|null} Timer instance or null
     */
    getTimer(timerId) {
        return this.timers[timerId] || null;
    }
    
    /**
     * Clear all timers
     */
    clearAllTimers() {
        // Clear session timer
        this.stopSessionTimer();
        
        // Clear individual rest timers
        Object.values(this.timers).forEach(timer => {
            if (timer && timer.stop) {
                timer.stop();
            }
        });
        
        this.timers = {};
    }
    
    // ==================== Inline Timer Management ====================
    
    /**
     * Register an inline timer instance
     * @param {number} exerciseIndex - Exercise index the timer belongs to
     * @param {Object} timer - InlineRestTimer instance
     */
    registerInlineTimer(exerciseIndex, timer) {
        const timerId = `inline-${exerciseIndex}`;
        this.inlineTimers[timerId] = timer;
        
        // Set up callback for single-timer enforcement
        timer.onTimerStart = () => {
            this.handleTimerStart('inline', exerciseIndex);
        };
        
        console.log(`📝 Registered inline timer for exercise ${exerciseIndex}`);
    }
    
    /**
     * Unregister an inline timer instance
     * @param {number} exerciseIndex - Exercise index
     */
    unregisterInlineTimer(exerciseIndex) {
        const timerId = `inline-${exerciseIndex}`;
        if (this.inlineTimers[timerId]) {
            delete this.inlineTimers[timerId];
            console.log(`🗑️ Unregistered inline timer for exercise ${exerciseIndex}`);
        }
    }
    
    /**
     * Get inline timer by exercise index
     * @param {number} exerciseIndex - Exercise index
     * @returns {Object|null} InlineRestTimer instance or null
     */
    getInlineTimer(exerciseIndex) {
        return this.inlineTimers[`inline-${exerciseIndex}`] || null;
    }
    
    /**
     * Handle timer start - enforce single-timer rule
     * @param {string} timerType - 'global' or 'inline'
     * @param {number|null} exerciseIndex - Exercise index for inline timers
     */
    handleTimerStart(timerType, exerciseIndex = null) {
        const newTimerId = timerType === 'global' ? 'global' : `inline-${exerciseIndex}`;
        
        console.log(`🎯 Timer started: ${newTimerId}, stopping all others...`);
        
        // Stop global timer if it's not the one starting
        if (newTimerId !== 'global' && this.globalRestTimer) {
            if (this.globalRestTimer.state === 'counting' || this.globalRestTimer.state === 'paused') {
                this.globalRestTimer.reset();
                console.log('⏹️ Stopped global rest timer');
            }
        }
        
        // Stop all other inline timers
        Object.entries(this.inlineTimers).forEach(([id, timer]) => {
            if (id !== newTimerId && timer) {
                if (timer.state === 'counting' || timer.state === 'paused') {
                    timer.reset();
                    console.log(`⏹️ Stopped inline timer: ${id}`);
                }
            }
        });
        
        // Update active timer tracking
        this.activeTimerType = timerType;
        this.activeTimerId = newTimerId;
    }
    
    /**
     * Notify manager when global timer starts (called from GlobalRestTimer)
     */
    notifyGlobalTimerStart() {
        this.handleTimerStart('global');
    }
    
    /**
     * Clear all inline timers
     */
    clearAllInlineTimers() {
        Object.values(this.inlineTimers).forEach(timer => {
            if (timer && timer.reset) {
                timer.reset();
            }
        });
        this.inlineTimers = {};
        console.log('🧹 Cleared all inline timers');
    }
    
    // ==================== Event Callbacks ====================
    
    /**
     * Register callback for timer tick events
     * @param {Function} callback - Callback function
     */
    onTimerTick(callback) {
        this.timerTickCallback = callback;
    }
    
    /**
     * Register callback for rest timer complete events
     * @param {Function} callback - Callback function
     */
    onRestComplete(callback) {
        this.restCompleteCallback = callback;
    }
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WorkoutTimerManager;
}

console.log('📦 Workout Timer Manager loaded');
