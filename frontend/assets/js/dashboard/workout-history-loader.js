/**
 * Ghost Gym - Workout History Loader
 * Data fetching and initialization
 * @version 1.0.0
 */

/* ============================================
   INITIALIZATION
   ============================================ */

/**
 * Initialize workout history page
 * Supports three URL patterns:
 * - workout-history.html (no params) → All Sessions mode
 * - workout-history.html?id=WORKOUT_ID → Single Workout mode
 * - workout-history.html?session=SESSION_ID → All Sessions mode, scroll to session
 */
async function initWorkoutHistory() {
  console.log('📊 Initializing Workout History...');

  // Get URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const workoutId = urlParams.get('id');
  const sessionId = urlParams.get('session');

  // Wait for Firebase
  if (!window.firebaseReady) {
    await new Promise(resolve => {
      window.addEventListener('firebaseReady', resolve, { once: true });
    });
  }

  if (workoutId) {
    // Single Workout mode (existing behavior)
    window.ffn.workoutHistory.workoutId = workoutId;
    window.ffn.workoutHistory.isAllMode = false;
    await loadWorkoutHistory(workoutId);
  } else {
    // All Sessions mode (new)
    window.ffn.workoutHistory.isAllMode = true;
    await loadAllSessions(sessionId); // Pass sessionId to scroll to if provided
  }
}

/* ============================================
   DATA LOADING - SINGLE WORKOUT MODE
   ============================================ */

/**
 * Load workout history data for a single workout
 */
async function loadWorkoutHistory(workoutId) {
  try {
    showLoading();

    // Fetch sessions, exercise history, and personal records in parallel
    const [sessionsData, exerciseData] = await Promise.all([
      fetchWorkoutSessions(workoutId),
      fetchExerciseHistory(workoutId),
      fetchPersonalRecords() // Fire-and-forget, populates state directly
    ]);

    // Update state
    window.ffn.workoutHistory.sessions = sessionsData.sessions || [];
    window.ffn.workoutHistory.workoutInfo = sessionsData.workout_info;
    window.ffn.workoutHistory.exerciseHistories = exerciseData.exercises || {};

    // Check if we have any data
    if (window.ffn.workoutHistory.sessions.length === 0) {
      hideLoading();
      showEmptyState();
      return;
    }

    // Calculate statistics
    calculateStatistics();

    // Render UI
    renderWorkoutInfo();
    renderStatistics();
    renderSessionHistory();
    renderExercisePerformance();
    if (window.renderPRSection) renderPRSection();
    initHistoryCalendar();

    // Show content
    hideLoading();
    document.getElementById('historyContent').style.display = 'block';

    console.log('✅ Workout history loaded successfully');

  } catch (error) {
    console.error('❌ Error loading workout history:', error);
    showError(error.message);
  }
}

/* ============================================
   DATA LOADING - ALL SESSIONS MODE
   ============================================ */

/**
 * Load all sessions (All Sessions mode)
 * @param {string|null} scrollToSessionId - Optional session ID to scroll to after loading
 */
