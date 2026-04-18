/**
 * Ghost Gym - Workout History Filters
 * Session filtering, sorting, and pagination
 * @version 2.0.0
 */

/* ============================================
   FILTER BAR
   ============================================ */

/**
 * Get the display label for the current workout filter state
 */
function getWorkoutFilterLabel() {
  const filters = window.ffn.workoutHistory.workoutTypeFilters || [];
  if (filters.length === 0) return 'All Workouts';
  if (filters.length === 1) return filters[0];
  return `${filters.length} Workouts`;
}

/**
 * Render session toolbar
 * Unified toolbar (full controls in All Mode, simple in single workout mode)
 */
function renderSessionFilterBar() {
  const state = window.ffn.workoutHistory;
  const isAllMode = state.isAllMode;
  const activeSort = state.sessionSort;
  const deleteMode = state.deleteMode;
  const filters = state.workoutTypeFilters || [];
  const hasActiveFilter = filters.length > 0;

  // Sort label mapping
  const sortLabels = {
    'date-desc': 'Newest',
    'date-asc': 'Oldest'
  };

  // All Mode: full toolbar
  if (isAllMode) {
    return `
      <div class="session-toolbar mb-3">
        <!-- Workout Filter Chip -->
        <button class="workout-filter-chip ${hasActiveFilter ? 'active-filter' : ''}"
                onclick="openWorkoutFilterOffcanvas()"
                ${deleteMode ? 'disabled' : ''}>
          <i class="bx bx-filter-alt"></i>
          <span id="workoutFilterLabel">${escapeHtml(getWorkoutFilterLabel())}</span>
          ${hasActiveFilter ? '<i class="bx bx-x workout-filter-chip-clear" onclick="event.stopPropagation(); setWorkoutTypeFilters([]); return false;"></i>' : ''}
        </button>

        <!-- Sort Cycle Button -->
        <button class="btn btn-sm btn-outline-secondary session-toolbar-btn"
                onclick="cycleSessionSort()"
                ${deleteMode ? 'disabled' : ''}>
          <i class="bx bx-sort-alt-2"></i>
          <span class="ms-1">${sortLabels[activeSort]}</span>
        </button>
      </div>
    `;
  }

  // Single workout mode: no toolbar needed (delete via 3-dot menu)
  return '';
}

/* ============================================
   FILTERING
   ============================================ */

/**
 * Apply session filters (workout type and date)
 */
function applySessionFilters(sessions) {
  const state = window.ffn.workoutHistory;
  const workoutFilters = state.workoutTypeFilters || [];
  const dateFilter = state.dateFilter;

  let filtered = sessions;

  // Filter by workout type (multi-select)
  if (workoutFilters.length > 0) {
    filtered = filtered.filter(session => {
      const workoutName = session.workout_name || 'Unknown Workout';
      return workoutFilters.includes(workoutName);
    });
  }

  // Filter by date (single date or range)
  if (dateFilter) {
    filtered = filtered.filter(session => {
      const dateStr = session.completed_at || session.started_at;
      if (!dateStr) return false;
      const date = new Date(dateStr);
      const sessionDateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

      if (typeof dateFilter === 'string') {
        // Single date filter
        return sessionDateKey === dateFilter;
      } else if (dateFilter.start && dateFilter.end) {
        // Range filter
        return sessionDateKey >= dateFilter.start && sessionDateKey <= dateFilter.end;
      }
      return true;
    });
  }

  return filtered;
}

/* ============================================
   SORTING
   ============================================ */

/**
 * Sort sessions by current sort mode
 */
function sortSessions(sessions) {
  const sortMode = window.ffn.workoutHistory.sessionSort;
  const sorted = [...sessions];

  switch (sortMode) {
    case 'date-desc':
      sorted.sort((a, b) => new Date(b.completed_at || b.started_at) - new Date(a.completed_at || a.started_at));
      break;
    case 'date-asc':
      sorted.sort((a, b) => new Date(a.completed_at || a.started_at) - new Date(b.completed_at || b.started_at));
      break;
    case 'duration-desc':
      sorted.sort((a, b) => (b.duration_minutes || 0) - (a.duration_minutes || 0));
      break;
    case 'duration-asc':
      sorted.sort((a, b) => (a.duration_minutes || 0) - (b.duration_minutes || 0));
      break;
  }

  return sorted;
}

/**
 * Set workout type filters and re-render
 * @param {Array<string>} names - Array of workout names (empty = all)
 */
function setWorkoutTypeFilters(names) {
  window.ffn.workoutHistory.workoutTypeFilters = names;
  window.ffn.workoutHistory.currentPage = 1; // Reset page
  renderSessionHistory();
}

/**
 * Cycle through session sort options
 */
