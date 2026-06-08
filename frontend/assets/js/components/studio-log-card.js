/**
 * StudioLogCard — Workout Studio Page 2 LOG variant
 *
 * Sibling of `studio-exercise-card.js`. Renders one card per tray instance
 * in Log mode. Body:
 *   - Plan line (read-only, gray): the protocol/weight/rest the template
 *     calls for, so the user sees what they were aiming at.
 *   - Actuals line (editable): one freeform "What you did" text input
 *     pre-filled from the plan, plus a separate weight input. User adjusts
 *     either if reality differed from the plan.
 *   - Done button: marks the exercise complete; card collapses to a
 *     single-line "did this" summary with a green checkmark. Tap again to
 *     re-open + edit.
 *   - Notes (optional): textarea that auto-grows, persisted with the rest.
 *
 * Cardio cards use the same shell but the plan line + actuals are derived
 * from the cardio_config (activity + duration). Notes still apply.
 *
 * This is a field log, not a notebook and not a gym app. We capture the
 * five fields that matter (actual sets, actual reps, actual weight, notes,
 * done) and skip everything else (rest timers, plate calc, weight history,
 * direction chips, set-by-set rows). Backend writes are batched until the
 * user taps Save Log on the FAB — no per-keystroke persistence.
 *
 * Public events (via callbacks):
 *   - onLogChange(instanceId, partialLogState)
 *       partialLogState may contain: actualSets, actualReps, actualWeight,
 *       actualNotes, isDone, doneAt
 *   - onMarkDone(instanceId)
 *   - onMarkUndone(instanceId)
 *   - onEditCardio(instanceId)  — cardio cards still open the offcanvas
 *     for activity/duration changes (no inline cardio edit in log mode)
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

  function planLineForStrength(planState) {
    const protocol = planState.protocol
      || (planState.sets && planState.reps ? `${planState.sets}×${planState.reps}` : '')
      || '—';
    const rest = planState.rest || '—';
    const weight = planState.weight ? `${planState.weight} ${planState.weightUnit || 'lbs'}` : '—';
    return `${protocol} · ${rest} · ${weight}`;
  }

  function planLineForCardio(cardioConfig) {
    const cfg = cardioConfig || {};
    const parts = [];
    if (cfg.duration_minutes) parts.push(`${cfg.duration_minutes} min`);
    if (cfg.distance) parts.push(`${cfg.distance} ${cfg.distance_unit || 'mi'}`);
    if (cfg.target_pace) parts.push(`${cfg.target_pace} pace`);
    return parts.length > 0 ? parts.join(' · ') : 'No plan — tap to log';
  }

  class StudioLogCard {
    constructor({
      instanceId,
      name,
      planState,
      logState,
      groupType,
      activityIcon,
      cardioConfig,
      callbacks,
    } = {}) {
      this.instanceId = instanceId;
      this.name = name || 'Exercise';
      this.planState = Object.assign({}, planState || {});
      // Pre-fill actuals from the plan so the common case (did it as
      // planned) needs zero typing. User overwrites whatever differed.
      this.logState = Object.assign({
        actualSets: '',
        actualReps: '',
        actualWeight: this.planState.weight || '',
        actualNotes: '',
        isDone: false,
        doneAt: null,
      }, logState || {});
      this.groupType = String(groupType || 'standard').toLowerCase();
      this.activityIcon = activityIcon ? String(activityIcon) : '';
      this.cardioConfig = cardioConfig ? Object.assign({}, cardioConfig) : {};
      this.callbacks = callbacks || {};
      this.el = null;
    }

    render() {
      const tpl = document.createElement('div');
      tpl.innerHTML = this._templateHtml();
      this.el = tpl.firstElementChild;
      this._bindEvents();
      this._autosizeNotes();
      this._applyDoneState();
      return this.el;
    }

    setLogState(partial) {
      Object.assign(this.logState, partial || {});
      this._refreshSummary();
    }

    destroy() {
      if (this.el && this.el.parentElement) this.el.parentElement.removeChild(this.el);
      this.el = null;
    }

    // ---------------- private ----------------

    _templateHtml() {
      const safeId = escapeHtml(this.instanceId);
      const safeName = escapeHtml(this.name);
      const isCardio = this.groupType === 'cardio';
      const typeAttr = ` data-card-type="${this.groupType === 'standard' ? 'standard' : escapeHtml(this.groupType)}"`;
      const iconHtml = (isCardio && this.activityIcon)
        ? `<i class="bx ${escapeHtml(this.activityIcon)} studio-card-type-icon" aria-hidden="true"></i> `
        : '';
      const planLine = isCardio
        ? planLineForCardio(this.cardioConfig)
        : planLineForStrength(this.planState);

      // Actuals — cardio uses a single freeform field since duration/distance/
      // pace are interrelated and the user can type "20min, 2mi" together.
      const actualsHtml = isCardio
        ? this._cardioActualsHtml()
        : this._strengthActualsHtml();

      return `
        <div class="studio-card studio-log-card" role="listitem" data-instance-id="${safeId}"${typeAttr}>
          <div class="studio-card-header">
            <div class="studio-card-name-wrap">
              <div class="studio-card-name">${iconHtml}${safeName}</div>
            </div>
            <button class="studio-log-done-btn" data-action="toggle-done" type="button"
                    aria-label="Mark exercise done" title="Mark done">
              <i class="bx bx-check"></i>
              <span class="studio-log-done-label">Done</span>
            </button>
          </div>

          <div class="studio-log-plan-line" aria-label="Planned">
            <span class="studio-log-plan-label">Plan</span>
            <span class="studio-log-plan-text">${escapeHtml(planLine)}</span>
          </div>

          ${actualsHtml}

          <div class="studio-log-summary" hidden>
            <i class="bx bx-check-circle"></i>
            <span class="studio-log-summary-text"></span>
          </div>

          <label class="studio-log-notes-row" aria-label="Notes (optional)">
            <textarea class="studio-log-notes" maxlength="500" rows="1"
                      placeholder="Notes (optional)…"></textarea>
          </label>
        </div>
      `;
    }

    _strengthActualsHtml() {
      const sets = escapeHtml(this.logState.actualSets || '');
      const reps = escapeHtml(this.logState.actualReps || '');
      const weight = escapeHtml(this.logState.actualWeight || '');
      const placeholderSets = escapeHtml(this.planState.sets || '3');
      const placeholderReps = escapeHtml(this.planState.reps || '8-12');
      const placeholderWeight = escapeHtml(this.planState.weight || '0');
      return `
        <div class="studio-log-actuals" data-actuals="strength">
          <div class="studio-log-field studio-log-field-sets">
            <label class="studio-log-field-label">Sets</label>
            <input type="text" class="studio-log-input" data-field="actualSets"
                   value="${sets}" placeholder="${placeholderSets}"
                   inputmode="numeric" autocomplete="off" />
          </div>
          <div class="studio-log-field studio-log-field-reps">
            <label class="studio-log-field-label">Reps</label>
            <input type="text" class="studio-log-input" data-field="actualReps"
                   value="${reps}" placeholder="${placeholderReps}"
                   inputmode="text" autocomplete="off" />
          </div>
          <div class="studio-log-field studio-log-field-weight">
            <label class="studio-log-field-label">Weight</label>
            <input type="text" class="studio-log-input" data-field="actualWeight"
                   value="${weight}" placeholder="${placeholderWeight}"
                   inputmode="text" autocomplete="off" />
          </div>
        </div>
      `;
    }

    _cardioActualsHtml() {
      const actual = escapeHtml(this.logState.actualReps || '');
      const placeholder = planLineForCardio(this.cardioConfig);
      return `
        <div class="studio-log-actuals" data-actuals="cardio">
          <div class="studio-log-field studio-log-field-full">
            <label class="studio-log-field-label">What you did</label>
            <input type="text" class="studio-log-input" data-field="actualReps"
                   value="${actual}" placeholder="${escapeHtml(placeholder)}"
                   inputmode="text" autocomplete="off" />
          </div>
        </div>
      `;
    }

    _bindEvents() {
      if (!this.el) return;

      // Field inputs — debounce-free, just capture on change/blur. Reads
      // batched into save payload when the user taps Save Log.
      this.el.querySelectorAll('input[data-field]').forEach((input) => {
        input.addEventListener('input', (e) => {
          const field = e.target.dataset.field;
          const value = String(e.target.value || '').trim();
          this.logState[field] = value;
          this._fire('onLogChange', { [field]: value });
        });
      });

      // Notes textarea — same pattern; debounce by autosize handler.
      const notes = this.el.querySelector('.studio-log-notes');
      if (notes) {
        notes.value = this.logState.actualNotes || '';
        notes.addEventListener('input', (e) => {
          this.logState.actualNotes = String(e.target.value || '').slice(0, 500);
          this._autosizeNotes();
          this._fire('onLogChange', { actualNotes: this.logState.actualNotes });
        });
      }

      // Done toggle — tap to mark complete; tap again on the collapsed
      // summary to re-open + edit.
      const doneBtn = this.el.querySelector('[data-action="toggle-done"]');
      if (doneBtn) {
        doneBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._toggleDone();
        });
      }
      const summary = this.el.querySelector('.studio-log-summary');
      if (summary) {
        summary.addEventListener('click', (e) => {
          e.stopPropagation();
          this._toggleDone();
        });
      }
    }

    _toggleDone() {
      const next = !this.logState.isDone;
      this.logState.isDone = next;
      this.logState.doneAt = next ? Date.now() : null;
      this._applyDoneState();
      this._fire('onLogChange', { isDone: next, doneAt: this.logState.doneAt });
      this._fire(next ? 'onMarkDone' : 'onMarkUndone');
    }

    _applyDoneState() {
      if (!this.el) return;
      const done = !!this.logState.isDone;
      this.el.classList.toggle('is-done', done);
      const doneBtn = this.el.querySelector('[data-action="toggle-done"]');
      if (doneBtn) {
        doneBtn.setAttribute('aria-pressed', done ? 'true' : 'false');
        const label = doneBtn.querySelector('.studio-log-done-label');
        if (label) label.textContent = done ? 'Done' : 'Done';
      }
      const summary = this.el.querySelector('.studio-log-summary');
      const actuals = this.el.querySelector('.studio-log-actuals');
      const notesRow = this.el.querySelector('.studio-log-notes-row');
      const planLine = this.el.querySelector('.studio-log-plan-line');
      if (summary) summary.hidden = !done;
      if (actuals) actuals.hidden = done;
      if (notesRow) notesRow.hidden = done;
      if (planLine) planLine.hidden = done;
      this._refreshSummary();
    }

    _refreshSummary() {
      if (!this.el) return;
      const span = this.el.querySelector('.studio-log-summary-text');
      if (!span) return;
      span.textContent = this._buildSummary();
    }

    _buildSummary() {
      if (this.groupType === 'cardio') {
        const actual = this.logState.actualReps || '';
        return actual || planLineForCardio(this.cardioConfig);
      }
      const sets = this.logState.actualSets || this.planState.sets || '';
      const reps = this.logState.actualReps || this.planState.reps || '';
      const weight = this.logState.actualWeight || this.planState.weight || '';
      const unit = this.planState.weightUnit || 'lbs';
      const parts = [];
      if (sets && reps) parts.push(`${sets}×${reps}`);
      else if (sets) parts.push(`${sets} sets`);
      else if (reps) parts.push(reps);
      if (weight) parts.push(`${weight} ${unit}`);
      return parts.join(' · ') || '(no details)';
    }

    _autosizeNotes() {
      const ta = this.el && this.el.querySelector('.studio-log-notes');
      if (!ta) return;
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(ta.scrollHeight, 240)}px`;
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
