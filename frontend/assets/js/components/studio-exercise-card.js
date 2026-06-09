/**
 * StudioExerciseCard — Workout Studio Page 2 card
 *
 * Renders one card per tray instance with:
 *   - Compact header: exercise name + info button + 3-dot menu
 *   - Body with three labeled rows: Protocol (sets×reps), Weight, Rest
 *   - Tap any value in the body to inline-edit. Protocol + Weight reuse the
 *     existing battle-tested field controllers
 *     (`window.RepsSetsFieldController`, `window.WeightFieldController`)
 *     so the morphing UX, +/- steppers, unit toggle (lbs/kg/DIY), and
 *     keyboard handling are inherited. Rest is a small bespoke editor.
 *
 * Public events (emitted via the provided callbacks):
 *   - onChange(instanceId, partialState)  -> after any inline edit
 *   - onInfo(instanceId)                  -> when user taps the info icon
 *   - onMenuAction(instanceId, action)    -> 'move-up' | 'move-down' | 'duplicate' | 'delete'
 *
 * The card does NOT pass a sessionService to the field controllers — Plan
 * mode has no live session, and the controllers gracefully no-op their
 * persistence calls when sessionService is undefined. We capture the new
 * value from the `weightChanged` / `repsSetsChanged` custom events the
 * controllers dispatch.
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

  /**
   * The protocol field is treated as a single free-text value at the UI
   * layer — the user types "5x5" and that exact string is what they see
   * later. On the way out to the save payload we still split into sets +
   * reps best-effort for backend compatibility, but the display value is
   * preserved verbatim. Returns { sets, reps } where one may be empty.
   */
  function splitProtocol(raw) {
    const s = String(raw || '').trim();
    if (!s) return { sets: '', reps: '' };
    const m = s.match(/^\s*(\d+)\s*[x×]\s*(.+?)\s*$/i);
    if (m) return { sets: m[1], reps: m[2] };
    return { sets: '', reps: s };
  }

  class StudioExerciseCard {
    constructor({ instanceId, name, state, callbacks, inBlock, blockOptions, groupType, activityIcon, cardioConfig, activityId, showDoneButton, isDone } = {}) {
      this.instanceId = instanceId;
      this.name = name || 'Exercise';
      this.state = Object.assign({
        sets: '3',
        reps: '8-12',
        rest: '60s',
        weight: '',
        weightUnit: 'lbs',
        // Free-text protocol string the user typed — source of truth for
        // the protocol display. sets + reps are derived on save for
        // backend compatibility. Falls back to formatProtocol(sets, reps)
        // for legacy state that doesn't yet carry this field.
        protocol: '',
      }, state || {});
      if (!this.state.protocol) {
        this.state.protocol = formatProtocol(this.state.sets, this.state.reps);
      }
      this.callbacks = callbacks || {};
      // Visual + menu state for blocks
      // inBlock: { blockId, blockName } | null
      // blockOptions: array of { blockId, name } for "Move to block ..." targets
      this.inBlock = inBlock || null;
      this.blockOptions = Array.isArray(blockOptions) ? blockOptions : [];
      // Type-card metadata — drives the left-border accent + name-line icon,
      // borrowed from the legacy builder so cardio/note cards are visually
      // distinct from standard strength cards.
      this.groupType = String(groupType || 'standard').toLowerCase();
      this.activityIcon = activityIcon ? String(activityIcon) : '';
      // Cardio-only — the cardio_config object (activity_type, duration_minutes,
      // distance, pace, hr, calories, rpe, elevation, notes, ...). Cardio cards
      // render a read-only summary derived from this; editing happens through
      // the cardio offcanvas, not inline.
      this.cardioConfig = cardioConfig ? Object.assign({}, cardioConfig) : {};
      this.activityId = activityId ? String(activityId) : '';
      // Log-mode affordance — when true, the header sprouts a small Done
      // check button next to the info icon. The card visually morphs into
      // a 'logged' state when isDone is flipped. Plan mode never sets
      // these, so the default-usage card surface is unchanged.
      this.showDoneButton = !!showDoneButton;
      this.isDone = !!isDone;
      this.el = null;
      this._repsSetsCtl = null;
      this._handleDocClickForMenu = null;
    }

    render() {
      const tpl = document.createElement('div');
      tpl.innerHTML = this._templateHtml();
      this.el = tpl.firstElementChild;
      this._bindEvents();
      return this.el;
    }

    /** Re-render the header preview and field display values from current state */
    refresh() {
      if (!this.el) return;
      const nameEl = this.el.querySelector('.studio-card-name');
      if (nameEl) {
        // Preserve the type icon if one was rendered — clearing textContent
        // would wipe it. Rebuild the inner HTML to match the template.
        if (this.groupType === 'cardio' && this.activityIcon) {
          nameEl.innerHTML = `<i class="bx ${escapeHtml(this.activityIcon)} studio-card-type-icon" aria-hidden="true"></i> ${escapeHtml(this.name)}`;
        } else {
          nameEl.textContent = this.name;
        }
      }
      if (this.groupType === 'cardio') {
        this._refreshCardioSummary();
      } else {
        this._refreshProtocolDisplay();
        this._refreshWeightDisplay();
        this._refreshRestDisplay();
      }
    }

    /**
     * Replace the cardio_config (e.g. after the offcanvas saves) and
     * refresh the summary line + activity icon + name without rebuilding
     * the whole card.
     */
    setCardioConfig(newConfig, opts = {}) {
      this.cardioConfig = newConfig ? Object.assign({}, newConfig) : {};
      if (opts.activityIcon) this.activityIcon = String(opts.activityIcon);
      if (opts.name) this.name = String(opts.name);
      if (opts.activityId) this.activityId = String(opts.activityId);
      this.refresh();
    }

    setState(partial) {
      Object.assign(this.state, partial || {});
      this.refresh();
    }

    /**
     * Flip the log-mode Done state without a full re-render. Toggles the
     * .is-done class on the card and swaps the Done button's icon/title
     * so the user gets immediate feedback without losing scroll position.
     */
    setDone(next) {
      this.isDone = !!next;
      if (!this.el) return;
      this.el.classList.toggle('is-done', this.isDone);
      const btn = this.el.querySelector('[data-action="toggle-done"]');
      if (btn) {
        btn.setAttribute('aria-pressed', this.isDone ? 'true' : 'false');
        const label = this.isDone ? 'Mark not done' : 'Mark done';
        btn.setAttribute('aria-label', label);
        btn.setAttribute('title', label);
        const icon = btn.querySelector('i');
        if (icon) icon.className = `bx ${this.isDone ? 'bx-check-circle' : 'bx-check'}`;
      }
    }

    setIndex(index, total) {
      if (!this.el) return;
      this.el.dataset.index = String(index);
      this.el.dataset.total = String(total);
      const up = this.el.querySelector('[data-action="move-up"]');
      const down = this.el.querySelector('[data-action="move-down"]');
      if (up) up.toggleAttribute('disabled', index <= 0);
      if (down) down.toggleAttribute('disabled', index >= total - 1);
    }

    destroy() {
      if (this._handleDocClickForMenu) {
        document.removeEventListener('click', this._handleDocClickForMenu);
        this._handleDocClickForMenu = null;
      }
      if (this.el && this.el.parentElement) this.el.parentElement.removeChild(this.el);
      this.el = null;
    }

    // ---------------- private ----------------

    _templateHtml() {
      const safeName = escapeHtml(this.name);
      const safeId = escapeHtml(this.instanceId);
      // Use the free-text protocol as-is when set, falling back to the
      // legacy formatProtocol(sets, reps) shape for state that predates it.
      const protocolDisplay = escapeHtml(
        this.state.protocol || formatProtocol(this.state.sets, this.state.reps)
      );
      const weight = this.state.weight || '';
      const unit = this.state.weightUnit || 'lbs';
      const isDIY = unit === 'diy';
      const weightDisplay = weight === '' ? '—' : escapeHtml(weight);
      const unitDisplay = (unit !== 'diy' && weight !== '') ? unit : '';
      const restDisplay = escapeHtml(this.state.rest || '60s');
      const blockClass = this.inBlock ? ' studio-card-in-block' : '';
      const blockAttr = this.inBlock ? ` data-block-id="${escapeHtml(this.inBlock.blockId)}"` : '';
      const moveMenuItems = this._buildMoveMenuItems();
      // Type accent: standard cards omit the attr so the default surface
      // shows through; cardio + note get a colored left border via CSS.
      const typeAttr = this.groupType && this.groupType !== 'standard'
        ? ` data-card-type="${escapeHtml(this.groupType)}"`
        : '';
      // For cardio cards we prepend the activity icon (e.g. bx-trending-up
      // for stair climber) inline next to the name — same affordance the
      // legacy builder uses to signal cardio at a glance.
      const iconHtml = (this.groupType === 'cardio' && this.activityIcon)
        ? `<i class="bx ${escapeHtml(this.activityIcon)} studio-card-type-icon" aria-hidden="true"></i> `
        : '';

      // Cardio cards render a summary-only template — activity fields
      // (duration, distance, pace, hr, calories, rpe, ...) are interdependent
      // and far too numerous to edit inline. Tapping the body opens the
      // shared cardio offcanvas (same editor the builder uses).
      if (this.groupType === 'cardio') {
        return this._templateCardio({ safeId, safeName, iconHtml, blockClass, blockAttr, typeAttr, moveMenuItems });
      }

      // Log-mode Done button — only rendered when the controller asked
      // for it. Sits in the header actions next to info + 3-dot menu so
      // it reads as a primary card action. The is-done class on the
      // card body green-tints it via CSS.
      const doneBtnHtml = this.showDoneButton ? `
              <button class="studio-card-icon-btn studio-card-done-btn"
                      data-action="toggle-done" type="button"
                      aria-pressed="${this.isDone ? 'true' : 'false'}"
                      aria-label="${this.isDone ? 'Mark not done' : 'Mark done'}"
                      title="${this.isDone ? 'Mark not done' : 'Mark done'}">
                <i class="bx ${this.isDone ? 'bx-check-circle' : 'bx-check'}"></i>
              </button>` : '';
      const doneClass = (this.showDoneButton && this.isDone) ? ' is-done' : '';

      return `
        <div class="studio-card${blockClass}${doneClass}" role="listitem" data-instance-id="${safeId}"${blockAttr}${typeAttr}>
          <div class="studio-card-header">
            <div class="studio-card-name-wrap">
              <div class="studio-card-name click-to-edit" tabindex="0">${iconHtml}${safeName}</div>
              <input class="studio-card-name-input"
                     type="text"
                     value="${safeName}"
                     maxlength="100"
                     aria-label="Exercise name"
                     style="display: none;" />
            </div>
            <div class="studio-card-actions">
              <button class="studio-card-icon-btn" data-action="info" type="button" aria-label="Details for ${safeName}" title="Details">
                <i class="bx bx-info-circle"></i>
              </button>${doneBtnHtml}
              <div class="studio-card-menu-wrap">
                <button class="studio-card-icon-btn" data-action="menu" type="button" aria-haspopup="true" aria-expanded="false" aria-label="More actions" title="More">
                  <i class="bx bx-dots-vertical-rounded"></i>
                </button>
                <div class="studio-card-menu" role="menu" hidden>
                  <button class="studio-card-menu-item" role="menuitem" data-action="move-up" type="button">
                    <i class="bx bx-up-arrow-alt"></i> Move up
                  </button>
                  <button class="studio-card-menu-item" role="menuitem" data-action="move-down" type="button">
                    <i class="bx bx-down-arrow-alt"></i> Move down
                  </button>
                  ${moveMenuItems}
                  <button class="studio-card-menu-item" role="menuitem" data-action="duplicate" type="button">
                    <i class="bx bx-copy"></i> Duplicate
                  </button>
                  <button class="studio-card-menu-item studio-card-menu-item-danger" role="menuitem" data-action="delete" type="button">
                    <i class="bx bx-trash"></i> Remove
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="studio-card-body">
            <!-- Protocol — free-text. Whatever the user types is what they
                 see; backend sets/reps are derived best-effort on save. -->
            <div class="workout-repssets-field studio-card-field"
                 data-protocol="${protocolDisplay}"
                 data-exercise-name="${safeName}">
              <div class="repssets-display click-to-edit">
                <span class="studio-card-field-label">Protocol</span>
                <span class="repssets-value-text">${protocolDisplay}</span>
              </div>
              <div class="repssets-editor" style="display: none;">
                <span class="studio-card-field-label">Protocol</span>
                <input type="text"
                       class="repssets-input studio-card-field-input"
                       value="${protocolDisplay}"
                       placeholder="e.g., 3x10, AMRAP"
                       inputmode="text" />
              </div>
            </div>

            <!-- Weight — free text. Unit pills choose lbs / kg / DIY; the
                 input itself accepts arbitrary text so '90, then drop set'
                 and similar entries persist verbatim. -->
            <div class="studio-card-weight-field studio-card-field"
                 data-weight="${escapeHtml(weight)}"
                 data-unit="${escapeHtml(unit)}">
              <div class="weight-display click-to-edit">
                <span class="studio-card-field-label">Weight</span>
                <span class="studio-card-field-value-wrap">
                  <span class="weight-value">${weightDisplay}</span>
                  <span class="weight-unit" ${unitDisplay ? '' : 'style="display:none;"'}>${unitDisplay}</span>
                </span>
              </div>
              <div class="studio-weight-editor" style="display: none;">
                <span class="studio-card-field-label">Weight</span>
                <div class="studio-card-weight-row">
                  <input class="weight-input studio-card-field-input"
                         type="text"
                         value="${escapeHtml(weight)}"
                         inputmode="text"
                         placeholder="${isDIY ? 'e.g. bodyweight + 10 lbs' : '0'}" />
                  <div class="weight-unit-selector">
                    <button class="unit-btn ${unit === 'lbs' ? 'active' : ''}" data-unit="lbs" type="button">lbs</button>
                    <button class="unit-btn ${unit === 'kg' ? 'active' : ''}" data-unit="kg" type="button">kg</button>
                    <button class="unit-btn ${unit === 'diy' ? 'active' : ''}" data-unit="diy" type="button">DIY</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Rest — free text. -->
            <div class="studio-card-rest-field studio-card-field" data-rest="${restDisplay}">
              <div class="studio-rest-display click-to-edit">
                <span class="studio-card-field-label">Rest</span>
                <span class="studio-rest-value-text">${restDisplay}</span>
              </div>
              <div class="studio-rest-editor" style="display: none;">
                <span class="studio-card-field-label">Rest</span>
                <input type="text" class="studio-rest-input studio-card-field-input"
                       value="${restDisplay}"
                       placeholder="60s" maxlength="20" />
              </div>
            </div>
          </div>

          <!-- Single card-level commit row, only visible during edit mode.
               Tapping any field's display opens all three editors and shows
               this footer; ✓ commits all, ✗ reverts all (workout-mode parity). -->
          <div class="studio-card-edit-actions" style="display: none;">
            <button class="btn btn-sm btn-outline-secondary studio-card-edit-cancel" type="button" aria-label="Cancel edits" title="Cancel"><i class="bx bx-x"></i> Cancel</button>
            <button class="btn btn-sm btn-success studio-card-edit-save" type="button" aria-label="Save edits" title="Save"><i class="bx bx-check"></i> Save</button>
          </div>
        </div>
      `;
    }

    _bindEvents() {
      if (!this.el) return;

      // Info button → emit onInfo callback (controller opens detail offcanvas)
      const infoBtn = this.el.querySelector('[data-action="info"]');
      if (infoBtn) {
        infoBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._fire('onInfo');
        });
      }

      // Done button (log mode only) → flip isDone + fire callback. The
      // controller persists the new state into logState; we toggle the
      // class locally so the user sees instant feedback.
      const doneBtn = this.el.querySelector('[data-action="toggle-done"]');
      if (doneBtn) {
        doneBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const next = !this.isDone;
          this.setDone(next);
          this._fire('onMarkDone', next);
        });
      }

      // Cardio edit affordances — the pencil button AND the summary
      // surface both open the cardio offcanvas. Both share the
      // data-action="edit-cardio" hook, so one delegated listener covers
      // both. Stop propagation so it doesn't bubble to the card click.
      const editCardioEls = this.el.querySelectorAll('[data-action="edit-cardio"]');
      editCardioEls.forEach((node) => {
        node.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          this._fire('onEditCardio');
        });
      });

      // 3-dot menu toggle
      const menuBtn = this.el.querySelector('[data-action="menu"]');
      const menu = this.el.querySelector('.studio-card-menu');
      if (menuBtn && menu) {
        menuBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._toggleMenu(!menu.hidden);
        });
        menu.addEventListener('click', (e) => {
          const item = e.target.closest('.studio-card-menu-item');
          if (!item) return;
          e.stopPropagation();
          const action = item.dataset.action;
          const blockId = item.dataset.blockId || null;
          this._toggleMenu(true); // close
          if (action) this._fire('onMenuAction', action, blockId);
        });
        // Close on outside click
        this._handleDocClickForMenu = (e) => {
          if (!menu.hidden && !this.el.contains(e.target)) this._toggleMenu(true);
        };
        document.addEventListener('click', this._handleDocClickForMenu);
      }

      // Unified edit mode — tapping ANY of the three field displays
      // (protocol, weight, rest) opens ALL three editors at once and
      // surfaces a single ✓/✗ row at the bottom of the card. This is the
      // workout-mode pattern: one explicit commit per card, no per-field
      // save/cancel, no blur-cancels-and-loses-typing.
      const displays = this.el.querySelectorAll(
        '.repssets-display, .weight-display, .studio-rest-display'
      );
      displays.forEach((d) => {
        d.addEventListener('click', (e) => {
          e.stopPropagation();
          // Map each display back to the field its input belongs to so
          // we can focus the field the user actually tapped, not always
          // the first one.
          let focusField = 'protocol';
          if (d.classList.contains('weight-display')) focusField = 'weight';
          else if (d.classList.contains('studio-rest-display')) focusField = 'rest';
          this._enterCardEditMode(focusField);
        });
      });

      // Card-level Save / Cancel — wired once; commit/revert all fields.
      const saveBtn = this.el.querySelector('.studio-card-edit-save');
      const cancelBtn = this.el.querySelector('.studio-card-edit-cancel');
      if (saveBtn) saveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._exitCardEditMode(true);
      });
      if (cancelBtn) cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._exitCardEditMode(false);
      });

      // Enter = commit, Escape = revert. Bound on each input so the
      // shortcuts work no matter which field has focus.
      const inputs = this.el.querySelectorAll(
        '.repssets-input, .weight-input, .studio-rest-input'
      );
      inputs.forEach((inp) => {
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); this._exitCardEditMode(true); }
          else if (e.key === 'Escape') { e.preventDefault(); this._exitCardEditMode(false); }
        });
      });

      // Weight unit pills — independent of edit-mode entry/exit, just
      // toggle the active class + state. Pressed buttons don't take
      // focus from the weight input.
      const unitBtns = this.el.querySelectorAll('.weight-unit-selector .unit-btn');
      const weightInput = this.el.querySelector('.weight-input');
      unitBtns.forEach((btn) => {
        ['pointerdown', 'mousedown'].forEach((evt) => {
          btn.addEventListener(evt, (ev) => { ev.preventDefault(); });
        });
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const unit = btn.dataset.unit;
          if (!unit) return;
          this.state.weightUnit = unit;
          unitBtns.forEach((b) => b.classList.toggle('active', b.dataset.unit === unit));
          if (weightInput) {
            weightInput.placeholder = unit === 'diy' ? 'e.g. bodyweight + 10 lbs' : '0';
            requestAnimationFrame(() => weightInput.focus());
          }
        });
      });

      // Name field — independent, simple click-to-edit with blur-saves.
      // Single field, no validation, low risk: blur-commits is the lowest-
      // friction interaction. It does NOT participate in the unified edit
      // mode (different concern, different lifetime).
      this._bindNameField();
    }

    /**
     * Snapshot the current state, open all three editors, show the
     * card-level ✓/✗ row, and focus the requested field's input. Safe
     * to call when already in edit mode (it's idempotent).
     */
    _enterCardEditMode(focusField) {
      if (!this.el || this._cardEditOpen) {
        // Already open — just refocus the requested field
        const refocusEl = this._getEditorInput(focusField);
        if (refocusEl) { refocusEl.focus(); refocusEl.select && refocusEl.select(); }
        return;
      }
      this._cardEditOpen = true;
      this._editSnapshot = {
        protocol: this.state.protocol || '',
        sets: this.state.sets || '',
        reps: this.state.reps || '',
        weight: this.state.weight || '',
        weightUnit: this.state.weightUnit || 'lbs',
        rest: this.state.rest || '60s',
      };
      // Seed every input from current state, then swap visibility
      const pInput = this.el.querySelector('.repssets-input');
      const wInput = this.el.querySelector('.weight-input');
      const rInput = this.el.querySelector('.studio-rest-input');
      if (pInput) pInput.value = this._editSnapshot.protocol;
      if (wInput) wInput.value = this._editSnapshot.weight;
      if (rInput) rInput.value = this._editSnapshot.rest;

      const displays = this.el.querySelectorAll(
        '.repssets-display, .weight-display, .studio-rest-display'
      );
      displays.forEach((d) => { d.style.display = 'none'; });
      this.el.querySelectorAll('.repssets-editor, .studio-weight-editor, .studio-rest-editor')
        .forEach((e) => { e.style.display = 'flex'; });

      const actions = this.el.querySelector('.studio-card-edit-actions');
      if (actions) actions.style.display = 'flex';
      this.el.classList.add('studio-card-editing');

      const focusEl = this._getEditorInput(focusField);
      if (focusEl) setTimeout(() => { focusEl.focus(); focusEl.select && focusEl.select(); }, 0);
    }

    _getEditorInput(field) {
      if (!this.el) return null;
      if (field === 'weight') return this.el.querySelector('.weight-input');
      if (field === 'rest') return this.el.querySelector('.studio-rest-input');
      return this.el.querySelector('.repssets-input');
    }

    /**
     * Commit (save=true) or discard (save=false) all three field edits as
     * a single transaction. Saves emit a single onChange with the merged
     * patch so the controller's draft + organize state stay coherent.
     */
    _exitCardEditMode(save) {
      if (!this.el || !this._cardEditOpen) return;
      if (save) {
        const pInput = this.el.querySelector('.repssets-input');
        const wInput = this.el.querySelector('.weight-input');
        const rInput = this.el.querySelector('.studio-rest-input');
        const protocolRaw = pInput ? String(pInput.value || '').trim() : this.state.protocol;
        const restRaw = rInput ? String(rInput.value || '').trim() : this.state.rest;
        const weightRaw = wInput ? String(wInput.value || '').trim() : this.state.weight;

        // Protocol is stored verbatim; sets+reps are derived best-effort
        // so the save payload + workout-mode (which reads sets/reps) keep
        // working without quirks like "5x5" auto-formatting to "5×5".
        const finalProtocol = protocolRaw || formatProtocol(this.state.sets, this.state.reps);
        const split = splitProtocol(finalProtocol);
        this.state.protocol = finalProtocol;
        this.state.sets = split.sets;
        this.state.reps = split.reps;
        this.state.rest = restRaw || '60s';
        this.state.weight = weightRaw;
        // weightUnit was tracked live by the pill click handler.
        this._fire('onChange', {
          protocol: this.state.protocol,
          sets: this.state.sets,
          reps: this.state.reps,
          rest: this.state.rest,
          weight: this.state.weight,
          weightUnit: this.state.weightUnit,
        });
      } else if (this._editSnapshot) {
        // Discard — restore every field to its pre-edit snapshot.
        Object.assign(this.state, this._editSnapshot);
      }
      // Refresh display lines from the now-final state, then swap back.
      this._refreshProtocolDisplay();
      this._refreshWeightDisplay();
      this._refreshRestDisplay();

      // Sync unit-pill active state in case Cancel rolled back a change.
      const unitBtns = this.el.querySelectorAll('.weight-unit-selector .unit-btn');
      unitBtns.forEach((b) => b.classList.toggle('active', b.dataset.unit === this.state.weightUnit));

      this.el.querySelectorAll('.repssets-editor, .studio-weight-editor, .studio-rest-editor')
        .forEach((e) => { e.style.display = 'none'; });
      const displays = this.el.querySelectorAll(
        '.repssets-display, .weight-display, .studio-rest-display'
      );
      displays.forEach((d) => { d.style.display = ''; });
      const actions = this.el.querySelector('.studio-card-edit-actions');
      if (actions) actions.style.display = 'none';
      this.el.classList.remove('studio-card-editing');

      this._cardEditOpen = false;
      this._editSnapshot = null;
    }

    // -------- cardio (summary-only, offcanvas-driven editing) --------

    _templateCardio({ safeId, safeName, iconHtml, blockClass, blockAttr, typeAttr, moveMenuItems }) {
      const summary = this._formatCardioSummary();
      const summaryHtml = summary
        ? escapeHtml(summary)
        : 'Tap to set duration, distance, pace…';
      const summaryClass = summary ? 'studio-card-cardio-meta' : 'studio-card-cardio-empty';
      const doneBtnHtml = this.showDoneButton ? `
              <button class="studio-card-icon-btn studio-card-done-btn"
                      data-action="toggle-done" type="button"
                      aria-pressed="${this.isDone ? 'true' : 'false'}"
                      aria-label="${this.isDone ? 'Mark not done' : 'Mark done'}"
                      title="${this.isDone ? 'Mark not done' : 'Mark done'}">
                <i class="bx ${this.isDone ? 'bx-check-circle' : 'bx-check'}"></i>
              </button>` : '';
      const doneClass = (this.showDoneButton && this.isDone) ? ' is-done' : '';
      return `
        <div class="studio-card studio-card-cardio${blockClass}${doneClass}" role="listitem" data-instance-id="${safeId}"${blockAttr}${typeAttr}>
          <div class="studio-card-header">
            <div class="studio-card-name-wrap">
              <div class="studio-card-name">${iconHtml}${safeName}</div>
            </div>
            <div class="studio-card-actions">
              <button class="studio-card-icon-btn" data-action="edit-cardio" type="button" aria-label="Edit activity" title="Edit activity">
                <i class="bx bx-pencil"></i>
              </button>${doneBtnHtml}
              <div class="studio-card-menu-wrap">
                <button class="studio-card-icon-btn" data-action="menu" type="button" aria-haspopup="true" aria-expanded="false" aria-label="More actions" title="More">
                  <i class="bx bx-dots-vertical-rounded"></i>
                </button>
                <div class="studio-card-menu" role="menu" hidden>
                  <button class="studio-card-menu-item" role="menuitem" data-action="move-up" type="button">
                    <i class="bx bx-up-arrow-alt"></i> Move up
                  </button>
                  <button class="studio-card-menu-item" role="menuitem" data-action="move-down" type="button">
                    <i class="bx bx-down-arrow-alt"></i> Move down
                  </button>
                  ${moveMenuItems}
                  <button class="studio-card-menu-item" role="menuitem" data-action="duplicate" type="button">
                    <i class="bx bx-copy"></i> Duplicate
                  </button>
                  <button class="studio-card-menu-item studio-card-menu-item-danger" role="menuitem" data-action="delete" type="button">
                    <i class="bx bx-trash"></i> Remove
                  </button>
                </div>
              </div>
            </div>
          </div>

          <button class="studio-card-cardio-summary" data-action="edit-cardio" type="button">
            <span class="${summaryClass}">${summaryHtml}</span>
          </button>
        </div>
      `;
    }

    /**
     * Build the comma-separated meta line ("20 min • 2.5 mi • 8:00/mi")
     * from cardio_config + ActivityDisplayConfig's user-chosen columns.
     * Returns '' when no displayable fields are populated.
     */
    _formatCardioSummary() {
      const cfg = this.cardioConfig || {};
      const ADC = window.ActivityDisplayConfig;
      // Default to the three most common columns when ADC isn't loaded.
      const columns = ADC && typeof ADC.getColumns === 'function'
        ? ADC.getColumns()
        : ['duration', 'distance', 'pace'];
      const parts = [];
      columns.forEach((fieldId) => {
        const def = ADC && typeof ADC.getFieldDef === 'function' ? ADC.getFieldDef(fieldId) : null;
        if (!def || typeof def.format !== 'function') return;
        const val = def.format(cfg);
        if (val) parts.push(val);
      });
      return parts.join(' • ');
    }

    _refreshCardioSummary() {
      if (!this.el) return;
      const slot = this.el.querySelector('.studio-card-cardio-summary');
      if (!slot) return;
      const summary = this._formatCardioSummary();
      const span = document.createElement('span');
      if (summary) {
        span.className = 'studio-card-cardio-meta';
        span.textContent = summary;
      } else {
        span.className = 'studio-card-cardio-empty';
        span.textContent = 'Tap to set duration, distance, pace…';
      }
      slot.innerHTML = '';
      slot.appendChild(span);
    }

    _bindNameField() {
      if (!this.el) return;
      const display = this.el.querySelector('.studio-card-name');
      const input = this.el.querySelector('.studio-card-name-input');
      if (!display || !input) return;

      const exitEdit = (save) => {
        if (save) {
          const v = String(input.value || '').trim();
          if (v && v !== this.name) {
            this.name = v;
            display.textContent = v;
            // Keep the info button's aria-label in sync for screen readers
            const info = this.el.querySelector('[data-action="info"]');
            if (info) info.setAttribute('aria-label', `Details for ${v}`);
            this._fire('onChange', { name: v });
          } else {
            // No-op or empty value — revert the input
            input.value = this.name;
          }
        } else {
          input.value = this.name;
        }
        input.style.display = 'none';
        display.style.display = '';
      };

      const enterEdit = () => {
        input.value = this.name;
        display.style.display = 'none';
        input.style.display = '';
        setTimeout(() => { input.focus(); input.select(); }, 0);
      };

      display.addEventListener('click', (e) => {
        e.stopPropagation();
        enterEdit();
      });
      display.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          enterEdit();
        }
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); exitEdit(true); }
        else if (e.key === 'Escape') { e.preventDefault(); exitEdit(false); }
      });
      input.addEventListener('blur', () => exitEdit(true));
    }


    _buildMoveMenuItems() {
      const parts = [];
      // If currently inside a block, offer "Move out of block"
      if (this.inBlock) {
        parts.push(`
          <button class="studio-card-menu-item" role="menuitem" data-action="move-out-of-block" type="button">
            <i class="bx bx-exit"></i> Move out of block
          </button>
        `);
      }
      // Offer "Move to: <block name>" for every block except the current one
      const targets = this.blockOptions.filter((b) => !this.inBlock || b.blockId !== this.inBlock.blockId);
      if (targets.length > 0) {
        // Separator before the move-to-block items, only if there are preceding items
        parts.push(`<div class="studio-card-menu-sep" role="separator"></div>`);
        for (const b of targets) {
          const safeName = escapeHtml(b.name || 'Block');
          const safeBlockId = escapeHtml(b.blockId);
          parts.push(`
            <button class="studio-card-menu-item" role="menuitem"
                    data-action="move-to-block" data-block-id="${safeBlockId}" type="button">
              <i class="bx bx-collection"></i> Move to: ${safeName || '<span class="studio-card-menu-muted">(unnamed)</span>'}
            </button>
          `);
        }
        parts.push(`<div class="studio-card-menu-sep" role="separator"></div>`);
      }
      return parts.join('');
    }

    _toggleMenu(forceClose) {
      const menu = this.el && this.el.querySelector('.studio-card-menu');
      const btn = this.el && this.el.querySelector('[data-action="menu"]');
      if (!menu || !btn) return;
      const open = forceClose ? false : menu.hidden;
      menu.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    _refreshProtocolDisplay() {
      if (!this.el) return;
      // Prefer the verbatim protocol the user typed; fall back to the
      // derived sets×reps shape for legacy state.
      const text = this.state.protocol || formatProtocol(this.state.sets, this.state.reps);
      const display = this.el.querySelector('.repssets-display .repssets-value-text');
      const field = this.el.querySelector('.workout-repssets-field');
      if (display) display.textContent = text;
      if (field) field.dataset.protocol = text;
    }

    _refreshWeightDisplay() {
      if (!this.el) return;
      const weight = this.state.weight || '';
      const unit = this.state.weightUnit || 'lbs';
      const valEl = this.el.querySelector('.weight-display .weight-value');
      const unitEl = this.el.querySelector('.weight-display .weight-unit');
      const field = this.el.querySelector('.studio-card-weight-field');
      if (valEl) valEl.textContent = weight === '' ? '—' : weight;
      if (unitEl) {
        if (weight !== '' && unit !== 'diy') {
          unitEl.textContent = unit;
          unitEl.style.display = '';
        } else {
          unitEl.style.display = 'none';
        }
      }
      if (field) {
        field.dataset.weight = weight;
        field.dataset.unit = unit;
      }
    }

    _refreshRestDisplay() {
      if (!this.el) return;
      const valueEl = this.el.querySelector('.studio-rest-value-text');
      const field = this.el.querySelector('.studio-card-rest-field');
      if (valueEl) valueEl.textContent = this.state.rest || '60s';
      if (field) field.dataset.rest = this.state.rest || '60s';
    }

    _fire(name, ...args) {
      const fn = this.callbacks && this.callbacks[name];
      if (typeof fn !== 'function') return;
      try { fn(this.instanceId, ...args); }
      catch (err) { console.error(`[StudioExerciseCard] ${name} callback threw:`, err); }
    }
  }

  window.StudioExerciseCard = StudioExerciseCard;
})();
