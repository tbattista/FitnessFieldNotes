/**
 * Ghost Gym - Workout Session Service
 * Orchestrator for workout session lifecycle and exercise state
 * Delegates to: SessionLifecycleApiService, SessionExerciseStateService,
 *   WeightHistoryService, SessionNotesService,
 *   PreSessionEditingService, SessionPersistenceService, AutoSaveService
 * @version 3.0.0
 * @date 2026-02-14
 */

class WorkoutSessionService {
    constructor() {
        this.currentSession = null;
        this.listeners = new Set();

        // Initialize Weight History Service
        this.weightHistoryService = new WeightHistoryService({
            onHistoryLoaded: (history) => this.notifyListeners('historyLoaded', history),
            onExerciseOrderFromHistory: (order) => this.setExerciseOrder(order)
        });

        // Initialize Session Notes Service
        this.sessionNotesService = new SessionNotesService({
            onNotify: (event, data) => this.notifyListeners(event, data),
            onPersist: () => this.persistSession()
        });

        // Initialize Pre-Session Editing Service
        this.preSessionEditingService = new PreSessionEditingService({
            onNotify: (event, data) => this.notifyListeners(event, data)
        });

        // Initialize Session Persistence Service
        this.sessionPersistenceService = new SessionPersistenceService({
            onGetCurrentSession: () => this.currentSession,
            onGetSessionNotes: () => this.sessionNotes,
            onSetSessionNotes: (notes) => { this.sessionNotes = notes; },
            onGetExerciseOrder: () => this.preSessionOrder,
            onSetExerciseOrder: (order) => { this.preSessionOrder = order; }
        });

        // Initialize Auto Save Service
        this.autoSaveService = new AutoSaveService({
            onGetCurrentSession: () => this.currentSession,
            onNotify: (event, data) => this.notifyListeners(event, data),
            onPersist: () => this.persistSession()
        });

        // Initialize Exercise State Service
        this.exerciseStateService = new SessionExerciseStateService({
            onGetCurrentSession: () => this.currentSession,
            onGetExerciseHistory: () => this.exerciseHistory,
            onIsSessionActive: () => this.isSessionActive(),
            onNotify: (event, data) => this.notifyListeners(event, data),
            onPersist: () => this.persistSession()
        });

        // Initialize Lifecycle API Service
        this.lifecycleApiService = new SessionLifecycleApiService({
            onGetCurrentSession: () => this.currentSession,
            onSetCurrentSession: (session) => { this.currentSession = session; },
            onGetSessionNotes: () => this.sessionNotes,
            onGetPreSessionOrder: () => this.preSessionOrder,
            onGetPreSessionEditingService: () => this.preSessionEditingService,
            onNotify: (event, data) => this.notifyListeners(event, data),
            onPersist: () => this.persistSession(),
            onClearPersistedSession: () => this.clearPersistedSession()
        });

        console.log('\ud83d\udce6 Workout Session Service initialized');
    }

    // ============================================
    // BACKWARD COMPATIBILITY GETTERS/SETTERS
    // ============================================

    get autoSaveTimer() {
        return this.autoSaveService?.autoSaveTimer || null;
    }
    set autoSaveTimer(value) {
        if (this.autoSaveService) this.autoSaveService.autoSaveTimer = value;
    }

    get exerciseHistory() {
        return this.weightHistoryService?.exerciseHistory || {};
    }
    set exerciseHistory(value) {
        if (this.weightHistoryService) this.weightHistoryService.exerciseHistory = value;
    }

    get sessionNotes() {
        return this.sessionNotesService?.sessionNotes || [];
    }
    set sessionNotes(value) {
        if (this.sessionNotesService) this.sessionNotesService.sessionNotes = value;
    }

    get preSessionEdits() {
        return this.preSessionEditingService?.preSessionEdits || {};
    }
    set preSessionEdits(value) {
        if (this.preSessionEditingService) this.preSessionEditingService.preSessionEdits = value;
    }

