/**
 * StudioBlock — Workout Studio Page 2 block container
 *
 * Renders a named container that groups multiple exercise cards. The block
 * itself is structural — the actual child cards (StudioExerciseCard) are
 * mounted into the block's child slot by the controller.
 *
 * Header layout:
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ ▤ <name input>                       ⋮                   │
 *   └──────────────────────────────────────────────────────────┘
 *   └ children slot ──────────────────────────────────────────┘
 *
 * Public events (via callbacks):
 *   - onRename(blockId, name)             — name input committed
 *   - onMenuAction(blockId, action)       — 'move-up' | 'move-down' | 'delete' | 'rename'
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

  class StudioBlock {
    constructor({ blockId, name, callbacks, readOnly = false } = {}) {
      this.blockId = blockId;
      this.name = name || '';
      this.callbacks = callbacks || {};
      // readOnly = the live Log session. Blocks are structural and can't be
      // renamed/reordered/removed mid-session (those ops are gated anyway),
      // so we render the name as a static label with no edit input and no
      // 3-dot menu — matching workout-mode's non-editable execution chrome.
      this.readOnly = !!readOnly;
      this.el = null;
      this.childrenSlot = null;
      this._handleDocClickForMenu = null;
    }

    render() {
      const tpl = document.createElement('div');
      tpl.innerHTML = this._templateHtml();
      this.el = tpl.firstElementChild;
      this.childrenSlot = this.el.querySelector('.studio-block-children');
      this._bindEvents();
      return this.el;
    }

    /** Returns the DOM node that child cards should be appended to. */
    getChildrenSlot() {
      return this.childrenSlot;
    }

    /** Update header position controls (Move up/down enable/disable). */
    setIndex(index, total) {
      if (!this.el) return;
      this.el.dataset.index = String(index);
      this.el.dataset.total = String(total);
      const up = this.el.querySelector('[data-action="move-up"]');
      const down = this.el.querySelector('[data-action="move-down"]');
      if (up) up.toggleAttribute('disabled', index <= 0);
      if (down) down.toggleAttribute('disabled', index >= total - 1);
    }

    /** Update the empty-state class so CSS can show the placeholder when no children. */
    setChildCount(n) {
      if (!this.el) return;
      this.el.classList.toggle('is-empty', n === 0);
      const placeholder = this.el.querySelector('.studio-block-placeholder');
      if (placeholder) placeholder.hidden = n > 0;
    }

    destroy() {
      if (this._handleDocClickForMenu) {
        document.removeEventListener('click', this._handleDocClickForMenu);
        this._handleDocClickForMenu = null;
      }
      if (this.el && this.el.parentElement) this.el.parentElement.removeChild(this.el);
      this.el = null;
      this.childrenSlot = null;
    }

    // ---------------- private ----------------

    _templateHtml() {
      const safeId = escapeHtml(this.blockId);
      const safeName = escapeHtml(this.name);
      const roClass = this.readOnly ? ' studio-block--readonly' : '';
      // Read-only (Log): static name label, no input, no 3-dot menu.
      const nameHtml = this.readOnly
        ? `<span class="studio-block-name-static">${safeName || 'Block'}</span>`
        : `<input class="studio-block-name-input"
                   type="text"
                   value="${safeName}"
                   placeholder="Block name (e.g. Warmup)"
                   maxlength="40"
                   aria-label="Block name" />`;
      const menuHtml = this.readOnly ? '' : `
            <div class="studio-block-menu-wrap">
              <button class="studio-block-icon-btn" data-action="menu" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Block actions" title="More">
                <i class="bx bx-dots-vertical-rounded"></i>
              </button>
              <div class="studio-block-menu" role="menu" hidden>
                <button class="studio-block-menu-item" role="menuitem" data-action="rename" type="button">
                  <i class="bx bx-edit"></i> Rename
                </button>
                <button class="studio-block-menu-item" role="menuitem" data-action="move-up" type="button">
                  <i class="bx bx-up-arrow-alt"></i> Move up
                </button>
                <button class="studio-block-menu-item" role="menuitem" data-action="move-down" type="button">
                  <i class="bx bx-down-arrow-alt"></i> Move down
                </button>
                <button class="studio-block-menu-item studio-block-menu-item-danger" role="menuitem" data-action="delete" type="button">
                  <i class="bx bx-trash"></i> Remove block
                </button>
              </div>
            </div>`;
      return `
        <div class="studio-block is-empty${roClass}" role="group" data-block-id="${safeId}">
          <div class="studio-block-header">
            <span class="studio-block-icon" aria-hidden="true"><i class="bx bx-collection"></i></span>
            ${nameHtml}
            ${menuHtml}
          </div>
          <div class="studio-block-children" role="list">
            <!-- Child StudioExerciseCard nodes appended here by controller -->
          </div>
          <div class="studio-block-placeholder">
            Empty block — use a card's “Move to block” menu to add exercises.
          </div>
        </div>
      `;
    }

    _bindEvents() {
      if (!this.el) return;

      const input = this.el.querySelector('.studio-block-name-input');
      if (input) {
        const commit = () => {
          const v = String(input.value || '').trim();
          if (v !== this.name) {
            this.name = v;
            this._fire('onRename', v);
          }
        };
        input.addEventListener('blur', commit);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            input.blur();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            input.value = this.name;
            input.blur();
          }
        });
      }

      const menuBtn = this.el.querySelector('[data-action="menu"]');
      const menu = this.el.querySelector('.studio-block-menu');
      if (menuBtn && menu) {
        menuBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._toggleMenu(!menu.hidden);
        });
        menu.addEventListener('click', (e) => {
          const item = e.target.closest('.studio-block-menu-item');
          if (!item) return;
          e.stopPropagation();
          const action = item.dataset.action;
          this._toggleMenu(true); // close
          if (action === 'rename') {
            if (input) { input.focus(); input.select(); }
            return;
          }
          if (action) this._fire('onMenuAction', action);
        });
        this._handleDocClickForMenu = (e) => {
          if (!menu.hidden && !this.el.contains(e.target)) this._toggleMenu(true);
        };
        document.addEventListener('click', this._handleDocClickForMenu);
      }
    }

    _toggleMenu(forceClose) {
      const menu = this.el && this.el.querySelector('.studio-block-menu');
      const btn = this.el && this.el.querySelector('[data-action="menu"]');
      if (!menu || !btn) return;
      const open = forceClose ? false : menu.hidden;
      menu.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    _fire(name, ...args) {
      const fn = this.callbacks && this.callbacks[name];
      if (typeof fn !== 'function') return;
      try { fn(this.blockId, ...args); }
      catch (err) { console.error(`[StudioBlock] ${name} callback threw:`, err); }
    }
  }

  window.StudioBlock = StudioBlock;
})();
