/**
 * Ghost Gym - Workout History Calendar
 * Calendar view initialization, date filtering, day detail offcanvas,
 * range selection, and quick presets
 * @version 2.0.0
 */

/* ============================================
   CALENDAR INITIALIZATION
   ============================================ */

/**
 * Initialize the history calendar view
 * Shows only sessions for the selected workout
 */
function initHistoryCalendar() {
  const sessions = window.ffn.workoutHistory.sessions;

  // Create calendar instance if it doesn't exist
  if (!window.ffn.workoutHistory.calendarView) {
    window.ffn.workoutHistory.calendarView = new CalendarView('historyCalendarGrid', {
      monthLabelId: 'historyCurrentMonth',
      prevButtonId: 'historyPrevMonth',
      nextButtonId: 'historyNextMonth',
      onDayClick: handleCalendarDayClick,
      onRangeSelect: handleCalendarRangeSelect
    });

    // CalendarView uses window.calendarView for onclick handlers
    window.calendarView = window.ffn.workoutHistory.calendarView;
  }

  // Set the session data (already filtered by workout)
  window.ffn.workoutHistory.calendarView.setSessionData(sessions);

  // Initialize presets
  initCalendarPresets();

  console.log(`📅 History calendar initialized with ${sessions.length} sessions`);
}

/* ============================================
   CALENDAR DAY CLICK HANDLING
   ============================================ */

/**
 * Handle calendar day click - show day detail offcanvas
 * In All Mode: shows bottom sheet with day's sessions, also filters History tab
 * In Single Workout Mode: scrolls to session
 */
function handleCalendarDayClick(dateKey, daySessions) {
  const isAllMode = window.ffn.workoutHistory.isAllMode;

  // Clear any active preset highlight
  clearPresetHighlight();

  // Clear inline range sessions if showing
  hideCalendarRangeSessions();

  if (isAllMode) {
    // Set filter for History tab (so switching tabs shows filtered view)
    setDateFilter(dateKey);
    // Show bottom sheet with day's workouts
    showDayDetailOffcanvas(dateKey, daySessions);
    return;
  }

  // In Single Workout mode, scroll to session (original behavior)
  if (daySessions.length === 0) {
    return;
  }
  scrollToSession(daySessions[0].id);
}

/**
 * Handle range selection complete
 */
function handleCalendarRangeSelect(startDate, endDate, sessions) {
  clearPresetHighlight();
  setDateRangeFilter(startDate, endDate);
  renderCalendarRangeSessions(startDate, endDate, sessions);
}

/* ============================================
   DAY DETAIL BOTTOM SHEET
   ============================================ */

/**
 * Show bottom sheet offcanvas with a day's workout details
 */