    get preSessionOrder() {
        return this.preSessionEditingService?.preSessionOrder || [];
    }
    set preSessionOrder(value) {
        if (this.preSessionEditingService) this.preSessionEditingService.preSessionOrder = value;
    }

    get preSessionSkips() {
        return this.preSessionEditingService?.preSessionSkips || {};
    }
    set preSessionSkips(value) {
        if (this.preSessionEditingService) this.preSessionEditingService.preSessionSkips = value;
    }

    // ============================================
    // SESSION LIFECYCLE FACADES
    // ============================================

    async startSession(workoutId, workoutName, workoutData = null) {
        return this.lifecycleApiService.startSession(workoutId, workoutName, workoutData);
    }

    async completeSession(exercisesPerformed, durationMinutes = null) {
        return this.lifecycleApiService.completeSession(exercisesPerformed, durationMinutes);
    }

    // ============================================
    // AUTO SAVE FACADE
    // ============================================

    async autoSaveSession(exercisesPerformed) {
        return this.autoSaveService.autoSaveSession(exercisesPerformed);
    }

    // ============================================
    // WEIGHT HISTORY FACADE
    // ============================================

    async fetchExerciseHistory(workoutId) {
        return this.weightHistoryService.fetchExerciseHistory(workoutId);
    }

    // ============================================
    // EXERCISE STATE FACADES
    // ============================================

    updateExerciseWeight(exerciseName, weight, unit) {
        return this.exerciseStateService.updateExerciseWeight(exerciseName, weight, unit);
    }

    updateExerciseDetails(exerciseName, details) {
        return this.exerciseStateService.updateExerciseDetails(exerciseName, details);
    }

    updateExerciseNotes(exerciseName, notes) {
        return this.exerciseStateService.updateExerciseNotes(exerciseName, notes);
    }

    updatePreSessionNotes(exerciseName, notes) {
        return this.exerciseStateService.updatePreSessionNotes(exerciseName, notes);
    }

    skipExercise(exerciseName, reason = '') {
        return this.exerciseStateService.skipExercise(exerciseName, reason);
    }

    unskipExercise(exerciseName) {
        return this.exerciseStateService.unskipExercise(exerciseName);
    }

    completeExercise(exerciseName) {
        return this.exerciseStateService.completeExercise(exerciseName);
    }

    uncompleteExercise(exerciseName) {
        return this.exerciseStateService.uncompleteExercise(exerciseName);
    }

    setWeightDirection(exerciseName, direction) {
        return this.exerciseStateService.setWeightDirection(exerciseName, direction);
    }

    getWeightDirection(exerciseName) {
        return this.exerciseStateService.getWeightDirection(exerciseName);
    }

    getLastWeightDirection(exerciseName) {
        return this.exerciseStateService.getLastWeightDirection(exerciseName);
    }

    startAutoCompleteTimer(exerciseName, timeoutMinutes = 10) {
        return this.exerciseStateService.startAutoCompleteTimer(exerciseName, timeoutMinutes);
    }

    clearAutoCompleteTimer(exerciseName) {
        return this.exerciseStateService.clearAutoCompleteTimer(exerciseName);
    }

    clearAllAutoCompleteTimers() {
        return this.exerciseStateService.clearAllAutoCompleteTimers();
    }

    getAutoCompleteRemainingTime(exerciseName) {
        return this.exerciseStateService.getAutoCompleteRemainingTime(exerciseName);
    }

    // ============================================
    // PRE-SESSION EDITING FACADES
    // ============================================

    updatePreSessionExercise(exerciseName, details) {
        return this.preSessionEditingService.updatePreSessionExercise(exerciseName, details);
    }

    getPreSessionEdits(exerciseName) {
        return this.preSessionEditingService.getPreSessionEdits(exerciseName);
    }

    clearPreSessionEdits() {
        return this.preSessionEditingService.clearPreSessionEdits();
    }

    skipPreSessionExercise(exerciseName, reason = '') {
        return this.preSessionEditingService.skipPreSessionExercise(exerciseName, reason);
    }

