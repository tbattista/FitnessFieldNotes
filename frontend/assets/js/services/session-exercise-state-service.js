/**
 * Ghost Gym - Session Exercise State Service
 * Manages exercise state mutations, auto-complete timers, and weight direction
 * Extracted from WorkoutSessionService for single responsibility
 * @version 1.0.0
 * @date 2026-02-14
 */

class SessionExerciseStateService {
    constructor(options = {}) {
        // Auto-complete timer state
        this.exerciseStartTimes = {};
        this.autoCompleteTimers = {};

        // Callbacks for session service coordination
        this.onGetCurrentSession = options.onGetCurrentSession || (() => null);
        this.onGetExerciseHistory = options.onGetExerciseHistory || (() => ({}));
        this.onIsSessionActive = options.onIsSessionActive || (() => false);
        this.onNotify = options.onNotify || (() => {});
        this.onPersist = options.onPersist || (() => {});

        console.log('🔧 Session Exercise State Service initialized');
    }

    /**
     * Update exercise weight in current session
     * @param {string} exerciseName - Exercise name
     * @param {number} weight - Weight value
     * @param {string} unit - Weight unit (lbs/kg)
     */
    updateExerciseWeight(exerciseName, weight, unit) {
        const currentSession = this.onGetCurrentSession();
        if (!currentSession) {
            console.warn('No active session to update');
            return;
        }

        if (!currentSession.exercises) {
            currentSession.exercises = {};
        }

        const history = this.onGetExerciseHistory();
        const previousWeight = history[exerciseName]?.last_weight || 0;
        const weightChange = weight - previousWeight;

        const existingData = currentSession.exercises[exerciseName] || {};
        currentSession.exercises[exerciseName] = {
            ...existingData,
            weight: weight,
            weight_unit: unit,
            previous_weight: previousWeight,
            weight_change: weightChange,
            is_modified: true,
            modified_at: new Date().toISOString()
        };

        console.log('💪 Updated weight:', exerciseName, weight, unit);
        this.onNotify('weightUpdated', { exerciseName, weight, unit });
        this.onPersist();
    }

    /**
     * Update exercise details (sets, reps, rest, weight) in current session
     * @param {string} exerciseName - Exercise name
     * @param {Object} details - Updated details
     */
    updateExerciseDetails(exerciseName, details) {
        const currentSession = this.onGetCurrentSession();
        if (!currentSession) {
            console.warn('\u26a0\ufe0f No active session to update');
            return;
        }

        if (!currentSession.exercises) {
            currentSession.exercises = {};
        }

        const history = this.onGetExerciseHistory();
        const previousWeight = history[exerciseName]?.last_weight || 0;

        const existingData = currentSession.exercises[exerciseName] || {};

        const updateData = {
            ...existingData,
            target_sets: details.sets || existingData.target_sets || '3',
            target_reps: details.reps || existingData.target_reps || '8-12',
            rest: details.rest || existingData.rest || '60s',
            is_modified: true,
            modified_at: new Date().toISOString()
        };

        if (details.target_sets_reps !== undefined) {
            updateData.target_sets_reps = details.target_sets_reps;
        }

        if (details.weight !== undefined) {
            const weightValue = parseFloat(details.weight) || 0;
            const weightChange = weightValue - previousWeight;
            updateData.weight = details.weight;
            updateData.weight_unit = details.weightUnit || existingData.weight_unit || 'lbs';
            updateData.previous_weight = previousWeight;
            updateData.weight_change = weightChange;
        } else if (details.weightUnit !== undefined) {
            updateData.weight_unit = details.weightUnit;
        }

        currentSession.exercises[exerciseName] = updateData;

        console.log('\ud83d\udcdd Updated exercise details:', exerciseName, details);
        this.onNotify('exerciseDetailsUpdated', { exerciseName, details });
        this.onPersist();
    }

    /**
     * Update exercise notes in current session
     * @param {string} exerciseName - Exercise name
     * @param {string} notes - Note text
     */
    updateExerciseNotes(exerciseName, notes) {
        const currentSession = this.onGetCurrentSession();
        if (!currentSession) {
            console.warn('⚠️ No active session to update notes');
            return;
        }

        if (!currentSession.exercises) {
            currentSession.exercises = {};
        }

        const existingData = currentSession.exercises[exerciseName] || {};
        currentSession.exercises[exerciseName] = {
            ...existingData,
            notes: notes || null
        };

        console.log('📝 Updated exercise notes:', exerciseName);
        this.onPersist();
    }

    /**
     * Update calories burned for an exercise in current session
     * @param {string} exerciseName - Exercise name
     * @param {number|null} calories - Calories burned value (from smartwatch or manual entry)
     */
    updateExerciseCalories(exerciseName, calories) {
        const currentSession = this.onGetCurrentSession();
        if (!currentSession) {
            console.warn('No active session to update calories');
            return;
        }

        if (!currentSession.exercises) {
            currentSession.exercises = {};
        }

        const existingData = currentSession.exercises[exerciseName] || {};
        currentSession.exercises[exerciseName] = {
            ...existingData,
            calories_burned: calories
        };

        console.log('🔥 Updated calories burned:', exerciseName, calories);
        this.onNotify('caloriesUpdated', { exerciseName, calories });
        this.onPersist();
    }

