/**
 * Ghost Gym - Session Lifecycle API Service
 * Handles session start, complete, and recovery API calls
 * Extracted from WorkoutSessionService for single responsibility
 * @version 1.0.0
 * @date 2026-02-14
 */

class SessionLifecycleApiService {
    constructor(options = {}) {
        // Callbacks for session service coordination
        this.onGetCurrentSession = options.onGetCurrentSession || (() => null);
        this.onSetCurrentSession = options.onSetCurrentSession || (() => {});
        this.onGetSessionNotes = options.onGetSessionNotes || (() => []);
        this.onGetPreSessionOrder = options.onGetPreSessionOrder || (() => []);
        this.onGetPreSessionEditingService = options.onGetPreSessionEditingService || (() => null);
        this.onNotify = options.onNotify || (() => {});
        this.onPersist = options.onPersist || (() => {});
        this.onClearPersistedSession = options.onClearPersistedSession || (() => {});

        console.log('\ud83d\ude80 Session Lifecycle API Service initialized');
    }

    /**
     * Fetch with retry for transient network errors (e.g. "TypeError: Load failed").
     * @param {string} url
     * @param {Object} options - fetch options
     * @param {number} retries - max retries (default 2)
     * @returns {Promise<Response>}
     */
    async _fetchWithRetry(url, options, retries = 2) {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                return await fetch(url, options);
            } catch (err) {
                const isNetworkError = err instanceof TypeError &&
                    (err.message.includes('Load failed') || err.message.includes('Failed to fetch') || err.message.includes('NetworkError'));
                if (!isNetworkError || attempt === retries) {
                    throw err;
                }
                const delay = Math.pow(2, attempt) * 1000; // 1s, 2s
                console.warn(`⚠️ Network error on attempt ${attempt + 1}, retrying in ${delay}ms...`, err.message);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }

    /**
     * Extract a human-readable error message from API error responses.
     * Handles FastAPI 422 validation errors where detail is an array of objects.
     * @param {Object} errorData - Parsed JSON error response
     * @param {string} fallback - Fallback message if detail is missing
     * @returns {string} Human-readable error message
     * @private
     */
    _extractErrorMessage(errorData, fallback) {
        const detail = errorData?.detail;
        if (!detail) return fallback;
        if (typeof detail === 'string') return detail;
        if (Array.isArray(detail)) {
            return detail.map(e => e.msg || JSON.stringify(e)).join('; ');
        }
        return fallback;
    }

