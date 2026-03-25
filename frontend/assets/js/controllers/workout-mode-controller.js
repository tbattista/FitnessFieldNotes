/**
 * Fitness Field Notes - Workout Mode Controller
 * Orchestrates workout mode by composing specialized managers
 * Serves as the public API facade for HTML onclick handlers and other JS modules
 * @version 2.0.0
 * @date 2026-02-13
 *
 * Delegates to:
 *   WorkoutRenderManager      - Card rendering, timers, field controllers
 *   WorkoutLandingManager     - Landing page, workout suggestions
 *   WorkoutUIStateManager     - Loading/error/content states
 *   WorkoutTimerManager       - Session & rest timers
 *   WorkoutDataManager        - Data collection, template updates, history
 *   WorkoutLifecycleManager   - Session start/complete/resume/persist
 *   WorkoutWeightManager      - Weight editing, direction indicators
 *   WorkoutExerciseOpsManager - Skip/complete/replace/edit exercises
 *   WorkoutExerciseMenuManager- Context menus
 *   WorkoutSettingsManager    - Sound, share, rest timer settings
 *   WorkoutReorderManager     - Exercise reordering
 *   WorkoutSessionNotesManager- Session notes CRUD
 */

class WorkoutModeController {
    constructor() {
        // Core services
        this.sessionService = window.workoutSessionService;
        this.authService = window.authService;
        this.dataManager = window.dataManager;

        // Card renderers
        this.cardRenderer = new window.ExerciseCardRenderer(this.sessionService);
        this.noteCardRenderer = window.NoteCardRenderer ? new window.NoteCardRenderer(this.sessionService) : null;

        // UI State Manager
        this.uiStateManager = new WorkoutUIStateManager({
            loading: 'workoutLoadingState',
            error: 'workoutErrorState',
            loadingMessage: 'loadingMessage',
            errorMessage: 'workoutErrorMessage',
            content: 'exerciseCardsSection',
            footer: 'workoutModeFooter',
            header: 'workoutInfoHeader',
            landing: 'workoutLandingPage'
        });

        // Timer Manager
        this.timerManager = new WorkoutTimerManager(this.sessionService);

        // Render Manager (NEW - extracted rendering orchestration)
        this.renderManager = new WorkoutRenderManager({
            sessionService: this.sessionService,
            cardRenderer: this.cardRenderer,
            noteCardRenderer: this.noteCardRenderer,
            timerManager: this.timerManager
        });

        // Landing Manager (NEW - extracted landing page logic)
        this.landingManager = new WorkoutLandingManager({
            dataManager: this.dataManager,
            uiStateManager: this.uiStateManager,
            authService: this.authService
        });

        // Data Manager
        this.workoutDataManager = new WorkoutDataManager({
            sessionService: this.sessionService,
            dataManager: this.dataManager
        });

        // Lifecycle Manager
        this.lifecycleManager = new WorkoutLifecycleManager({
            sessionService: this.sessionService,
            uiStateManager: this.uiStateManager,
            authService: this.authService,
            dataManager: this.dataManager,
            timerManager: this.timerManager,
            onRenderWorkout: () => this.renderWorkout(),
            onExpandFirstCard: () => this.expandFirstExerciseCard(),
            onCollectExerciseData: () => this.workoutDataManager.collectExerciseData(this.currentWorkout),
            onUpdateTemplateWeights: async (exercises) => await this.workoutDataManager.updateWorkoutTemplate(this.currentWorkout, exercises),
            onLoadWorkout: async (workoutId) => await this.loadWorkout(workoutId)
        });

        // Weight Manager
        this.weightManager = new WorkoutWeightManager({
            sessionService: this.sessionService,
            onWeightUpdated: () => this.renderWorkout(),
            onRenderWorkout: () => this.renderWorkout(true),
            onAutoSave: () => this.autoSave(null)
        });
        window.workoutWeightManager = this.weightManager;

        // Exercise Operations Manager
        this.exerciseOpsManager = new WorkoutExerciseOperationsManager({
            sessionService: this.sessionService,
            dataManager: this.dataManager,
            authService: this.authService,
            onRenderWorkout: () => this.renderWorkout(true),
            onAutoSave: () => this.autoSave(null),
            onGoToNext: (index) => this.goToNextExercise(index),
            onGetCurrentExerciseData: (name, index) => this.workoutDataManager.getCurrentExerciseData(name, this.currentWorkout, index),
            onGetAllExerciseNames: () => this.renderManager.getAllExerciseNames(this.currentWorkout),
            onGetCurrentWorkout: () => this.currentWorkout,
            onUpdateExerciseInTemplate: (name, data) => this.workoutDataManager.updateExerciseInTemplate(this.currentWorkout, name, data)
        });

        // Menu Manager
        this.menuManager = new WorkoutExerciseMenuManager();

        // Settings Manager
        this.settingsManager = new WorkoutSettingsManager({
            onGetCurrentWorkout: () => this.currentWorkout
        });

        // Reorder Manager
        this.reorderManager = new WorkoutReorderManager({
            sessionService: this.sessionService,
            onRenderWorkout: () => this.renderWorkout(true),
            onAutoSave: () => this.autoSave(null),
            onGetCurrentWorkout: () => this.currentWorkout,
            onToggleExerciseMenu: (btn, name, idx) => this.menuManager.toggleExerciseMenu(btn, name, idx)
        });

        // Session Notes Manager
        this.notesManager = new WorkoutSessionNotesManager({
            sessionService: this.sessionService,
            onRenderWorkout: () => this.renderWorkout(true),
            onGetCurrentWorkout: () => this.currentWorkout,
            onGetModalManager: () => this.getModalManager()
        });

        // FAB Manager (replaces bottom action bar)
        this.fabManager = new WorkoutModeFabManager();
        window.workoutModeFabManager = this.fabManager;

        // State
        this.currentWorkout = null;
        this.autoSaveTimer = null;
        this.isBuildMode = new URLSearchParams(window.location.search).get('mode') === 'build';

        console.log('🎮 Workout Mode Controller initialized');
    }

