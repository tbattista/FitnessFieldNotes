/**
 * Workout History - Exercise Tab Renderer
 * Renders the exercise overview tab/section for All Sessions mode
 * @version 1.0.0
 */

/* ============================================
   MAIN RENDER
   ============================================ */

/**
 * Render the exercise tab content
 * Works for both mobile tab pane and desktop sidebar card
 */
function renderExerciseTab() {
  const container = document.getElementById('exerciseTabContainer');
  if (!container) return;

  const state = window.ffn.workoutHistory;
  let groups = state.allExerciseGroups || [];

  if (groups.length === 0) {
    container.innerHTML = `
      <div class="text-center py-4">
        <i class="bx bx-dumbbell display-4 text-muted"></i>
        <p class="mt-3 text-muted">No exercise data yet</p>
      </div>
    `;
    return;
  }

  // Apply search filter
  const search = (state.exerciseTabSearch || '').toLowerCase().trim();
  if (search) {
    groups = groups.filter(g => {
      if (g.baseName.toLowerCase().includes(search)) return true;
      return g.variants.some(v => v.fullName.toLowerCase().includes(search));
    });
  }

  // Apply sort
  groups = sortExerciseGroups(groups, state.exerciseTabSort);

  // Sort labels
  const sortLabels = {
    'frequency': 'Frequency',
    'name': 'A-Z',
    'recent': 'Recent'
  };

  // Build HTML
  let html = '';

  // Search + sort bar
  html += `
    <div class="exercise-tab-toolbar">
      <div class="exercise-tab-search-wrapper">
        <i class="bx bx-search exercise-tab-search-icon"></i>
        <input type="text" class="form-control form-control-sm exercise-tab-search"
               placeholder="Search exercises..."
               value="${escapeHtml(state.exerciseTabSearch || '')}"
               oninput="handleExerciseTabSearch(this.value)">
      </div>
      <button class="exercise-sort-btn" onclick="cycleExerciseTabSort()" title="Sort exercises">
        <i class="bx bx-sort-alt-2"></i> ${sortLabels[state.exerciseTabSort]}
      </button>
    </div>
  `;

  if (groups.length === 0) {
    html += `
      <div class="text-center py-3">
        <p class="text-muted mb-0">No exercises match "${escapeHtml(search)}"</p>
      </div>
    `;
  } else {
    html += `<div class="exercise-group-list">`;
    for (const group of groups) {
      html += renderExerciseGroup(group);
    }
    html += `</div>`;
  }

  // Save search input focus/cursor state before replacing DOM
  const searchInput = container.querySelector('.exercise-tab-search');
  const hadFocus = searchInput && document.activeElement === searchInput;
  const cursorPos = hadFocus ? searchInput.selectionStart : null;

  container.innerHTML = html;

  // Restore focus and cursor position after re-render
  if (hadFocus) {
    const newInput = container.querySelector('.exercise-tab-search');
    if (newInput) {
      newInput.focus();
      if (cursorPos !== null) {
        newInput.setSelectionRange(cursorPos, cursorPos);
      }
    }
  }
}

/* ============================================
   GROUP RENDERING
   ============================================ */

/**
 * Render a single exercise group (base movement + variants)
 */
