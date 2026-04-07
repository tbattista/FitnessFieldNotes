/**
 * Workout History - Personal Records Section
 * Renders horizontal scrolling PR chips at the top of the history page
 * @version 2.1.0
 */

/** Rewrite external ExerciseDB CDN URLs to local proxy */
function _proxyGifUrl(url) {
  if (!url) return url;
  return url.replace('https://static.exercisedb.dev/media/', '/api/v3/exercise-image/');
}

/** Cache of exercise name -> gifUrl lookups */
let _prGifCache = {};
let _exerciseCacheReady = false;

/**
 * Alias map: maps common user exercise names to seed-data exercise names
 * so the GIF lookup finds the right image. Keys must be lowercase.
 */
const PR_EXERCISE_ALIASES = {
  // Squat variants
  'back squat':           'Barbell Full Squat',
  'squat':                'Barbell Full Squat',
  'front squat':          'Barbell Front Squat',
  'goblet squat':         'Dumbbell Goblet Squat',
  'overhead squat':       'Barbell Overhead Squat',
  'zercher squat':        'Barbell Zercher Squat',
  'hack squat':           'Sled Hack Squat',
  'split squat':          'Dumbbell Single Leg Split Squat',
  'jump squat':           'Jump Squat',
  'sissy squat':          'Sissy Squat',
  // Bench variants
  'bench press':          'Barbell Bench Press - Medium Grip',
  'bench':                'Barbell Bench Press - Medium Grip',
  'incline bench':        'Barbell Incline Bench Press',
  'incline bench press':  'Barbell Incline Bench Press',
  'decline bench':        'Barbell Decline Bench Press',
  'decline bench press':  'Barbell Decline Bench Press',
  // Deadlift variants
  'deadlift':             'Barbell Deadlift',
  'sumo deadlift':        'Barbell Sumo Deadlift',
  'romanian deadlift':    'Barbell Romanian Deadlift',
  'rdl':                  'Barbell Romanian Deadlift',
  // Common shorthand
  'ohp':                  'Barbell Standing Military Press',
  'military press':       'Barbell Standing Military Press',
  'pull up':              'Pull Up',
  'pullup':               'Pull Up',
  'chin up':              'Chin-Up',
  'chinup':               'Chin-Up',
  'lat pulldown':         'Cable Lat Pulldown',
  'row':                  'Barbell Bent Over Row',
  'barbell row':          'Barbell Bent Over Row',
  'bent over row':        'Barbell Bent Over Row',
  'dip':                  'Chest Dip',
  'dips':                 'Chest Dip',
  'curl':                 'Barbell Curl',
  'bicep curl':           'Barbell Curl',
  'tricep extension':     'Dumbbell Triceps Extension',
  'leg press':            'Lever Seated Leg Press',
  'leg curl':             'Lever Lying Leg Curl',
  'leg extension':        'Lever Leg Extension',
  'calf raise':           'Lever Seated Calf Raise',
};

/**
 * Look up an activity icon from the activity-type-registry.
 * Matches by id, name, or shortName (case-insensitive).
 * Returns a "bx bx-*" class string or null.
 */
function _lookupActivityIcon(exerciseName) {
  const registry = window.activityTypeRegistry;
  if (!registry) return null;
  const all = registry.getAll();
  if (!all) return null;
  const lower = exerciseName.toLowerCase().trim();
  for (const act of all) {
    if (lower === act.id || lower === (act.name || '').toLowerCase() || lower === (act.shortName || '').toLowerCase()) {
      return 'bx ' + act.icon;
    }
  }
  return null;
}

/**
 * Initialize the exercise cache for GIF lookups (called once)
 */
async function _initExerciseCacheForPR() {
  if (_exerciseCacheReady) return;
  const cacheService = window.exerciseCacheService;
  if (!cacheService) return;
  try {
    await cacheService.getExercisesWithInstantFallback();
    _exerciseCacheReady = true;
  } catch (e) {
    console.warn('[PR] Could not init exercise cache for GIFs:', e);
  }
}

/**
 * Check if `haystack` contains `needle` as a whole word (bounded by non-letter chars or string edges).
 * Prevents "run" matching inside "crunch", while still allowing "Bench Press" inside "Barbell Bench Press".
 */