function showDayDetailOffcanvas(dateKey, daySessions) {
  // Format the date for display
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const formattedDate = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });

  // Build session cards
  let bodyHtml = '';
  if (daySessions.length === 0) {
    bodyHtml = `
      <div class="text-center py-4">
        <i class="bx bx-calendar-x display-4 text-muted"></i>
        <p class="mt-3 text-muted mb-0">No workouts on this day</p>
      </div>
    `;
  } else {
    bodyHtml = daySessions.map(session => {
      const duration = session.duration_minutes
        ? `${session.duration_minutes} min`
        : '';
      const exerciseCount = (session.exercises_performed || []).length;
      const exerciseLabel = exerciseCount === 1 ? '1 exercise' : `${exerciseCount} exercises`;
      const isCardio = session._sessionType === 'cardio';
      const iconClass = isCardio ? 'bx-cycling' : 'bx-dumbbell';
      const typeBadge = isCardio ? 'Cardio' : 'Strength';

      return `
        <div class="day-session-card card mb-2">
          <div class="card-body">
            <div class="d-flex align-items-start justify-content-between">
              <div class="day-session-info">
                <div class="day-session-name">
                  <i class="bx ${iconClass} me-1"></i>
                  ${escapeHtml(session.workout_name || 'Workout')}
                </div>
                <div class="day-session-meta mt-1">
                  ${duration ? `<i class="bx bx-time-five me-1"></i>${duration}` : ''}
                  ${duration && exerciseCount ? ' &bull; ' : ''}
                  ${exerciseCount ? `<i class="bx bx-list-ul me-1"></i>${exerciseLabel}` : ''}
                </div>
              </div>
              <span class="badge bg-label-${isCardio ? 'info' : 'success'} day-session-badge">${typeBadge}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  const offcanvasId = 'calendarDayDetailOffcanvas';
  const offcanvasHtml = `
    <div class="offcanvas offcanvas-bottom calendar-day-offcanvas" tabindex="-1"
         id="${offcanvasId}" aria-labelledby="${offcanvasId}Label"
         data-bs-scroll="false">
      <div class="offcanvas-header">
        <h6 class="offcanvas-title" id="${offcanvasId}Label">
          <i class="bx bx-calendar me-2"></i>${formattedDate}
          ${daySessions.length > 0 ? `<span class="text-muted ms-2 fw-normal" style="font-size: 0.85rem;">${daySessions.length} session${daySessions.length !== 1 ? 's' : ''}</span>` : ''}
        </h6>
        <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
      </div>
      <div class="offcanvas-body">
        ${bodyHtml}
      </div>
    </div>
  `;

  // Use offcanvasManager if available, otherwise create manually
  if (window.offcanvasManager) {
    window.offcanvasManager.create(offcanvasId, offcanvasHtml);
  } else {
    // Fallback: insert and show manually
    const existing = document.getElementById(offcanvasId);
    if (existing) existing.remove();
    document.body.insertAdjacentHTML('beforeend', offcanvasHtml);
    const el = document.getElementById(offcanvasId);
    const offcanvas = new bootstrap.Offcanvas(el);
    el.addEventListener('hidden.bs.offcanvas', () => el.remove());
    offcanvas.show();
  }
}

/* ============================================
   DATE FILTER MANAGEMENT
   ============================================ */

/**
 * Set date filter and re-render sessions
 * @param {string} dateKey - Date in 'YYYY-MM-DD' format
 */
function setDateFilter(dateKey) {
  const state = window.ffn.workoutHistory;
  state.dateFilter = dateKey;
  state.currentPage = 1; // Reset pagination

  // Update date filter indicator
  updateDateFilterIndicator(dateKey);

  // Re-render sessions
  if (typeof renderSessionHistory === 'function') {
    renderSessionHistory();
  }
}

/**
 * Set date range filter
 * @param {string} startDate - Start date 'YYYY-MM-DD'
 * @param {string} endDate - End date 'YYYY-MM-DD'
 */
function setDateRangeFilter(startDate, endDate) {
  const state = window.ffn.workoutHistory;
  state.dateFilter = { start: startDate, end: endDate };
  state.currentPage = 1;

  updateDateFilterIndicator({ start: startDate, end: endDate });

  if (typeof renderSessionHistory === 'function') {
    renderSessionHistory();
  }
}

/**
 * Clear date filter and show all sessions
 */
function clearDateFilter() {
  const state = window.ffn.workoutHistory;
  state.dateFilter = null;
  state.dateRangePreset = null;
  state.currentPage = 1;

  // Clear calendar selection
  if (state.calendarView) {
    state.calendarView.clearSelection();
  }

  // Clear preset highlight
  clearPresetHighlight();

  // Hide indicator
  const indicator = document.getElementById('dateFilterIndicator');
  if (indicator) {
    indicator.style.display = 'none';
  }

  // Hide inline range sessions
  hideCalendarRangeSessions();

  // Re-render sessions
  if (typeof renderSessionHistory === 'function') {
    renderSessionHistory();
  }
}

/**
 * Update the date filter indicator UI
 * @param {string|Object} filter - 'YYYY-MM-DD' string or { start, end } object
 */
function updateDateFilterIndicator(filter) {
  const indicator = document.getElementById('dateFilterIndicator');
  const label = document.getElementById('dateFilterLabel');

  if (!indicator || !label) return;

  if (typeof filter === 'string') {
    // Single date
    const [year, month, day] = filter.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const options = { weekday: 'long', month: 'long', day: 'numeric' };
    label.textContent = date.toLocaleDateString('en-US', options);
  } else if (filter && filter.start && filter.end) {
    // Date range
    const [sy, sm, sd] = filter.start.split('-').map(Number);
    const [ey, em, ed] = filter.end.split('-').map(Number);
    const startDate = new Date(sy, sm - 1, sd);
    const endDate = new Date(ey, em - 1, ed);
    const fmt = { month: 'short', day: 'numeric' };
    const startStr = startDate.toLocaleDateString('en-US', fmt);
    const endStr = endDate.toLocaleDateString('en-US', fmt);
    label.textContent = `${startStr} – ${endStr}`;
  }

  indicator.style.display = 'flex';
}

/* ============================================
   INLINE RANGE SESSION RENDERING
   ============================================ */

/**
 * Render sessions for a date range inline below the calendar
 */
function renderCalendarRangeSessions(startDate, endDate, sessions) {
  const container = document.getElementById('calendarRangeSessionList');
  if (!container) return;

  // Format dates for header
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const startFmt = new Date(sy, sm - 1, sd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endFmt = new Date(ey, em - 1, ed).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  if (sessions.length === 0) {
    container.innerHTML = `
      <div class="calendar-range-session-list">
        <div class="range-session-header">
          ${startFmt} – ${endFmt}
        </div>
        <div class="text-center py-4">
          <i class="bx bx-calendar-x display-4 text-muted"></i>
          <p class="mt-3 text-muted mb-0">No workouts in this range</p>
        </div>
      </div>
    `;
  } else {
    // Sort sessions by date descending
    const sorted = [...sessions].sort((a, b) => {
      return new Date(b.completed_at || b.started_at) - new Date(a.completed_at || a.started_at);
    });

    // Group by date for clean display
    const groups = {};
    sorted.forEach(session => {
      const dateStr = session.completed_at || session.started_at;
      const date = new Date(dateStr);
      const dayKey = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      if (!groups[dayKey]) groups[dayKey] = [];
      groups[dayKey].push(session);
    });

    let html = `
      <div class="calendar-range-session-list">
        <div class="range-session-header d-flex justify-content-between align-items-center">
          <span>${startFmt} – ${endFmt}</span>
          <span class="text-muted" style="font-size: 0.8rem;">${sessions.length} session${sessions.length !== 1 ? 's' : ''}</span>
        </div>
    `;

    Object.entries(groups).forEach(([dayLabel, daySessions]) => {
      html += `<div class="range-day-group mt-2">`;
      html += `<div class="text-muted small fw-semibold mb-1">${dayLabel}</div>`;

      daySessions.forEach(session => {
        const duration = session.duration_minutes ? `${session.duration_minutes} min` : '';
        const exerciseCount = (session.exercises_performed || []).length;
        const isCardio = session._sessionType === 'cardio';
        const iconClass = isCardio ? 'bx-cycling' : 'bx-dumbbell';

        html += `
          <div class="day-session-card card mb-2">
            <div class="card-body">
              <div class="d-flex align-items-center">
                <div class="day-session-info flex-grow-1">
                  <div class="day-session-name">
                    <i class="bx ${iconClass} me-1"></i>
                    ${escapeHtml(session.workout_name || 'Workout')}
                  </div>
                  <div class="day-session-meta mt-1">
                    ${duration ? `<i class="bx bx-time-five me-1"></i>${duration}` : ''}
                    ${duration && exerciseCount ? ' &bull; ' : ''}
                    ${exerciseCount ? `${exerciseCount} exercise${exerciseCount !== 1 ? 's' : ''}` : ''}
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
      });

      html += `</div>`;
    });

    html += `</div>`;
    container.innerHTML = html;
  }

  container.style.display = 'block';
}

