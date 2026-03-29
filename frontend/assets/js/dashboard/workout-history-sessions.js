/**
 * Ghost Gym - Workout History Sessions
 * Session rendering and grouping
 * @version 1.1.0
 */

/* ============================================
   SESSION ENTRY CLICK HANDLER
   ============================================ */

/**
 * Handle clicks on session entries - toggles collapse unless click was on the dropdown menu
 */
function handleSessionEntryClick(event, collapseId) {
  if (event.target.closest('.session-menu')) return;

  const collapseEl = document.getElementById(collapseId);
  if (!collapseEl) return;

  const bsCollapse = bootstrap.Collapse.getOrCreateInstance(collapseEl, { toggle: false });
  bsCollapse.toggle();

  // Update aria-expanded (Bootstrap collapse fires asynchronously, so invert current state)
  const entry = event.currentTarget;
  const wasExpanded = entry.getAttribute('aria-expanded') === 'true';
  entry.setAttribute('aria-expanded', String(!wasExpanded));
}

/* ============================================
   SESSION HISTORY RENDERING
   ============================================ */

/**
 * Render session history with time-based grouping
 * Uses filter/pagination functions from workout-history-filters.js
 */
function renderSessionHistory() {
  const sessions = window.ffn.workoutHistory.sessions;
  const container = document.getElementById('sessionHistoryContainer');
  const isAllMode = window.ffn.workoutHistory.isAllMode;

  if (sessions.length === 0) {
    container.innerHTML = `
      <div class="text-center py-4">
        <i class="bx bx-calendar-x display-4 text-muted"></i>
        <p class="mt-3 text-muted">No workout sessions yet</p>
      </div>
    `;
    return;
  }

  let html = '';

  // Render toolbar (full in All Mode, simple in single workout mode)
  html += renderSessionFilterBar();

  // Apply filters and sort (only in All Mode)
  let filteredSessions = sessions;
  if (isAllMode) {
    filteredSessions = applySessionFilters(sessions);
    filteredSessions = sortSessions(filteredSessions);
  }

  // Check if filters resulted in empty list
  if (filteredSessions.length === 0) {
    html += `
      <div class="text-center py-4">
        <i class="bx bx-filter-alt display-4 text-muted"></i>
        <p class="mt-3 text-muted">No sessions match your filters</p>
        <button class="btn btn-sm btn-outline-secondary mt-2" onclick="resetSessionFilters()">
          Clear Filters
        </button>
      </div>
    `;
    container.innerHTML = html;
    return;
  }

  // Apply pagination (All Mode only)
  const state = window.ffn.workoutHistory;
  let paginatedSessions = filteredSessions;
  let totalPages = 1;
  const pageSize = state.pageSize;
  const currentPage = state.currentPage;

  if (isAllMode && pageSize !== 'all') {
    const size = parseInt(pageSize);
    totalPages = Math.ceil(filteredSessions.length / size);
    // Clamp current page to valid range
    if (currentPage > totalPages) {
      state.currentPage = totalPages;
    }
    const startIndex = (state.currentPage - 1) * size;
    paginatedSessions = filteredSessions.slice(startIndex, startIndex + size);
  }

  // Group sessions by time period (use paginated sessions)
  const groups = groupSessionsByTimePeriod(paginatedSessions);

  // Render each time period as separate card group
  if (groups.thisWeek.length > 0) {
    html += renderSessionGroup('This Week', groups.thisWeek);
  }

  if (groups.lastWeek.length > 0) {
    html += renderSessionGroup('Last Week', groups.lastWeek);
  }

  if (groups.earlierThisMonth.length > 0) {
    html += renderSessionGroup('Earlier This Month', groups.earlierThisMonth);
  }

  // Render monthly groups (sorted by date, most recent first)
  const monthKeys = Object.keys(groups.byMonth).sort((a, b) => {
    const dateA = new Date(groups.byMonth[a][0].completed_at);
    const dateB = new Date(groups.byMonth[b][0].completed_at);
    return dateB - dateA;
  });

  monthKeys.forEach(monthKey => {
    html += renderSessionGroup(monthKey, groups.byMonth[monthKey]);
  });

  // Add pagination controls at the bottom (All Mode only)
  if (isAllMode && pageSize !== 'all' && totalPages > 1) {
    html += renderPaginationControls(state.currentPage, totalPages, filteredSessions.length);
  }

  container.innerHTML = html;
}