function _containsWholeWord(haystack, needle) {
  if (!haystack || !needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('(?:^|[^a-z])' + escaped + '(?:$|[^a-z])');
  return re.test(haystack);
}

/**
 * Look up a GIF URL for an exercise name.
 * Returns { type: 'gif', url } | { type: 'icon', className } | null
 */
function _lookupGifUrl(exerciseName) {
  if (!exerciseName) return null;
  if (_prGifCache[exerciseName] !== undefined) return _prGifCache[exerciseName];

  const nameLower = exerciseName.toLowerCase().trim();

  // 1. Check activity icon overrides first (cardio, etc.) via registry
  const iconClass = _lookupActivityIcon(exerciseName);
  if (iconClass) {
    const result = { type: 'icon', className: iconClass };
    _prGifCache[exerciseName] = result;
    return result;
  }

  const cacheService = window.exerciseCacheService;
  if (!cacheService || !_exerciseCacheReady) {
    return null;
  }

  // 2. Check alias map — search using the mapped name instead
  const aliasName = PR_EXERCISE_ALIASES[nameLower];
  const searchName = aliasName || exerciseName;
  const searchLower = searchName.toLowerCase();

  // Search with more results to find a good match
  const results = cacheService.searchExercises(searchName, { limit: 5 });

  for (const match of results) {
    if (!match || !match.gifUrl || !match.name) continue;
    const matchLower = match.name.toLowerCase();
    // Accept: exact match, alias match, or one name contains the other as a whole word
    if (matchLower === searchLower || matchLower === nameLower
      || _containsWholeWord(matchLower, searchLower) || _containsWholeWord(searchLower, matchLower)
      || _containsWholeWord(matchLower, nameLower) || _containsWholeWord(nameLower, matchLower)) {
      const proxied = _proxyGifUrl(match.gifUrl);
      const result = { type: 'gif', url: proxied };
      _prGifCache[exerciseName] = result;
      return result;
    }
  }
  _prGifCache[exerciseName] = null;
  return null;
}

/**
 * Default PR display order by exercise name keywords.
 * PRs matching these keywords (case-insensitive) are placed first in this order.
 */
const DEFAULT_PR_ORDER = ['bench', 'deadlift', 'squat', 'overhead press'];

/**
 * Get ordered records using: saved order from API > default keyword order > remaining alphabetically
 */
function _getOrderedRecords(records, savedRecordIds) {
  if (!records || records.length === 0) return [];

  // If we have a saved order from the backend, use it
  if (savedRecordIds && savedRecordIds.length > 0) {
    const recordMap = new Map(records.map(r => [r.id, r]));
    const ordered = [];

    // Add records in saved order
    for (const id of savedRecordIds) {
      const rec = recordMap.get(id);
      if (rec) {
        ordered.push(rec);
        recordMap.delete(id);
      }
    }

    // Append any remaining records not in the saved order
    for (const rec of recordMap.values()) {
      ordered.push(rec);
    }

    return ordered;
  }

  // No saved order — apply default keyword ordering
  const nameLower = r => (r.exercise_name || '').toLowerCase();
  const defaultMatched = [];
  const remaining = [];

  // Create slots for each default keyword
  const slots = DEFAULT_PR_ORDER.map(() => []);

  for (const rec of records) {
    const name = nameLower(rec);
    let matched = false;
    for (let i = 0; i < DEFAULT_PR_ORDER.length; i++) {
      if (name.includes(DEFAULT_PR_ORDER[i])) {
        slots[i].push(rec);
        matched = true;
        break;
      }
    }
    if (!matched) {
      remaining.push(rec);
    }
  }

  // Flatten slots then append remaining sorted alphabetically
  const ordered = slots.flat();
  remaining.sort((a, b) => (a.exercise_name || '').localeCompare(b.exercise_name || ''));
  return ordered.concat(remaining);
}

/** Track drag-and-drop reorder mode */
let _prReorderMode = false;

/**
 * Render the PR chips section at the top of the history page
 * Called on page load and whenever PRs change
 */
async function renderPRSection() {
  const container = document.getElementById('prSectionContainer');
  if (!container) return;

  const state = window.ffn.workoutHistory;
  const records = Array.from(state.personalRecords.values());

  if (records.length === 0) {
    container.style.display = '';
    container.innerHTML = `
      <div class="pr-section-empty">
        <button class="btn btn-sm btn-outline-warning" onclick="showAddPRModal()">
          <i class="bx bxs-trophy me-1"></i> Add Your First PR
        </button>
      </div>
    `;
    return;
  }

  container.style.display = '';

  // Order records by saved order or default
  const orderedRecords = _getOrderedRecords(records, state.prRecordIds);

  // Initialize exercise cache for GIF lookups
  await _initExerciseCacheForPR();

  // Check stored visibility preference
  const isCollapsed = localStorage.getItem('ffn_pr_section_visible') === 'false';

  const chips = orderedRecords.map(pr => {
    const dateStr = _formatPRDate(pr.session_date || pr.marked_at);
    const prId = pr.id;
    const media = _lookupGifUrl(pr.exercise_name);

    let mediaHtml = '';
    if (media && media.type === 'gif') {
      mediaHtml = `<img src="${escapeHtml(media.url)}" alt="" class="pr-chip-gif" onerror="this.style.display='none'" loading="lazy">`;
    } else if (media && media.type === 'icon') {
      mediaHtml = `<div class="pr-chip-activity-icon"><i class="${escapeHtml(media.className)}"></i></div>`;
    }

    return `
      <div class="pr-chip${_prReorderMode ? ' pr-chip-reorder' : ''}" data-pr-id="${escapeHtml(prId)}"
           ${_prReorderMode ? 'draggable="true"' : ''}
           onclick="${_prReorderMode ? '' : `editPRValue('${escapeHtml(prId)}')`}"
           role="button" title="${_prReorderMode ? 'Drag to reorder' : 'Click to edit PR value'}">
        <div class="pr-chip-top">
          ${_prReorderMode ? '<i class="bx bx-grid-vertical text-secondary pr-drag-handle"></i>' : '<i class="bx bxs-trophy text-warning"></i>'}
          <span class="pr-chip-name">${escapeHtml(pr.exercise_name)}</span>
        </div>
        ${mediaHtml}
        <span class="pr-chip-value">${escapeHtml(pr.value)} ${escapeHtml(pr.value_unit)}</span>
        ${dateStr ? `<span class="pr-chip-date">${dateStr}</span>` : ''}
      </div>
    `;
  }).join('');

  const reorderBtnClass = _prReorderMode ? 'btn-warning' : 'btn-outline-secondary';
  const reorderBtnLabel = _prReorderMode ? 'Done' : 'Reorder';
  const reorderBtnTitle = _prReorderMode ? 'Save order' : 'Reorder PRs';

  container.innerHTML = `
    <div class="pr-section-header">
      <span class="pr-section-label">
        <i class="bx bxs-trophy"></i> Personal Records
      </span>
      <div class="d-flex align-items-center gap-1">
<<<<<<< HEAD
        <button class="btn btn-xs btn-outline-secondary pr-collapse-btn" onclick="togglePRSection()" title="${isCollapsed ? 'Show PRs' : 'Hide PRs'}">
          ${isCollapsed ? 'Show' : 'Hide'}
=======
        <button class="btn btn-xs btn-outline-primary pr-add-btn" onclick="showAddPRModal()" title="Add a PR for any exercise">
          <i class="bx bx-plus"></i> Add
>>>>>>> 0ff6f40 (feat: add exercise fuzzy matching and Add PR for any exercise on history page)
        </button>
        <button class="btn btn-xs ${reorderBtnClass} pr-reorder-btn" onclick="togglePRReorderMode()" title="${reorderBtnTitle}">
          ${reorderBtnLabel}
        </button>
      </div>
    </div>
    <div class="pr-chips-collapsible${isCollapsed ? ' collapsed' : ''}">
      <div class="pr-chips-container">
        <div class="pr-chips-scroll" id="prChipsScroll">
          ${chips}
        </div>
      </div>
    </div>
  `;

  // Attach drag-and-drop handlers if in reorder mode
  if (_prReorderMode) {
    _initPRDragAndDrop();
  }
}

/**
 * Toggle reorder mode on/off. When turning off, save the new order.
 */
async function togglePRReorderMode() {
  if (_prReorderMode) {
    // Turning off — save the current order
    const scrollContainer = document.getElementById('prChipsScroll');
    if (scrollContainer) {
      const chips = scrollContainer.querySelectorAll('.pr-chip[data-pr-id]');
      const newOrder = Array.from(chips).map(c => c.dataset.prId);
      await _savePROrder(newOrder);
    }
    _prReorderMode = false;
  } else {
    _prReorderMode = true;
  }
  renderPRSection();
}

/**
 * Save PR order to the backend
 */
async function _savePROrder(recordIds) {
  try {
    if (!window.dataManager) return;
    const token = await window.dataManager.getAuthToken();

    const response = await fetch('/api/v3/users/me/personal-records/reorder', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ recordIds })
    });

    if (response.ok) {
      // Update local state
      const state = window.ffn.workoutHistory;
      state.prRecordIds = recordIds;
      if (window.showToast) window.showToast('PR order saved!', 'success');
    } else {
      if (window.showToast) window.showToast('Failed to save PR order', 'danger');
    }
  } catch (error) {
    console.error('Error saving PR order:', error);
    if (window.showToast) window.showToast('Failed to save PR order', 'danger');
  }
}

