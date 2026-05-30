/**
 * StudioReorderSheet — Workout Studio Page 2 reorder UI
 *
 * Opens a bottom offcanvas containing a compact two-level list of the current
 * organize structure (top-level cards + blocks with their child cards).
 * SortableJS handles drag-and-drop:
 *   - Top-level container: reorder cards AND blocks
 *   - Block children container: reorder cards within
 *   - Cards can move between top-level and any block (group: 'sr-cards')
 *   - Blocks can only move at the top level (enforced in onMove)
 *
 * Lifecycle:
 *   open(snapshot) — populates the sheet and shows the offcanvas
 *   On Save: walks the rebuilt DOM, computes new organizeOrder + per-block
 *   instanceIds, fires onSave(newState), closes.
 *   On Cancel / dismiss: closes without calling onSave (sheet DOM is discarded).
 */

(function () {
  'use strict';

  const SORTABLE_CDN = 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.1/Sortable.min.js';

  async function loadSortableJS() {
    if (window.Sortable) return;
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${SORTABLE_CDN}"]`);
      if (existing) {
        existing.addEventListener('load', resolve);
        existing.addEventListener('error', reject);
        return;
      }
      const script = document.createElement('script');
      script.src = SORTABLE_CDN;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Failed to load SortableJS'));
      document.head.appendChild(script);
    });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  class StudioReorderSheet {
    constructor({ onSave } = {}) {
      this.onSave = typeof onSave === 'function' ? onSave : () => {};
      this.el = null;
      this.bsOffcanvas = null;
      this._sortables = [];
      this._didSave = false;
    }

    /**
     * Open the sheet with a snapshot of the current organize structure.
     * snapshot: {
     *   organizeOrder: Array<{ kind:'card'|'block', instanceId?, blockId? }>,
     *   blocks: Map<blockId, { name, instanceIds: string[] }>,
     *   items: Array<{ instanceId, name }>   (from tray.getItems())
     * }
     */
    async open(snapshot) {
      this._didSave = false;
      // Build a name lookup so the sheet can label rows
      const nameByInstanceId = new Map();
      for (const it of snapshot.items || []) nameByInstanceId.set(it.instanceId, it.name);

      this._mount();
      this._populate(snapshot, nameByInstanceId);
      this._show();

      try {
        await loadSortableJS();
        this._initSortables();
      } catch (err) {
        console.error('[StudioReorderSheet] SortableJS failed to load:', err);
        const status = this.el && this.el.querySelector('.studio-reorder-status');
        if (status) {
          status.textContent = 'Could not load drag-and-drop. Reload and try again.';
          status.classList.add('is-error');
        }
      }
    }

    close() {
      if (this.bsOffcanvas) {
        try { this.bsOffcanvas.hide(); } catch (e) { /* noop */ }
      } else {
        this._teardown();
      }
    }

    // ---------------- internals ----------------

    _mount() {
      if (this.el) return; // already mounted
      const wrap = document.createElement('div');
      wrap.innerHTML = this._templateHtml();
      this.el = wrap.firstElementChild;
      document.body.appendChild(this.el);

      this.el.querySelector('[data-action="save"]').addEventListener('click', () => this._commit());
      this.el.querySelector('[data-action="cancel"]').addEventListener('click', () => this.close());
      this.el.addEventListener('hidden.bs.offcanvas', () => this._teardown());
    }

    _show() {
      if (window.bootstrap && window.bootstrap.Offcanvas) {
        this.bsOffcanvas = window.bootstrap.Offcanvas.getOrCreateInstance(this.el);
        this.bsOffcanvas.show();
      } else {
        // Fallback for environments without Bootstrap available (tests)
        this.el.classList.add('show');
        this.el.style.visibility = 'visible';
      }
    }

    _teardown() {
      this._destroySortables();
      if (this.el && this.el.parentElement) {
        this.el.parentElement.removeChild(this.el);
      }
      this.el = null;
      this.bsOffcanvas = null;
    }

    _destroySortables() {
      for (const s of this._sortables) {
        try { s.destroy(); } catch (e) { /* noop */ }
      }
      this._sortables = [];
    }

    _templateHtml() {
      return `
        <div class="offcanvas offcanvas-bottom studio-reorder-sheet" tabindex="-1"
             aria-labelledby="studioReorderTitle"
             data-bs-scroll="true">
          <div class="offcanvas-header studio-reorder-header">
            <h5 class="offcanvas-title" id="studioReorderTitle">Reorder</h5>
            <button type="button" class="btn-close" data-action="cancel" aria-label="Close"></button>
          </div>
          <div class="offcanvas-body studio-reorder-body">
            <p class="studio-reorder-hint">
              Drag the handle to reorder. Drop a card into a block to group it.
            </p>
            <div class="studio-reorder-list" id="studioReorderList" role="list"></div>
            <div class="studio-reorder-status" role="status" aria-live="polite"></div>
          </div>
          <div class="offcanvas-footer studio-reorder-footer">
            <button type="button" class="btn btn-outline-secondary" data-action="cancel">Cancel</button>
            <button type="button" class="btn btn-primary" data-action="save">Save Order</button>
          </div>
        </div>
      `;
    }

    _populate(snapshot, nameByInstanceId) {
      const listEl = this.el.querySelector('#studioReorderList');
      const order = Array.isArray(snapshot.organizeOrder) ? snapshot.organizeOrder : [];
      const blocks = snapshot.blocks || new Map();

      const parts = [];
      for (const entry of order) {
        if (entry.kind === 'card') {
          parts.push(this._cardRowHtml(entry.instanceId, nameByInstanceId.get(entry.instanceId)));
        } else if (entry.kind === 'block') {
          const block = blocks.get(entry.blockId);
          if (!block) continue;
          parts.push(this._blockRowHtml(entry.blockId, block, nameByInstanceId));
        }
      }
      listEl.innerHTML = parts.join('') || `
        <div class="studio-reorder-empty">No exercises to reorder.</div>
      `;
    }

    _cardRowHtml(instanceId, name) {
      const safeId = escapeHtml(instanceId);
      const safeName = escapeHtml(name || 'Exercise');
      return `
        <div class="studio-reorder-row studio-reorder-card-row"
             role="listitem"
             data-type="card"
             data-instance-id="${safeId}">
          <span class="studio-reorder-handle" aria-hidden="true"><i class="bx bx-menu"></i></span>
          <span class="studio-reorder-row-label">${safeName}</span>
        </div>
      `;
    }

    _blockRowHtml(blockId, block, nameByInstanceId) {
      const safeBlockId = escapeHtml(blockId);
      const safeName = escapeHtml(block.name || 'Block');
      const childRows = (block.instanceIds || [])
        .map((iid) => this._cardRowHtml(iid, nameByInstanceId.get(iid)))
        .join('');
      return `
        <div class="studio-reorder-row studio-reorder-block-row"
             role="listitem"
             data-type="block"
             data-block-id="${safeBlockId}">
          <div class="studio-reorder-block-header">
            <span class="studio-reorder-handle" aria-hidden="true"><i class="bx bx-menu"></i></span>
            <span class="studio-reorder-block-icon" aria-hidden="true"><i class="bx bx-collection"></i></span>
            <span class="studio-reorder-row-label studio-reorder-block-label">${safeName}</span>
          </div>
          <div class="studio-reorder-block-children" data-block-id="${safeBlockId}">
            ${childRows}
          </div>
        </div>
      `;
    }

    _initSortables() {
      if (!window.Sortable || !this.el) return;
      const topEl = this.el.querySelector('#studioReorderList');
      if (!topEl) return;

      const baseOpts = {
        animation: 150,
        handle: '.studio-reorder-handle',
        draggable: '.studio-reorder-row',
        ghostClass: 'studio-reorder-ghost',
        chosenClass: 'studio-reorder-chosen',
        forceFallback: true,
        fallbackClass: 'studio-reorder-fallback',
        fallbackOnBody: true,
      };

      const top = window.Sortable.create(topEl, Object.assign({}, baseOpts, {
        group: { name: 'sr-mixed', pull: true, put: true },
        onMove: (evt) => {
          // Prevent blocks from being dropped into a block's children container
          const dragged = evt.dragged;
          const toEl = evt.to;
          if (dragged && dragged.dataset.type === 'block') {
            if (!toEl.classList.contains('studio-reorder-list')) return false;
          }
          return true;
        },
      }));
      this._sortables.push(top);

      const blockChildEls = this.el.querySelectorAll('.studio-reorder-block-children');
      blockChildEls.forEach((childEl) => {
        const inner = window.Sortable.create(childEl, Object.assign({}, baseOpts, {
          group: { name: 'sr-mixed', pull: true, put: true },
          // Block-children container only accepts cards
          onMove: (evt) => {
            const dragged = evt.dragged;
            if (dragged && dragged.dataset.type === 'block') return false;
            return true;
          },
        }));
        this._sortables.push(inner);
      });
    }

    /** Walk the rebuilt DOM and emit the new organize state to the caller. */
    _commit() {
      const listEl = this.el && this.el.querySelector('#studioReorderList');
      if (!listEl) return;

      const newOrder = [];
      const blockUpdates = new Map(); // blockId -> new instanceIds[]

      for (const child of Array.from(listEl.children)) {
        const type = child.dataset.type;
        if (type === 'card') {
          const iid = child.dataset.instanceId;
          if (iid) newOrder.push({ kind: 'card', instanceId: iid });
        } else if (type === 'block') {
          const blockId = child.dataset.blockId;
          if (!blockId) continue;
          const childContainer = child.querySelector('.studio-reorder-block-children');
          const newInstanceIds = [];
          if (childContainer) {
            for (const grand of Array.from(childContainer.children)) {
              if (grand.dataset.type === 'card' && grand.dataset.instanceId) {
                newInstanceIds.push(grand.dataset.instanceId);
              }
            }
          }
          blockUpdates.set(blockId, newInstanceIds);
          newOrder.push({ kind: 'block', blockId });
        }
      }

      this._didSave = true;
      try {
        this.onSave({ organizeOrder: newOrder, blockInstanceIds: blockUpdates });
      } catch (err) {
        console.error('[StudioReorderSheet] onSave callback threw:', err);
      }
      this.close();
    }
  }

  window.StudioReorderSheet = StudioReorderSheet;
})();