/* ============================================
   SESSION GROUPING
   ============================================ */

/**
 * Group sessions by time period
 * Returns: { thisWeek: [], lastWeek: [], earlierThisMonth: [], byMonth: { 'December 2025': [], ... } }
 */
function groupSessionsByTimePeriod(sessions) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Calculate week boundaries
  const dayOfWeek = today.getDay(); // 0 = Sunday
  const startOfThisWeek = new Date(today);
  startOfThisWeek.setDate(today.getDate() - dayOfWeek);

  const startOfLastWeek = new Date(startOfThisWeek);
  startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

  const startOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const groups = {
    thisWeek: [],
    lastWeek: [],
    earlierThisMonth: [],
    byMonth: {}
  };

  sessions.forEach(session => {
    const sessionDate = new Date(session.completed_at || session.started_at);
    const sessionDay = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate());

    if (sessionDay >= startOfThisWeek) {
      groups.thisWeek.push(session);
    } else if (sessionDay >= startOfLastWeek) {
      groups.lastWeek.push(session);
    } else if (sessionDay >= startOfThisMonth) {
      groups.earlierThisMonth.push(session);
    } else {
      // Group by month
      const monthKey = sessionDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (!groups.byMonth[monthKey]) {
        groups.byMonth[monthKey] = [];
      }
      groups.byMonth[monthKey].push(session);
    }
  });

  return groups;
}

/**
 * Render a group of sessions with header outside the card
 */
function renderSessionGroup(title, sessions) {
  return `
    <div class="session-group">
      <div class="time-period-header">${escapeHtml(title)}</div>
      <div class="session-list">
        ${sessions.map((session, index) => createSessionEntry(session)).join('')}
      </div>
    </div>
  `;
}

/* ============================================
   SESSION ENTRY RENDERING
   ============================================ */

/**
 * Create a compact session entry
 * In All Mode: shows workout name as primary
 * In Single Workout Mode: date is primary
 * Supports delete mode with checkbox selection
 */
