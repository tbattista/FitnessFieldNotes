/**
 * ExerciseTray — Workout Studio
 *
 * Manages the sticky chip row of selected exercises at the top of Page 1.
 * Each "+" tap on the selection grid appends another instance (multi-add).
 * The same exercise can appear multiple times; chips include an instance index.
 *
 * Events emitted via callbacks:
 *   - onChange(items): tray contents changed (add / remove / reorder / clear)
 *
 * Public methods:
 *   add(exercise)            -> push a new instance, returns the instance id
 *   remove(instanceId)       -> remove by instance id
 *   countFor(exerciseId)     -> how many instances of an exerciseId are in the tray
 *   getItems()               -> snapshot array
 *   clear()
 */

(function () {
  'use strict';

  class ExerciseTray {
    constructor({ root, chipsContainer, onChange, canRemove } = {}) {
      this.root = root;
      this.chipsContainer = chipsContainer;
      this.onChange = onChange || (() => {});
      // Optional gate consulted before any removal (chip X, remove(),
      // removeLastFor()). Lets the host block structure edits during a
      // live workout session without the tray knowing session details.
      this.canRemove = typeof canRemove === 'function' ? canRemove : (() => true);
      this.items = []; // { instanceId, exerciseId, name, exercise }
      this._instanceSeq = 1;

      if (this.chipsContainer) {
        this.chipsContainer.addEventListener('click', (e) => {
          const removeBtn = e.target.closest('.studio-tray-chip-remove');
          if (removeBtn) {
            const chip = removeBtn.closest('.studio-tray-chip');
            if (chip) this.remove(chip.dataset.instanceId);
          }
        });
      }

      this._render();
    }

    add(exercise) {
      if (!exercise) return null;
      const id = exercise.id || exercise.name;
      if (!id) return null;
      const instanceId = `tray-${this._instanceSeq++}`;
      this.items.push({
        instanceId,
        exerciseId: String(id),
        name: exercise.name || 'Exercise',
        exercise,
      });
      this._render();
      this._emit();
      return instanceId;
    }

    remove(instanceId) {
      if (!this.canRemove(instanceId)) return;
      const idx = this.items.findIndex((it) => it.instanceId === instanceId);
      if (idx === -1) return;
      this.items.splice(idx, 1);
      this._render();
      this._emit();
    }

    removeLastFor(exerciseId) {
      if (!this.canRemove(null)) return false;
      for (let i = this.items.length - 1; i >= 0; i--) {
        if (this.items[i].exerciseId === String(exerciseId)) {
          this.items.splice(i, 1);
          this._render();
          this._emit();
          return true;
        }
      }
      return false;
    }

    countFor(exerciseId) {
      const key = String(exerciseId);
      return this.items.reduce((n, it) => (it.exerciseId === key ? n + 1 : n), 0);
    }

    countsByExerciseId() {
      const out = new Map();
      for (const it of this.items) {
        out.set(it.exerciseId, (out.get(it.exerciseId) || 0) + 1);
      }
      return out;
    }

    getItems() {
      return this.items.slice();
    }

    size() {
      return this.items.length;
    }

    clear() {
      if (this.items.length === 0) return;
      this.items = [];
      this._render();
      this._emit();
    }

    _emit() {
      try {
        this.onChange(this.getItems());
      } catch (err) {
        console.error('[ExerciseTray] onChange handler threw:', err);
      }
    }

    _render() {
      if (!this.chipsContainer) return;
      const empty = this.items.length === 0;
      if (this.root) this.root.dataset.empty = empty ? 'true' : 'false';

      if (empty) {
        this.chipsContainer.innerHTML = '';
        return;
      }

      // Diff is overkill for v1; tray rarely has >20 items.
      this.chipsContainer.innerHTML = this.items
        .map((it) => this._renderChip(it))
        .join('');
    }

    _renderChip(item) {
      const safeName = this._escapeHtml(item.name);
      return `
        <span class="studio-tray-chip" role="listitem" data-instance-id="${item.instanceId}" data-exercise-id="${this._escapeAttr(item.exerciseId)}">
          <span class="studio-tray-chip-label">${safeName}</span>
          <button class="studio-tray-chip-remove" type="button" aria-label="Remove ${safeName}">&times;</button>
        </span>
      `;
    }

    _escapeHtml(s) {
      return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    _escapeAttr(s) {
      return this._escapeHtml(s);
    }
  }

  window.ExerciseTray = ExerciseTray;
})();