    /**
     * Update activity (cardio) details in current session
     * Stores session-level overrides without modifying the workout template
     * @param {string} exerciseName - Activity name (activity_type ID)
     * @param {Object} cardioConfig - Updated cardio config from editor
     */
    updateActivityDetails(exerciseName, cardioConfig) {
        const currentSession = this.onGetCurrentSession();
        if (!currentSession) {
            console.warn('No active session to update activity');
            return;
        }

        if (!currentSession.exercises) {
            currentSession.exercises = {};
        }

        const existingData = currentSession.exercises[exerciseName] || {};
        currentSession.exercises[exerciseName] = {
            ...existingData,
            session_cardio_config: cardioConfig,
            is_modified: true,
            modified_at: new Date().toISOString()
        };

        console.log('🏃 Updated activity details:', exerciseName);
        this.onNotify('activityDetailsUpdated', { exerciseName, cardioConfig });
        this.onPersist();
    }

    /**
     * Get session-level cardio config overrides for an activity
     * @param {string} exerciseName - Activity name
     * @returns {Object|null} Session cardio config or null if no overrides
     */
    getActivitySessionConfig(exerciseName) {
        const currentSession = this.onGetCurrentSession();
        return currentSession?.exercises?.[exerciseName]?.session_cardio_config || null;
    }

    /**
     * Update exercise notes before session starts (pre-session edits)
     * @param {string} exerciseName - Exercise name
     * @param {string} notes - Note text
     */
    updatePreSessionNotes(exerciseName, notes) {
        const currentSession = this.onGetCurrentSession();
        if (!currentSession) {
            console.warn('⚠️ No active session to update pre-session notes');
            return;
        }

        if (!currentSession.exercises) {
            currentSession.exercises = {};
        }

        const existingData = currentSession.exercises[exerciseName] || {};
        currentSession.exercises[exerciseName] = {
            ...existingData,
            notes: notes || null
        };

        console.log('📝 Updated pre-session notes:', exerciseName);
        this.onPersist();
    }

    /**
     * Mark exercise as skipped
     * @param {string} exerciseName - Exercise name
     * @param {string} reason - Optional reason for skipping (max 200 chars)
     */
    skipExercise(exerciseName, reason = '') {
        const currentSession = this.onGetCurrentSession();
        if (!currentSession?.exercises) {
            console.warn('\u26a0\ufe0f No active session to skip exercise');
            return;
        }

        const existingData = currentSession.exercises[exerciseName] || {};

        currentSession.exercises[exerciseName] = {
            ...existingData,
            is_skipped: true,
            skip_reason: reason.substring(0, 200),
            skipped_at: new Date().toISOString()
        };

        console.log('\u23ed\ufe0f Exercise skipped:', exerciseName, reason ? `(${reason})` : '');
        this.onNotify('exerciseSkipped', { exerciseName, reason });
        this.onPersist();
    }

    /**
     * Unskip exercise (if user changes mind)
     * @param {string} exerciseName - Exercise name
     */
    unskipExercise(exerciseName) {
        const currentSession = this.onGetCurrentSession();
        if (!currentSession?.exercises?.[exerciseName]) {
            console.warn('\u26a0\ufe0f Exercise not found in session:', exerciseName);
            return;
        }

        currentSession.exercises[exerciseName].is_skipped = false;
        currentSession.exercises[exerciseName].skip_reason = null;
        delete currentSession.exercises[exerciseName].skipped_at;

        console.log('\u21a9\ufe0f Exercise unskipped:', exerciseName);
        this.onNotify('exerciseUnskipped', { exerciseName });
        this.onPersist();
    }

    /**
     * Mark exercise as completed
     * @param {string} exerciseName - Exercise name
     */
    completeExercise(exerciseName) {
        const currentSession = this.onGetCurrentSession();
        if (!currentSession?.exercises) {
            console.warn('\u26a0\ufe0f No active session to complete exercise');
            return;
        }

        const existingData = currentSession.exercises[exerciseName] || {};

        currentSession.exercises[exerciseName] = {
            ...existingData,
            is_completed: true,
            completed_at: new Date().toISOString()
        };

        console.log('\u2705 Exercise completed:', exerciseName);
        this.onNotify('exerciseCompleted', { exerciseName });
        this.onPersist();
    }

    /**
     * Uncomplete exercise (if user changes mind)
     * @param {string} exerciseName - Exercise name
     */
    uncompleteExercise(exerciseName) {
        const currentSession = this.onGetCurrentSession();
        if (!currentSession?.exercises?.[exerciseName]) {
            console.warn('\u26a0\ufe0f Exercise not found in session:', exerciseName);
            return;
        }

        currentSession.exercises[exerciseName].is_completed = false;
        delete currentSession.exercises[exerciseName].completed_at;

        console.log('\u21a9\ufe0f Exercise uncompleted:', exerciseName);
        this.onNotify('exerciseUncompleted', { exerciseName });
        this.onPersist();
    }