async function loadAllSessions(scrollToSessionId = null) {
  try {
    showLoading();

    // Get auth token - getAuthToken() will throw if not authenticated
    // Note: Don't check isUserAuthenticated() separately due to mobile race condition
    if (!window.dataManager) {
      throw new Error('Data manager not available');
    }

    // Debug: Log user at API call time
    const fbUser = window.dataManager.getFirebaseUser();
    const uid = fbUser?.uid || 'NULL';
    const email = fbUser?.email || 'NULL';
    console.log('🔍 [HISTORY] API call user - UID:', uid, 'Email:', email);
    if (window.mobileDebugLog) window.mobileDebugLog('📱 HISTORY USER: ' + email + ' UID:' + uid.substring(0, 8));

    const token = await window.dataManager.getAuthToken();
    if (window.mobileDebugLog) window.mobileDebugLog('Token: ' + (token ? token.substring(0, 20) + '...' : 'NO TOKEN'));

    // Fetch workout sessions, cardio sessions, and personal records in parallel
    const [workoutResponse, cardioResponse] = await Promise.all([
      fetch('/api/v3/workout-sessions?status=completed&page_size=100&sort=desc', {
        headers: { 'Authorization': `Bearer ${token}` }
      }),
      fetch('/api/v3/cardio-sessions?page_size=100', {
        headers: { 'Authorization': `Bearer ${token}` }
      }).catch(() => null), // Don't fail if cardio endpoint errors
      fetchPersonalRecords() // Fire-and-forget, populates state directly
    ]);

    console.log('🔍 [HISTORY] Workout response status:', workoutResponse.status);
    if (window.mobileDebugLog) window.mobileDebugLog('Response: ' + workoutResponse.status);

    if (!workoutResponse.ok) {
      throw new Error('Failed to fetch workout sessions');
    }

    const workoutData = await workoutResponse.json();
    const workoutSessions = (workoutData.sessions || []).map(s => ({ ...s, _sessionType: 'strength' }));
    console.log('🔍 [HISTORY] Got workout sessions:', workoutSessions.length);

    // Parse cardio sessions if available
    let cardioSessions = [];
    if (cardioResponse && cardioResponse.ok) {
      const cardioData = await cardioResponse.json();
      cardioSessions = (cardioData.sessions || []).map(s => ({ ...s, _sessionType: 'cardio' }));
      console.log('🔍 [HISTORY] Got cardio sessions:', cardioSessions.length);
    }

    // Merge and sort by started_at descending
    const allSessions = [...workoutSessions, ...cardioSessions].sort((a, b) => {
      const dateA = new Date(a.started_at || a.created_at);
      const dateB = new Date(b.started_at || b.created_at);
      return dateB - dateA;
    });

    if (window.mobileDebugLog) window.mobileDebugLog('Total sessions: ' + allSessions.length);

    window.ffn.workoutHistory.sessions = allSessions;

    // No exercise history in all mode (API requires workout_id)
    window.ffn.workoutHistory.exerciseHistories = {};

    // Check if we have any data
    if (window.ffn.workoutHistory.sessions.length === 0) {
      hideLoading();
      showEmptyState();
      return;
    }

    // Calculate statistics
    calculateStatistics();

    // Render UI for All Mode
    await renderAllModeUI();
    initHistoryCalendar();

    // Show content
    hideLoading();
    document.getElementById('historyContent').style.display = 'block';

    // If sessionId provided, scroll to it after a short delay
    if (scrollToSessionId) {
      setTimeout(() => scrollToSession(scrollToSessionId), 500);
    }

    console.log(`✅ All sessions loaded: ${window.ffn.workoutHistory.sessions.length} sessions`);

  } catch (error) {
    console.error('❌ Error loading all sessions:', error);
    showError(error.message);
  }
}

/**
 * Render UI for All Sessions mode
 */
async function renderAllModeUI() {
  // Extract unique workout names for filter dropdown
  extractUniqueWorkouts();

  renderWorkoutInfo();
  renderStatistics();
  renderSessionHistory();

  // Render PR section at top
  if (window.renderPRSection) renderPRSection();

  // Aggregate and render exercise overview (All Sessions mode)
  await aggregateAndRenderExercises();
}

/**
 * Aggregate exercise data from sessions and render the exercise tab
 * Async to ensure exercise cache is loaded for fuzzy matching
 */
async function aggregateAndRenderExercises() {
  // Ensure exercise cache is ready for fuzzy matching
  const cacheService = window.exerciseCacheService;
  if (cacheService) {
    try {
      await cacheService.getExercisesWithInstantFallback();
    } catch (e) {
      console.warn('[History] Could not load exercise cache for fuzzy matching:', e);
    }
  }

  const sessions = window.ffn.workoutHistory.sessions;
  // Only aggregate strength sessions (exclude cardio)
  const strengthSessions = sessions.filter(s => s._sessionType !== 'cardio');

  window.ffn.workoutHistory.allExerciseGroups = aggregateExercisesFromSessions(strengthSessions);

  renderExerciseTab();

  // Show the desktop card wrapper
  const wrapper = document.getElementById('exerciseOverviewCardWrapper');
  if (wrapper) {
    wrapper.style.display = '';
  }
}

