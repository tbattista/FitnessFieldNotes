/**
 * Ghost Gym - Workout History Calendar
 * Calendar view initialization, date filtering, inline session display,
 * range selection, and quick presets.
 *
 * All selections (single day, range, presets) render sessions inline
 * using the same createSessionEntry() renderer from workout-history-sessions.js.
 *
 * @version 3.0.0
 */

/* ============================================
   CALENDAR INITIALIZATION
   ============================================ */

/**
 * Initialize the history calendar view
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

  // Set the session data
  window.ffn.workoutHistory.calendarView.setSessionData(sessions);

  // Initialize presets
  initCalendarPresets();

  console.log(`📅 History calendar initialized with ${sessions.length} sessions`);
}

/* ============================================
   CALENDAR DAY CLICK HANDLING
   ============================================ */

/**
 * Handle calendar day click - filters the main session list
 */
function handleCalendarDayClick(dateKey, daySessions) {
  const isAllMode = window.ffn.workoutHistory.isAllMode;

  clearPresetHighlight();

  if (isAllMode) {
    setDateFilter(dateKey);
    return;
  }

  // In Single Workout mode, scroll to session
  if (daySessions.length === 0) return;
  scrollToSession(daySessions[0].id);
}

/**
 * Handle range selection complete - filters the main session list
 */
function handleCalendarRangeSelect(startDate, endDate, sessions) {
  clearPresetHighlight();
  setDateRangeFilter(startDate, endDate);
}

/* ============================================
   DATE FILTER MANAGEMENT
   ============================================ */

/**
 * Set single-date filter and re-render History tab sessions
 * @param {string} dateKey - Date in 'YYYY-MM-DD' format
 */
function setDateFilter(dateKey) {
  const state = window.ffn.workoutHistory;
  state.dateFilter = dateKey;
  state.currentPage = 1;

  updateDateFilterIndicator(dateKey);

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

  // Re-render session list
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
    const [year, month, day] = filter.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    label.textContent = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  } else if (filter && filter.start && filter.end) {
    const [sy, sm, sd] = filter.start.split('-').map(Number);
    const [ey, em, ed] = filter.end.split('-').map(Number);
    const startDate = new Date(sy, sm - 1, sd);
    const endDate = new Date(ey, em - 1, ed);
    const fmt = { month: 'short', day: 'numeric' };
    label.textContent = `${startDate.toLocaleDateString('en-US', fmt)} – ${endDate.toLocaleDateString('en-US', fmt)}`;
  }

  indicator.style.display = 'flex';
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

  const todayKey = calendarView.formatDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  switch (preset) {
    case 'this-week': {
      const dayOfWeek = today.getDay();
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

  // Set filter - main session list re-renders automatically
  setDateRangeFilter(start, end);
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

  if (newMode) {
    clearPresetHighlight();
    state.dateRangePreset = 'custom';
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

window.initHistoryCalendar = initHistoryCalendar;
window.handleCalendarDayClick = handleCalendarDayClick;
window.handleCalendarRangeSelect = handleCalendarRangeSelect;
window.setDateFilter = setDateFilter;
window.setDateRangeFilter = setDateRangeFilter;
window.clearDateFilter = clearDateFilter;
window.updateDateFilterIndicator = updateDateFilterIndicator;
window.initCalendarPresets = initCalendarPresets;
window.applyCalendarPreset = applyCalendarPreset;
window.toggleRangeMode = toggleRangeMode;
window.clearPresetHighlight = clearPresetHighlight;

console.log('📦 Workout History Calendar module loaded (v3.0.0)');
