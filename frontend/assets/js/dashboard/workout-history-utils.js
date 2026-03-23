/**
 * Ghost Gym - Workout History Utilities
 * Stats calculation, formatting, and UI state management
 * @version 1.0.0
 */

/* ============================================
   STATISTICS CALCULATION
   ============================================ */

/**
 * Calculate statistics from session data
 */
function calculateStatistics() {
  const sessions = window.ffn.workoutHistory.sessions;
  const stats = window.ffn.workoutHistory.statistics;

  stats.totalWorkouts = sessions.length;

  if (sessions.length > 0) {
    // Average duration
    const totalDuration = sessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
    stats.avgDuration = Math.round(totalDuration / sessions.length);

    // Last completed
    stats.lastCompleted = sessions[0]?.completed_at;

    // Total volume (sum of all weights × sets)
    stats.totalVolume = sessions.reduce((sum, session) => {
      const sessionVolume = (session.exercises_performed || []).reduce((exSum, ex) => {
        return exSum + ((ex.weight || 0) * (ex.sets_completed || 0));
      }, 0);
      return sum + sessionVolume;
    }, 0);
  }
}

/**
 * Get count of sessions this month
 */
function getThisMonthSessionCount() {
  const sessions = window.ffn.workoutHistory.sessions;
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  return sessions.filter(s => {
    const d = new Date(s.completed_at);
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  }).length;
}

/* ============================================
   RENDERING - WORKOUT INFO & STATISTICS
   ============================================ */

/**
 * Render workout information header
 */
function renderWorkoutInfo() {
  const isAllMode = window.ffn.workoutHistory.isAllMode;

  // Subheader containers (hidden by default)
  const subheader = document.getElementById('workoutHistorySubheader');
  const desktopSubheader = document.getElementById('desktopWorkoutHistorySubheader');

  if (isAllMode) {
    // All Sessions mode - static heading is sufficient, hide subheader
    if (subheader) subheader.style.display = 'none';
    if (desktopSubheader) desktopSubheader.style.display = 'none';
    return;
  }

  // Single workout mode - show workout info in subheader
  const info = window.ffn.workoutHistory.workoutInfo;
  if (info) {
    document.getElementById('workoutName').textContent = info.name;
    const descEl = document.getElementById('workoutDescription');
    if (descEl) {
      descEl.textContent = info.description || '';
    }
    if (subheader) subheader.style.display = '';
    if (desktopSubheader) desktopSubheader.style.display = '';
  }
}

/**
 * Render compact statistics summary
 */
function renderStatistics() {
  const stats = window.ffn.workoutHistory.statistics;
  const container = document.getElementById('statisticsCards');

  // Guard against missing container (Insights tab removed)
  if (!container) return;

  // Guard against NaN/undefined
  const sessionCount = stats.totalWorkouts || 0;
  const avgDuration = isNaN(stats.avgDuration) ? 0 : stats.avgDuration;
  const lastDate = stats.lastCompleted
    ? formatDate(stats.lastCompleted, { short: true })
    : null;

  // Build compact summary parts
  let summaryParts = [];

  if (lastDate) {
    summaryParts.push(`Last trained: ${lastDate}`);
    if (avgDuration > 0) {
      summaryParts.push(`${avgDuration} min`);
    }
  }

  const thisMonthCount = getThisMonthSessionCount();
  if (thisMonthCount > 0) {
    summaryParts.push(`This month: ${thisMonthCount} sessions`);
  } else if (sessionCount > 0) {
    summaryParts.push(`${sessionCount} total sessions`);
  }

  if (summaryParts.length === 0) {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }

  container.innerHTML = `
    <div class="col-12">
      <div class="stats-summary-row">
        ${summaryParts.join(' <span class="stats-dot">•</span> ')}
      </div>
    </div>
  `;
  container.style.display = 'block';
}

/* ============================================
   FORMATTING UTILITIES
   ============================================ */

/**
 * Format duration with validation (clamp unrealistic values)
 */
function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return '—';
  // Clamp to reasonable max (4 hours = 240 min)
  if (minutes > 240) return '—';
  return `${minutes} min`;
}

/**
 * Format date for display (conversational style)
 */