/**
 * Initialize drag-and-drop for PR chips reordering
 */
function _initPRDragAndDrop() {
  const scrollContainer = document.getElementById('prChipsScroll');
  if (!scrollContainer) return;

  let draggedEl = null;

  scrollContainer.addEventListener('dragstart', (e) => {
    const chip = e.target.closest('.pr-chip[data-pr-id]');
    if (!chip) return;
    draggedEl = chip;
    chip.classList.add('pr-chip-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', chip.dataset.prId);
  });

  scrollContainer.addEventListener('dragend', (e) => {
    if (draggedEl) {
      draggedEl.classList.remove('pr-chip-dragging');
      draggedEl = null;
    }
    // Remove all drop indicators
    scrollContainer.querySelectorAll('.pr-chip-drag-over').forEach(el => {
      el.classList.remove('pr-chip-drag-over');
    });
  });

  scrollContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const chip = e.target.closest('.pr-chip[data-pr-id]');
    if (!chip || chip === draggedEl) return;

    // Remove previous indicators
    scrollContainer.querySelectorAll('.pr-chip-drag-over').forEach(el => {
      el.classList.remove('pr-chip-drag-over');
    });
    chip.classList.add('pr-chip-drag-over');
  });

  scrollContainer.addEventListener('drop', (e) => {
    e.preventDefault();
    const targetChip = e.target.closest('.pr-chip[data-pr-id]');
    if (!targetChip || !draggedEl || targetChip === draggedEl) return;

    // Determine drop position (before or after target)
    const rect = targetChip.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    if (e.clientX < midX) {
      scrollContainer.insertBefore(draggedEl, targetChip);
    } else {
      scrollContainer.insertBefore(draggedEl, targetChip.nextSibling);
    }

    targetChip.classList.remove('pr-chip-drag-over');
  });

  // Touch drag support for mobile
  let touchDragEl = null;
  let touchClone = null;
  let touchStartX = 0;
  let touchStartY = 0;

  scrollContainer.addEventListener('touchstart', (e) => {
    const chip = e.target.closest('.pr-chip[data-pr-id]');
    if (!chip || !_prReorderMode) return;
    touchDragEl = chip;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  scrollContainer.addEventListener('touchmove', (e) => {
    if (!touchDragEl) return;

    const dx = Math.abs(e.touches[0].clientX - touchStartX);
    const dy = Math.abs(e.touches[0].clientY - touchStartY);

    // Only start drag if horizontal movement exceeds threshold
    if (dx < 10 && !touchClone) return;

    e.preventDefault();

    if (!touchClone) {
      touchDragEl.classList.add('pr-chip-dragging');
      touchClone = touchDragEl.cloneNode(true);
      touchClone.classList.add('pr-chip-touch-clone');
      document.body.appendChild(touchClone);
    }

    touchClone.style.left = (e.touches[0].clientX - 65) + 'px';
    touchClone.style.top = (e.touches[0].clientY - 40) + 'px';

    // Find drop target
    const elemBelow = document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY);
    const targetChip = elemBelow ? elemBelow.closest('.pr-chip[data-pr-id]') : null;

    scrollContainer.querySelectorAll('.pr-chip-drag-over').forEach(el => {
      el.classList.remove('pr-chip-drag-over');
    });

    if (targetChip && targetChip !== touchDragEl) {
      targetChip.classList.add('pr-chip-drag-over');
    }
  }, { passive: false });

  scrollContainer.addEventListener('touchend', (e) => {
    if (!touchDragEl) return;

    if (touchClone) {
      // Find drop target
      const lastTouch = e.changedTouches[0];
      const elemBelow = document.elementFromPoint(lastTouch.clientX, lastTouch.clientY);
      const targetChip = elemBelow ? elemBelow.closest('.pr-chip[data-pr-id]') : null;

      if (targetChip && targetChip !== touchDragEl) {
        const rect = targetChip.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        if (lastTouch.clientX < midX) {
          scrollContainer.insertBefore(touchDragEl, targetChip);
        } else {
          scrollContainer.insertBefore(touchDragEl, targetChip.nextSibling);
        }
      }

      touchClone.remove();
      touchClone = null;
    }

    touchDragEl.classList.remove('pr-chip-dragging');
    scrollContainer.querySelectorAll('.pr-chip-drag-over').forEach(el => {
      el.classList.remove('pr-chip-drag-over');
    });

    touchDragEl = null;
  });
}

