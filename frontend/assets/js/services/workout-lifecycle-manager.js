/**
 * Ghost Gym - Workout Lifecycle Manager
 * Orchestrates workout session lifecycle (start → in-progress → complete)
 * @version 1.0.0
 * @date 2026-01-05
 * Phase 5: Session Lifecycle Management
 */

class WorkoutLifecycleManager {
    constructor(options) {
        // Required services
        this.sessionService = options.sessionService;
        this.uiStateManager = options.uiStateManager;
        this.authService = options.authService;
        this.dataManager = options.dataManager;
        this.timerManager = options.timerManager;
        
        // Callbacks for controller coordination
        this.onRenderWorkout = options.onRenderWorkout || (() => {});
        this.onExpandFirstCard = options.onExpandFirstCard || (() => {});
        this.onCollectExerciseData = options.onCollectExerciseData || (() => []);
        this.onUpdateTemplateWeights = options.onUpdateTemplateWeights || (async () => {});
        this.onLoadWorkout = options.onLoadWorkout || (async () => {});
        
        // State
        this.isStartingSession = false;
        this.currentWorkout = null;
        
        console.log('🔄 Workout Lifecycle Manager initialized');
    }
    
    /**
     * Set current workout context
     * @param {Object} workout - Current workout object
     */
    setWorkout(workout) {
        this.currentWorkout = workout;
    }
    
    /**
     * Handle start workout (auto-start, always timed mode)
     * Validates state, checks auth, handles conflicts
     * @returns {Promise<boolean>} Success status
     */
    async handleStartWorkout() {
        return this._handleStartSession();
    }

    /**
     * Internal handler for starting a session
     * @returns {Promise<boolean>} Success status
     * @private
     */
    async _handleStartSession() {

        if (!this.currentWorkout) {
            console.error('❌ No workout loaded');
            return false;
        }

        // Prevent concurrent session creation using state flag
        if (this.isStartingSession) {
            console.log('🚫 Session already being created, ignoring click');
            return false;
        }

        // Check if user is authenticated
        // Allow anonymous users through if they came from public workouts (source=public)
        const urlParams = new URLSearchParams(window.location.search);
        const isPublicSource = urlParams.get('source') === 'public';
        if (!this.authService.isUserAuthenticated() && !isPublicSource) {
            this.showLoginPrompt();
            return false;
        }

        try {
            // Set flag to prevent concurrent calls
            this.isStartingSession = true;

            // Check if there's a different persisted session
            const persistedSession = this.sessionService.restoreSession();
            if (persistedSession && persistedSession.workoutId !== this.currentWorkout.id) {
                const modalManager = this.getModalManager();

                return new Promise((resolve) => {
                    modalManager.confirm(
                        'Active Session Found',
                        `You have an active session for <strong>${WorkoutUtils.escapeHtml(persistedSession.workoutName)}</strong>. Starting a new session will end that session. Continue?`,
                        async () => {
                            this.sessionService.clearPersistedSession();
                            const result = await this.startNewSession();
                            resolve(result);
                        },
                        () => {
                            this.isStartingSession = false;
                            resolve(false);
                        }
                    );
                });
            }

            return await this.startNewSession();

        } catch (error) {
            console.error('❌ Error starting session:', error);
            this.isStartingSession = false;

            const modalManager = this.getModalManager();
            modalManager.alert('Error', error.message, 'danger');
            return false;
        }
    }

    /**
     * Start a new workout session
     * Creates session, fetches history, updates UI
     * @returns {Promise<boolean>} Success status
     */
    async startNewSession() {
        try {
            console.log('🏋️ Starting session...');

            // Pass workout data and session mode to create session
            await this.sessionService.startSession(
                this.currentWorkout.id,
                this.currentWorkout.name,
                this.currentWorkout,
                'timed'
            );

            // Fetch exercise history
            await this.sessionService.fetchExerciseHistory(this.currentWorkout.id);

            // Update UI
            this.uiStateManager.updateSessionState(true, this.sessionService.getCurrentSession());

            // Start elapsed timer
            this.timerManager.startSessionTimer();

            // Show bottom bar and timer display
            this.showFloatingControls(true);

            // Re-render to show weight inputs
            this.onRenderWorkout();

            // Auto-expand first exercise card after render completes
            setTimeout(() => {
                this.onExpandFirstCard();
            }, 300);

            if (window.showAlert) {
                window.showAlert('Workout session started! 💪', 'success');
            }

            this.isStartingSession = false;
            return true;

        } catch (error) {
            console.error('❌ Error starting session:', error);
            this.isStartingSession = false;

            const modalManager = this.getModalManager();
            modalManager.alert('Error', error.message, 'danger');
            return false;
        }
    }