    unskipPreSessionExercise(exerciseName) {
        return this.preSessionEditingService.unskipPreSessionExercise(exerciseName);
    }

    isPreSessionSkipped(exerciseName) {
        return this.preSessionEditingService.isPreSessionSkipped(exerciseName);
    }

    getPreSessionSkips() {
        return this.preSessionEditingService.getPreSessionSkips();
    }

    clearPreSessionSkips() {
        return this.preSessionEditingService.clearPreSessionSkips();
    }

    setExerciseOrder(exerciseNames) {
        return this.preSessionEditingService.setExerciseOrder(exerciseNames);
    }

    getExerciseOrder() {
        return this.preSessionEditingService.getExerciseOrder();
    }

    clearExerciseOrder() {
        return this.preSessionEditingService.clearExerciseOrder();
    }

    hasCustomOrder() {
        return this.preSessionEditingService.hasCustomOrder();
    }

    // ============================================
    // SESSION PERSISTENCE FACADES
    // ============================================

    persistSession() {
        return this.sessionPersistenceService.persistSession();
    }

    restoreSession() {
        return this.sessionPersistenceService.restoreSession();
    }

    clearPersistedSession() {
        return this.sessionPersistenceService.clearPersistedSession();
    }

    hasPersistedSession() {
        return this.sessionPersistenceService.hasPersistedSession();
    }

    // ============================================
    // SESSION NOTES FACADES
    // ============================================

    addSessionNote(position, content = '') {
        return this.sessionNotesService.addSessionNote(position, content);
    }

    updateSessionNote(noteId, content) {
        return this.sessionNotesService.updateSessionNote(noteId, content);
    }

    deleteSessionNote(noteId) {
        return this.sessionNotesService.deleteSessionNote(noteId);
    }

    getSessionNotes() {
        return this.sessionNotesService.getSessionNotes();
    }

    getSessionNote(noteId) {
        return this.sessionNotesService.getSessionNote(noteId);
    }

    clearSessionNotes() {
        return this.sessionNotesService.clearSessionNotes();
    }

    updateSessionNoteOrder(noteId, newOrderIndex) {
        return this.sessionNotesService.updateSessionNoteOrder(noteId, newOrderIndex);
    }

    // ============================================
    // QUERY METHODS
    // ============================================

    getExerciseHistory(exerciseName) {
        return this.exerciseHistory[exerciseName] || null;
    }

    getCurrentSession() {
        return this.currentSession;
    }

    isSessionActive() {
        return this.currentSession && this.currentSession.status === 'in_progress';
    }

    getExerciseWeight(exerciseName) {
        if (!this.currentSession || !this.currentSession.exercises) {
            return null;
        }
        return this.currentSession.exercises[exerciseName] || null;
    }

    // ============================================
    // SESSION MANAGEMENT
    // ============================================

    clearSession() {
        this.exerciseStateService.clearAllAutoCompleteTimers();

        this.currentSession = null;
        this.exerciseHistory = {};

        this.clearSessionNotes();

        if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }

        console.log('\ud83e\uddf9 Session cleared');
        this.notifyListeners('sessionCleared', {});

        this.clearPersistedSession();
    }

    // ============================================
    // EVENT SYSTEM
    // ============================================

    addListener(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    notifyListeners(event, data) {
        this.listeners.forEach(callback => {
            try {
                callback(event, data);
            } catch (error) {
                console.error('Error in session listener:', error);
            }
        });
    }

    // ============================================
    // STATUS
    // ============================================

    getStatus() {
        return {
            hasActiveSession: this.isSessionActive(),
            sessionId: this.currentSession?.id || null,
            workoutName: this.currentSession?.workoutName || null,
            exerciseCount: Object.keys(this.exerciseHistory).length,
            startedAt: this.currentSession?.startedAt || null
        };
    }
}

// Create global instance
window.workoutSessionService = new WorkoutSessionService();

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WorkoutSessionService;
}

console.log('\ud83d\udce6 Workout Session Service loaded');