function renderExerciseGroup(group) {
  const state = window.ffn.workoutHistory;
  const groupId = `exgrp-${group.baseName.replace(/[^a-zA-Z0-9]/g, '-')}`;
  const isExpanded = state.expandedExerciseGroups.has(group.baseName);
  const sessionLabel = group.totalSessions === 1 ? '1 session' : `${group.totalSessions} sessions`;
  const lastDate = group.lastDate ? formatExerciseDate(group.lastDate) : '';
  const hasMultipleVariants = group.variants.length > 1;

  // PR tracking: check if this exercise has a PR (check canonical name + any merged alias names)
  let isPR = state.prExerciseNames.has(group.baseName.toLowerCase());
  if (!isPR && group.mergedNames && group.mergedNames.size > 0) {
    for (const alias of group.mergedNames) {
      if (state.prExerciseNames.has(alias.toLowerCase())) {
        isPR = true;
        break;
      }
    }
  }
  // Get most recent variant for pre-fill (user expects "last weight I did")
  const mostRecentVariant = group.variants.reduce((best, v) => {
    const bestDate = best.lastDate ? new Date(best.lastDate) : new Date(0);
    const vDate = v.lastDate ? new Date(v.lastDate) : new Date(0);
    return vDate > bestDate ? v : best;
  }, group.variants[0]);
  const prefillWeight = mostRecentVariant?.lastWeight || mostRecentVariant?.bestWeight || '';
  const bestUnit = mostRecentVariant?.lastWeightUnit || 'lbs';
  // Find the earliest date the best weight was first achieved (across all variants)
  const bestWeightDate = mostRecentVariant?.bestWeightDate || '';

  // Build alias display text
  const mergedNamesArray = group.mergedNames && group.mergedNames.size > 0
    ? Array.from(group.mergedNames).filter(n => n.toLowerCase() !== group.baseName.toLowerCase())
    : [];
  const aliasHtml = mergedNamesArray.length > 0
    ? `<span class="exercise-group-aliases">also: ${mergedNamesArray.map(n => escapeHtml(n)).join(', ')}</span>`
    : '';

  let html = `
    <div class="exercise-group-item">
      <div class="exercise-group-header"
           onclick="toggleExerciseGroup('${escapeHtml(group.baseName)}')"
           role="button"
           aria-expanded="${isExpanded}"
           aria-controls="${groupId}">
        <div class="exercise-group-header-row1">
          <span class="exercise-group-name">${escapeHtml(group.baseName)}</span>${aliasHtml}
          <div class="exercise-group-header-right">
            ${hasMultipleVariants ? `<span class="exercise-group-variant-count">${group.variants.length} variants</span>` : ''}
            <button class="pr-toggle-btn ${isPR ? 'active' : ''}"
                    onclick="event.stopPropagation(); toggleExercisePRTracking('${escapeHtml(group.baseName)}', '${escapeHtml(String(prefillWeight))}', '${escapeHtml(bestUnit)}', '${escapeHtml(bestWeightDate)}')"
                    title="${isPR ? 'Remove PR tracking' : 'Track PR for this exercise'}">
              <i class="bx ${isPR ? 'bxs-trophy' : 'bx-trophy'} ${isPR ? 'text-warning' : ''}"></i>
            </button>
            <i class="bx bx-chevron-down exercise-group-chevron ${isExpanded ? 'rotated' : ''}"></i>
          </div>
        </div>
        <div class="exercise-group-meta">
          <span class="exercise-group-count">${sessionLabel}</span>
          ${lastDate ? `<span class="exercise-group-meta-sep">&middot;</span><span class="exercise-group-date">${lastDate}</span>` : ''}
        </div>
      </div>
      <div id="${groupId}" class="exercise-group-body" style="${isExpanded ? '' : 'display: none;'}">
  `;

  if (hasMultipleVariants) {
    // Multiple variants: show each with equipment label
    for (const variant of group.variants) {
      html += renderExerciseVariant(variant, true);
    }
  } else {
    // Single variant: show timeline directly
    html += renderExerciseVariant(group.variants[0], false);
  }

  html += `
      </div>
    </div>
  `;

  return html;
}

/**
 * Render a single equipment variant
 */