    /**
     * Start a new workout session
     * @param {string} workoutId - Workout ID
     * @param {string} workoutName - Workout name
     * @param {Object|null} workoutData - Optional workout template data
     * @returns {Promise<Object>} Session object
     */
    async startSession(workoutId, workoutName, workoutData = null) {
        try {
            const sessionMode = 'timed';
            console.log(`🏋️ Starting workout session:`, workoutName);

            // Auto-detect program_id from active program
            const programId = await this._detectProgramId(workoutId);
            if (programId) {
                console.log(`📋 Auto-linking session to program: ${programId}`);
            }

            // Local-only session for anonymous users
            if (!window.authService?.isUserAuthenticated()) {
                console.log('👤 Creating local-only session (anonymous user)');
                const localSession = {
                    id: `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    workoutId: workoutId,
                    workoutName: workoutName,
                    startedAt: new Date(),
                    status: 'in_progress',
                    sessionMode: sessionMode,
                    programId: programId,
                    exercises: {}
                };

                if (workoutData) {
                    localSession.exercises = this._initializeExercisesFromTemplate(workoutData);
                    console.log('✅ Pre-populated', Object.keys(localSession.exercises).length, 'exercises from template');
                }

                this.onSetCurrentSession(localSession);

                const preSessionEditingService = this.onGetPreSessionEditingService();
                if (preSessionEditingService && (preSessionEditingService.hasEdits() || preSessionEditingService.hasSkips())) {
                    preSessionEditingService.applyAllToSession(localSession);
                }

                console.log('✅ Local workout session started:', localSession.id);
                this.onNotify('sessionStarted', localSession);
                this.onPersist();

                return localSession;
            }

            const token = await window.authService.getIdToken();
            if (!token) {
                throw new Error('Authentication required. Please log in to track your workout.');
            }

            const url = window.config.api.getUrl('/api/v3/workout-sessions');

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    workout_id: workoutId,
                    workout_name: workoutName,
                    started_at: this._getImportedStartTime() || new Date().toISOString(),
                    session_mode: sessionMode,
                    ...(programId ? { program_id: programId } : {})
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(this._extractErrorMessage(errorData, `Failed to create session: ${response.statusText}`));
            }

            const session = await response.json();

            // Build the session object
            const newSession = {
                id: session.id,
                workoutId: workoutId,
                workoutName: workoutName,
                startedAt: new Date(session.started_at),
                status: 'in_progress',
                sessionMode: sessionMode,
                programId: programId,
                exercises: {}
            };

            // Pre-populate exercises from template
            if (workoutData) {
                newSession.exercises = this._initializeExercisesFromTemplate(workoutData);
                console.log('\u2705 Pre-populated', Object.keys(newSession.exercises).length, 'exercises from template');
            }

            // Set the session on the parent
            this.onSetCurrentSession(newSession);

            // Apply pre-session modifications
            const preSessionEditingService = this.onGetPreSessionEditingService();
            if (preSessionEditingService && (preSessionEditingService.hasEdits() || preSessionEditingService.hasSkips())) {
                console.log('\ud83d\udd04 Applying pre-session modifications to new session...');
                preSessionEditingService.applyAllToSession(newSession);
            }

            console.log('\u2705 Workout session started:', session.id);
            this.onNotify('sessionStarted', newSession);
            window.dispatchEvent(new CustomEvent('sessionStateChanged', { detail: { type: 'started' } }));

            // Persist session immediately after start
            this.onPersist();

            return newSession;

        } catch (error) {
            console.error('\u274c Error starting workout session:', error);
            throw error;
        }
    }

    /**
     * Initialize exercises from workout template
     * @param {Object} workout - Workout template data
     * @returns {Object} Initialized exercises object
     * @private
     */
    _initializeExercisesFromTemplate(workout) {
        const exercises = {};

        if (workout.exercise_groups) {
            workout.exercise_groups.forEach((group, index) => {
                // Skip note card types
                if (group.group_type === 'note') return;

                // Cardio/activity groups get simplified session entries
                if (group.group_type === 'cardio') {
                    const exerciseName = group.exercises?.a;
                    if (exerciseName) {
                        exercises[exerciseName] = {
                            is_completed: false,
                            is_skipped: false,
                            is_modified: false,
                            order_index: index,
                            notes: '',
                            session_cardio_config: null
                        };
                    }
                    return;
                }

                const exerciseName = group.exercises?.a;
                if (exerciseName) {
                    const templateWeight = group.default_weight || null;
                    const templateSets = group.sets || '3';
                    const templateReps = group.reps || '8-12';

                    exercises[exerciseName] = {
                        weight: templateWeight,
                        weight_unit: group.default_weight_unit || 'lbs',
                        target_sets: templateSets,
                        target_reps: templateReps,
                        rest: group.rest || '60s',
                        previous_weight: null,
                        weight_change: 0,
                        order_index: index,
                        is_modified: false,
                        is_skipped: false,
                        notes: '',
                        original_weight: templateWeight,
                        original_sets: templateSets,
                        original_reps: templateReps
                    };
                }
            });
        }

        return exercises;
    }

    /**
     * Complete the current workout session
     * @param {Array} exercisesPerformed - Array of exercise data
     * @param {number|null} durationMinutes - Optional manual duration for Quick Log mode
     * @returns {Promise<Object>} Completed session object
     */
    async completeSession(exercisesPerformed, durationMinutes = null, sessionCalories = null) {
        const currentSession = this.onGetCurrentSession();
        try {
            if (!currentSession || !currentSession.id) {
                throw new Error('No active session to complete');
            }

            console.log('\ud83c\udfc1 Completing workout session:', currentSession.id);

            // Local-only session completion for anonymous users
            if (currentSession.id.startsWith('local-')) {
                console.log('👤 Completing local-only session (anonymous user)');
                const completedAt = new Date();
                const durationMs = completedAt.getTime() - new Date(currentSession.startedAt).getTime();
                const actualDuration = durationMinutes || Math.round(durationMs / 60000);

                const completedSession = {
                    id: currentSession.id,
                    workout_id: currentSession.workoutId,
                    workout_name: currentSession.workoutName,
                    started_at: currentSession.startedAt instanceof Date ? currentSession.startedAt.toISOString() : currentSession.startedAt,
                    completed_at: completedAt.toISOString(),
                    duration_minutes: actualDuration,
                    exercises_performed: exercisesPerformed,
                    calories: sessionCalories,
                    status: 'completed'
                };

                currentSession.status = 'completed';
                currentSession.completedAt = completedAt;

                console.log('✅ Local workout session completed:', currentSession.id);
                this.onNotify('sessionCompleted', completedSession);
                this.onClearPersistedSession();

                return completedSession;
            }

            const token = await window.authService.getIdToken();
            if (!token) {
                throw new Error('Authentication required');
            }

            const url = window.config.api.getUrl(`/api/v3/workout-sessions/${currentSession.id}/complete`);

            const sessionNotes = this.onGetSessionNotes();
            const preSessionOrder = this.onGetPreSessionOrder();

            const requestBody = {
                completed_at: new Date().toISOString(),
                exercises_performed: exercisesPerformed,
                notes: '',
                session_notes: (sessionNotes || []).map(note => ({
                    id: note.id,
                    content: note.content,
                    order_index: note.order_index,
                    created_at: note.created_at || new Date().toISOString(),
                    modified_at: note.modified_at || null
                }))
            };

            if (requestBody.session_notes.length > 0) {
                console.log('\ud83d\udcdd Including', requestBody.session_notes.length, 'session notes in completion');
            }

            if (preSessionOrder && preSessionOrder.length > 0) {
                requestBody.exercise_order = preSessionOrder;
                console.log('\ud83d\udccb Including custom exercise order in completion:', preSessionOrder.length, 'exercises');
            }

            if (durationMinutes !== null && durationMinutes > 0) {
                requestBody.duration_minutes = durationMinutes;
                console.log('\u23f1\ufe0f Including manual duration for Quick Log:', durationMinutes, 'minutes');
            }

            if (sessionCalories !== null && sessionCalories > 0) {
                requestBody.calories = sessionCalories;
                console.log('🔥 Including session calories:', sessionCalories);
            }

            const response = await this._fetchWithRetry(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            // Handle session not found - create new session and complete it
            if (response.status === 404) {
                console.warn('\u26a0\ufe0f Session not found in database, creating new session to save workout data...');
                return await this._createAndCompleteSession(exercisesPerformed, durationMinutes, token, sessionCalories);
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(this._extractErrorMessage(errorData, `Failed to complete session: ${response.statusText}`));
            }

            const completedSession = await response.json();

            currentSession.status = 'completed';
            currentSession.completedAt = new Date(completedSession.completed_at);

            console.log('\u2705 Workout session completed:', currentSession.id);
            this.onNotify('sessionCompleted', completedSession);
            window.dispatchEvent(new CustomEvent('sessionStateChanged', { detail: { type: 'completed' } }));

            this.onClearPersistedSession();

            return completedSession;

        } catch (error) {
            console.error('\u274c Error completing workout session:', error);
            throw error;
        }
    }

    /**
     * Create a new session and immediately complete it (fallback for orphaned localStorage sessions)
     * @private
     */
    async _createAndCompleteSession(exercisesPerformed, durationMinutes, token, sessionCalories = null) {
        console.log('\ud83d\udd04 Creating new session to preserve workout data...');

        // Strategy 1: Try atomic create-and-complete endpoint
        try {
            const atomicResult = await this._tryAtomicCreateAndComplete(
                exercisesPerformed, durationMinutes, token, sessionCalories
            );
            if (atomicResult) return atomicResult;
        } catch (error) {
            console.warn('\u26a0\ufe0f Atomic create-and-complete failed, falling back to two-step:', error.message);
        }

        // Strategy 2: Two-step with retry
        return await this._createThenCompleteWithRetry(exercisesPerformed, durationMinutes, token, sessionCalories);
    }

    /**
     * Try atomic create-and-complete endpoint (single API call)
     * @private
     */
    async _tryAtomicCreateAndComplete(exercisesPerformed, durationMinutes, token, sessionCalories = null) {
        const currentSession = this.onGetCurrentSession();
        const sessionNotes = this.onGetSessionNotes();
        const preSessionOrder = this.onGetPreSessionOrder();
        const url = window.config.api.getUrl('/api/v3/workout-sessions/create-and-complete');

        const requestBody = {
            workout_id: currentSession.workoutId,
            workout_name: currentSession.workoutName,
            started_at: currentSession.startedAt.toISOString(),
            completed_at: new Date().toISOString(),
            exercises_performed: exercisesPerformed,
            session_mode: currentSession.sessionMode || 'timed',
            notes: '',
            session_notes: (sessionNotes || []).map(note => ({
                id: note.id,
                content: note.content,
                order_index: note.order_index,
                created_at: note.created_at,
                modified_at: note.modified_at || null
            }))
        };

        if (currentSession.programId) {
            requestBody.program_id = currentSession.programId;
        }

        if (preSessionOrder && preSessionOrder.length > 0) {
            requestBody.exercise_order = preSessionOrder;
        }

        if (durationMinutes !== null && durationMinutes > 0) {
            requestBody.duration_minutes = durationMinutes;
        }

        if (sessionCalories !== null && sessionCalories > 0) {
            requestBody.calories = sessionCalories;
        }

        console.log('\ud83d\ude80 Trying atomic create-and-complete endpoint...');
        const response = await this._fetchWithRetry(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(this._extractErrorMessage(errorData, `Atomic endpoint failed: ${response.status}`));
        }

        const completedSession = await response.json();

        currentSession.id = completedSession.id;
        currentSession.status = 'completed';
        currentSession.completedAt = new Date(completedSession.completed_at);

        console.log('\u2705 Atomic create-and-complete succeeded:', completedSession.id);
        this.onNotify('sessionCompleted', completedSession);
        window.dispatchEvent(new CustomEvent('sessionStateChanged', { detail: { type: 'completed' } }));
        this.onClearPersistedSession();

        return completedSession;
    }

    /**
     * Two-step create then complete with retry and exponential backoff
     * @private
     */
    async _createThenCompleteWithRetry(exercisesPerformed, durationMinutes, token, sessionCalories = null) {
        const MAX_RETRIES = 3;
        const BASE_DELAY_MS = 150;
        const currentSession = this.onGetCurrentSession();
        const sessionNotes = this.onGetSessionNotes();
        const preSessionOrder = this.onGetPreSessionOrder();

        // Step 1: Create session
        console.log('\ud83d\udcdd Creating recovery session (two-step fallback)...');
        const createUrl = window.config.api.getUrl('/api/v3/workout-sessions');
        const createResponse = await this._fetchWithRetry(createUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                workout_id: currentSession.workoutId,
                workout_name: currentSession.workoutName,
                started_at: currentSession.startedAt.toISOString(),
                session_mode: currentSession.sessionMode || 'timed'
            })
        });

        if (!createResponse.ok) {
            const errorData = await createResponse.json().catch(() => ({}));
            throw new Error(this._extractErrorMessage(errorData, 'Failed to create recovery session'));
        }

        const newSession = await createResponse.json();
        console.log('\u2705 Recovery session created:', newSession.id);

        // Step 2: Complete with retry
        const requestBody = {
            completed_at: new Date().toISOString(),
            exercises_performed: exercisesPerformed,
            notes: '',
            session_notes: (sessionNotes || []).map(note => ({
                id: note.id,
                content: note.content,
                order_index: note.order_index,
                created_at: note.created_at,
                modified_at: note.modified_at || null
            }))
        };

        if (preSessionOrder && preSessionOrder.length > 0) {
            requestBody.exercise_order = preSessionOrder;
        }

        if (durationMinutes !== null && durationMinutes > 0) {
            requestBody.duration_minutes = durationMinutes;
        }

        if (sessionCalories !== null && sessionCalories > 0) {
            requestBody.calories = sessionCalories;
        }

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            const delay = BASE_DELAY_MS * Math.pow(2, attempt);
            console.log(`\u23f1\ufe0f Waiting ${delay}ms before complete attempt ${attempt + 1}/${MAX_RETRIES}`);
            await this._sleep(delay);

            try {
                const completeUrl = window.config.api.getUrl(`/api/v3/workout-sessions/${newSession.id}/complete`);
                const completeResponse = await this._fetchWithRetry(completeUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(requestBody)
                });

                if (completeResponse.ok) {
                    const completedSession = await completeResponse.json();

                    currentSession.id = newSession.id;
                    currentSession.status = 'completed';
                    currentSession.completedAt = new Date(completedSession.completed_at);

                    console.log('\u2705 Recovery session completed successfully:', newSession.id);
                    this.onNotify('sessionCompleted', completedSession);
                        this.onClearPersistedSession();

                    return completedSession;
                }

                if (completeResponse.status !== 404) {
                    const errorData = await completeResponse.json().catch(() => ({}));
                    throw new Error(this._extractErrorMessage(errorData, 'Failed to complete recovery session'));
                }

                console.warn(`\u26a0\ufe0f Complete attempt ${attempt + 1} got 404, retrying...`);

            } catch (error) {
                if (attempt === MAX_RETRIES - 1) {
                    throw error;
                }
                console.warn(`\u26a0\ufe0f Complete attempt ${attempt + 1} failed:`, error.message);
            }
        }

        throw new Error('Failed to complete recovery session after all retries');
    }

    /**
     * Sleep helper for async delays
     * @private
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Detect which program this workout belongs to and return its program_id.
     * Priority: 1) Primary/pinned program, 2) Any tracker-enabled program containing this workout.
     * @param {string} workoutId - The workout being started
     * @returns {Promise<string|null>} program_id if workout belongs to a program, null otherwise
     * @private
     */
    async _detectProgramId(workoutId) {
        try {
            if (!window.dataManager?.getPrograms) return null;

            const programs = await window.dataManager.getPrograms({ pageSize: 100 });
            if (!programs || programs.length === 0) return null;

            const activeProgramId = localStorage.getItem('ffn_active_program_id');

            // 1. Check primary/pinned program first
            if (activeProgramId) {
                const activeProgram = programs.find(p => p.id === activeProgramId);
                if (activeProgram?.workouts) {
                    const workoutIds = activeProgram.workouts.map(w => w.workout_id);
                    if (workoutIds.includes(workoutId)) {
                        return activeProgramId;
                    }
                }
            }

            // 2. Check all tracker-enabled programs
            for (const program of programs) {
                if (program.tracker_enabled && program.workouts) {
                    const workoutIds = program.workouts.map(w => w.workout_id);
                    if (workoutIds.includes(workoutId)) {
                        return program.id;
                    }
                }
            }

            return null;
        } catch (error) {
            console.warn('Could not detect program for session:', error);
            return null;
        }
    }

    /**
     * Check if there's an AI-imported session date/time in sessionStorage.
     * Returns ISO string if found and valid, null otherwise.
     * Clears the stored value after reading (one-time use).
     */
    _getImportedStartTime() {
        try {
            const stored = sessionStorage.getItem('ffn_imported_session_datetime');
            if (!stored) return null;

            sessionStorage.removeItem('ffn_imported_session_datetime');
            const meta = JSON.parse(stored);

            if (meta.session_date) {
                const timeStr = meta.session_time || '12:00';
                const dt = new Date(`${meta.session_date}T${timeStr}`);
                if (!isNaN(dt)) {
                    console.log('📅 Using AI-extracted session start time:', dt.toISOString());
                    return dt.toISOString();
                }
            }
            return null;
        } catch (e) {
            return null;
        }
    }
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SessionLifecycleApiService;
}

console.log('\ud83d\udce6 Session Lifecycle API Service loaded');