function createSessionEntry(session) {
  // Route to cardio renderer if this is a cardio session
  if (session._sessionType === 'cardio' && window.renderCardioHistoryEntry) {
    return window.renderCardioHistoryEntry(session);
  }

  const collapseId = `session-${session.id}`;
  const state = window.ffn.workoutHistory;
  const isExpanded = state.expandedSessions.has(session.id);
  const isAllMode = state.isAllMode;
  const deleteMode = state.deleteMode;
  const isSelected = state.selectedSessionIds.has(session.id);
  const dateStr = formatDate(session.completed_at, { short: true });
  const duration = formatDuration(session.duration_minutes);

  // Check for notes
  const hasNotes = session.notes || (session.session_notes && session.session_notes.length > 0);

  // In All Mode, show workout name as primary
  const workoutNameHtml = isAllMode
    ? `<span class="session-workout-name">${escapeHtml(session.workout_name || 'Workout')}</span>`
    : '';

  // Escape workout name for use in onclick attribute
  const escapedWorkoutName = (session.workout_name || 'Workout').replace(/'/g, "\\'").replace(/"/g, '&quot;');

  // Delete mode: show checkbox instead of collapse trigger
  if (deleteMode) {
    return `
      <div class="session-entry delete-mode ${isSelected ? 'selected' : ''}"
           id="session-entry-${session.id}"
           onclick="toggleSessionSelection('${session.id}')"
           role="checkbox"
           aria-checked="${isSelected}">
        <div class="session-select-checkbox">
          <input type="checkbox"
                 class="form-check-input session-checkbox"
                 id="select-session-${session.id}"
                 ${isSelected ? 'checked' : ''}
                 onclick="event.stopPropagation(); toggleSessionSelection('${session.id}');">
        </div>
        <div class="session-status">
          <span class="session-status-icon strength-icon">
            <i class="bx bx-dumbbell"></i>
          </span>
        </div>
        <div class="session-info flex-grow-1">
          ${workoutNameHtml}
          <span class="session-date">${dateStr}</span>
          <span class="session-meta">${duration}${hasNotes ? ' • <i class="bx bx-note"></i>' : ''}</span>
        </div>
      </div>
    `;
  }

  // Normal mode: expandable session entry
  return `
    <div class="session-entry" id="session-entry-${session.id}"
         onclick="handleSessionEntryClick(event, '${collapseId}')"
         role="button"
         aria-expanded="${isExpanded}"
         aria-controls="${collapseId}">
      <div class="session-status">
        <span class="session-status-icon strength-icon">
          <i class="bx bx-dumbbell"></i>
        </span>
      </div>
      <div class="session-info">
        ${workoutNameHtml}
        <span class="session-date">${dateStr}</span>
        <span class="session-meta">${duration}${hasNotes ? ' • <i class="bx bx-note"></i>' : ''}</span>
      </div>
      <div class="dropdown session-menu">
        <button class="btn btn-sm btn-icon session-menu-btn"
                type="button"
                data-bs-toggle="dropdown"
                aria-expanded="false"
                title="Session options">
          <i class="bx bx-dots-vertical-rounded"></i>
        </button>
        <ul class="dropdown-menu dropdown-menu-end">
          <li>
            <a class="dropdown-item" href="javascript:void(0);"
               onclick="openEditSessionModal('${session.id}');">
              <i class="bx bx-edit-alt me-2"></i>Edit Session
            </a>
          </li>
          <li>
            <a class="dropdown-item" href="javascript:void(0);"
               onclick="createTemplateFromSession('${session.id}');">
              <i class="bx bx-copy-alt me-2"></i>Save as Template
            </a>
          </li>
          <li><hr class="dropdown-divider"></li>
          <li>
            <a class="dropdown-item text-danger" href="javascript:void(0);"
               onclick="enterDeleteModeWithSelection('${session.id}');">
              <i class="bx bx-trash me-2"></i>Delete
            </a>
          </li>
        </ul>
      </div>
      <i class="bx bx-chevron-down session-chevron"></i>
    </div>
    <div id="${collapseId}" class="collapse session-details-collapse ${isExpanded ? 'show' : ''}">
      <div class="session-details-wrapper">
        ${renderSessionDetails(session)}
      </div>
    </div>
  `;
}

/**
 * Render session details (exercise table with change indicators)
 * Finds the previous session for the same workout to enable session-over-session diffs
 */
function renderSessionDetails(session) {
  const exercises = session.exercises_performed || [];

  // Find previous session for the same workout (for session-over-session comparison)
  const prevExerciseMap = buildPreviousExerciseMap(session);

  return `
    <div class="session-details">
      ${session.notes ? `
        <div class="alert alert-info mb-3">
          <i class="bx bx-note me-2"></i>${escapeHtml(session.notes)}
        </div>
      ` : ''}

      <div class="table-responsive">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>Exercise</th>
              <th>Weight</th>
              <th>Sets × Reps</th>
              <th>Change</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${exercises.map(ex => renderExerciseTableRow(ex, prevExerciseMap[ex.exercise_name])).join('')}
          </tbody>
        </table>
      </div>

    </div>
  `;
}

/**
 * Build a map of exercise_name → exercise data from the previous session for the same workout
 */
