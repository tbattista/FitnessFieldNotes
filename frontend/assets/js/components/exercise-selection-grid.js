/**
 * ExerciseSelectionGrid — Workout Studio
 *
 * Renders a compact, MFP-style list of exercises with a "+" button on each row.
 * The grid is data-source agnostic — the controller passes in an array of
 * exercise objects (already filtered/sorted) and the grid just paints them.
 *
 * Each row shows:
 *   - Bold title (exercise name)
 *   - Optional tier badge for Tier 1 / Foundational
 *   - Subtitle line: muscle group • equipment • optional tag
 *   - Circular "+" button with optional count badge when in the tray
 *
 * Callbacks:
 *   onAdd(exercise, rowEl)   -> row body or "+" was tapped; controller pushes to the tray
 *   onInfo(exercise)         -> info icon was tapped; controller opens the detail popup
 */

(function () {
  'use strict';

  class ExerciseSelectionGrid {
    constructor({ container, onAdd, onRowClick, onInfo } = {}) {
      this.container = container;
      this.onAdd = onAdd || (() => {});
      this.onRowClick = onRowClick || (() => {});
      this.onInfo = onInfo || (() => {});
      this.exercises = [];
      this.countsByExerciseId = new Map();

      if (this.container) {
        this.container.addEventListener('click', (e) => this._handleClick(e));
      }
    }

    setExercises(exercises) {
      this.exercises = Array.isArray(exercises) ? exercises : [];
      this._render();
    }

    setCounts(countsMap) {
      this.countsByExerciseId = countsMap instanceof Map ? countsMap : new Map();
      this._updateCountBadges();
    }

    _handleClick(e) {
      const row = e.target.closest('.studio-row');
      if (!row) return;
      const id = row.dataset.exerciseId;
      const exercise = this._findById(id);
      if (!exercise) return;

      // Info icon → open detail popup, swallow event so the row's add doesn't fire
      if (e.target.closest('.studio-row-info')) {
        e.stopPropagation();
        try { this.onInfo(exercise); }
        catch (err) { console.error('[ExerciseSelectionGrid] onInfo threw:', err); }
        return;
      }

      // Anything else on the row — the dedicated + button or the row body —
      // adds the exercise to the tray. Single behavior keeps multi-add
      // intuitive: tap the card again to add another instance.
      try { this.onAdd(exercise, row); }
      catch (err) { console.error('[ExerciseSelectionGrid] onAdd threw:', err); }
      row.classList.remove('is-added');
      // Force reflow to restart the bounce animation on repeat adds
      // eslint-disable-next-line no-unused-expressions
      row.offsetWidth;
      row.classList.add('is-added');
    }

    _findById(id) {
      if (!id) return null;
      return this.exercises.find((ex) => String(ex.id || ex.name) === String(id)) || null;
    }

    _render() {
      if (!this.container) return;
      if (this.exercises.length === 0) {
        this.container.innerHTML = '';
        return;
      }
      this.container.innerHTML = this.exercises.map((ex) => this._renderRow(ex)).join('');
      this._updateCountBadges();
    }

    _updateCountBadges() {
      if (!this.container) return;
      const rows = this.container.querySelectorAll('.studio-row');
      rows.forEach((row) => {
        const id = row.dataset.exerciseId;
        const count = this.countsByExerciseId.get(id) || 0;
        const btn = row.querySelector('.studio-row-add');
        const badge = row.querySelector('.studio-row-add-badge');
        if (!btn || !badge) return;
        if (count > 0) {
          btn.classList.add('has-count');
          badge.textContent = count;
          badge.style.display = '';
        } else {
          btn.classList.remove('has-count');
          badge.style.display = 'none';
        }
      });
    }

    _renderRow(exercise) {
      const id = String(exercise.id || exercise.name || '');
      const name = this._escape(exercise.name || 'Unnamed');
      const muscle = this._escape(exercise.targetMuscleGroup || '');
      const equipment = this._escape(exercise.primaryEquipment || '');
      const mechanics = this._escape(exercise.mechanics || '');

      const subtitleParts = [];
      if (muscle) subtitleParts.push(muscle);
      if (equipment) subtitleParts.push(equipment);
      if (mechanics) subtitleParts.push(mechanics);
      const subtitle = subtitleParts.join(' • ');

      const isFoundational = exercise.exerciseTier === 1 || exercise.isFoundational === true;
      const tierBadge = isFoundational
        ? '<span class="studio-row-tier-badge" title="Foundational" aria-label="Foundational">★</span>'
        : '';

      return `
        <div class="studio-row" role="listitem" data-exercise-id="${this._escapeAttr(id)}">
          <div class="studio-row-body">
            <div class="studio-row-title">
              ${tierBadge}
              <span>${name}</span>
            </div>
            <div class="studio-row-subtitle">${subtitle}</div>
          </div>
          <button class="studio-row-info" type="button" aria-label="View details for ${name}" title="Details">
            <i class="bx bx-info-circle"></i>
          </button>
          <button class="studio-row-add" type="button" aria-label="Add ${name} to tray">
            <i class="bx bx-plus"></i>
            <span class="studio-row-add-badge" style="display: none;"></span>
          </button>
        </div>
      `;
    }

    _escape(s) {
      return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    _escapeAttr(s) {
      return this._escape(s);
    }
  }

  window.ExerciseSelectionGrid = ExerciseSelectionGrid;
})();