/**
 * Format a date value for a date input (YYYY-MM-DD)
 */
function _toDateInputValue(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d)) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch { return ''; }
}

/**
 * Edit a PR — click on a chip to change value and/or date
 */
async function editPRValue(prId) {
  const state = window.ffn.workoutHistory;
  const pr = state.personalRecords.get(prId);
  if (!pr) return;
  if (!window.ffnModalManager) return;

  const currentDate = pr.session_date || pr.marked_at || '';
  const currentDateInput = _toDateInputValue(currentDate);
  const currentDateDisplay = _formatPRDate(currentDate);

  const result = await new Promise(resolve => {
    const id = `pr-edit-modal-${Date.now()}`;
    const valueId = `${id}-value`;
    const dateId = `${id}-date`;

    const body = `
      <div class="mb-3">
        <label for="${valueId}" class="form-label">PR Value (${escapeHtml(pr.value_unit)})</label>
        <input type="text" class="form-control" id="${valueId}"
               value="${String(pr.value).replace(/"/g, '&quot;')}">
      </div>
      <div class="mb-2">
        <label for="${dateId}" class="form-label">PR Date</label>
        <input type="date" class="form-control" id="${dateId}"
               value="${currentDateInput}">
        ${currentDateDisplay ? `<div class="form-text">Current: ${currentDateDisplay}</div>` : ''}
      </div>
    `;

    let pendingResult = null;

    const modal = window.ffnModalManager.create(id, {
      title: `Edit PR: ${pr.exercise_name}`,
      body: body,
      size: 'sm',
      buttons: [
        { text: 'Cancel', class: 'btn-secondary', dismiss: true },
        {
          text: 'Save',
          class: 'btn-primary',
          onClick: () => {
            const valInput = document.getElementById(valueId);
            const dateInput = document.getElementById(dateId);
            pendingResult = {
              value: valInput ? valInput.value : '',
              date: dateInput ? dateInput.value : ''
            };
            window.ffnModalManager.hide(id);
          }
        }
      ]
    });

    modal.element.addEventListener('shown.bs.modal', () => {
      const input = document.getElementById(valueId);
      if (input) { input.focus(); input.select(); }
    }, { once: true });

    modal.element.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const valInput = document.getElementById(valueId);
        const dateInput = document.getElementById(dateId);
        pendingResult = {
          value: valInput ? valInput.value : '',
          date: dateInput ? dateInput.value : ''
        };
        window.ffnModalManager.hide(id);
      }
    });

    modal.element.addEventListener('hidden.bs.modal', () => {
      window.ffnModalManager.destroy(id);
      resolve(pendingResult);
    }, { once: true });

    window.ffnModalManager.show(id);
  });

  if (!result) return;

  const newValue = result.value.trim();
  const newDate = result.date; // YYYY-MM-DD or empty
  if (!newValue) return;

  // Check if anything actually changed
  const valueChanged = newValue !== pr.value;
  const dateChanged = newDate && newDate !== currentDateInput;
  if (!valueChanged && !dateChanged) return;

  try {
    if (!window.dataManager) return;
    const token = await window.dataManager.getAuthToken();

    const payload = { value: newValue, value_unit: pr.value_unit };
    if (dateChanged) {
      payload.session_date = new Date(newDate + 'T12:00:00').toISOString();
    }

    const response = await fetch(`/api/v3/users/me/personal-records/${prId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      // Update local state
      if (valueChanged) pr.value = newValue;
      if (dateChanged) {
        const isoDate = new Date(newDate + 'T12:00:00').toISOString();
        pr.session_date = isoDate;
        pr.marked_at = isoDate;
      }

      if (window.showToast) window.showToast(`PR updated for ${pr.exercise_name}!`, 'success');
      renderPRSection();
      if (window.renderExerciseTab) window.renderExerciseTab();
    } else {
      if (window.showToast) window.showToast('Failed to update PR', 'danger');
    }
  } catch (error) {
    console.error('Error updating PR:', error);
    if (window.showToast) window.showToast('Failed to update PR', 'danger');
  }
}

function _formatPRDate(dateStr) {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    if (isNaN(date)) return '';

    // Format as mm/dd/yy
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const yy = String(date.getFullYear()).slice(-2);
    const dateFormatted = `${mm}/${dd}/${yy}`;

    // Calculate relative time
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    let relative;
    if (diffDays === 0) relative = 'today';
    else if (diffDays === 1) relative = '1 day ago';
    else if (diffDays < 7) relative = `${diffDays} days ago`;
    else {
      const diffWeeks = Math.floor(diffDays / 7);
      if (diffWeeks < 5) relative = diffWeeks === 1 ? '1 week ago' : `${diffWeeks} weeks ago`;
      else {
        const diffMonths = Math.floor(diffDays / 30);
        relative = diffMonths <= 1 ? '1 month ago' : `${diffMonths} months ago`;
      }
    }

    return `${dateFormatted} - ${relative}`;
  } catch {
    return '';
  }
}

/**
 * Toggle the PR chips section visibility
 */
function togglePRSection() {
  const collapsible = document.querySelector('.pr-chips-collapsible');
  const btn = document.querySelector('.pr-collapse-btn');
  if (!collapsible || !btn) return;

  const isCollapsing = !collapsible.classList.contains('collapsed');
  collapsible.classList.toggle('collapsed');
  btn.textContent = isCollapsing ? 'Show' : 'Hide';
  btn.title = isCollapsing ? 'Show PRs' : 'Hide PRs';
  localStorage.setItem('ffn_pr_section_visible', !isCollapsing ? 'true' : 'false');
}

/* ============================================
   ADD PR FOR ANY EXERCISE (MODAL)
   ============================================ */

/** Debounce timer for PR modal search */
let _prModalSearchTimer = null;

/**
 * Show modal to add a PR for any exercise (searched from full exercise DB)
 */
async function showAddPRModal() {
  if (!window.ffnModalManager) return;

  // Ensure exercise cache is ready
  const cacheService = window.exerciseCacheService;
  if (cacheService) {
    await cacheService.getExercisesWithInstantFallback();
  }

  const modalId = `pr-add-modal-${Date.now()}`;
  const exerciseInputId = `${modalId}-exercise`;
  const resultsId = `${modalId}-results`;
  const typeId = `${modalId}-type`;
  const valueId = `${modalId}-value`;
  const unitId = `${modalId}-unit`;
  const dateId = `${modalId}-date`;

  const defaultUnits = {
    weight: 'lbs',
    distance: 'miles',
    duration: 'min',
    pace: 'min/mi'
  };

  const body = `
    <div class="mb-3">
      <label for="${exerciseInputId}" class="form-label">Exercise</label>
      <input type="text" class="form-control" id="${exerciseInputId}"
             placeholder="Search exercises..." autocomplete="off">
      <div class="pr-modal-search-results" id="${resultsId}" style="display: none;"></div>
    </div>
    <div class="mb-3">
      <label class="form-label">PR Type</label>
      <div class="d-flex gap-2 flex-wrap" id="${typeId}">
        <label class="btn btn-outline-secondary btn-sm pr-type-radio active">
          <input type="radio" name="prType" value="weight" checked class="d-none"> Weight
        </label>
        <label class="btn btn-outline-secondary btn-sm pr-type-radio">
          <input type="radio" name="prType" value="distance" class="d-none"> Distance
        </label>
        <label class="btn btn-outline-secondary btn-sm pr-type-radio">
          <input type="radio" name="prType" value="duration" class="d-none"> Duration
        </label>
        <label class="btn btn-outline-secondary btn-sm pr-type-radio">
          <input type="radio" name="prType" value="pace" class="d-none"> Pace
        </label>
      </div>
    </div>
    <div class="row g-2 mb-3">
      <div class="col-7">
        <label for="${valueId}" class="form-label">Value</label>
        <input type="text" class="form-control" id="${valueId}" placeholder="e.g. 225">
      </div>
      <div class="col-5">
        <label for="${unitId}" class="form-label">Unit</label>
        <input type="text" class="form-control" id="${unitId}" value="lbs">
      </div>
    </div>
    <div class="mb-2">
      <label for="${dateId}" class="form-label">Date <span class="text-muted">(optional)</span></label>
      <input type="date" class="form-control" id="${dateId}">
    </div>
  `;

  let pendingResult = null;

  const modal = window.ffnModalManager.create(modalId, {
    title: 'Add Personal Record',
    body: body,
    size: 'sm',
    buttons: [
      { text: 'Cancel', class: 'btn-secondary', dismiss: true },
      {
        text: 'Save PR',
        class: 'btn-warning',
        onClick: () => {
          const exerciseInput = document.getElementById(exerciseInputId);
          const valueInput = document.getElementById(valueId);
          const unitInput = document.getElementById(unitId);
          const dateInput = document.getElementById(dateId);
          const selectedType = document.querySelector(`#${typeId} input[name="prType"]:checked`);

          pendingResult = {
            exercise_name: exerciseInput ? exerciseInput.value.trim() : '',
            pr_type: selectedType ? selectedType.value : 'weight',
            value: valueInput ? valueInput.value.trim() : '',
            value_unit: unitInput ? unitInput.value.trim() : 'lbs',
            date: dateInput ? dateInput.value : ''
          };
          window.ffnModalManager.hide(modalId);
        }
      }
    ]
  });

  // Wire up interactions after modal is shown
  modal.element.addEventListener('shown.bs.modal', () => {
    const exerciseInput = document.getElementById(exerciseInputId);
    if (exerciseInput) {
      exerciseInput.focus();

      // Exercise search on input
      exerciseInput.addEventListener('input', () => {
        clearTimeout(_prModalSearchTimer);
        _prModalSearchTimer = setTimeout(() => {
          _handlePRModalSearch(exerciseInput.value, resultsId, exerciseInputId);
        }, 250);
      });
    }

    // PR type radio toggle
    const typeContainer = document.getElementById(typeId);
    if (typeContainer) {
      typeContainer.addEventListener('click', (e) => {
        const label = e.target.closest('.pr-type-radio');
        if (!label) return;
        typeContainer.querySelectorAll('.pr-type-radio').forEach(l => l.classList.remove('active'));
        label.classList.add('active');
        const radio = label.querySelector('input[type="radio"]');
        if (radio) {
          radio.checked = true;
          // Update unit default
          const unitInput = document.getElementById(unitId);
          if (unitInput) unitInput.value = defaultUnits[radio.value] || '';
        }
      });
    }
  }, { once: true });

  // Handle Enter key to submit
  modal.element.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id !== exerciseInputId) {
      e.preventDefault();
      const exerciseInput = document.getElementById(exerciseInputId);
      const valueInput = document.getElementById(valueId);
      const unitInput = document.getElementById(unitId);
      const dateInput = document.getElementById(dateId);
      const selectedType = document.querySelector(`#${typeId} input[name="prType"]:checked`);

      pendingResult = {
        exercise_name: exerciseInput ? exerciseInput.value.trim() : '',
        pr_type: selectedType ? selectedType.value : 'weight',
        value: valueInput ? valueInput.value.trim() : '',
        value_unit: unitInput ? unitInput.value.trim() : 'lbs',
        date: dateInput ? dateInput.value : ''
      };
      window.ffnModalManager.hide(modalId);
    }
  });

  // Process result on modal close
  const result = await new Promise(resolve => {
    modal.element.addEventListener('hidden.bs.modal', () => {
      window.ffnModalManager.destroy(modalId);
      resolve(pendingResult);
    }, { once: true });

    window.ffnModalManager.show(modalId);
  });

  if (!result || !result.exercise_name || !result.value) return;

  // Save the PR via API
  try {
    if (!window.dataManager) return;
    const token = await window.dataManager.getAuthToken();

    const payload = {
      pr_type: result.pr_type,
      exercise_name: result.exercise_name,
      value: result.value,
      value_unit: result.value_unit
    };
    if (result.date) {
      payload.session_date = new Date(result.date + 'T12:00:00').toISOString();
    }

    console.log('[PR] Creating PR via Add modal:', payload);

    const response = await fetch('/api/v3/users/me/personal-records', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const data = await response.json();
      const prId = data.pr_id;
      if (!prId) {
        console.error('[PR] Response missing pr_id:', data);
        if (window.showToast) window.showToast('PR saved but ID missing', 'warning');
        return;
      }

      const state = window.ffn.workoutHistory;
      state.personalRecords.set(prId, {
        id: prId,
        pr_type: result.pr_type,
        exercise_name: result.exercise_name,
        value: result.value,
        value_unit: result.value_unit,
        session_date: result.date ? new Date(result.date + 'T12:00:00').toISOString() : null,
        marked_at: new Date().toISOString(),
        is_manual: true
      });
      state.prExerciseNames.add(result.exercise_name.toLowerCase());

      if (window.showToast) window.showToast(`PR added for ${result.exercise_name}!`, 'success');
      renderPRSection();
      if (window.renderExerciseTab) window.renderExerciseTab();
    } else {
      const errBody = await response.text().catch(() => '');
      console.error('[PR] Create failed:', response.status, errBody);
      if (window.showToast) window.showToast('Failed to save PR', 'danger');
    }
  } catch (error) {
    console.error('Error creating PR:', error);
    if (window.showToast) window.showToast('Failed to save PR', 'danger');
  }
}