    /**
     * Handle complete workout button click
     * Shows completion offcanvas
     */
    handleCompleteWorkout() {
        // NOTE: Do NOT call showFloatingControls(false) here!
        // The timer/controls should remain visible while the completion offcanvas is open.
        // Controls will be reset when the workout is actually completed or cancelled.
        try {
            this.showCompleteWorkoutOffcanvas();
        } catch (error) {
            console.error('❌ Error showing complete workout offcanvas:', error);
            const modalManager = this.getModalManager();
            modalManager.alert(
                'Save Error',
                `Something went wrong while trying to save: ${error.message}. Please try again.`,
                'danger'
            );
        }
    }
    
    /**
     * Show complete workout offcanvas
     * Creates completion offcanvas with session stats
     */
    showCompleteWorkoutOffcanvas() {
        const session = this.sessionService.getCurrentSession();
        if (!session) {
            console.error('❌ No active session found when trying to save');
            const modalManager = this.getModalManager();
            modalManager.alert(
                'No Active Session',
                'Could not find an active workout session. Please start a new session and try again.',
                'warning'
            );
            return;
        }

        // Calculate session stats
        const elapsed = Math.floor((Date.now() - session.startedAt.getTime()) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const exerciseCount = this.currentWorkout?.exercise_groups?.length || 0;
        const totalExercises = exerciseCount;

        if (!window.UnifiedOffcanvasFactory) {
            console.error('❌ UnifiedOffcanvasFactory not loaded — cannot show save offcanvas');
            const modalManager = this.getModalManager();
            modalManager.alert(
                'Save Error',
                'A required component failed to load. Please refresh the page and try again.',
                'danger'
            );
            return;
        }

        // Use unified factory to create offcanvas
        const isBuildMode = window.workoutModeController?.isBuildMode || false;
        window.UnifiedOffcanvasFactory.createCompleteWorkout({
            workoutName: this.currentWorkout.name,
            minutes,
            totalExercises,
            isQuickLog: false,
            isBuildMode
        }, async (durationMinutes, templateOpts = {}) => {
            try {
                // Collect exercise data
                const exercisesPerformed = this.onCollectExerciseData();

                // Complete session (pass durationMinutes for Quick Log mode)
                const completedSession = await this.sessionService.completeSession(
                    exercisesPerformed,
                    durationMinutes  // null for timed sessions, number for Quick Log
                );

                // Update template weights
                await this.onUpdateTemplateWeights(exercisesPerformed);

                // Build & Log: unarchive workout if user chose "Save as Template"
                if (isBuildMode && templateOpts.saveAsTemplate && this.currentWorkout?.id) {
                    try {
                        await window.dataManager.updateWorkout(this.currentWorkout.id, {
                            name: templateOpts.templateName || this.currentWorkout.name,
                            is_archived: false
                        });
                        console.log('✅ Workout saved as template:', templateOpts.templateName);
                    } catch (err) {
                        console.error('⚠️ Failed to save workout as template:', err);
                    }
                }

                // Clean up temporary localStorage workout for anonymous "Do Once" sessions
                const completionUrlParams = new URLSearchParams(window.location.search);
                if (completionUrlParams.get('source') === 'public' && this.currentWorkout?.id) {
                    try {
                        await window.dataManager.deleteWorkout(this.currentWorkout.id);
                        console.log('🧹 Cleaned up temporary Do Once workout:', this.currentWorkout.id);
                    } catch (cleanupErr) {
                        console.warn('⚠️ Failed to clean up temporary workout:', cleanupErr);
                    }
                }

                // Hide controls after workout is completed
                this.showFloatingControls(false);

                // Show completion summary
                this.showCompletionSummary(completedSession);
            } catch (error) {
                console.error('❌ Error completing workout:', error);

                const modalManager = this.getModalManager();
                modalManager.alert(
                    'Save Failed',
                    `Failed to save your workout: ${error.message}. Your data has been preserved locally - please try again.`,
                    'danger'
                );

                // Re-show controls so user can try again
                this.showFloatingControls(true);
            }
        });
    }
    
    /**
     * Show completion summary
     * @param {Object} session - Completed session data
     */
    showCompletionSummary(session) {
        window.UnifiedOffcanvasFactory.createCompletionSummary({
            duration: session.duration_minutes || 0,
            exerciseCount: session.exercises_performed?.length || 0,
            workoutId: this.currentWorkout?.id
        });
    }
    
    /**
     * Show login prompt modal
     * Called when unauthenticated user tries to start workout
     */
    showLoginPrompt() {
        const modalHtml = `
            <div class="modal fade" id="loginPromptModal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header border-0 pb-0">
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body text-center pt-0">
                            <div class="mb-4">
                                <i class="bx bx-lock-alt" style="font-size: 4rem; color: var(--bs-primary);"></i>
                            </div>
                            <h4 class="mb-3">Login Required</h4>
                            <p class="text-muted mb-4">You need to be logged in to track your workouts and save weight progress.</p>
                            
                            <div class="mb-4">
                                <p class="mb-3"><strong>With an account you can:</strong></p>
                                <ul class="list-unstyled text-start" style="max-width: 300px; margin: 0 auto;">
                                    <li class="mb-2">
                                        <i class="bx bx-check-circle text-success me-2"></i>
                                        Track weight progress
                                    </li>
                                    <li class="mb-2">
                                        <i class="bx bx-check-circle text-success me-2"></i>
                                        Save workout history
                                    </li>
                                    <li class="mb-2">
                                        <i class="bx bx-check-circle text-success me-2"></i>
                                        See personal records
                                    </li>
                                    <li class="mb-2">
                                        <i class="bx bx-check-circle text-success me-2"></i>
                                        Auto-save during workouts
                                    </li>
                                </ul>
                            </div>
                        </div>
                        <div class="modal-footer border-0 justify-content-center">
                            <button type="button" class="btn btn-primary" onclick="window.authService.showLoginModal(); bootstrap.Modal.getInstance(document.getElementById('loginPromptModal')).hide();">
                                <i class="bx bx-log-in me-2"></i>Log In
                            </button>
                            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">
                                Maybe Later
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if any
        const existingModal = document.getElementById('loginPromptModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Initialize Bootstrap modal
        const modalElement = document.getElementById('loginPromptModal');
        const modal = new window.bootstrap.Modal(modalElement);
        
        // Cleanup modal on hide
        modalElement.addEventListener('hidden.bs.modal', () => {
            modalElement.remove();
        });
        
        // Show modal
        modal.show();
    }
    
    /**
     * Check for and handle persisted session on page load
     * @returns {Promise<boolean>} True if session was found and handled
     */
    async checkPersistedSession() {
        const persistedSession = this.sessionService.restoreSession();
        
        if (persistedSession) {
            // Calculate time since page was last active
            // Use lastPageActive (when page was visible) NOT lastUpdated (when data changed)
            // This prevents auto-resume when user has been changing weights for 50+ minutes
            const lastPageActive = new Date(persistedSession.lastPageActive || persistedSession.lastUpdated);
            const minutesSincePageActive = (Date.now() - lastPageActive.getTime()) / (1000 * 60);
            
            // Auto-resume threshold: 2 minutes
            // If user was away briefly (< 2 min), auto-resume silently without showing offcanvas
            const AUTO_RESUME_THRESHOLD_MINUTES = 2;
            
            if (minutesSincePageActive < AUTO_RESUME_THRESHOLD_MINUTES) {
                // User was away briefly - auto-resume silently
                console.log(`🔄 Auto-resuming session (page inactive for ${minutesSincePageActive.toFixed(1)} minutes, threshold: ${AUTO_RESUME_THRESHOLD_MINUTES} min)`);
                await this.resumeSession(persistedSession);
                return true;
            }
            
            // User was away longer - show resume prompt with options
            console.log(`🔄 Found persisted session (page inactive for ${minutesSincePageActive.toFixed(1)} minutes), showing resume prompt...`);
            await this.showResumeSessionPrompt(persistedSession);
            return true;
        }
        
        return false;
    }
    
    /**
     * Show resume session prompt
     * @param {Object} sessionData - Persisted session data
     */
    async showResumeSessionPrompt(sessionData) {
        // Calculate elapsed time
        const startedAt = new Date(sessionData.startedAt);
        const elapsedMinutes = Math.floor((Date.now() - startedAt.getTime()) / (1000 * 60));
        const elapsedHours = Math.floor(elapsedMinutes / 60);
        const remainingMinutes = elapsedMinutes % 60;
        
        // Format elapsed time display
        const elapsedDisplay = elapsedHours > 0
            ? `${elapsedHours}h ${remainingMinutes}m ago`
            : `${elapsedMinutes} minutes ago`;
        
        // Count exercises with weights
        const exercisesWithWeights = Object.keys(sessionData.exercises || {})
            .filter(name => sessionData.exercises[name].weight).length;
        const totalExercises = Object.keys(sessionData.exercises || {}).length;
        
        // Guard: if factory not loaded, fall back to auto-resume
        if (!window.UnifiedOffcanvasFactory) {
            console.error('❌ UnifiedOffcanvasFactory not loaded, falling back to auto-resume');
            await this.resumeSession(sessionData);
            return;
        }

        // Use unified factory to create offcanvas
        window.UnifiedOffcanvasFactory.createResumeSession({
            workoutName: sessionData.workoutName,
            elapsedDisplay,
            exercisesWithWeights,
            totalExercises
        },
        async () => await this.resumeSession(sessionData),  // onResume
        (onDiscardComplete) => {                             // onStartFresh
            this.sessionService.clearPersistedSession();
            if (onDiscardComplete) onDiscardComplete();
            window.location.href = 'workout-database.html';
        },
        () => {                                              // onCancel
            // Show confirmation before canceling workout
            const modalManager = this.getModalManager();
            modalManager.confirm(
                'Cancel Workout?',
                'Are you sure you want to cancel this workout session?<br><br>All progress from this session will be discarded and you will return to the workout database.',
                () => {
                    // User confirmed - clear session and redirect
                    this.sessionService.clearPersistedSession();
                    window.location.href = 'workout-database.html';
                },
                {
                    confirmText: 'Yes, Cancel Workout',
                    confirmClass: 'btn-danger',
                    cancelText: 'Go Back'
                }
            );
        },
        async () => {                                        // onEnd
            await this.resumeSession(sessionData);
            this.handleCompleteWorkout();
        });
    }
    
    /**
     * Resume a persisted session
     * @param {Object} sessionData - Persisted session data
     */
    async resumeSession(sessionData) {
        try {
            // Always resume as timed (backward compat: old quick_log sessions treated as timed)
            console.log('🔄 Resuming workout session...');

            // Verify session exists in Firestore before resuming
            // If not found, recreate it to avoid 404 on completion
            const verifiedSessionId = await this._verifyOrRecreateSession(sessionData);

            // Load the workout first (this will also hide loading state)
            await this.onLoadWorkout(sessionData.workoutId);

            // Restore session to service (including sessionMode)
            // Use verified session ID (may be different if recreated)
            this.sessionService.currentSession = {
                id: verifiedSessionId,
                workoutId: sessionData.workoutId,
                workoutName: sessionData.workoutName,
                startedAt: new Date(sessionData.startedAt),
                status: sessionData.status,
                sessionMode: 'timed',
                exercises: sessionData.exercises || {}
            };

            // Render workout with session data
            this.onRenderWorkout();

            // Update UI to show active session
            this.uiStateManager.updateSessionState(true, this.sessionService.getCurrentSession());

            // Start elapsed timer
            this.timerManager.startSessionTimer(this.sessionService.getCurrentSession());

            // Show bottom bar and timer
            this.showFloatingControls(true);

            // Persist session to update lastUpdated timestamp
            this.sessionService.persistSession();

            // Show resume message
            if (window.showAlert) {
                const elapsedMinutes = Math.floor(
                    (Date.now() - this.sessionService.currentSession.startedAt.getTime()) / (1000 * 60)
                );
                window.showAlert(
                    `Workout resumed! You've been working out for ${elapsedMinutes} minutes.`,
                    'success'
                );
            }