function buildPreviousExerciseMap(currentSession) {
  const allSessions = window.ffn.workoutHistory.sessions || [];
  const currentDate = new Date(currentSession.completed_at).getTime();
  const workoutId = currentSession.workout_id;

  // Find the most recent session for the same workout that is older than the current one
  let prevSession = null;
  for (const s of allSessions) {
    if (s.id === currentSession.id) continue;
    if (s.workout_id !== workoutId) continue;
    const sDate = new Date(s.completed_at).getTime();
    if (sDate >= currentDate) continue;
    if (!prevSession || sDate > new Date(prevSession.completed_at).getTime()) {
      prevSession = s;
    }
  }

  const map = {};
  if (prevSession && prevSession.exercises_performed) {
    for (const ex of prevSession.exercises_performed) {
      map[ex.exercise_name] = ex;
    }
  }
  return map;
}

/**
 * Render a single exercise row in session details table
 * Shows session-over-session diffs (strikethrough old + colored new)
 * @param {Object} ex - Current exercise performance data
 * @param {Object} [prev] - Same exercise from the previous session (for diff)
 */
function renderExerciseTableRow(ex, prev) {
  // Determine status badge
  let statusBadge = '';
  let rowClass = '';

  if (ex.is_skipped) {
    statusBadge = '<span class="badge bg-warning">Skipped</span>';
    rowClass = 'text-muted';
  } else if (ex.is_modified) {
    statusBadge = '<span class="badge bg-primary">Modified</span>';
  } else {
    statusBadge = '<span class="badge bg-label-secondary">Default</span>';
  }

  // Determine weight change indicator
  let changeIndicator = '—';
  let changeIcon = '';

  if (ex.is_skipped) {
    changeIndicator = '—';
  } else if (ex.weight_change !== undefined && ex.weight_change !== null) {
    const unitDisplay = ex.weight_unit && ex.weight_unit !== 'other' ? ` ${ex.weight_unit}` : '';
    if (ex.weight_change > 0) {
      changeIcon = '↑';
      changeIndicator = `<span class="text-success fw-bold" title="Weight increased from previous session">
        ${changeIcon} +${ex.weight_change.toFixed(1)}${unitDisplay}
      </span>`;
    } else if (ex.weight_change < 0) {
      changeIcon = '↓';
      changeIndicator = `<span class="text-danger fw-bold" title="Weight decreased from previous session">
        ${changeIcon} ${ex.weight_change.toFixed(1)}${unitDisplay}
      </span>`;
    } else if (ex.previous_weight) {
      changeIcon = '→';
      changeIndicator = `<span class="text-muted" title="Same weight as previous session">
        ${changeIcon} 0
      </span>`;
    }
  } else if (!ex.previous_weight && !ex.is_skipped) {
    changeIcon = '★';
    changeIndicator = `<span class="text-primary" title="First time performing this exercise">
      ${changeIcon} New
    </span>`;
  }

  // Build weight display with session-over-session diff
  let weightDisplay = '—';
  if (!ex.is_skipped) {
    const prevWeight = prev && !prev.is_skipped ? String(prev.weight ?? '') : null;
    const curWeight = String(ex.weight ?? '');
    const weightChanged = prevWeight !== null && prevWeight !== curWeight && prevWeight !== '';

    if (weightChanged) {
      weightDisplay = `<span class="exercise-original-value">${prevWeight}</span><span class="exercise-modified-value">${ex.weight || '—'}</span> ${ex.weight_unit || ''}`;
    } else {
      weightDisplay = `${ex.weight || '—'} ${ex.weight_unit || ''}`;
    }
  }

  // Build sets/reps display with session-over-session diff
  let setsRepsDisplay = '—';
  if (!ex.is_skipped) {
    const prevSets = prev && !prev.is_skipped ? String(prev.target_sets ?? '') : null;
    const prevReps = prev && !prev.is_skipped ? String(prev.target_reps ?? '') : null;
    const curSets = String(ex.target_sets ?? '');
    const curReps = String(ex.target_reps ?? '');

    const setsChanged = prevSets !== null && prevSets !== curSets && prevSets !== '';
    const repsChanged = prevReps !== null && prevReps !== curReps && prevReps !== '';

    let setsStr = setsChanged
      ? `<span class="exercise-original-value">${prevSets}</span><span class="exercise-modified-value">${curSets || '—'}</span>`
      : (ex.target_sets || '—');

    let repsStr = repsChanged
      ? `<span class="exercise-original-value">${prevReps}</span><span class="exercise-modified-value">${curReps || '—'}</span>`
      : (ex.target_reps || '—');

    setsRepsDisplay = `${setsStr} × ${repsStr}`;
  }

  return `
    <tr class="${rowClass}">
      <td>
        ${ex.is_skipped ? '<i class="bx bx-x-circle text-warning me-1"></i>' : ''}
        ${escapeHtml(ex.exercise_name)}
      </td>
      <td>${weightDisplay}</td>
      <td>${setsRepsDisplay}</td>
      <td>${changeIndicator}</td>
      <td>${statusBadge}</td>
    </tr>
    ${ex.is_skipped && ex.skip_reason ? `
      <tr class="${rowClass}">
        <td colspan="5" class="small ps-4">
          <i class="bx bx-info-circle text-warning me-1"></i>
          <em>${escapeHtml(ex.skip_reason)}</em>
        </td>
      </tr>
    ` : ''}
  `;
}

