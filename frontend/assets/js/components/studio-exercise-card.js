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

  class StudioExerciseCard {
    constructor({ instanceId, name, state, callbacks, inBlock, blockOptions, groupType, activityIcon, cardioConfig, activityId } = {}) {
      this.instanceId = instanceId;
      this.name = name || 'Exercise';
      this.state = Object.assign({
        sets: '3',
        reps: '8-12',
        rest: '60s',
        weight: '',
        weightUnit: 'lbs',
      }, state || {});
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
      this.el = null;
      this._repsSetsCtl = null;
      this._handleDocClickForMenu = null;
    }

    render() {
      const tpl = document.createElement('div');
      tpl.innerHTML = this._templateHtml();
      this.el = tpl.firstElementChild;
      this._bindEvents();
      // Cardio cards skip the inline-field controllers — those edit
      // sets/reps/rest/weight, none of which apply to a cardio summary.
      if (this.groupType !== 'cardio') this._initFieldControllers();
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
      const protocolDisplay = escapeHtml(formatProtocol(this.state.sets, this.state.reps));
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

      return `
        <div class="studio-card${blockClass}" role="listitem" data-instance-id="${safeId}"${blockAttr}${typeAttr}>
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
              </button>
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
            <!-- Protocol (sets × reps) -->
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
                       class="repssets-input repssets-text-input studio-card-field-input"
                       value="${protocolDisplay}"
                       placeholder="e.g., 3x10, AMRAP"
                       inputmode="text" />
                <div class="studio-inline-actions" data-field="protocol">
                  <button class="btn btn-sm btn-success studio-inline-save" type="button" aria-label="Save protocol" title="Save"><i class="bx bx-check"></i></button>
                  <button class="btn btn-sm btn-outline-secondary studio-inline-cancel" type="button" aria-label="Cancel protocol" title="Cancel"><i class="bx bx-x"></i></button>
                </div>
              </div>
            </div>

            <!-- Weight (single input that morphs type when DIY pill is tapped) -->
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
                         type="${isDIY ? 'text' : 'number'}"
                         value="${escapeHtml(weight)}"
                         step="${unit === 'kg' ? '2.5' : '5'}"
                         min="0" max="9999"
                         inputmode="${isDIY ? 'text' : 'decimal'}"
                         placeholder="${isDIY ? 'e.g. bodyweight + 10 lbs' : '0'}" />
                  <div class="weight-unit-selector">
                    <button class="unit-btn ${unit === 'lbs' ? 'active' : ''}" data-unit="lbs" type="button">lbs</button>
                    <button class="unit-btn ${unit === 'kg' ? 'active' : ''}" data-unit="kg" type="button">kg</button>
                    <button class="unit-btn ${unit === 'diy' ? 'active' : ''}" data-unit="diy" type="button">DIY</button>
                  </div>
                </div>
                <div class="studio-inline-actions" data-field="weight">
                  <button class="btn btn-sm btn-success studio-inline-save" type="button" aria-label="Save weight" title="Save"><i class="bx bx-check"></i></button>
                  <button class="btn btn-sm btn-outline-secondary studio-inline-cancel" type="button" aria-label="Cancel weight" title="Cancel"><i class="bx bx-x"></i></button>
                </div>
              </div>
            </div>

            <!-- Rest (small bespoke editor — no existing controller) -->
            <div class="studio-card-rest-field studio-card-field" data-rest="${restDisplay}">
              <div class="studio-rest-display click-to-edit">
                <span class="studio-card-field-label">Rest</span>
                <span class="studio-rest-value-text">${restDisplay}</span>
              </div>
              <div class="studio-rest-editor" style="display: none;">
                <span class="studio-card-field-label">Rest</span>
                <input type="text" class="studio-rest-input studio-card-field-input"
                       value="${restDisplay}"
                       placeholder="60s" maxlength="8" />
                <div class="studio-inline-actions" data-field="rest">
                  <button class="btn btn-sm btn-success studio-inline-save" type="button" aria-label="Save rest" title="Save"><i class="bx bx-check"></i></button>
                  <button class="btn btn-sm btn-outline-secondary studio-inline-cancel" type="button" aria-label="Cancel rest" title="Cancel"><i class="bx bx-x"></i></button>
                </div>
              </div>
            </div>
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

      // Protocol display tap → enter edit via RepsSetsFieldController
      const rDisplay = this.el.querySelector('.repssets-display');
      if (rDisplay) {
        rDisplay.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this._repsSetsCtl) this._repsSetsCtl.enterEditMode();
        });
      }

      // Weight field (bespoke inline edit — one input that morphs type
      // when the DIY unit pill is tapped, so it can hold either a number
      // or arbitrary text like "bodyweight + 10 lbs".)
      this._bindWeightField();

      // Name field (tap-to-edit; saves on Enter/blur, cancels on Escape)
      this._bindNameField();

      // Rest field (bespoke inline edit). Workout-mode-style: blur is a
      // no-op; commit is explicit via the inline ✓ button or Enter, cancel
      // via ✗ or Escape. This is what fixes the "tap off → revert" pain.
      const restDisplay = this.el.querySelector('.studio-rest-display');
      const restEditor = this.el.querySelector('.studio-rest-editor');
      const restInput = this.el.querySelector('.studio-rest-input');
      if (restDisplay && restEditor && restInput) {
        const exitRestEdit = (save) => {
          if (save) {
            const v = String(restInput.value || '').trim() || '60s';
            this.state.rest = v;
            this._fire('onChange', { rest: v });
          }
          this._refreshRestDisplay();
          restEditor.style.display = 'none';
          restDisplay.style.display = '';
        };
        restDisplay.addEventListener('click', (e) => {
          e.stopPropagation();
          restDisplay.style.display = 'none';
          restEditor.style.display = 'flex';
          restInput.value = this.state.rest || '60s';
          setTimeout(() => { restInput.focus(); restInput.select(); }, 0);
        });
        restInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); exitRestEdit(true); }
          else if (e.key === 'Escape') { e.preventDefault(); exitRestEdit(false); }
        });
        const rSave = this.el.querySelector('.studio-card-rest-field .studio-inline-save');
        const rCancel = this.el.querySelector('.studio-card-rest-field .studio-inline-cancel');
        if (rSave) rSave.addEventListener('click', (e) => { e.stopPropagation(); exitRestEdit(true); });
        if (rCancel) rCancel.addEventListener('click', (e) => { e.stopPropagation(); exitRestEdit(false); });
      }

      // Listen for change events emitted by the field controllers
      const repsFieldEl = this.el.querySelector('.workout-repssets-field');
      if (repsFieldEl) {
        repsFieldEl.addEventListener('repsSetsChanged', (e) => {
          const detail = e.detail || {};
          const newState = {};
          if (detail.protocol) {
            const m = String(detail.protocol).match(/^\s*(\d+)\s*[x×]\s*(.+?)\s*$/i);
            if (m) {
              newState.sets = m[1];
              newState.reps = m[2];
            } else {
              newState.sets = '';
              newState.reps = String(detail.protocol);
            }
          }
          if (detail.sets != null) newState.sets = String(detail.sets);
          if (detail.reps != null) newState.reps = String(detail.reps);
          Object.assign(this.state, newState);
          this._refreshProtocolDisplay();
          this._fire('onChange', newState);
        });
      }
    }

    // -------- cardio (summary-only, offcanvas-driven editing) --------

    _templateCardio({ safeId, safeName, iconHtml, blockClass, blockAttr, typeAttr, moveMenuItems }) {
      const summary = this._formatCardioSummary();
      const summaryHtml = summary
        ? escapeHtml(summary)
        : 'Tap to set duration, distance, pace…';
      const summaryClass = summary ? 'studio-card-cardio-meta' : 'studio-card-cardio-empty';
      return `
        <div class="studio-card studio-card-cardio${blockClass}" role="listitem" data-instance-id="${safeId}"${blockAttr}${typeAttr}>
          <div class="studio-card-header">
            <div class="studio-card-name-wrap">
              <div class="studio-card-name">${iconHtml}${safeName}</div>
            </div>
            <div class="studio-card-actions">
              <button class="studio-card-icon-btn" data-action="edit-cardio" type="button" aria-label="Edit activity" title="Edit activity">
                <i class="bx bx-pencil"></i>
              </button>
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

    _initFieldControllers() {
      // Weight is handled bespoke in _bindWeightField — no controller needed.
      const rEl = this.el.querySelector('.workout-repssets-field');
      if (rEl && window.RepsSetsFieldController) {
        try {
          this._repsSetsCtl = new window.RepsSetsFieldController(rEl, {
            exerciseName: this.name,
            sessionService: null,
          });
          // The controller's default blur handler CANCELS edits — for the
          // studio that meant "tap protocol → type → tap off → value
          // reverts." Disable that auto-cancel by claiming unified mode so
          // the user has to explicitly commit via the inline ✓ / Enter,
          // matching workout-mode's inline-edit feel.
          if (typeof this._repsSetsCtl.setUnifiedEditMode === 'function') {
            this._repsSetsCtl.setUnifiedEditMode(true);
          }
        } catch (err) {
          console.warn('[StudioExerciseCard] RepsSetsFieldController init failed:', err);
        }
      }
      // Wire the inline ✓ / ✗ buttons that live inside the protocol editor.
      const pSave = this.el.querySelector('.workout-repssets-field .studio-inline-save');
      const pCancel = this.el.querySelector('.workout-repssets-field .studio-inline-cancel');
      if (pSave) pSave.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this._repsSetsCtl) this._repsSetsCtl.exitEditMode(true);
      });
      if (pCancel) pCancel.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this._repsSetsCtl) this._repsSetsCtl.exitEditMode(false);
      });
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

    _bindWeightField() {
      if (!this.el) return;
      const display = this.el.querySelector('.weight-display');
      const editor = this.el.querySelector('.studio-weight-editor');
      const input = this.el.querySelector('.weight-input');
      const unitBtns = this.el.querySelectorAll('.weight-unit-selector .unit-btn');
      if (!display || !editor || !input) return;

      const applyUnitMode = (unit) => {
        const isDIY = unit === 'diy';
        // One physical input morphs type so the box position is stable.
        input.type = isDIY ? 'text' : 'number';
        input.inputMode = isDIY ? 'text' : 'decimal';
        input.placeholder = isDIY ? 'e.g. bodyweight + 10 lbs' : '0';
        input.step = unit === 'kg' ? '2.5' : '5';
        unitBtns.forEach((b) => b.classList.toggle('active', b.dataset.unit === unit));
      };

      // Snapshot the pre-edit state so Cancel can fully revert (including
      // a unit change the user made via the pills before tapping ✗).
      let originalWeight = '';
      let originalUnit = 'lbs';

      const exitEdit = (save) => {
        if (save) {
          const v = String(input.value || '').trim();
          this.state.weight = v;
          this._fire('onChange', { weight: this.state.weight, weightUnit: this.state.weightUnit });
        } else {
          // Roll back any unit-pill changes made during this edit session.
          this.state.weight = originalWeight;
          this.state.weightUnit = originalUnit;
        }
        this._refreshWeightDisplay();
        editor.style.display = 'none';
        display.style.display = '';
      };

      display.addEventListener('click', (e) => {
        e.stopPropagation();
        originalWeight = this.state.weight || '';
        originalUnit = this.state.weightUnit || 'lbs';
        applyUnitMode(originalUnit);
        input.value = originalWeight;
        display.style.display = 'none';
        editor.style.display = 'flex';
        setTimeout(() => { input.focus(); input.select(); }, 0);
      });

      // Workout-mode pattern: blur is a no-op. The editor stays open until
      // the user explicitly commits via ✓ / Enter or discards via ✗ /
      // Escape. This is what fixes "tap off → value reverts" — there's no
      // longer an auto-cancel on blur.
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); exitEdit(true); }
        else if (e.key === 'Escape') { e.preventDefault(); exitEdit(false); }
      });

      const wSave = this.el.querySelector('.studio-card-weight-field .studio-inline-save');
      const wCancel = this.el.querySelector('.studio-card-weight-field .studio-inline-cancel');
      if (wSave) wSave.addEventListener('click', (e) => { e.stopPropagation(); exitEdit(true); });
      if (wCancel) wCancel.addEventListener('click', (e) => { e.stopPropagation(); exitEdit(false); });

      unitBtns.forEach((btn) => {
        // Stop the down-event from stealing focus so the input cursor stays
        // ready for more typing after a pill tap.
        ['pointerdown', 'mousedown'].forEach((evt) => {
          btn.addEventListener(evt, (e) => { e.preventDefault(); });
        });
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const unit = btn.dataset.unit;
          if (!unit || unit === this.state.weightUnit) return;
          this.state.weightUnit = unit;
          applyUnitMode(unit);
          requestAnimationFrame(() => input.focus());
        });
      });
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
      const text = formatProtocol(this.state.sets, this.state.reps);
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
