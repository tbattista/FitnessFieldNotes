/**
 * StudioNoteCard — Workout Studio Page 2 free-text note card
 *
 * Sits between exercise cards / blocks in the organize list. Backed by the
 * existing TemplateNote model (id, content ≤500 chars, order_index).
 *
 * Public events (via callbacks):
 *   - onChange(noteId, partial)   { content }
 *   - onMenuAction(noteId, action) — 'move-up' | 'move-down' | 'delete'
 */

(function () {
  'use strict';

  const MAX_CONTENT = 500;

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  class StudioNoteCard {
    constructor({ noteId, content, callbacks } = {}) {
      this.noteId = noteId;
      this.content = String(content || '');
      this.callbacks = callbacks || {};
      this.el = null;
      this._handleDocClickForMenu = null;
    }

    render() {
      const tpl = document.createElement('div');
      tpl.innerHTML = this._templateHtml();
      this.el = tpl.firstElementChild;
      this._bindEvents();
      this._autosizeTextarea();
      return this.el;
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

    _templateHtml() {
      const safeId = escapeHtml(this.noteId);
      const safeContent = escapeHtml(this.content);
      return `
        <div class="studio-note-card" role="listitem" data-note-id="${safeId}">
          <span class="studio-note-icon" aria-hidden="true"><i class="bx bx-note"></i></span>
          <textarea class="studio-note-textarea"
                    placeholder="Type a note (e.g. focus on form, drop set on final rep)"
                    maxlength="${MAX_CONTENT}"
                    rows="1"
                    aria-label="Workout note">${safeContent}</textarea>
          <div class="studio-note-menu-wrap">
            <button class="studio-note-icon-btn"
                    data-action="menu" type="button"
                    aria-haspopup="true" aria-expanded="false"
                    aria-label="Note actions" title="More">
              <i class="bx bx-dots-vertical-rounded"></i>
            </button>
            <div class="studio-note-menu" role="menu" hidden>
              <button class="studio-note-menu-item" role="menuitem" data-action="move-up" type="button">
                <i class="bx bx-up-arrow-alt"></i> Move up
              </button>
              <button class="studio-note-menu-item" role="menuitem" data-action="move-down" type="button">
                <i class="bx bx-down-arrow-alt"></i> Move down
              </button>
              <button class="studio-note-menu-item studio-note-menu-item-danger"
                      role="menuitem" data-action="delete" type="button">
                <i class="bx bx-trash"></i> Remove note
              </button>
            </div>
          </div>
        </div>
      `;
    }

    _bindEvents() {
      if (!this.el) return;

      const textarea = this.el.querySelector('.studio-note-textarea');
      if (textarea) {
        textarea.addEventListener('input', (e) => {
          this.content = String(e.target.value || '').slice(0, MAX_CONTENT);
          this._autosizeTextarea();
          this._fire('onChange', { content: this.content });
        });
      }

      const menuBtn = this.el.querySelector('[data-action="menu"]');
      const menu = this.el.querySelector('.studio-note-menu');
      if (menuBtn && menu) {
        menuBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._toggleMenu(!menu.hidden);
        });
        menu.addEventListener('click', (e) => {
          const item = e.target.closest('.studio-note-menu-item');
          if (!item) return;
          e.stopPropagation();
          const action = item.dataset.action;
          this._toggleMenu(true); // close
          if (action) this._fire('onMenuAction', action);
        });
        this._handleDocClickForMenu = (e) => {
          if (!menu.hidden && !this.el.contains(e.target)) this._toggleMenu(true);
        };
        document.addEventListener('click', this._handleDocClickForMenu);
      }
    }

    _toggleMenu(forceClose) {
      const menu = this.el && this.el.querySelector('.studio-note-menu');
      const btn = this.el && this.el.querySelector('[data-action="menu"]');
      if (!menu || !btn) return;
      const open = forceClose ? false : menu.hidden;
      menu.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    _autosizeTextarea() {
      const ta = this.el && this.el.querySelector('.studio-note-textarea');
      if (!ta) return;
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(ta.scrollHeight, 240)}px`;
    }

    _fire(name, ...args) {
      const fn = this.callbacks && this.callbacks[name];
      if (typeof fn !== 'function') return;
      try { fn(this.noteId, ...args); }
      catch (err) { console.error(`[StudioNoteCard] ${name} callback threw:`, err); }
    }
  }

  window.StudioNoteCard = StudioNoteCard;
})();