/**
 * Handle exercise search within the Add PR modal
 */
function _handlePRModalSearch(query, resultsContainerId, exerciseInputId) {
  const container = document.getElementById(resultsContainerId);
  if (!container) return;

  if (!query || query.trim().length < 2) {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }

  const cacheService = window.exerciseCacheService;
  if (!cacheService) return;

  const results = cacheService.searchExercises(query.trim(), { limit: 8 });

  if (results.length === 0) {
    container.innerHTML = '<div class="pr-modal-search-item text-muted">No matches found</div>';
    container.style.display = '';
    return;
  }

  container.innerHTML = results.map(ex => `
    <div class="pr-modal-search-item" data-name="${escapeHtml(ex.name)}">
      <div>${escapeHtml(ex.name)}</div>
      ${ex.targetMuscleGroup || ex.primaryEquipment ? `<div class="pr-modal-search-subtitle">${escapeHtml(ex.targetMuscleGroup || '')}${ex.primaryEquipment ? ' &middot; ' + escapeHtml(ex.primaryEquipment) : ''}</div>` : ''}
    </div>
  `).join('');
  container.style.display = '';

  // Attach click handlers
  container.querySelectorAll('.pr-modal-search-item').forEach(item => {
    item.addEventListener('click', () => {
      const nameInput = document.getElementById(exerciseInputId);
      if (nameInput) {
        nameInput.value = item.dataset.name;
      }
      container.style.display = 'none';
    });
  });
}

// Exports
window.renderPRSection = renderPRSection;
window.editPRValue = editPRValue;
window.togglePRSection = togglePRSection;
window.togglePRReorderMode = togglePRReorderMode;
window.showAddPRModal = showAddPRModal;

console.log('Workout History PR Section module loaded (v4.0.0)');