/* ============================================
   API CALLS
   ============================================ */

/**
 * Fetch workout sessions from API
 */
async function fetchWorkoutSessions(workoutId) {
  try {
    // Get auth token - getAuthToken() will throw if not authenticated
    // Note: Don't check isUserAuthenticated() separately due to mobile race condition
    if (!window.dataManager) {
      throw new Error('Data manager not available');
    }

    const token = await window.dataManager.getAuthToken();
    const response = await fetch(
      `/api/v3/workout-sessions?workout_id=${workoutId}&status=completed&page_size=50`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch workout sessions');
    }

    const data = await response.json();

    // Get workout info separately if not included
    let workout_info = null;
    if (window.dataManager && window.dataManager.getWorkouts) {
      const workouts = await window.dataManager.getWorkouts();
      workout_info = workouts.find(w => w.id === workoutId);
    }

    return {
      sessions: data.sessions || [],
      workout_info: workout_info
    };
  } catch (error) {
    console.error('Error fetching sessions:', error);
    throw error;
  }
}

/**
 * Fetch exercise history from API
 */
async function fetchExerciseHistory(workoutId) {
  try {
    // Get auth token - getAuthToken() will throw if not authenticated
    // Note: Don't check isUserAuthenticated() separately due to mobile race condition
    if (!window.dataManager) {
      throw new Error('Data manager not available');
    }

    const token = await window.dataManager.getAuthToken();
    const response = await fetch(
      `/api/v3/workout-sessions/history/workout/${workoutId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch exercise history');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching exercise history:', error);
    throw error;
  }
}

/* ============================================
   PERSONAL RECORDS LOADING
   ============================================ */

/**
 * Fetch personal records from API and populate state indexes
 */
async function fetchPersonalRecords() {
  try {
    if (!window.dataManager) return;

    const token = await window.dataManager.getAuthToken();
    const response = await fetch('/api/v3/users/me/personal-records', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      console.warn('Failed to fetch personal records:', response.status);
      return;
    }

    const data = await response.json();
    const state = window.ffn.workoutHistory;

    // Clear and rebuild indexes
    state.personalRecords.clear();
    state.prExerciseNames.clear();

    (data.records || []).forEach(pr => {
      state.personalRecords.set(pr.id, pr);
      state.prExerciseNames.add(pr.exercise_name.toLowerCase());
    });

    // Store ordered record IDs for display order
    state.prRecordIds = data.recordIds || [];

    console.log(`📊 Loaded ${state.personalRecords.size} personal records`);
  } catch (error) {
    console.warn('Could not load personal records:', error.message);
  }
}

/* ============================================
   HELPER FUNCTIONS
   ============================================ */

/**
 * Extract unique workout names from sessions
 */
function extractUniqueWorkouts() {
  const sessions = window.ffn.workoutHistory.sessions;
  const workoutMap = new Map();

  sessions.forEach(session => {
    const name = session.workout_name || 'Unknown Workout';
    if (!workoutMap.has(name)) {
      workoutMap.set(name, {
        name: name,
        count: 1
      });
    } else {
      workoutMap.get(name).count++;
    }
  });

  // Sort by count (most frequent first)
  window.ffn.workoutHistory.uniqueWorkouts = Array.from(workoutMap.values())
    .sort((a, b) => b.count - a.count);
}

/* ============================================
   EXPORTS
   ============================================ */

// Export to window for backwards compatibility
window.initWorkoutHistory = initWorkoutHistory;
window.loadWorkoutHistory = loadWorkoutHistory;
window.loadAllSessions = loadAllSessions;
window.renderAllModeUI = renderAllModeUI;
window.aggregateAndRenderExercises = aggregateAndRenderExercises;
window.fetchWorkoutSessions = fetchWorkoutSessions;
window.fetchExerciseHistory = fetchExerciseHistory;
window.extractUniqueWorkouts = extractUniqueWorkouts;
window.fetchPersonalRecords = fetchPersonalRecords;

console.log('📦 Workout History Loader module loaded (v1.0.0)');