    /**
     * Set weight direction indicator for an exercise
     * @param {string} exerciseName - Exercise name
     * @param {string|null} direction - 'up', 'down', 'same', or null to clear
     */
    setWeightDirection(exerciseName, direction) {
        const currentSession = this.onGetCurrentSession();
        if (!currentSession?.exercises) {
            console.warn('\u26a0\ufe0f No active session to set weight direction');
            return;
        }

        const validDirections = ['up', 'down', 'same', null];
        if (!validDirections.includes(direction)) {
            console.error('\u274c Invalid weight direction:', direction);
            return;
        }

        const existingData = currentSession.exercises[exerciseName] || {};
        currentSession.exercises[exerciseName] = {
            ...existingData,
            next_weight_direction: direction,
            direction_set_at: direction ? new Date().toISOString() : null
        };

        const directionIcon = direction === 'up' ? '\u2b06\ufe0f' : direction === 'down' ? '\u2b07\ufe0f' : '\u23f9\ufe0f';
        console.log(`${directionIcon} Weight direction set for ${exerciseName}: ${direction || 'cleared'}`);
        this.onNotify('weightDirectionUpdated', { exerciseName, direction });
        this.onPersist();
    }

    /**
     * Get weight direction for an exercise
     * @param {string} exerciseName - Exercise name
     * @returns {string|null} 'up', 'down', or null
     */
    getWeightDirection(exerciseName) {
        const currentSession = this.onGetCurrentSession();
        return currentSession?.exercises?.[exerciseName]?.next_weight_direction || null;
    }

    /**
     * Get last weight direction from history (for display on load)
     * @param {string} exerciseName - Exercise name
     * @returns {string|null} 'up', 'down', or null
     */
    getLastWeightDirection(exerciseName) {
        const history = this.onGetExerciseHistory();
        return history?.[exerciseName]?.last_weight_direction || null;
    }

    // ============================================
    // AUTO-COMPLETE TIMER METHODS
    // ============================================

    /**
     * Start auto-complete timer for an exercise
     * @param {string} exerciseName - Exercise name
     * @param {number} timeoutMinutes - Minutes until auto-complete (default 10)
     */
    startAutoCompleteTimer(exerciseName, timeoutMinutes = 10) {
        if (!this.onIsSessionActive()) return;

        const currentSession = this.onGetCurrentSession();
        const exerciseData = currentSession?.exercises?.[exerciseName];
        if (exerciseData?.is_completed || exerciseData?.is_skipped) {
            console.log('\u23ed\ufe0f Skipping auto-complete timer - exercise already completed/skipped');
            return;
        }

        this.clearAutoCompleteTimer(exerciseName);

        this.exerciseStartTimes[exerciseName] = Date.now();

        const timeoutMs = timeoutMinutes * 60 * 1000;
        this.autoCompleteTimers[exerciseName] = setTimeout(() => {
            console.log(`\u23f0 Auto-completing ${exerciseName} after ${timeoutMinutes} minutes`);
            this.completeExercise(exerciseName);
            this.onNotify('exerciseAutoCompleted', { exerciseName, timeoutMinutes });
        }, timeoutMs);

        console.log(`\u23f1\ufe0f Auto-complete timer started for ${exerciseName}: ${timeoutMinutes} minutes`);
    }

    /**
     * Clear auto-complete timer for an exercise
     * @param {string} exerciseName - Exercise name
     */
    clearAutoCompleteTimer(exerciseName) {
        if (this.autoCompleteTimers[exerciseName]) {
            clearTimeout(this.autoCompleteTimers[exerciseName]);
            delete this.autoCompleteTimers[exerciseName];
            delete this.exerciseStartTimes[exerciseName];
            console.log(`\u23f1\ufe0f Auto-complete timer cleared for ${exerciseName}`);
        }
    }

    /**
     * Clear all auto-complete timers
     */
    clearAllAutoCompleteTimers() {
        Object.keys(this.autoCompleteTimers).forEach(exerciseName => {
            this.clearAutoCompleteTimer(exerciseName);
        });
        console.log('\ud83e\uddf9 All auto-complete timers cleared');
    }

    /**
     * Get remaining time for auto-complete
     * @param {string} exerciseName - Exercise name
     * @returns {number|null} Seconds remaining or null if no timer
     */
    getAutoCompleteRemainingTime(exerciseName) {
        if (!this.exerciseStartTimes[exerciseName]) return null;

        const elapsed = (Date.now() - this.exerciseStartTimes[exerciseName]) / 1000;
        const remaining = (10 * 60) - elapsed;
        return Math.max(0, Math.floor(remaining));
    }
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SessionExerciseStateService;
}

console.log('\ud83d\udce6 Session Exercise State Service loaded');