function formatDate(dateString, options = {}) {
  if (!dateString) return 'N/A';

  try {
    const date = new Date(dateString);
    const now = new Date();
    const isCurrentYear = date.getFullYear() === now.getFullYear();

    // Short format: "Jan 25" or "Jan 25, 2024" for older dates
    if (options.short) {
      if (isCurrentYear) {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } else {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }
    }

    // Full format for details
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch (e) {
    return 'Invalid date';
  }
}

/**
 * Format date for exercise rows (compact)
 */
function formatExerciseDate(dateString) {
  if (!dateString) return '—';
  try {
    const date = new Date(dateString);
    const now = new Date();
    if (date.getFullYear() === now.getFullYear()) {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (e) {
    return '—';
  }
}

/**
 * Get last reps from exercise history
 */
function getLastReps(history) {
  if (history.recent_sessions && history.recent_sessions.length > 0) {
    const lastSession = history.recent_sessions[0];
    return lastSession.reps || lastSession.sets || '—';
  }
  return '—';
}

/**
 * Get muted trend arrow based on direction
 */
function getTrendArrow(direction) {
  if (!direction) return '';
  if (direction === 'up') {
    return '<span class="trend-arrow trend-up" title="Trending up">↑</span>';
  }
  if (direction === 'down') {
    return '<span class="trend-arrow trend-down" title="Trending down">↓</span>';
  }
  return '<span class="trend-arrow trend-stable" title="Stable">→</span>';
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/* ============================================
   UI STATE MANAGEMENT
   ============================================ */

/**
 * Show loading state
 */
function showLoading() {
  document.getElementById('historyLoadingState').style.display = 'block';
  document.getElementById('historyErrorState').style.display = 'none';
  document.getElementById('historyEmptyState').style.display = 'none';
  document.getElementById('historyContent').style.display = 'none';
}

/**
 * Hide loading state
 */
function hideLoading() {
  document.getElementById('historyLoadingState').style.display = 'none';
}

/**
 * Show error state
 */
function showError(message) {
  hideLoading();
  document.getElementById('historyErrorState').style.display = 'block';
  document.getElementById('historyErrorMessage').textContent = message;
  document.getElementById('historyContent').style.display = 'none';
  document.getElementById('historyEmptyState').style.display = 'none';
}

/**
 * Show empty state
 */
function showEmptyState() {
  hideLoading();
  document.getElementById('historyEmptyState').style.display = 'block';
  document.getElementById('historyContent').style.display = 'none';
}

/* ============================================
   SESSION DELETION
   ============================================ */

/**
 * Delete a workout session
 * @param {string} sessionId - Session ID to delete
 * @param {string} workoutName - Workout name for confirmation message
 */
async function deleteSession(sessionId, workoutName) {
  ffnModalManager.confirm('Delete Session', `Delete this ${workoutName} session? This cannot be undone.`, async () => {
    try {
      // Check authentication
      if (!window.dataManager || !window.dataManager.isUserAuthenticated()) {
        throw new Error('Authentication required');
      }

      const token = await window.dataManager.getAuthToken();
      const response = await fetch(`/api/v3/workout-sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to delete session');
      }

      // Remove from local state
      window.ffn.workoutHistory.sessions =
        window.ffn.workoutHistory.sessions.filter(s => s.id !== sessionId);

      // Re-render
      if (typeof renderSessionHistory === 'function') {
        renderSessionHistory();
      }
      calculateStatistics();
      renderStatistics();

      // Update calendar if visible
      if (window.ffn.workoutHistory.calendarView) {
        window.ffn.workoutHistory.calendarView.setSessionData(
          window.ffn.workoutHistory.sessions
        );
      }

      console.log('✅ Session deleted:', sessionId);

    } catch (error) {
      console.error('❌ Error deleting session:', error);
      ffnModalManager.alert('Error', 'Failed to delete session. Please try again.', 'danger');
    }
  }, { confirmText: 'Delete', confirmClass: 'btn-danger', size: 'sm' });
}

/* ============================================
   EXPORTS
   ============================================ */

// Export to window for backwards compatibility
window.calculateStatistics = calculateStatistics;
window.getThisMonthSessionCount = getThisMonthSessionCount;
window.renderWorkoutInfo = renderWorkoutInfo;
window.renderStatistics = renderStatistics;
window.formatDuration = formatDuration;
window.formatDate = formatDate;
window.formatExerciseDate = formatExerciseDate;
window.getLastReps = getLastReps;
window.getTrendArrow = getTrendArrow;
window.escapeHtml = escapeHtml;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.showError = showError;
window.showEmptyState = showEmptyState;
window.deleteSession = deleteSession;

console.log('📦 Workout History Utils module loaded (v1.0.0)');