function cycleSessionSort() {
  const sortOrder = ['date-desc', 'date-asc'];
  const currentSort = window.ffn.workoutHistory.sessionSort;
  const currentIndex = sortOrder.indexOf(currentSort);
  const nextIndex = (currentIndex + 1) % sortOrder.length;

  window.ffn.workoutHistory.sessionSort = sortOrder[nextIndex];
  window.ffn.workoutHistory.currentPage = 1; // Reset page
  renderSessionHistory();
}

/**
 * Reset all session filters to defaults
 */
function resetSessionFilters() {
  const state = window.ffn.workoutHistory;
  state.sessionFilter = 'all';
  state.workoutTypeFilters = [];
  state.sessionSort = 'date-desc';
  state.currentPage = 1;
  state.pageSize = 20;
  state.dateFilter = null;
  state.dateRangePreset = null;

  // Clear calendar selection
  if (state.calendarView) {
    state.calendarView.clearSelection();
  }

  // Clear preset highlights
  if (typeof clearPresetHighlight === 'function') {
    clearPresetHighlight();
  }

  // Hide date filter indicator
  const indicator = document.getElementById('dateFilterIndicator');
  if (indicator) {
    indicator.style.display = 'none';
  }

  renderSessionHistory();
}

/* ============================================
   PAGINATION
   ============================================ */

/**
 * Set page size and re-render
 */
function setPageSize(size) {
  window.ffn.workoutHistory.pageSize = size;
  window.ffn.workoutHistory.currentPage = 1; // Reset to page 1
  renderSessionHistory();
}

/**
 * Navigate to a specific page
 */
function goToPage(page) {
  const state = window.ffn.workoutHistory;

  if (state.pageSize === 'all') return;

  const pageSize = parseInt(state.pageSize);
  const filteredSessions = applySessionFilters(state.sessions);
  const sortedSessions = sortSessions(filteredSessions);
  const totalPages = Math.ceil(sortedSessions.length / pageSize);

  if (page < 1 || page > totalPages) return;

  state.currentPage = page;
  renderSessionHistory();

  // Scroll to top of session list
  document.getElementById('sessionHistoryContainer')?.scrollIntoView({ behavior: 'smooth' });
}

/**
 * Render pagination controls
 */
function renderPaginationControls(currentPage, totalPages, totalItems) {
  const state = window.ffn.workoutHistory;
  const pageSize = parseInt(state.pageSize);
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  // Build page numbers (show max 5 pages with ellipsis)
  let pageNumbers = '';
  const maxVisible = 5;
  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);

  if (endPage - startPage < maxVisible - 1) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }

  if (startPage > 1) {
    pageNumbers += `<button class="pagination-btn" onclick="goToPage(1)">1</button>`;
    if (startPage > 2) pageNumbers += `<span class="pagination-ellipsis">...</span>`;
  }

  for (let i = startPage; i <= endPage; i++) {
    pageNumbers += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}"
                            onclick="goToPage(${i})">${i}</button>`;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) pageNumbers += `<span class="pagination-ellipsis">...</span>`;
    pageNumbers += `<button class="pagination-btn" onclick="goToPage(${totalPages})">${totalPages}</button>`;
  }

  const activePageSize = state.pageSize;

  return `
    <div class="session-pagination">
      <div class="pagination-info">
        Showing ${start}-${end} of ${totalItems}
      </div>
      <div class="pagination-controls">
        <button class="pagination-btn pagination-prev"
                onclick="goToPage(${currentPage - 1})"
                ${currentPage === 1 ? 'disabled' : ''}>
          <i class="bx bx-chevron-left"></i>
        </button>
        ${pageNumbers}
        <button class="pagination-btn pagination-next"
                onclick="goToPage(${currentPage + 1})"
                ${currentPage === totalPages ? 'disabled' : ''}>
          <i class="bx bx-chevron-right"></i>
        </button>
      </div>
      <select class="form-select form-select-sm session-pagesize-select"
              onchange="setPageSize(this.value)">
        <option value="10" ${activePageSize == 10 ? 'selected' : ''}>10 / page</option>
        <option value="20" ${activePageSize == 20 ? 'selected' : ''}>20 / page</option>
        <option value="50" ${activePageSize == 50 ? 'selected' : ''}>50 / page</option>
        <option value="all" ${activePageSize === 'all' ? 'selected' : ''}>Show all</option>
      </select>
    </div>
  `;
}

/* ============================================
   EXPORTS
   ============================================ */

// Export to window for backwards compatibility
window.renderSessionFilterBar = renderSessionFilterBar;
window.applySessionFilters = applySessionFilters;
window.sortSessions = sortSessions;
window.setWorkoutTypeFilters = setWorkoutTypeFilters;
window.getWorkoutFilterLabel = getWorkoutFilterLabel;
window.cycleSessionSort = cycleSessionSort;
window.resetSessionFilters = resetSessionFilters;
window.setPageSize = setPageSize;
window.goToPage = goToPage;
window.renderPaginationControls = renderPaginationControls;

console.log('📦 Workout History Filters module loaded (v2.0.0)');
