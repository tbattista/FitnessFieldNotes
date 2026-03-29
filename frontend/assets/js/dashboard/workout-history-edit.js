/**
 * Workout History - Edit Session
 * Allows editing completed session metadata and exercises
 * @version 1.0.0
 */

/* ============================================
   EDIT SESSION MODAL
   ============================================ */

/**
 * Open edit session modal for a given session ID
 */
function openEditSessionModal(sessionId) {
  const session = (window.ffn.workoutHistory.sessions || []).find(s => s.id === sessionId);
  if (!session) {
    console.error('Session not found:', sessionId);
    return;
  }

  const modalId = 'editSessionModal';

  // Parse existing dates
  const startDate = session.started_at ? new Date(session.started_at) : new Date();
  const completedDate = session.completed_at ? new Date(session.completed_at) : new Date();

  // Format for date/time inputs
  const startDateStr = formatDateForInput(startDate);
  const startTimeStr = formatTimeForInput(startDate);
  const completedDateStr = formatDateForInput(completedDate);
  const completedTimeStr = formatTimeForInput(completedDate);

  const exercises = session.exercises_performed || [];

  // Build exercise rows HTML
  const exerciseRowsHtml = exercises.map((ex, idx) => `
    <div class="exercise-edit-row mb-2 p-2 border rounded" data-index="${idx}">
      <div class="d-flex align-items-center gap-2 mb-1">
        <strong class="flex-grow-1 small">${escapeHtml(ex.exercise_name)}</strong>
        <div class="form-check form-check-inline mb-0">
          <input class="form-check-input" type="checkbox" id="skip-${idx}"
                 ${ex.is_skipped ? 'checked' : ''}>
          <label class="form-check-label small" for="skip-${idx}">Skipped</label>
        </div>
      </div>
      <div class="row g-2">
        <div class="col-4">
          <input type="text" class="form-control form-control-sm edit-weight"
                 placeholder="Weight" value="${escapeHtml(ex.weight || '')}"
                 data-index="${idx}">
        </div>
        <div class="col-4">
          <input type="text" class="form-control form-control-sm edit-sets"
                 placeholder="Sets" value="${escapeHtml(String(ex.sets_completed || ex.target_sets || ''))}"
                 data-index="${idx}">
        </div>
        <div class="col-4">
          <input type="text" class="form-control form-control-sm edit-reps"
                 placeholder="Reps" value="${escapeHtml(String(ex.target_reps || ''))}"
                 data-index="${idx}">
        </div>
      </div>
    </div>
  `).join('');

  const bodyHtml = `
    <form id="editSessionForm">
      <div class="mb-3">
        <label class="form-label fw-bold">Workout Name</label>
        <input type="text" class="form-control" id="editWorkoutName"
               value="${escapeHtml(session.workout_name || '')}" maxlength="100">
      </div>

      <div class="row g-2 mb-3">
        <div class="col-6">
          <label class="form-label fw-bold">Start Date</label>
          <input type="date" class="form-control" id="editStartDate" value="${startDateStr}">
        </div>
        <div class="col-6">
          <label class="form-label fw-bold">Start Time</label>
          <input type="time" class="form-control" id="editStartTime" value="${startTimeStr}">
        </div>
      </div>

      <div class="row g-2 mb-3">
        <div class="col-6">
          <label class="form-label fw-bold">End Date</label>
          <input type="date" class="form-control" id="editEndDate" value="${completedDateStr}">
        </div>
        <div class="col-6">
          <label class="form-label fw-bold">End Time</label>
          <input type="time" class="form-control" id="editEndTime" value="${completedTimeStr}">
        </div>
      </div>

      <div class="mb-3">
        <label class="form-label fw-bold">Duration (minutes)</label>
        <input type="number" class="form-control" id="editDuration"
               value="${session.duration_minutes || ''}" min="1" max="600"
               placeholder="Auto-calculated from start/end">
      </div>

      <div class="mb-3">
        <label class="form-label fw-bold">Notes</label>
        <textarea class="form-control" id="editSessionNotes" rows="2"
                  maxlength="500" placeholder="Session notes...">${escapeHtml(session.notes || '')}</textarea>
      </div>

      <div class="mb-2">
        <label class="form-label fw-bold">Exercises</label>
        <div id="editExerciseRows">
          ${exerciseRowsHtml || '<p class="text-muted small">No exercises in this session</p>'}
        </div>
      </div>
    </form>
  `;

  // Create the modal
  if (window.ffnModalManager) {
    window.ffnModalManager.create(modalId, {
      title: 'Edit Session',
      body: bodyHtml,
      size: 'lg',
      scrollable: true,
      buttons: [
        { text: 'Cancel', class: 'btn-secondary', dismiss: true },
        {
          text: 'Save Changes',
          class: 'btn-primary',
          onClick: () => saveSessionEdits(sessionId, session)
        }
      ]
    });
    window.ffnModalManager.show(modalId);
  }

  // Auto-update duration when dates change
  setTimeout(() => {
    const startDateEl = document.getElementById('editStartDate');
    const startTimeEl = document.getElementById('editStartTime');
    const endDateEl = document.getElementById('editEndDate');
    const endTimeEl = document.getElementById('editEndTime');
    const durationEl = document.getElementById('editDuration');

    const updateDuration = () => {
      const start = new Date(`${startDateEl.value}T${startTimeEl.value}`);
      const end = new Date(`${endDateEl.value}T${endTimeEl.value}`);
      if (!isNaN(start) && !isNaN(end) && end > start) {
        durationEl.value = Math.round((end - start) / 60000);
      }
    };

    [startDateEl, startTimeEl, endDateEl, endTimeEl].forEach(el => {
      if (el) el.addEventListener('change', updateDuration);
    });
  }, 100);
}


