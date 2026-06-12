/**
 * StudioLogCard — Workout Studio Log-view card
 *
 * Renders the SAME .workout-card markup workout-mode.html uses so the
 * two pages share one source of truth for the visual (big WEIGHT
 * numeral, PROTOCOL label, weight history tree, direction chips, the
 * full-width Mark Done button). Loaded only on the Log view; Plan view
 * keeps its template-editor StudioExerciseCard.
 *
 * Data inputs are pulled from the studio's local maps (organizeState /
 * logState / exerciseHistory) rather than workout-mode's sessionService
 * getters, but the produced HTML is essentially identical.
 *
 * Behavior:
 *   - Click the header → expand/collapse. Accordion logic lives in the
 *     controller (one expanded card at a time).
 *   - Click any field display → unified edit mode (the same field
 *     controllers WeightFieldController + RepsSetsFieldController the
 *     studio already wires for plan cards mount here too).
 *   - Mark Done button at the bottom of the expanded body → flips
 *     isDone. Auto-collapses after a short pause so the user gets the
 *     "Completed" confirmation, then can move on.
 *
 * Emits via callbacks:
 *   onToggleExpand(instanceId, willExpand)
 *   onChange(instanceId, partial)              — field edits
 *   onMarkDone(instanceId, done)               — Mark Done / Completed
 *   onMenuAction(instanceId, action)           — skip / skip-replace / unskip
 *   onDirectionChange(instanceId, dir)         — pill chips
 *   onNotesChange(instanceId, notes)           — note textarea
 *   onInfo(instanceId)                         — info icon
 */