/**
 * Scroll to and expand a specific session
 */
function scrollToSession(sessionId) {
  const sessionEl = document.getElementById(`session-entry-${sessionId}`);
  if (sessionEl) {
    sessionEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Expand the session details
    const collapseEl = document.getElementById(`session-${sessionId}`);
    if (collapseEl && !collapseEl.classList.contains('show')) {
      const bsCollapse = new bootstrap.Collapse(collapseEl, { toggle: true });
    }
    // Highlight briefly
    sessionEl.classList.add('session-highlight');
    setTimeout(() => sessionEl.classList.remove('session-highlight'), 1500);
  }
}

/* ============================================
   CARDIO SESSION RENDERER (Unified History)
   ============================================ */

// Activity type metadata comes from ActivityTypeRegistry (activity-type-registry.js)

/**
 * Render a cardio session entry in the unified history timeline
 */
function renderCardioHistoryEntry(session) {
  const registry = window.ActivityTypeRegistry;
  const icon = registry ? registry.getIcon(session.activity_type) : 'bx-dots-horizontal-rounded';
  const name = session.activity_name || (registry ? registry.getName(session.activity_type) : session.activity_type);
  const dateStr = formatDate(session.started_at || session.created_at, { short: true });

  // Format duration
  const mins = session.duration_minutes || 0;
  const duration = mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60 > 0 ? (mins % 60) + 'm' : ''}`;

  // Build meta parts
  const metaParts = [duration.trim()];
  if (session.distance) {
    metaParts.push(`${session.distance} ${session.distance_unit || 'mi'}`);
  }
  if (session.pace_per_unit) {
    metaParts.push(session.pace_per_unit);
  }
  if (session.avg_heart_rate) {
    metaParts.push(`${session.avg_heart_rate} bpm`);
  }

  // Delete mode: show checkbox instead of menu
  const state = window.ffn.workoutHistory;
  const deleteMode = state.deleteMode;
  const isSelected = state.selectedSessionIds.has(session.id);

  if (deleteMode) {
    return `
      <div class="session-entry delete-mode ${isSelected ? 'selected' : ''}"
           id="session-entry-${session.id}"
           onclick="toggleSessionSelection('${session.id}')"
           role="checkbox"
           aria-checked="${isSelected}">
        <div class="session-select-checkbox">
          <input type="checkbox"
                 class="form-check-input session-checkbox"
                 id="select-session-${session.id}"
                 ${isSelected ? 'checked' : ''}
                 onclick="event.stopPropagation(); toggleSessionSelection('${session.id}');">
        </div>
        <div class="session-status">
          <span class="session-status-icon cardio-icon">
            <i class="bx ${icon}"></i>
          </span>
        </div>
        <div class="session-info flex-grow-1">
          <span class="session-workout-name">${escapeHtml(name)}</span>
          <span class="session-date">${dateStr}</span>
          <span class="session-meta">${metaParts.join(' · ')}</span>
        </div>
      </div>
    `;
  }

  // Build detail rows (comprehensive view of all optional data)
  const detailRows = [];
  if (session.distance) {
    let distStr = `${session.distance} ${session.distance_unit || 'mi'}`;
    if (session.pace_per_unit) distStr += ` @ ${session.pace_per_unit}`;
    detailRows.push(`<div><i class="bx bx-map me-1"></i>${distStr}</div>`);
  }
  const hrParts = [];
  if (session.avg_heart_rate) hrParts.push(`Avg: ${session.avg_heart_rate}`);
  if (session.max_heart_rate) hrParts.push(`Max: ${session.max_heart_rate}`);
  if (hrParts.length > 0) {
    detailRows.push(`<div><i class="bx bx-heart me-1"></i>${hrParts.join(' · ')} bpm</div>`);
  }
  if (session.calories) detailRows.push(`<div><i class="bx bxs-flame me-1"></i>${session.calories} kcal</div>`);
  if (session.rpe) detailRows.push(`<div><i class="bx bx-bar-chart me-1"></i>RPE: ${session.rpe}/10</div>`);
  if (session.elevation_gain) detailRows.push(`<div><i class="bx bx-trending-up me-1"></i>${session.elevation_gain} ${session.elevation_unit || 'ft'} gain</div>`);
  if (session.activity_details && typeof session.activity_details === 'object') {
    const ad = session.activity_details;
    if (ad.cadence_rpm || ad.cadence) detailRows.push(`<div><i class="bx bx-revision me-1"></i>Cadence: ${ad.cadence_rpm || ad.cadence} rpm</div>`);
    if (ad.stroke_rate) detailRows.push(`<div><i class="bx bx-water me-1"></i>Stroke Rate: ${ad.stroke_rate} spm</div>`);
    if (ad.laps) detailRows.push(`<div><i class="bx bx-refresh me-1"></i>Laps: ${ad.laps}</div>`);
    if (ad.pool_length_m || ad.pool_length) detailRows.push(`<div><i class="bx bx-ruler me-1"></i>Pool: ${ad.pool_length_m || ad.pool_length}m</div>`);
    if (ad.incline_percent || ad.incline) detailRows.push(`<div><i class="bx bx-trending-up me-1"></i>Incline: ${ad.incline_percent || ad.incline}%</div>`);
  }
  if (session.notes) detailRows.push(`<div class="mt-2 fst-italic text-muted">"${escapeHtml(session.notes)}"</div>`);

  const hasDetails = detailRows.length > 0;
  const collapseId = `cardio-hist-${session.id}`;

  // Normal mode: expandable with 3-dot menu
  return `
    <div class="session-entry" id="session-entry-${session.id}"
         ${hasDetails ? `onclick="handleSessionEntryClick(event, '${collapseId}')" role="button" aria-expanded="false" aria-controls="${collapseId}"` : ''}
         data-session-id="${session.id}">
      <div class="session-status">
        <span class="session-status-icon cardio-icon">
          <i class="bx ${icon}"></i>
        </span>
      </div>
      <div class="session-info">
        <span class="session-workout-name">${escapeHtml(name)}</span>
        <span class="session-date">${dateStr}</span>
        <span class="session-meta">${metaParts.join(' · ')}</span>
      </div>
      <div class="dropdown session-menu">
        <button class="btn btn-sm btn-icon session-menu-btn"
                type="button"
                data-bs-toggle="dropdown"
                aria-expanded="false"
                title="Session options">
          <i class="bx bx-dots-vertical-rounded"></i>
        </button>
        <ul class="dropdown-menu dropdown-menu-end">
          <li>
            <a class="dropdown-item text-danger" href="javascript:void(0);"
               onclick="enterDeleteModeWithSelection('${session.id}');">
              <i class="bx bx-trash me-2"></i>Delete
            </a>
          </li>
        </ul>
      </div>
      ${hasDetails ? `<i class="bx bx-chevron-down session-chevron"></i>` : ''}
    </div>
    ${hasDetails ? `
      <div class="collapse session-details-collapse" id="${collapseId}">
        <div class="session-details-wrapper p-3">
          ${detailRows.join('')}
        </div>
      </div>
    ` : ''}
  `;
}

/* ============================================
   CREATE TEMPLATE FROM SESSION
   ============================================ */

/**
 * Convert a completed session into workout creation data
 * Uses actual performed values (sets_completed, actual reps, weight used)
 */
function sessionToWorkoutData(session) {
  const exercises = (session.exercises_performed || [])
    .filter(ex => !ex.is_skipped)
    .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

  if (exercises.length === 0) return null;

  const exercise_groups = exercises.map((ex, index) => {
    // Determine reps: prefer actual reps from set_details, fall back to target_reps
    let reps = String(ex.target_reps || '8-12');
    if (ex.set_details && ex.set_details.length > 0) {
      const actualReps = ex.set_details
        .filter(s => s.reps_completed != null)
        .map(s => s.reps_completed);
      if (actualReps.length > 0) {
        const minReps = Math.min(...actualReps);
        const maxReps = Math.max(...actualReps);
        reps = minReps === maxReps ? String(minReps) : `${minReps}-${maxReps}`;
      }
    }

    return {
      group_id: `group-${Date.now()}-${index}`,
      exercises: { a: ex.exercise_name },
      sets: String(ex.sets_completed || ex.target_sets || '3'),
      reps: reps,
      rest: '60s',
      default_weight: ex.weight || null,
      default_weight_unit: ex.weight_unit || 'lbs',
      group_type: 'standard'
    };
  });

  const completedDate = session.completed_at
    ? new Date(session.completed_at).toLocaleDateString()
    : 'unknown date';

  return {
    name: `${session.workout_name || 'Workout'} (from session)`,
    description: `Created from session on ${completedDate}`,
    tags: [],
    exercise_groups: exercise_groups,
    template_notes: []
  };
}

/**
 * Create a workout template from a completed session
 * Stores data in sessionStorage and navigates to workout builder
 */
function createTemplateFromSession(sessionId) {
  const session = (window.ffn.workoutHistory.sessions || []).find(s => s.id === sessionId);
  if (!session) {
    console.error('Session not found:', sessionId);
    return;
  }

  const workoutData = sessionToWorkoutData(session);
  if (!workoutData) {
    if (window.showToast) {
      window.showToast('No exercises to create a template from (all were skipped)', 'warning');
    } else {
      alert('No exercises to create a template from.');
    }
    return;
  }

  // Store in sessionStorage for the workout builder to pick up
  sessionStorage.setItem('ffn_create_from_session', JSON.stringify(workoutData));

  // Navigate to workout builder
  window.location.href = 'workout-builder.html?from_session=true';
}

/* ============================================
   EXPORTS
   ============================================ */

// Export to window for backwards compatibility
window.renderSessionHistory = renderSessionHistory;
window.groupSessionsByTimePeriod = groupSessionsByTimePeriod;
window.renderSessionGroup = renderSessionGroup;
window.createSessionEntry = createSessionEntry;
window.renderSessionDetails = renderSessionDetails;
window.renderExerciseTableRow = renderExerciseTableRow;
window.scrollToSession = scrollToSession;
window.renderCardioHistoryEntry = renderCardioHistoryEntry;
window.sessionToWorkoutData = sessionToWorkoutData;
window.createTemplateFromSession = createTemplateFromSession;

console.log('📦 Workout History Sessions module loaded (v1.4.0)');
