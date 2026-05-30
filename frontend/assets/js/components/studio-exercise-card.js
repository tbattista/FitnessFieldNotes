/**
 * StudioExerciseCard — Workout Studio Page 2 card
 *
 * Renders one card per tray instance with:
 *   - Compact header: exercise name + pencil edit + 3-dot menu
 *   - Body with three labeled rows: Protocol (sets×reps), Weight, Rest
 *   - Tap any value in the body to inline-edit. Protocol + Weight reuse the
 *     existing battle-tested field controllers
 *     (`window.RepsSetsFieldController`, `window.WeightFieldController`)
 *     so the morphing UX, +/- steppers, unit toggle (lbs/kg/DIY), and
 *     keyboard handling are inherited. Rest is a small bespoke editor.
 *
 * Public events (emitted via the provided callbacks):
 *   - onChange(instanceId, partialState)  -> after any inline edit
 *   - onPencil(instanceId)                -> when user taps the pencil
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
    constructor({ instanceId, name, state, callbacks } = {}) {
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
      this.el = null;
      this._weightCtl = null;
      this._repsSetsCtl = null;
      this._handleDocClickForMenu = null;
    }

    render() {
      const tpl = document.createElement('div');
      tpl.innerHTML = this._templateHtml();
      this.el = tpl.firstElementChild;
      this._bindEvents();
      this._initFieldControllers();
      return this.el;
    }

    /** Re-render the header preview and field display values from current state */
    refresh() {
      if (!this.el) return;
      const nameEl = this.el.querySelector('.studio-card-name');
      if (nameEl) nameEl.textContent = this.name;
      this._refreshProtocolDisplay();
      this._refreshWeightDisplay();
      this._refreshRestDisplay();
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

      return `
        <div class="studio-card" role="listitem" data-instance-id="${safeId}">
          <div class="studio-card-header">
            <div class="studio-card-name">${safeName}</div>
            <div class="studio-card-actions">
              <button class="studio-card-icon-btn" data-action="pencil" type="button" aria-label="Edit ${safeName}" title="Edit">
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
              </div>
            </div>

            <!-- Weight -->
            <div class="workout-weight-field studio-card-field"
                 data-weight="${escapeHtml(weight)}"
                 data-unit="${escapeHtml(unit)}"
                 data-weight-mode="${isDIY ? 'text' : 'numeric'}"
                 data-exercise-name="${safeName}">
              <div class="weight-display click-to-edit">
                <span class="studio-card-field-label">Weight</span>
                <span class="studio-card-field-value-wrap">
                  <span class="weight-value">${weightDisplay}</span>
                  <span class="weight-unit" ${unitDisplay ? '' : 'style="display:none;"'}>${unitDisplay}</span>
                </span>
              </div>
              <div class="weight-editor ${isDIY ? 'diy-active' : ''}" style="display: none;">
                <span class="studio-card-field-label">Weight</span>
                <div class="studio-card-weight-row">
                  <div class="weight-input-row numeric-mode">
                    <input type="number" class="weight-input studio-card-field-input"
                           value="${isDIY ? '' : escapeHtml(weight)}"
                           step="5" min="0" max="9999" inputmode="decimal" placeholder="0" />
                  </div>
                  <div class="weight-input-row diy-mode">
                    <input type="text" class="weight-text-input studio-card-field-input"
                           value="${isDIY ? escapeHtml(weight) : ''}"
                           placeholder="e.g. bodyweight + 10 lbs" />
                  </div>
                  <div class="weight-unit-selector">
                    <button class="unit-btn ${unit === 'lbs' ? 'active' : ''}" data-unit="lbs" type="button">lbs</button>
                    <button class="unit-btn ${unit === 'kg' ? 'active' : ''}" data-unit="kg" type="button">kg</button>
                    <button class="unit-btn ${unit === 'diy' ? 'active' : ''}" data-unit="diy" type="button">DIY</button>
                  </div>
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
              </div>
            </div>
          </div>
        </div>
      `;
    }

    _bindEvents() {
      if (!this.el) return;

      // Pencil button → emit onPencil callback (controller opens offcanvas)
      const pencilBtn = this.el.querySelector('[data-action="pencil"]');
      if (pencilBtn) {
        pencilBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._fire('onPencil');
        });
      }

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
          this._toggleMenu(true); // close
          if (action) this._fire('onMenuAction', action);
        });
        // Close on outside click
        this._handleDocClickForMenu = (e) => {
          if (!menu.hidden && !this.el.contains(e.target)) this._toggleMenu(true);
        };
        document.addEventListener('click', this._handleDocClickForMenu);
      }

      // Display tap → enter edit mode for each field
      const wDisplay = this.el.querySelector('.weight-display');
      if (wDisplay) {
        wDisplay.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this._weightCtl) this._weightCtl.enterEditMode();
        });
      }
      const rDisplay = this.el.querySelector('.repssets-display');
      if (rDisplay) {
        rDisplay.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this._repsSetsCtl) this._repsSetsCtl.enterEditMode();
        });
      }

      // Rest field (bespoke inline edit)
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
        restInput.addEventListener('blur', () => exitRestEdit(true));
      }

      // Listen for change events emitted by the field controllers
      const weightFieldEl = this.el.querySelector('.workout-weight-field');
      if (weightFieldEl) {
        weightFieldEl.addEventListener('weightChanged', (e) => {
          const detail = e.detail || {};
          const newState = {
            weight: detail.weight != null ? String(detail.weight) : '',
            weightUnit: detail.unit || this.state.weightUnit || 'lbs',
          };
          Object.assign(this.state, newState);
          this._refreshWeightDisplay();
          this._fire('onChange', newState);
        });
      }
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

    _initFieldControllers() {
      const wEl = this.el.querySelector('.workout-weight-field');
      const rEl = this.el.querySelector('.workout-repssets-field');
      if (wEl && window.WeightFieldController) {
        try {
          this._weightCtl = new window.WeightFieldController(wEl, {
            exerciseName: this.name,
            sessionService: null, // Plan mode: no session
          });
        } catch (err) {
          console.warn('[StudioExerciseCard] WeightFieldController init failed:', err);
        }
      }
      if (rEl && window.RepsSetsFieldController) {
        try {
          this._repsSetsCtl = new window.RepsSetsFieldController(rEl, {
            exerciseName: this.name,
            sessionService: null,
          });
        } catch (err) {
          console.warn('[StudioExerciseCard] RepsSetsFieldController init failed:', err);
        }
      }
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
      const field = this.el.querySelector('.workout-weight-field');
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
        field.dataset.weightMode = unit === 'diy' ? 'text' : 'numeric';
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