    // ========================================================================
    // CORE ORCHESTRATION
    // ========================================================================

    /** Get modal manager */
    getModalManager() {
        if (!window.ffnModalManager) {
            console.warn('⚠️ Modal manager not available');
        }
        return window.ffnModalManager;
    }

    /** Initialize controller - auth, persistence check, workout loading */
    async initialize() {
        try {
            console.log('🎮 Controller initialize() called');

            this.uiStateManager.updateLoadingMessage('Initializing authentication...');

            // Auth state listener
            this.authService.onAuthStateChange((user) => {
                this.handleAuthStateChange(user);
            });

            // Track page-active timestamp for session resume threshold
            const updatePageActiveTimestamp = () => {
                const stored = localStorage.getItem('ffn_active_workout_session');
                if (stored) {
                    try {
                        const sessionData = JSON.parse(stored);
                        sessionData.lastPageActive = new Date().toISOString();
                        localStorage.setItem('ffn_active_workout_session', JSON.stringify(sessionData));
                    } catch (e) {
                        console.warn('⚠️ Failed to update page active timestamp:', e);
                    }
                }
            };
            window.addEventListener('beforeunload', updatePageActiveTimestamp);
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) updatePageActiveTimestamp();
            });

            // Wait for auth before checking persisted session
            this.uiStateManager.updateLoadingMessage('Determining authentication status...');
            const authState = await this.dataManager.waitForAuthReady();
            console.log('✅ Auth state ready:', authState.storageMode, 'authenticated:', authState.isAuthenticated);

            // Always initialize settings and FABs
            // (needed for both resume and fresh-load paths)
            this.settingsManager.initialize();
            this.fabManager.initialize();

            // Get workout ID from URL
            const workoutId = this.getWorkoutIdFromUrl();

            // Check for persisted session — but if the URL specifies a different
            // workout, the user explicitly chose a new one, so skip resume
            const persistedSession = this.sessionService.restoreSession();
            if (persistedSession && (!workoutId || persistedSession.workoutId === workoutId)) {
                const hasSession = await this.lifecycleManager.checkPersistedSession(persistedSession);
                if (hasSession) return;
            } else if (persistedSession && workoutId && persistedSession.workoutId !== workoutId) {
                console.log(`🔄 URL workout (${workoutId}) differs from persisted session (${persistedSession.workoutId}), starting fresh`);
                this.sessionService.clearPersistedSession();
            }
            if (!workoutId) {
                if (this.isBuildMode) {
                    // Build mode without ID: create empty workout and proceed
                    await this.handleBuildModeStart();
                    return;
                }
                console.log('📄 No workout ID provided, redirecting to library...');
                sessionStorage.setItem('ffn_pending_toast', JSON.stringify({
                    message: 'No workout in progress. Choose a workout from your library to get started.',
                    type: 'info'
                }));
                window.location.href = 'workout-database.html';
                return;
            }

            this.uiStateManager.updateLoadingMessage(
                authState.isAuthenticated ? 'Loading workout from cloud...' : 'Loading workout...'
            );

            await this.loadWorkout(workoutId);

            // Auto-start session immediately (for all modes, not just build)
            if (!this.sessionService.isSessionActive()) {
                console.log('▶️ Auto-starting session');
                await this.lifecycleManager.handleStartWorkout();
            }

            console.log('✅ Workout Mode Controller ready');
        } catch (error) {
            console.error('❌ Controller initialization failed:', error);
            this.uiStateManager.showError(error.message);
        }
    }

    /** Get workout ID from URL query params */
    getWorkoutIdFromUrl() {
        return new URLSearchParams(window.location.search).get('id');
    }

    /** Handle build mode entry without a workout ID — creates an empty workout inline */
    async handleBuildModeStart() {
        const user = window.firebaseAuth?.currentUser;
        if (!user) {
            window.toastNotifications?.warning('Sign in to use Build & Log');
            window.authService?.showLoginModal();
            return;
        }
        this.uiStateManager.updateLoadingMessage('Setting up your session...');
        const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const workout = await this.dataManager.createWorkout({
            name: `Workout - ${today}`,
            exercise_groups: [],
            is_archived: true
        });
        if (!workout?.id) throw new Error('Failed to create workout');
        // Update URL so session persistence and reload work correctly
        window.history.replaceState({}, '', `workout-mode.html?id=${workout.id}&mode=build`);
        await this.loadWorkout(workout.id);
        if (!this.sessionService.isSessionActive()) {
            console.log('▶️ Auto-starting build mode session');
            await this.lifecycleManager.handleStartWorkout();
        }
        console.log('✅ Build mode session started');
    }

    /** Load workout data, fetch history, render */
    async loadWorkout(workoutId) {
        try {
            console.log('📥 Loading workout:', workoutId);
            this.uiStateManager.showLoading('Loading workout...');

            const workouts = await this.dataManager.getWorkouts();
            this.currentWorkout = workouts.find(w => w.id === workoutId);

            if (!this.currentWorkout) {
                // Log details for debugging, but show user-friendly error
                const availableIds = workouts?.map(w => w.id).join(', ') || 'none';
                console.warn(`Workout ${workoutId} not in ${workouts?.length || 0} workouts: ${availableIds}`);
                const error = new Error('This workout may have been deleted or is no longer available.');
                error.workoutNotFound = true;
                throw error;
            }

            // Update page title and header
            document.getElementById('workoutName').textContent = this.currentWorkout.name;
            document.title = `${this.currentWorkout.name} - Session - Fitness Field Notes`;
            const workoutInfoHeader = document.getElementById('workoutInfoHeader');
            if (workoutInfoHeader) workoutInfoHeader.style.display = 'block';

            // Fetch and display last completed date
            const lastCompleted = await this.workoutDataManager.fetchLastCompleted(this.currentWorkout, this.authService);
            const lastCompletedDate = document.getElementById('lastCompletedDate');
            if (lastCompleted && lastCompletedDate) {
                lastCompletedDate.textContent = lastCompleted.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            } else if (lastCompletedDate) {
                lastCompletedDate.textContent = 'Never';
            }

            // Fetch exercise history before render
            if (this.authService.isUserAuthenticated()) {
                console.log('📊 Fetching exercise history before render...');
                await this.sessionService.fetchExerciseHistory(this.currentWorkout.id);
            }

            // Set context and render
            this.lifecycleManager.setWorkout(this.currentWorkout);
            this.renderWorkout();
            this.uiStateManager.hideLoading();

            console.log('✅ Workout loaded:', this.currentWorkout.name);
        } catch (error) {
            console.error('❌ Error loading workout:', error);
            this.uiStateManager.showError(error.message);
            throw error;
        }
    }

    /** Render workout cards via render manager */
    renderWorkout(forceRender = false) {
        this.renderManager.render(this.currentWorkout, forceRender);
        // Sync cardManager reference for card navigation facades
        if (this.renderManager.cardManager) {
            this.cardManager = this.renderManager.cardManager;
        }
    }

    /** Auto-save session data */
    async autoSave(card) {
        try {
            const exercisesPerformed = this.workoutDataManager.collectExerciseData(this.currentWorkout);
            await this.sessionService.autoSaveSession(exercisesPerformed);
            if (card) this.uiStateManager.showSaveIndicator(card, 'success');
            console.log('✅ Auto-save successful');
        } catch (error) {
            console.error('❌ Auto-save failed:', error);
            if (card) this.uiStateManager.showSaveIndicator(card, 'error');
        }
    }

    /** Auto-expand first exercise card when workout starts */
    expandFirstExerciseCard() {
        const firstCard = document.querySelector('.exercise-card[data-exercise-index="0"]');
        if (firstCard && !firstCard.classList.contains('expanded')) {
            console.log('✨ Auto-expanding first exercise card');
            this.toggleExerciseCard(0);
        }
    }

    /** Handle auth state change - update tooltip only */
    async handleAuthStateChange(user) {
        console.log('🔄 Auth state changed:', user ? 'authenticated' : 'anonymous');
    }

    // ========================================================================
    // NAVIGATION & SESSION STATE
    // ========================================================================

    /** Navigate to workout builder */
    handleEditWorkout() {
        if (!this.currentWorkout) return;
        window.location.href = `workout-builder.html?id=${this.currentWorkout.id}`;
    }

    /** Navigate to workout database */
    handleChangeWorkout() {
        window.location.href = 'workout-database.html';
    }

    /** Show cancel confirmation and reset if confirmed */
    handleCancelWorkout() {
        if (window.UnifiedOffcanvasFactory) {
            window.UnifiedOffcanvasFactory.createConfirmOffcanvas({
                id: 'cancelWorkoutOffcanvas',
                title: 'Cancel Workout?',
                icon: 'bx-x-circle',
                iconColor: 'danger',
                message: 'Are you sure you want to cancel this workout session?',
                subMessage: 'All progress from this session will be discarded.',
                confirmText: 'Yes, Cancel',
                confirmVariant: 'danger',
                cancelText: 'Go Back',
                onConfirm: () => this.resetToFreshState()
            });
        } else {
            const modalManager = this.getModalManager();
            modalManager.confirm(
                'Cancel Workout?',
                'Are you sure you want to cancel this workout session?<br><br>All progress from this session will be discarded.',
                () => this.resetToFreshState(),
                { confirmText: 'Yes, Cancel', confirmClass: 'btn-danger', cancelText: 'Go Back' }
            );
        }
    }

    /** Reset page to fresh state - clear session, re-render */
    resetToFreshState() {
        console.log('🔄 Resetting page to fresh state...');
        this.sessionService.clearPersistedSession();
        if (this.timerManager) this.timerManager.stopSessionTimer();
        if (this.uiStateManager) this.uiStateManager.updateSessionState(false, null);
        if (this.lifecycleManager) this.lifecycleManager.showFloatingControls(false);
        this.renderWorkout();
        if (window.toastNotifications) {
            window.toastNotifications.info('Workout cancelled. Ready to start fresh!', 'Cancelled');
        } else if (window.showAlert) {
            window.showAlert('Workout cancelled.', 'info');
        }
        console.log('✅ Page reset to fresh state');
    }

    /** Sound enabled property (proxied to settings manager) */
    get soundEnabled() { return this.settingsManager ? this.settingsManager.soundEnabled : true; }
    set soundEnabled(value) { if (this.settingsManager) this.settingsManager.soundEnabled = value; }

    // ========================================================================
    // PUBLIC API FACADES
    // Called from HTML onclick handlers (exercise-card-renderer.js,
    // note-card-renderer.js, bottom-action-bar-config.js, offcanvas-workout.js,
    // global-rest-timer.js, workout-mode-refactored.js, workout-mode.html)
    // ========================================================================

    // Exercise operations (exercise-card-renderer.js)
    handleEditExercise(name, idx) { return this.exerciseOpsManager.handleEditExercise(name, idx); }
    handleCompleteExercise(name, idx) { return this.exerciseOpsManager.handleCompleteExercise(name, idx); }
    handleUncompleteExercise(name, idx) { return this.exerciseOpsManager.handleUncompleteExercise(name, idx); }
    handleSkipExercise(name, idx) { return this.exerciseOpsManager.handleSkipExercise(name, idx); }
    handleUnskipExercise(name, idx) { return this.exerciseOpsManager.handleUnskipExercise(name, idx); }
    async handleReplaceExercise(name, idx) { return await this.exerciseOpsManager.handleReplaceExercise(name, idx); }
    toggleExerciseMenu(btn, name, idx) { this.menuManager.toggleExerciseMenu(btn, name, idx); }
    toggleWeightDirection(btn, name, dir) { return this.weightManager.toggleWeightDirection(btn, name, dir); }
    handleMoveUp(idx) { this.reorderManager.handleMoveUp(idx); }
    handleMoveDown(idx) { this.reorderManager.handleMoveDown(idx); }

    // Note operations (note-card-renderer.js)
    handleEditNote(id) { this.notesManager.handleEditNote(id); }
    handleSaveNote(id) { this.notesManager.handleSaveNote(id); }
    handleCancelNoteEdit(id) { this.notesManager.handleCancelNoteEdit(id); }
    handleDeleteNote(id) { this.notesManager.handleDeleteNote(id); }
    toggleNoteMenu(btn, id, idx) { this.notesManager.toggleNoteMenu(btn, id, idx); }

    // Session lifecycle (bottom-action-bar-config.js)
    async handleStartWorkout() { return await this.lifecycleManager.handleStartWorkout(); }
    async handleCompleteWorkout() { return this.lifecycleManager.handleCompleteWorkout(); }
    handleAddNote() { return this.notesManager.handleAddNote(); }
    showAddExerciseForm() { return this.exerciseOpsManager.showAddExerciseForm(); }
    showAddActivityForm() { return this.exerciseOpsManager.showAddActivityForm(); }
    showReorderOffcanvas() { this.reorderManager.showReorderOffcanvas(); }
    initializeShareButton() { this.settingsManager.initializeShareButton(); }

    // Card navigation (global-rest-timer.js, workout-mode-refactored.js)
    toggleExerciseCard(idx) { if (this.cardManager) this.cardManager.toggle(idx); }
    goToNextExercise(idx) { if (this.cardManager) this.cardManager.goToNext(idx, () => this.handleCompleteWorkout()); }
}

// Initialize controller on page load
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎮 Controller DOMContentLoaded event fired');
    window.workoutModeController = new WorkoutModeController();
    window.workoutModeController.initialize();
});

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WorkoutModeController;
}

console.log('📦 Workout Mode Controller loaded');