/**
 * Save session edits via PATCH API
 */
async function saveSessionEdits(sessionId, originalSession) {
  try {
    if (!window.dataManager || !window.dataManager.isUserAuthenticated()) {
      throw new Error('Authentication required');
    }

    // Gather form values
    const workoutName = document.getElementById('editWorkoutName')?.value?.trim();
    const startDate = document.getElementById('editStartDate')?.value;
    const startTime = document.getElementById('editStartTime')?.value;
    const endDate = document.getElementById('editEndDate')?.value;
    const endTime = document.getElementById('editEndTime')?.value;
    const duration = document.getElementById('editDuration')?.value;
    const notes = document.getElementById('editSessionNotes')?.value?.trim();

    // Build request body (only include changed fields)
    const body = {};

    if (workoutName && workoutName !== originalSession.workout_name) {
      body.workout_name = workoutName;
    }

    if (startDate && startTime) {
      const newStart = new Date(`${startDate}T${startTime}`);
      if (!isNaN(newStart)) {
        body.started_at = newStart.toISOString();
      }
    }

    if (endDate && endTime) {
      const newEnd = new Date(`${endDate}T${endTime}`);
      if (!isNaN(newEnd)) {
        body.completed_at = newEnd.toISOString();
      }
    }

    if (duration) {
      body.duration_minutes = parseInt(duration, 10);
    }

    if (notes !== (originalSession.notes || '')) {
      body.notes = notes || null;
    }

    // Gather exercise edits
    const exerciseRows = document.querySelectorAll('.exercise-edit-row');
    if (exerciseRows.length > 0) {
      const exercises = [...(originalSession.exercises_performed || [])];
      let exercisesChanged = false;

      exerciseRows.forEach((row) => {
        const idx = parseInt(row.dataset.index, 10);
        if (idx >= exercises.length) return;

        const ex = { ...exercises[idx] };
        const weightInput = row.querySelector('.edit-weight');
        const setsInput = row.querySelector('.edit-sets');
        const repsInput = row.querySelector('.edit-reps');
        const skipInput = row.querySelector(`#skip-${idx}`);

        const newWeight = weightInput?.value?.trim() || null;
        const newSets = setsInput?.value?.trim() || ex.target_sets;
        const newReps = repsInput?.value?.trim() || ex.target_reps;
        const newSkipped = skipInput?.checked || false;

        if (newWeight !== (ex.weight || null) ||
            newSets !== String(ex.sets_completed || ex.target_sets || '') ||
            newReps !== String(ex.target_reps || '') ||
            newSkipped !== (ex.is_skipped || false)) {
          exercisesChanged = true;
        }

        ex.weight = newWeight;
        // Update sets_completed if numeric, otherwise keep target_sets
        const setsNum = parseInt(newSets, 10);
        if (!isNaN(setsNum)) {
          ex.sets_completed = setsNum;
        }
        ex.target_sets = newSets;
        ex.target_reps = newReps;
        ex.is_skipped = newSkipped;

        exercises[idx] = ex;
      });

      if (exercisesChanged) {
        body.exercises_performed = exercises;
      }
    }

    // Check if anything changed
    if (Object.keys(body).length === 0) {
      window.ffnModalManager.hide('editSessionModal');
      if (window.showToast) window.showToast('No changes to save', 'info');
      return;
    }

    // Send PATCH request
    const token = await window.dataManager.getAuthToken();
    const response = await fetch(`/api/v3/workout-sessions/${sessionId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || 'Failed to save changes');
    }

    const updatedSession = await response.json();

    // Update local state
    const sessions = window.ffn.workoutHistory.sessions;
    const sessionIndex = sessions.findIndex(s => s.id === sessionId);
    if (sessionIndex !== -1) {
      sessions[sessionIndex] = updatedSession;
    }

    // Close modal and re-render
    window.ffnModalManager.hide('editSessionModal');

    if (typeof renderSessionHistory === 'function') {
      renderSessionHistory();
    }
    calculateStatistics();
    renderStatistics();

    // Update calendar if visible
    if (window.ffn.workoutHistory.calendarView) {
      window.ffn.workoutHistory.calendarView.setSessionData(sessions);
    }

    if (window.showToast) window.showToast('Session updated successfully', 'success');
    console.log('Session edited:', sessionId);

  } catch (error) {
    console.error('Error editing session:', error);
    if (window.ffnModalManager) {
      window.ffnModalManager.alert('Error', `Failed to save changes: ${error.message}`, 'danger');
    }
  }
}


/* ============================================
   DATE/TIME FORMATTING HELPERS
   ============================================ */

function formatDateForInput(date) {
  if (!date || isNaN(date)) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatTimeForInput(date) {
  if (!date || isNaN(date)) return '';
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}


/* ============================================
   EXPORTS
   ============================================ */

window.openEditSessionModal = openEditSessionModal;
window.saveSessionEdits = saveSessionEdits;

console.log('Workout History Edit module loaded (v1.0.0)');