function renderExerciseVariant(variant, showHeader) {
  const lastWeight = variant.lastWeight || '--';
  const lastUnit = variant.lastWeightUnit || 'lbs';
  const lastReps = variant.lastReps || '--';
  const sessionLabel = variant.totalSessions === 1 ? '1x' : `${variant.totalSessions}x`;

  let html = `<div class="exercise-variant">`;

  if (showHeader) {
    html += `
      <div class="variant-header">
        <span class="variant-equipment">${escapeHtml(variant.equipment)}</span>
        <span class="variant-stats">${lastWeight} ${lastUnit} x ${lastReps} &middot; ${sessionLabel}</span>
      </div>
    `;
  }

  // Timeline entries
  const entries = variant.entries || [];
  if (entries.length > 0) {
    html += `<div class="variant-timeline">`;
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const weight = entry.weight || '--';
      const unit = entry.weightUnit || 'lbs';
      const reps = entry.reps || entry.sets || '--';
      const date = formatExerciseDate(entry.date);
      const fadeClass = i === 0 ? '' : 'history-row-faded';

      // Show increase icon when weight is higher than the next (chronologically earlier) entry
      let increaseIcon = '';
      if (i < entries.length - 1) {
        const prevWeight = parseFloat(entries[i + 1].weight);
        const currWeight = parseFloat(entry.weight);
        if (!isNaN(currWeight) && !isNaN(prevWeight) && currWeight > prevWeight) {
          increaseIcon = '<i class="bx bx-up-arrow-alt weight-increase-icon"></i>';
        }
      }

      html += `
        <div class="variant-entry ${fadeClass}">
          <span class="variant-entry-weight">${weight} ${unit} x ${reps}${increaseIcon}</span>
          <span class="variant-entry-date">&middot; ${date}</span>
        </div>
      `;
    }
    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

/* ============================================
   INTERACTIONS
   ============================================ */

/**
 * Toggle exercise group expansion
 */
function toggleExerciseGroup(baseName) {
  const state = window.ffn.workoutHistory;
  if (state.expandedExerciseGroups.has(baseName)) {
    state.expandedExerciseGroups.delete(baseName);
  } else {
    state.expandedExerciseGroups.add(baseName);
  }

  // Toggle visibility directly for performance
  const groupId = `exgrp-${baseName.replace(/[^a-zA-Z0-9]/g, '-')}`;
  const body = document.getElementById(groupId);
  if (body) {
    body.style.display = state.expandedExerciseGroups.has(baseName) ? '' : 'none';
  }

  // Toggle chevron
  const header = body?.previousElementSibling;
  const chevron = header?.querySelector('.exercise-group-chevron');
  if (chevron) {
    chevron.classList.toggle('rotated', state.expandedExerciseGroups.has(baseName));
  }
}

/**
 * Handle search input
 */
function handleExerciseTabSearch(value) {
  window.ffn.workoutHistory.exerciseTabSearch = value;
  renderExerciseTab();
}

/**
 * Cycle sort mode
 */
function cycleExerciseTabSort() {
  const sortOrder = ['frequency', 'name', 'recent'];
  const current = window.ffn.workoutHistory.exerciseTabSort;
  const idx = sortOrder.indexOf(current);
  window.ffn.workoutHistory.exerciseTabSort = sortOrder[(idx + 1) % sortOrder.length];
  renderExerciseTab();
}

/* ============================================
   SORTING
   ============================================ */

function sortExerciseGroups(groups, mode) {
  const sorted = [...groups];
  switch (mode) {
    case 'frequency':
      sorted.sort((a, b) => b.totalSessions - a.totalSessions);
      break;
    case 'name':
      sorted.sort((a, b) => a.baseName.localeCompare(b.baseName));
      break;
    case 'recent':
      sorted.sort((a, b) => {
        const dateA = a.lastDate ? new Date(a.lastDate) : new Date(0);
        const dateB = b.lastDate ? new Date(b.lastDate) : new Date(0);
        return dateB - dateA;
      });
      break;
  }
  return sorted;
}

/* ============================================
   TAB VISIBILITY (MOBILE)
   ============================================ */

/**
 * Initialize tab visibility toggling for mobile
 * Hides session list when Exercises tab is active
 */
function initExerciseTabVisibility() {
  const tabsEl = document.getElementById('historyTabs');
  if (!tabsEl) return;

  tabsEl.addEventListener('shown.bs.tab', function(event) {
    const isExerciseTab = event.target.id === 'exercises-tab';
    const sessionContainer = document.getElementById('sessionHistoryContainer');
    const dateFilter = document.getElementById('dateFilterIndicator');

    if (sessionContainer) {
      sessionContainer.style.display = isExerciseTab ? 'none' : '';
    }
    if (dateFilter && isExerciseTab) {
      dateFilter.style.display = 'none';
    }
  });
}

/* ============================================
   PR TRACKING TOGGLE
   ============================================ */

/**
 * Toggle PR tracking for an exercise from the Exercises tab
 * If enabling: shows an input for initial PR value (pre-filled with best weight)
 * If disabling: confirms and removes
 */
async function toggleExercisePRTracking(baseName, bestWeight, bestUnit, bestWeightDate) {
  const state = window.ffn.workoutHistory;
  const exNameLower = baseName.toLowerCase();
  const isPR = state.prExerciseNames.has(exNameLower);

  if (!window.dataManager) return;

  try {
    const token = await window.dataManager.getAuthToken();

    if (isPR) {
      // Remove PR tracking
      let prId = null;
      for (const [id, pr] of state.personalRecords) {
        if (pr.exercise_name.toLowerCase() === exNameLower) {
          prId = id;
          break;
        }
      }
      if (!prId) return;

      const confirmed = await new Promise(resolve => {
        if (window.ffnModalManager && window.ffnModalManager.confirm) {
          window.ffnModalManager.confirm(
            'Remove PR Tracking?',
            `Stop tracking PR for <strong>${baseName}</strong>?`,
            () => resolve(true),
            () => resolve(false)
          );
        } else {
          resolve(confirm(`Stop tracking PR for ${baseName}?`));
        }
      });
      if (!confirmed) return;

      const response = await fetch(`/api/v3/users/me/personal-records/${prId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        state.personalRecords.delete(prId);
        state.prExerciseNames.delete(exNameLower);
        if (window.showToast) window.showToast(`PR tracking removed for ${baseName}`, 'info');
        renderExerciseTab();
        if (window.renderPRSection) window.renderPRSection();
      }
    } else {
      // Enable PR tracking — prompt for initial value
      const userValue = await _promptPRValue(baseName, bestWeight || '', bestUnit);
      if (userValue === null) return; // Cancelled

      const value = String(userValue.trim() || bestWeight || 0);
      const unit = String(bestUnit || 'lbs');
      const payload = { pr_type: 'weight', exercise_name: baseName, value, value_unit: unit };
      if (bestWeightDate) payload.session_date = bestWeightDate;
      console.log('[PR] Creating PR:', payload);

      const response = await fetch('/api/v3/users/me/personal-records', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result = await response.json();
        const prId = result.pr_id;
        if (!prId) {
          console.error('[PR] Response missing pr_id:', result);
          if (window.showToast) window.showToast('PR saved but ID missing', 'warning');
          return;
        }

        state.personalRecords.set(prId, {
          id: prId,
          pr_type: 'weight',
          exercise_name: baseName,
          value: value,
          value_unit: unit,
          marked_at: new Date().toISOString(),
          is_manual: true
        });
        state.prExerciseNames.add(exNameLower);

        if (window.showToast) window.showToast(`PR tracking enabled for ${baseName}!`, 'success');
        renderExerciseTab();
        if (window.renderPRSection) window.renderPRSection();
      } else {
        const errBody = await response.text().catch(() => '');
        console.error('[PR] Create failed:', response.status, errBody);
        if (window.showToast) window.showToast('Failed to save PR', 'danger');
      }
    }
  } catch (error) {
    console.error('Error toggling PR tracking:', error);
    if (window.showToast) window.showToast('Failed to update PR', 'danger');
  }
}

/**
 * Show a prompt for the user to enter/confirm a PR value
 * Returns the entered value string, or null if cancelled
 */
function _promptPRValue(exerciseName, prefill, unit) {
  return new Promise(resolve => {
    window.ffnModalManager.prompt(
      `Set PR for ${exerciseName}`,
      `Enter your personal record (${unit}):`,
      prefill,
      (val) => resolve(val),
      () => resolve(null),
      { placeholder: `e.g. ${prefill || '225'}` }
    );
  });
}

/* ============================================
   EXPORTS
   ============================================ */

window.renderExerciseTab = renderExerciseTab;
window.toggleExerciseGroup = toggleExerciseGroup;
window.handleExerciseTabSearch = handleExerciseTabSearch;
window.cycleExerciseTabSort = cycleExerciseTabSort;
window.initExerciseTabVisibility = initExerciseTabVisibility;
window.toggleExercisePRTracking = toggleExercisePRTracking;

console.log('Workout History Exercise Tab module loaded (v2.0.0)');