(function () {
  'use strict';

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatProtocol(sets, reps) {
    if (sets && reps) return `${sets}×${reps}`;
    return sets || reps || '3×10';
  }

  /** "today" / "yesterday" / "N days ago" up to 10; calendar date past. */
  function formatHistoryDate(dateStr) {
    if (!dateStr) return '';
    let diffDays;
    try { diffDays = window.getCalendarDaysAgo
        ? window.getCalendarDaysAgo(dateStr)
        : Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
    } catch (_) { diffDays = null; }
    if (!Number.isFinite(diffDays)) return '';
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays <= 10) return `${diffDays} days ago`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  class StudioLogCard {
    constructor({
      instanceId,
      name,
      state,
      callbacks,
      groupType,
      activityIcon,
      // Log-mode props
      isDone = false,
      isSkipped = false,
      skipReason = '',
      replacedByName = '',
      lastSession = null,        // { weight, unit, daysAgo, sessionDate, lastDirection? }
      recentSessions = [],       // [{ weight, weight_unit, date }, ...] from history
      weightDirection = null,    // 'up' | 'down' | 'same' | null
      lastDirection = null,      // direction the user set last session (reminder)
      exerciseNotes = '',
      // Index hint for the "first not-yet-done" auto-expand decision.
      expanded = false,
    } = {}) {
      this.instanceId = instanceId;
      this.name = name || 'Exercise';
      this.state = Object.assign({
        sets: '3', reps: '8-12', rest: '60s',
        weight: '', weightUnit: 'lbs', protocol: '',
      }, state || {});
      if (!this.state.protocol) {
        this.state.protocol = formatProtocol(this.state.sets, this.state.reps);
      }
      this.callbacks = callbacks || {};
      this.groupType = String(groupType || 'standard').toLowerCase();
      this.activityIcon = activityIcon ? String(activityIcon) : '';
      this.isDone = !!isDone;
      this.isSkipped = !!isSkipped;
      this.skipReason = skipReason || '';
      this.replacedByName = replacedByName ? String(replacedByName) : '';
      this.lastSession = (lastSession && lastSession.weight) ? lastSession : null;
      this.recentSessions = Array.isArray(recentSessions) ? recentSessions : [];
      this.weightDirection = ['up', 'down', 'same'].includes(weightDirection)
        ? weightDirection : null;
      this.lastDirection = ['up', 'down', 'same'].includes(lastDirection)
        ? lastDirection : null;
      this.exerciseNotes = exerciseNotes ? String(exerciseNotes) : '';
      this._expanded = !!expanded;
      this._notesDebounce = null;
      this.el = null;
    }

    /** Toggle / set expansion. Controller drives the accordion (one open). */
    setExpanded(next) {
      const want = !!next;
      this._expanded = want;
      if (this.el) this.el.classList.toggle('expanded', want);
    }
    isExpanded() { return this._expanded; }

    /** Mark Done state change — flip the visual + the data prop. */
    setDone(next) {
      const want = !!next;
      this.isDone = want;
      if (!this.el) return;
      this.el.classList.toggle('logged', want);
      const btn = this.el.querySelector('.workout-primary-action');
      if (btn) {
        btn.classList.toggle('completed', want);
        btn.classList.toggle('save', !want);
        btn.innerHTML = want
          ? '<i class="bx bx-check"></i> Completed'
          : 'Mark Done';
      }
    }

    /** Skipped flag flip — no full re-render needed for the visual treatment. */
    setSkipped(next, reason = '') {
      this.isSkipped = !!next;
      this.skipReason = reason || '';
      if (!this.el) return;
      this.el.classList.toggle('skipped', this.isSkipped);
    }

    render() {
      const tpl = document.createElement('div');
      tpl.innerHTML = this._templateHtml();
      this.el = tpl.firstElementChild;
      if (this._expanded) this.el.classList.add('expanded');
      this._bindEvents();
      return this.el;
    }

    destroy() {
      if (this.el && this.el.parentElement) {
        this.el.parentElement.removeChild(this.el);
      }
      this.el = null;
    }

    // ---------------- private ----------------

    _templateHtml() {
      const safeName = escapeHtml(this.name);
      const safeId = escapeHtml(this.instanceId);
      const sets = this.state.sets || '3';
      const reps = this.state.reps || '8-12';
      const rest = this.state.rest || '60s';
      const weight = this.state.weight || '';
      const unit = this.state.weightUnit || 'lbs';

      // State classes — mirror workout-mode's .workout-card.logged / .skipped.
      const stateClasses = [];
      if (this.isDone) stateClasses.push('logged');
      if (this.isSkipped) stateClasses.push('skipped');

      const currentDirection = this.weightDirection;
      const lastWeight = this.lastSession ? this.lastSession.weight : '';
      const lastWeightUnit = this.lastSession ? (this.lastSession.unit || 'lbs') : 'lbs';
      const lastSessionDate = this.lastSession ? this.lastSession.sessionDate : null;
      const notes = this.exerciseNotes || '';

      return `
        <div class="workout-card studio-log-card ${stateClasses.join(' ')}"
             data-instance-id="${safeId}"
             data-exercise-name="${safeName}">
          <!-- Collapsed Header -->
          <div class="workout-card-header" data-action="toggle-expand">
            <div class="workout-exercise-name-row">
              <div class="workout-exercise-name">
                ${notes ? '<i class="bx bx-note exercise-note-indicator" title="Has notes"></i>' : ''}
                ${safeName}
              </div>
              <div class="workout-header-actions">
                <button class="workout-edit-btn${this.isDone ? ' edit-locked' : ''}"
                        data-action="info" type="button"
                        title="Details"
                        aria-label="Details">
                  <i class="bx bx-info-circle"></i>
                </button>
                ${this._buildMenuButton()}
                <i class="bx bx-chevron-down workout-chevron"></i>
              </div>
            </div>
            <div class="workout-exercise-info">
              <div class="workout-exercise-meta">${escapeHtml(sets)} × ${escapeHtml(reps)} • ${escapeHtml(rest)}</div>
              <div class="workout-state-row">
                ${weight ? `<div class="workout-state-item highlight">Today: ${escapeHtml(weight)} ${escapeHtml(unit)}</div>` : ''}
                ${lastWeight ? `<div class="workout-state-item"><span class="tree-branch">└─</span> Last: ${escapeHtml(lastWeight)} ${escapeHtml(lastWeightUnit)}</div>` : ''}
                ${currentDirection === 'up' ? '<span class="workout-state-item next-up"><i class="bx bx-up-arrow-alt"></i> Increase</span>' : ''}
                ${currentDirection === 'down' ? '<span class="workout-state-item next-down"><i class="bx bx-down-arrow-alt"></i> Decrease</span>' : ''}
                ${currentDirection === 'same' ? '<span class="workout-state-item"><i class="bx bx-minus"></i> No Change</span>' : ''}
              </div>
              ${(this.isSkipped && this.replacedByName) ? `
                <div class="workout-note-preview">Replaced with ${escapeHtml(this.replacedByName)}</div>
              ` : ''}
              ${notes ? `<div class="workout-note-preview">${escapeHtml(notes)}</div>` : ''}
            </div>
          </div>

          <!-- Expanded Body -->
          <div class="workout-card-body" data-action="stop-propagation">
            ${this.isSkipped ? `
              <div class="alert alert-warning">
                <i class="bx bx-info-circle me-2"></i>
                <strong>Exercise Skipped</strong>
                ${this.skipReason ? `<p class="mb-0 mt-1 small">${escapeHtml(this.skipReason)}</p>` : ''}
              </div>
            ` : ''}

            ${(this.lastDirection && !this.isSkipped) ? `
              <div class="alert alert-${this.lastDirection === 'up' ? 'success' : 'warning'} d-flex align-items-center mb-3">
                <i class="bx bx-chevron-${this.lastDirection} me-2" style="font-size: 1.5rem;"></i>
                <div><strong>From last session:</strong> ${this.lastDirection === 'up' ? 'Increase' : this.lastDirection === 'down' ? 'Decrease' : 'Keep same'} weight</div>
              </div>
            ` : ''}

            ${!this.isSkipped ? `
              <!-- Weight + Protocol -->
              <div class="workout-fields-row">
                <div class="workout-section">
                  ${this._templateWeightField(weight, unit)}
                </div>
                <div class="workout-section">
                  ${this._templateRepsSetsField(sets, reps)}
                </div>
              </div>

              <!-- Notes -->
              <div class="workout-section workout-notes-timer-section workout-unified-notes">
                <div class="workout-notes-content" ${notes ? '' : 'style="display: none;"'}>
                  <textarea class="workout-notes-input"
                            placeholder="Add a note about this exercise..."
                            rows="3"
                            data-exercise-name="${safeName}">${escapeHtml(notes)}</textarea>
                </div>
                <div class="workout-notes-timer-row">
                  <div class="workout-notes-col w-100">
                    <button class="workout-note-toggle-btn" data-action="toggle-notes" type="button">
                      <i class="bx bx-note"></i> ${notes ? 'Edit Note' : 'Add Note'}
                    </button>
                  </div>
                </div>
              </div>

              <!-- Weight History -->
              ${lastWeight && lastSessionDate ? `
                <div class="workout-section">
                  <div class="workout-section-label"><i class="bx bx-history"></i>Weight History</div>
                  ${this._templateWeightHistory(lastWeight, lastWeightUnit, lastSessionDate)}
                </div>
              ` : ''}

              <!-- Direction Chips -->
              <div class="workout-section workout-next-section">
                <div class="workout-section-label workout-next-label">NEXT SESSION (OPTIONAL)</div>
                <div class="workout-next-chips">
                  <button class="workout-chip ${currentDirection === 'down' ? 'active' : ''}"
                          data-direction="down" type="button">Decrease</button>
                  <button class="workout-chip ${currentDirection === 'same' ? 'active' : ''}"
                          data-direction="same" type="button">Same</button>
                  <button class="workout-chip ${currentDirection === 'up' ? 'active' : ''}"
                          data-direction="up" type="button">Increase</button>
                </div>
              </div>

              <!-- Mark Done -->
              <div class="workout-actions">
                <button class="workout-primary-action ${this.isDone ? 'completed' : 'save'}"
                        data-action="mark-done" type="button">
                  ${this.isDone ? '<i class="bx bx-check"></i> Completed' : 'Mark Done'}
                </button>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }

    _buildMenuButton() {
      // Skip / Skip & replace / Unskip surfaces here. Keeps the same
      // data-action sink the StudioExerciseCard menu uses so the
      // controller's _onCardMenuAction handles both card variants.
      const items = this.isSkipped ? `
        <button class="workout-menu-item" role="menuitem" data-action="unskip" type="button">
          <i class="bx bx-undo"></i> Unskip exercise
        </button>` : `
        <button class="workout-menu-item" role="menuitem" data-action="skip" type="button">
          <i class="bx bx-skip-next"></i> Skip exercise
        </button>
        <button class="workout-menu-item" role="menuitem" data-action="skip-replace" type="button">
          <i class="bx bx-transfer-alt"></i> Skip &amp; replace
        </button>`;
      // workout-mode's _menu.css keys visibility on the .show class
      // (display: none in base, display: block on .show). Match that so
      // we inherit the same hover/animation/positioning rules.
      return `
        <div class="workout-menu-wrap">
          <button class="workout-more-btn" data-action="menu" type="button" aria-haspopup="true" aria-expanded="false" title="More options">
            <i class="bx bx-dots-vertical"></i>
          </button>
          <div class="workout-menu" role="menu">${items}</div>
        </div>`;
    }

    _templateWeightField(weight, unit) {
      const displayWeight = weight || '—';
      const displayUnit = unit !== 'other' ? unit : '';
      const currentUnit = unit || 'lbs';
      const isDIY = currentUnit === 'diy';
      return `
        <div class="workout-weight-field"
             data-weight="${escapeHtml(weight || 0)}"
             data-unit="${escapeHtml(currentUnit)}"
             data-weight-mode="${isDIY ? 'text' : 'numeric'}"
             data-exercise-name="${escapeHtml(this.name)}">
          <div class="weight-display click-to-edit">
            <div class="workout-section-label inline"><i class="bx bx-dumbbell"></i>Weight</div>
            <div class="weight-value-group">
              <span class="weight-value">${escapeHtml(displayWeight)}</span>
              ${(displayUnit && currentUnit !== 'diy') ? `<span class="weight-unit">${escapeHtml(displayUnit)}</span>` : ''}
            </div>
          </div>
          <div class="weight-editor ${isDIY ? 'diy-active' : ''}" style="display: none;">
            <div class="workout-section-label inline"><i class="bx bx-dumbbell"></i>Weight</div>
            <div class="weight-input-row numeric-mode">
              <input type="number" class="weight-input" value="${isDIY ? '' : escapeHtml(weight || '')}" step="5" min="0" max="9999" inputmode="decimal" placeholder="0" />
            </div>
            <div class="weight-input-row diy-mode">
              <input type="text" class="weight-text-input" value="${isDIY ? escapeHtml(weight) : ''}" placeholder="e.g., body weight + 10lbs" />
            </div>
            <div class="weight-unit-selector">
              <button class="unit-btn ${currentUnit === 'lbs' ? 'active' : ''}" data-unit="lbs" type="button">lbs</button>
              <button class="unit-btn ${currentUnit === 'kg' ? 'active' : ''}" data-unit="kg" type="button">kg</button>
              <button class="unit-btn ${currentUnit === 'diy' ? 'active' : ''}" data-unit="diy" type="button">DIY</button>
            </div>
          </div>
        </div>`;
    }

    _templateRepsSetsField(sets, reps) {
      const displayValue = (sets && reps) ? `${sets}×${reps}` : (sets || reps || '3×10');
      return `
        <div class="workout-repssets-field"
             data-protocol="${escapeHtml(displayValue)}"
             data-exercise-name="${escapeHtml(this.name)}">
          <div class="repssets-display click-to-edit">
            <div class="workout-section-label inline"><i class="bx bx-list-ul"></i>Protocol</div>
            <span class="repssets-value-text">${escapeHtml(displayValue)}</span>
          </div>
          <div class="repssets-editor" style="display: none;">
            <div class="workout-section-label inline"><i class="bx bx-list-ul"></i>Protocol</div>
            <input type="text" class="repssets-input repssets-text-input"
                   value="${escapeHtml(displayValue)}"
                   placeholder="e.g., 3x10, AMRAP" />
            <div class="workout-unified-actions inline">
              <button class="btn btn-sm btn-success unified-save-btn" type="button" aria-label="Save changes" title="Save"><i class="bx bx-check"></i></button>
              <button class="btn btn-sm btn-outline-secondary unified-cancel-btn" type="button" aria-label="Cancel changes" title="Cancel"><i class="bx bx-x"></i></button>
            </div>
          </div>
        </div>`;
    }

    /** Last + up to 3 previous sessions in a tree — same shape workout-mode shows. */
    _templateWeightHistory(lastWeight, lastWeightUnit, lastSessionDate) {
      const sessions = this.recentSessions.slice(1, 4); // skip the primary
      return `
        <div class="workout-history">
          <div class="workout-history-primary">
            <span class="history-label">Last:</span>
            <span class="history-weight">${escapeHtml(lastWeight)}${lastWeightUnit !== 'other' ? ` ${escapeHtml(lastWeightUnit)}` : ''}</span>
            <span class="history-date">${escapeHtml(formatHistoryDate(lastSessionDate))}</span>
          </div>
          ${sessions.length > 0 ? `
            <div class="workout-history-tree">
              ${sessions.map((s, i) => {
                const isLast = i === sessions.length - 1;
                const connector = isLast ? '└─' : '├─';
                const w = s.weight || '—';
                const u = s.weight_unit || 'lbs';
                return `
                  <div class="workout-history-tree-item">
                    <span class="tree-branch">${connector}</span>
                    <span class="history-weight">${escapeHtml(w)}${u !== 'other' ? ` ${escapeHtml(u)}` : ''}</span>
                    <span>${escapeHtml(formatHistoryDate(s.date))}</span>
                  </div>`;
              }).join('')}
            </div>
          ` : ''}
        </div>`;
    }

    _bindEvents() {
      if (!this.el) return;

      // Header tap → expand/collapse, unless the user hit an action.
      const header = this.el.querySelector('.workout-card-header');
      if (header) {
        header.addEventListener('click', (e) => {
          if (e.target.closest('[data-action="info"], [data-action="menu"], .workout-menu')) return;
          this._fire('onToggleExpand', !this._expanded);
        });
      }
      // Body taps should NOT toggle expand.
      const body = this.el.querySelector('.workout-card-body');
      if (body) body.addEventListener('click', (e) => e.stopPropagation());

      // Info icon
      const infoBtn = this.el.querySelector('[data-action="info"]');
      if (infoBtn) infoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._fire('onInfo');
      });

      // 3-dot menu open/close + items. Use the .show class so the
      // workout-mode _menu.css rules (display: none/block by class)
      // drive visibility — matches the menu's animation + positioning.
      const menuBtn = this.el.querySelector('[data-action="menu"]');
      const menu = this.el.querySelector('.workout-menu');
      if (menuBtn && menu) {
        menuBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const open = !menu.classList.contains('show');
          menu.classList.toggle('show', open);
          menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        menu.addEventListener('click', (e) => {
          e.stopPropagation();
          const item = e.target.closest('.workout-menu-item');
          if (!item) return;
          menu.classList.remove('show');
          menuBtn.setAttribute('aria-expanded', 'false');
          this._fire('onMenuAction', item.dataset.action);
        });
        this._handleDocClickForMenu = (e) => {
          if (menu.classList.contains('show') && !this.el.contains(e.target)) {
            menu.classList.remove('show');
            menuBtn.setAttribute('aria-expanded', 'false');
          }
        };
        document.addEventListener('click', this._handleDocClickForMenu);
      }

      // Direction chips
      const chips = this.el.querySelectorAll('.workout-next-chips .workout-chip');
      chips.forEach((chip) => {
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          const dir = chip.dataset.direction;
          const next = this.weightDirection === dir ? null : dir;
          this.weightDirection = next;
          chips.forEach((c) => c.classList.toggle('active', c.dataset.direction === next));
          this._fire('onDirectionChange', next);
        });
      });

      // Notes toggle + textarea
      const notesToggle = this.el.querySelector('[data-action="toggle-notes"]');
      const notesContent = this.el.querySelector('.workout-notes-content');
      const notesInput = this.el.querySelector('.workout-notes-input');
      if (notesToggle && notesContent && notesInput) {
        notesToggle.addEventListener('click', (e) => {
          e.stopPropagation();
          const open = notesContent.style.display === 'none' || !notesContent.style.display;
          notesContent.style.display = open ? '' : 'none';
          if (open) notesInput.focus();
        });
        const commit = () => {
          this.exerciseNotes = notesInput.value;
          notesToggle.innerHTML = `<i class="bx bx-note"></i> ${notesInput.value.trim() ? 'Edit Note' : 'Add Note'}`;
          this._fire('onNotesChange', notesInput.value);
        };
        notesInput.addEventListener('input', () => {
          if (this._notesDebounce) clearTimeout(this._notesDebounce);
          this._notesDebounce = setTimeout(commit, 800);
        });
        notesInput.addEventListener('blur', () => {
          if (this._notesDebounce) clearTimeout(this._notesDebounce);
          commit();
        });
        notesInput.addEventListener('click', (e) => e.stopPropagation());
      }

      // Mark Done button
      const doneBtn = this.el.querySelector('[data-action="mark-done"]');
      if (doneBtn) {
        doneBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const next = !this.isDone;
          this.setDone(next);
          this._fire('onMarkDone', next);
        });
      }

      // Field edits — the studio's WeightFieldController + RepsSetsFieldController
      // discover their target nodes via class selectors. Mounted by the
      // controller in _mountLogCard after render() returns.
      // For now, expose a hook the controller calls to wire those up:
      // (mounted externally; this card just renders the right DOM.)
    }

    _fire(name, ...args) {
      const fn = this.callbacks && this.callbacks[name];
      if (typeof fn !== 'function') return;
      try { fn(this.instanceId, ...args); }
      catch (err) { console.error(`[StudioLogCard] ${name} callback threw:`, err); }
    }
  }

  window.StudioLogCard = StudioLogCard;
})();