            console.log('✅ Session resumed successfully');
            
        } catch (error) {
            console.error('❌ Error resuming session:', error);

            // Clear invalid session
            this.sessionService.clearPersistedSession();

            // If workout was deleted, show a friendly message and redirect
            if (error.workoutNotFound) {
                if (window.showAlert) {
                    window.showAlert('The workout for this session has been deleted. Redirecting to workout database.', 'warning');
                }
                setTimeout(() => {
                    window.location.href = 'workout-database.html';
                }, 2000);
                return;
            }

            // Show error for other failures
            this.uiStateManager.showError('Failed to resume workout. Please try again.');

            throw error;
        }
    }
    
    /**
     * Update UI for session state changes
     * @param {boolean} isActive - Whether session is active
     */
    updateSessionUI(isActive) {
        // Delegate to UI state manager
        this.uiStateManager.updateSessionState(isActive, this.sessionService.getCurrentSession());
        
        // Handle timers
        if (isActive) {
            this.timerManager.startSessionTimer(this.sessionService.getCurrentSession());
        } else {
            this.timerManager.stopSessionTimer();
        }
    }

    /**
     * Verify session exists in Firestore, recreate if missing
     * Prevents 404 errors when completing resumed sessions
     * @param {Object} sessionData - Session data from localStorage
     * @returns {Promise<string>} Verified or new session ID
     * @private
     */
    async _verifyOrRecreateSession(sessionData) {
        try {
            const token = await window.authService?.getIdToken();
            if (!token) {
                console.warn('⚠️ No auth token, skipping session verification');
                return sessionData.sessionId;
            }

            const exists = await this._verifySessionExists(sessionData.sessionId, token);

            if (exists) {
                console.log('✅ Session verified in Firestore:', sessionData.sessionId);
                return sessionData.sessionId;
            }

            // Session not found - recreate it
            console.warn('⚠️ Session not found in Firestore, recreating...');
            const newSessionId = await this._recreateSessionInFirestore(sessionData, token);
            return newSessionId;

        } catch (error) {
            console.warn('⚠️ Session verification failed:', error.message);
            // Return original ID and let completion handle recovery
            return sessionData.sessionId;
        }
    }

    /**
     * Check if session exists in Firestore
     * @param {string} sessionId - Session ID to verify
     * @param {string} token - Auth token
     * @returns {Promise<boolean>} True if session exists
     * @private
     */
    async _verifySessionExists(sessionId, token) {
        try {
            const url = window.config.api.getUrl(`/api/v3/workout-sessions/${sessionId}`);
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.status === 404) {
                return false;
            }

            return response.ok;
        } catch (error) {
            console.warn('⚠️ Session verification request failed:', error.message);
            return true; // Assume exists on network error, let completion handle it
        }
    }

    /**
     * Recreate session in Firestore from localStorage data
     * @param {Object} sessionData - Session data from localStorage
     * @param {string} token - Auth token
     * @returns {Promise<string>} New session ID
     * @private
     */
    async _recreateSessionInFirestore(sessionData, token) {
        const url = window.config.api.getUrl('/api/v3/workout-sessions');
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                workout_id: sessionData.workoutId,
                workout_name: sessionData.workoutName,
                started_at: sessionData.startedAt,
                session_mode: sessionData.sessionMode || 'timed'
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to recreate session');
        }

        const newSession = await response.json();
        console.log('✅ Session recreated in Firestore:', newSession.id);

        // Update localStorage with new session ID
        sessionData.sessionId = newSession.id;
        this.sessionService.persistSession();

        return newSession.id;
    }

    /**
     * Get modal manager (lazy load to ensure it's available)
     * @returns {Object} Modal manager or fallback
     */
    getModalManager() {
        if (!window.ffnModalManager) {
            console.warn('⚠️ Modal manager not available');
        }
        return window.ffnModalManager;
    }
    
    /**
     * Strip HTML tags from string
     * @param {string} html - HTML string
     * @returns {string} Plain text
     */
    stripHtml(html) {
        return WorkoutUtils.stripHtml(html);
    }
    
    /**
     * Show/hide session UI controls (bottom bar + header timer)
     * @param {boolean} sessionActive - True to show, false to hide
     */
    showFloatingControls(sessionActive) {
        const bottomBar = document.getElementById('workoutModeBottomBar');
        const timerDisplay = document.getElementById('sessionTimerDisplay');
        const inlineAddBtns = document.getElementById('workoutModeAddButtons');

        if (sessionActive) {
            if (bottomBar) bottomBar.style.display = '';
            if (timerDisplay) timerDisplay.style.display = '';
            if (inlineAddBtns) inlineAddBtns.style.display = 'none';
        } else {
            if (bottomBar) bottomBar.style.display = 'none';
            if (timerDisplay) timerDisplay.style.display = 'none';
        }
    }
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WorkoutLifecycleManager;
}

console.log('📦 Workout Lifecycle Manager loaded');