/**
 * Hide the inline range session list
 */
function hideCalendarRangeSessions() {
  const container = document.getElementById('calendarRangeSessionList');
  if (container) {
    container.style.display = 'none';
    container.innerHTML = '';
  }
}

/* ============================================
   RANGE PRESETS
   ============================================ */

/**
 * Initialize calendar range preset buttons
 */
function initCalendarPresets() {
  const container = document.getElementById('calendarRangePresets');
  if (!container) return;

  container.innerHTML = `
    <button class="calendar-range-preset-btn" data-preset="this-week" onclick="applyCalendarPreset('this-week')">This Week</button>
    <button class="calendar-range-preset-btn" data-preset="last-7" onclick="applyCalendarPreset('last-7')">Last 7 Days</button>
    <button class="calendar-range-preset-btn" data-preset="this-month" onclick="applyCalendarPreset('this-month')">This Month</button>
    <button class="calendar-range-preset-btn" data-preset="last-30" onclick="applyCalendarPreset('last-30')">Last 30 Days</button>
    <button class="calendar-range-toggle" id="calendarRangeToggle" onclick="toggleRangeMode()">
      <i class="bx bx-select-multiple"></i> Custom
    </button>
  `;
}

/**
 * Apply a preset date range
 */
function applyCalendarPreset(preset) {
  const state = window.ffn.workoutHistory;
  const calendarView = state.calendarView;
  if (!calendarView) return;

  const today = new Date();
  let start, end;

  // Calculate the date key for today
  const todayKey = calendarView.formatDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  switch (preset) {
    case 'this-week': {
      const dayOfWeek = today.getDay(); // 0 = Sunday
      const startDate = new Date(today);
      startDate.setDate(today.getDate() - dayOfWeek);
      start = calendarView.formatDateKey(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      end = todayKey;
      break;
    }
    case 'last-7': {
      const startDate = new Date(today);
      startDate.setDate(today.getDate() - 6);
      start = calendarView.formatDateKey(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      end = todayKey;
      break;
    }
    case 'this-month': {
      const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      start = calendarView.formatDateKey(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      end = todayKey;
      break;
    }
    case 'last-30': {
      const startDate = new Date(today);
      startDate.setDate(today.getDate() - 29);
      start = calendarView.formatDateKey(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      end = todayKey;
      break;
    }
    default:
      return;
  }

  // Disable range mode if active
  if (calendarView.rangeMode) {
    calendarView.setRangeMode(false);
    const toggle = document.getElementById('calendarRangeToggle');
    if (toggle) toggle.classList.remove('active');
  }

  // Set state
  state.dateRangePreset = preset;

  // Highlight active preset button
  clearPresetHighlight();
  const activeBtn = document.querySelector(`.calendar-range-preset-btn[data-preset="${preset}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  // Navigate calendar to start month and set selection
  calendarView.navigateToDate(start);
  calendarView.setSelection(start, end);

  // Get sessions in range and render
  const rangeSessions = calendarView.getSessionsInRange(start, end);
  setDateRangeFilter(start, end);
  renderCalendarRangeSessions(start, end, rangeSessions);
}

/**
 * Toggle custom range selection mode
 */
function toggleRangeMode() {
  const state = window.ffn.workoutHistory;
  const calendarView = state.calendarView;
  if (!calendarView) return;

  const toggle = document.getElementById('calendarRangeToggle');
  const newMode = !calendarView.rangeMode;

  calendarView.setRangeMode(newMode);

  if (toggle) {
    toggle.classList.toggle('active', newMode);
  }

  // Clear preset highlight when entering custom mode
  if (newMode) {
    clearPresetHighlight();
    state.dateRangePreset = 'custom';
    hideCalendarRangeSessions();
  } else {
    state.dateRangePreset = null;
  }
}

/**
 * Clear active state from all preset buttons
 */
function clearPresetHighlight() {
  document.querySelectorAll('.calendar-range-preset-btn.active').forEach(btn => {
    btn.classList.remove('active');
  });
}

/* ============================================
   EXPORTS
   ============================================ */

// Export to window for backwards compatibility
window.initHistoryCalendar = initHistoryCalendar;
window.handleCalendarDayClick = handleCalendarDayClick;
window.handleCalendarRangeSelect = handleCalendarRangeSelect;
window.showDayDetailOffcanvas = showDayDetailOffcanvas;
window.setDateFilter = setDateFilter;
window.setDateRangeFilter = setDateRangeFilter;
window.clearDateFilter = clearDateFilter;
window.updateDateFilterIndicator = updateDateFilterIndicator;
window.renderCalendarRangeSessions = renderCalendarRangeSessions;
window.hideCalendarRangeSessions = hideCalendarRangeSessions;
window.initCalendarPresets = initCalendarPresets;
window.applyCalendarPreset = applyCalendarPreset;
window.toggleRangeMode = toggleRangeMode;
window.clearPresetHighlight = clearPresetHighlight;

console.log('📦 Workout History Calendar module loaded (v2.0.0)');
