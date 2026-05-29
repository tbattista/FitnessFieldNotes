/**
 * WorkoutStudioController — Phase 1, Commit 1 (Foundation + live exercise list)
 *
 * Orchestrates the unified workout-studio page:
 *   - Persistent header (back, workout-name picker, Plan/Log mode toggle)
 *   - Sticky tray chip row (ExerciseTray)
 *   - Page 1 Select view: search, tab strip (History / My Exercises / All Exercises),
 *     quick-action tiles (stubs in this commit), and a compact exercise list
 *     (ExerciseSelectionGrid) sourced from window.exerciseCacheService.
 *
 * Out of scope for this commit (per the approved plan):
 *   - Inline "Pairs well with…" suggestions
 *   - Page 2 (Organize & Log) implementation
 *   - Activity sheet, Custom Exercise inline-add, Quick Add
 *   - Save / Continue persistence
 */

(function () {
  'use strict';

  const LIST_LIMIT = 60;
  const DEFAULT_SETS = '3';
  const DEFAULT_REPS = '8-12';
  const DEFAULT_REST = '60s';

  class WorkoutStudioController {
    constructor() {
      this.dom = {};
      this.tray = null;
      this.grid = null;
      this.searchQuery = '';
      this.mode = 'plan'; // 'plan' | 'log'
      this.allExercises = [];
      this.customExercises = [];
      this.favoriteIds = new Set();
      this._searchDebounceTimer = null;
      this.currentView = 'select'; // 'select' | 'organize'
      // Per-tray-instance editor state for Page 2:
      //   key = instanceId, value = { sets, reps, rest, weight, weightUnit }
      this.organizeState = new Map();
      // Live card components mounted on Page 2, keyed by instanceId
      this.studioCards = new Map();
      this.workoutName = '';
      this._saveInFlight = false;
    }

    init() {
      this._cacheDom();
      if (!this.dom.studio) return; // not on this page

      this._initTray();
      this._initGrid();
      this._bindHeader();
      this._bindSearch();
      this._bindQuickTiles();
      this._bindContinue();
      this._bindOrganize();

      this._loadExercises().catch((err) => {
        console.error('[WorkoutStudio] Failed to load exercises:', err);
        this._showEmpty('Could not load exercises. Try reloading.');
      });

      console.log('🎬 Workout Studio controller ready');
    }

    _cacheDom() {
      this.dom.studio = document.getElementById('studio');
      this.dom.workoutNameInput = document.getElementById('studioWorkoutNameInput');
      this.dom.modePlanBtn = document.getElementById('studioModePlan');
      this.dom.modeLogBtn = document.getElementById('studioModeLog');

      this.dom.tray = document.getElementById('studioTray');
      this.dom.trayChips = document.getElementById('studioTrayChips');

      this.dom.searchInput = document.getElementById('studioSearchInput');
      this.dom.searchClear = document.getElementById('studioSearchClear');

      this.dom.quickTiles = document.querySelectorAll('.studio-quick-tile');

      this.dom.sectionTitle = document.getElementById('studioSectionTitle');
      this.dom.list = document.getElementById('studioList');
      this.dom.empty = document.getElementById('studioEmpty');
      this.dom.emptyText = document.getElementById('studioEmptyText');

      this.dom.continueCta = document.getElementById('studioContinueCta');
      this.dom.continueBtn = document.getElementById('studioContinueBtn');
      this.dom.continueCount = document.getElementById('studioContinueCount');

      // Page 2 (Organize) elements
      this.dom.viewSelect = document.getElementById('studioViewSelect');
      this.dom.viewOrganize = document.getElementById('studioViewOrganize');
      this.dom.organizeList = document.getElementById('studioOrganizeList');
      this.dom.organizeCount = document.getElementById('studioOrganizeCount');
      this.dom.organizeEmpty = document.getElementById('studioOrganizeEmpty');
      this.dom.organizeBackBtn = document.getElementById('studioOrganizeBack');
      this.dom.saveBtn = document.getElementById('studioSaveBtn');
      this.dom.organizeStatus = document.getElementById('studioOrganizeStatus');
    }

    _initTray() {
      if (!window.ExerciseTray) {
        console.error('[WorkoutStudio] ExerciseTray component missing');
        return;
      }
      this.tray = new window.ExerciseTray({
        root: this.dom.tray,
        chipsContainer: this.dom.trayChips,
        onChange: (items) => this._onTrayChange(items),
      });
    }

    _initGrid() {
      if (!window.ExerciseSelectionGrid) {
        console.error('[WorkoutStudio] ExerciseSelectionGrid component missing');
        return;
      }
      this.grid = new window.ExerciseSelectionGrid({
        container: this.dom.list,
        onAdd: (exercise) => this._onAddExercise(exercise),
        // onRowClick: open detail view in a later commit
      });
    }

    _bindHeader() {
      if (this.dom.workoutNameInput) {
        this.dom.workoutNameInput.addEventListener('input', (e) => {
          this.workoutName = String(e.target.value || '').trim();
        });
      }

      [this.dom.modePlanBtn, this.dom.modeLogBtn].forEach((btn) => {
        if (!btn) return;
        btn.addEventListener('click', () => this._setMode(btn.dataset.mode));
      });
    }

    _setMode(mode) {
      if (mode !== 'plan' && mode !== 'log') return;
      this.mode = mode;
      if (this.dom.modePlanBtn) {
        this.dom.modePlanBtn.classList.toggle('is-active', mode === 'plan');
        this.dom.modePlanBtn.setAttribute('aria-pressed', mode === 'plan' ? 'true' : 'false');
      }
      if (this.dom.modeLogBtn) {
        this.dom.modeLogBtn.classList.toggle('is-active', mode === 'log');
        this.dom.modeLogBtn.setAttribute('aria-pressed', mode === 'log' ? 'true' : 'false');
      }
    }

    _bindSearch() {
      if (!this.dom.searchInput) return;
      this.dom.searchInput.addEventListener('input', (e) => {
        const q = String(e.target.value || '').trim();
        this.searchQuery = q;
        if (this.dom.searchClear) {
          this.dom.searchClear.style.display = q ? '' : 'none';
        }
        clearTimeout(this._searchDebounceTimer);
        this._searchDebounceTimer = setTimeout(() => this._refreshList(), 120);
      });

      if (this.dom.searchClear) {
        this.dom.searchClear.addEventListener('click', () => {
          this.dom.searchInput.value = '';
          this.searchQuery = '';
          this.dom.searchClear.style.display = 'none';
          this._refreshList();
          this.dom.searchInput.focus();
        });
      }
    }

    _bindQuickTiles() {
      this.dom.quickTiles.forEach((tile) => {
        tile.addEventListener('click', () => {
          const action = tile.dataset.action;
          // Stubs in this commit; future commits wire these up.
          console.log(`[WorkoutStudio] Quick tile tapped: ${action} (handler coming soon)`);
        });
      });
    }

    _bindContinue() {
      if (!this.dom.continueBtn) return;
      this.dom.continueBtn.addEventListener('click', () => {
        if (!this.tray || this.tray.size() === 0) return;
        this._showView('organize');
      });
    }

    _bindOrganize() {
      if (this.dom.organizeBackBtn) {
        this.dom.organizeBackBtn.addEventListener('click', () => this._showView('select'));
      }

      // Per-card field edits and removals are handled by StudioExerciseCard
      // via the callbacks wired in _renderOrganize().

      if (this.dom.saveBtn) {
        this.dom.saveBtn.addEventListener('click', () => this._handleSave());
      }
    }

    _showView(view) {
      if (view !== 'select' && view !== 'organize') return;
      // Guard: can't open organize with an empty tray
      if (view === 'organize' && (!this.tray || this.tray.size() === 0)) {
        return;
      }
      this.currentView = view;
      if (this.dom.studio) this.dom.studio.dataset.view = view;

      // Toggle the `hidden` HTML attribute explicitly so the UA's
      // display: none doesn't fight our CSS data-view rules.
      if (this.dom.viewSelect)   this.dom.viewSelect.hidden   = view !== 'select';
      if (this.dom.viewOrganize) this.dom.viewOrganize.hidden = view !== 'organize';

      if (view === 'organize') {
        this._renderOrganize();
        // If the workout has no name yet, nudge the user to fill the slim
        // header input before saving.
        if (!this.workoutName && this.dom.workoutNameInput) {
          setTimeout(() => this.dom.workoutNameInput.focus(), 150);
        }
      }
      this._setStatus('', null);
    }

    _renderOrganize() {
      if (!this.dom.organizeList || !this.tray) return;
      const items = this.tray.getItems();

      if (this.dom.organizeCount) {
        this.dom.organizeCount.textContent = items.length === 1
          ? '1 exercise'
          : `${items.length} exercises`;
      }
      if (items.length === 0) {
        this._destroyAllCards();
        this.dom.organizeList.innerHTML = '';
        if (this.dom.organizeEmpty) this.dom.organizeEmpty.hidden = false;
        if (this.dom.saveBtn) this.dom.saveBtn.disabled = true;
        return;
      }
      if (this.dom.organizeEmpty) this.dom.organizeEmpty.hidden = true;
      if (this.dom.saveBtn) this.dom.saveBtn.disabled = false;

      // Diff: drop cards no longer in the tray, rebuild from scratch in order.
      // The card count is small (typical workout is <20 exercises), so a full
      // rebuild is simpler and avoids stale field-controller bindings.
      this._destroyAllCards();
      this.dom.organizeList.innerHTML = '';

      items.forEach((item, idx) => {
        const state = this._ensureOrganizeState(item.instanceId);
        const card = new window.StudioExerciseCard({
          instanceId: item.instanceId,
          name: item.name,
          state,
          callbacks: {
            onChange: (instanceId, partial) => this._onCardChange(instanceId, partial),
            onPencil: (instanceId) => this._onPencil(instanceId),
            onMenuAction: (instanceId, action) => this._onCardMenuAction(instanceId, action),
          },
        });
        const node = card.render();
        this.dom.organizeList.appendChild(node);
        card.setIndex(idx, items.length);
        this.studioCards.set(item.instanceId, card);
      });
    }

    _destroyAllCards() {
      this.studioCards.forEach((c) => c.destroy && c.destroy());
      this.studioCards.clear();
    }

    _ensureOrganizeState(instanceId) {
      let state = this.organizeState.get(instanceId);
      if (!state) {
        state = {
          sets: DEFAULT_SETS,
          reps: DEFAULT_REPS,
          rest: DEFAULT_REST,
          weight: '',
          weightUnit: 'lbs',
        };
        this.organizeState.set(instanceId, state);
      } else {
        // Backfill defaults if any were missing
        if (state.sets == null) state.sets = DEFAULT_SETS;
        if (state.reps == null) state.reps = DEFAULT_REPS;
        if (state.rest == null) state.rest = DEFAULT_REST;
        if (state.weight == null) state.weight = '';
        if (state.weightUnit == null) state.weightUnit = 'lbs';
      }
      return state;
    }

    _onCardChange(instanceId, partial) {
      const state = this._ensureOrganizeState(instanceId);
      Object.assign(state, partial || {});
      this.organizeState.set(instanceId, state);
    }

    _onCardMenuAction(instanceId, action) {
      if (!this.tray) return;
      const items = this.tray.getItems();
      const idx = items.findIndex((it) => it.instanceId === instanceId);
      if (idx === -1) return;

      switch (action) {
        case 'move-up':
          if (idx > 0) this._reorderTray(idx, idx - 1);
          break;
        case 'move-down':
          if (idx < items.length - 1) this._reorderTray(idx, idx + 1);
          break;
        case 'duplicate': {
          const src = items[idx];
          if (this.tray && src && src.exercise) this.tray.add(src.exercise);
          break;
        }
        case 'delete':
          this.tray.remove(instanceId);
          break;
      }
    }

    _reorderTray(fromIdx, toIdx) {
      if (!this.tray || !Array.isArray(this.tray.items)) return;
      const items = this.tray.items;
      if (fromIdx < 0 || fromIdx >= items.length || toIdx < 0 || toIdx >= items.length) return;
      const [moved] = items.splice(fromIdx, 1);
      items.splice(toIdx, 0, moved);
      // Re-render Page 2 and notify the tray so chips and Page 1 badges sync
      this._renderOrganize();
      if (typeof this.tray._emit === 'function') this.tray._emit();
      if (typeof this.tray._render === 'function') this.tray._render();
    }

    _onPencil(instanceId) {
      const item = this.tray && this.tray.getItems().find((it) => it.instanceId === instanceId);
      if (!item) return;
      const state = this._ensureOrganizeState(instanceId);

      const config = {
        groupId: instanceId,
        exercises: { a: item.name },
        sets: state.sets || DEFAULT_SETS,
        reps: state.reps || DEFAULT_REPS,
        rest: state.rest || DEFAULT_REST,
        weight: state.weight || '',
        weightUnit: state.weightUnit || 'lbs',
        isNew: false,
        mode: 'single',
      };

      const onSave = (groupData) => {
        if (!groupData) return;
        const next = {};
        if (groupData.exercises && groupData.exercises.a) {
          item.name = groupData.exercises.a;
          // The tray chip label is derived from item.name; re-render the chip row.
          if (this.tray && typeof this.tray._render === 'function') this.tray._render();
        }
        if (groupData.sets != null) next.sets = String(groupData.sets);
        if (groupData.reps != null) next.reps = String(groupData.reps);
        if (groupData.rest != null) next.rest = String(groupData.rest);
        if (groupData.default_weight != null) next.weight = String(groupData.default_weight);
        if (groupData.default_weight_unit) next.weightUnit = groupData.default_weight_unit;
        this._onCardChange(instanceId, next);
        // Refresh the card preview so the inline display matches
        const card = this.studioCards.get(instanceId);
        if (card) {
          card.name = item.name;
          card.setState(next);
        }
      };
      const onDelete = () => {
        if (this.tray) this.tray.remove(instanceId);
      };

      const factory = window.UnifiedOffcanvasFactory;
      if (factory && typeof factory.createExerciseGroupEditor === 'function') {
        factory.createExerciseGroupEditor(config, onSave, onDelete);
      } else {
        console.warn('[WorkoutStudio] UnifiedOffcanvasFactory not loaded; pencil edit is no-op until offcanvas module is available');
      }
    }

    _escape(s) {
      return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    _buildSavePayload() {
      const items = this.tray ? this.tray.getItems() : [];
      const sections = items.map((it, idx) => {
        const state = this.organizeState.get(it.instanceId) || {};
        const ex = it.exercise || {};
        return {
          section_id: `section-${Date.now()}-${idx}`,
          type: 'standard',
          name: null,
          exercises: [{
            exercise_id: ex.id ? String(ex.id) : `ex-${idx}`,
            name: it.name,
            alternates: [],
            sets: state.sets || DEFAULT_SETS,
            reps: state.reps || DEFAULT_REPS,
            rest: state.rest || DEFAULT_REST,
            default_weight: state.weight || '',
            default_weight_unit: state.weightUnit || 'lbs',
            group_type: ex.group_type || 'standard',
          }],
        };
      });

      // Flatten to exercise_groups for backward compatibility, mirroring the
      // shape produced by workout-editor-save-manager.js when sections mode
      // is active.
      const exercise_groups = sections.flatMap((s) => (s.exercises || []).map((e) => ({
        group_id: e.exercise_id,
        exercises: { a: e.name },
        sets: e.sets,
        reps: e.reps,
        rest: e.rest,
        default_weight: e.default_weight,
        default_weight_unit: e.default_weight_unit || 'lbs',
        group_type: e.group_type || 'standard',
      })));

      return {
        name: this.workoutName,
        description: '',
        tags: [],
        sections,
        exercise_groups,
        workout_type: 'standard',
        template_notes: [],
      };
    }

    async _handleSave() {
      if (this._saveInFlight) return;
      if (!this.tray || this.tray.size() === 0) {
        this._setStatus('Add at least one exercise before saving.', 'error');
        return;
      }
      if (!this.workoutName) {
        this._setStatus('Give your workout a name first.', 'error');
        if (this.dom.workoutNameInput) this.dom.workoutNameInput.focus();
        return;
      }

      this._saveInFlight = true;
      if (this.dom.saveBtn) this.dom.saveBtn.disabled = true;
      this._setStatus('Saving…', null);

      try {
        const payload = this._buildSavePayload();
        let saved;
        if (window.dataManager && typeof window.dataManager.createWorkout === 'function') {
          saved = await window.dataManager.createWorkout(payload);
        } else {
          // Fallback for environments without dataManager (e.g. anonymous tests)
          const resp = await fetch('/api/v3/workouts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!resp.ok) throw new Error(`Save failed (${resp.status})`);
          saved = await resp.json();
        }
        this._setStatus('Saved!', 'success');
        console.log('[WorkoutStudio] Workout saved:', saved && saved.id);
      } catch (err) {
        console.error('[WorkoutStudio] Save failed:', err);
        this._setStatus(`Could not save: ${err.message || 'unknown error'}`, 'error');
      } finally {
        this._saveInFlight = false;
        if (this.dom.saveBtn) this.dom.saveBtn.disabled = false;
      }
    }

    _setStatus(text, kind) {
      if (!this.dom.organizeStatus) return;
      this.dom.organizeStatus.textContent = text || '';
      this.dom.organizeStatus.classList.toggle('is-error', kind === 'error');
      this.dom.organizeStatus.classList.toggle('is-success', kind === 'success');
    }

    async _loadExercises() {
      if (!window.exerciseCacheService) {
        this._showEmpty('Exercise service unavailable.');
        return;
      }
      this._showEmpty('Loading exercises…');

      const exercises = await window.exerciseCacheService.getExercisesWithInstantFallback();
      this.allExercises = Array.isArray(exercises) ? exercises : [];

      // Custom exercises (loaded in the background for authed users)
      this.customExercises = window.exerciseCacheService.customExercises || [];

      window.exerciseCacheService.on('customLoaded', () => {
        this.customExercises = window.exerciseCacheService.customExercises || [];
      });

      this._refreshList();
    }

    _refreshList() {
      if (!this.grid) return;
      const rows = this._computeList();
      if (rows.length === 0) {
        this.grid.setExercises([]);
        this._showEmpty(this._emptyMessage());
        return;
      }
      this._hideEmpty();
      this.grid.setExercises(rows);
      if (this.tray) this.grid.setCounts(this.tray.countsByExerciseId());
    }

    _computeList() {
      const query = this.searchQuery;
      if (query && query.length >= 2 && window.exerciseCacheService) {
        return window.exerciseCacheService.searchExercises(query, { limit: LIST_LIMIT });
      }
      return this.allExercises.slice(0, LIST_LIMIT);
    }

    _emptyMessage() {
      if (this.searchQuery && this.searchQuery.length >= 2) {
        return `No exercises match "${this.searchQuery}".`;
      }
      return 'No exercises available.';
    }

    _showEmpty(text) {
      if (this.dom.empty) this.dom.empty.style.display = '';
      if (this.dom.emptyText) this.dom.emptyText.textContent = text || '';
      if (this.dom.list) this.dom.list.innerHTML = '';
    }

    _hideEmpty() {
      if (this.dom.empty) this.dom.empty.style.display = 'none';
    }

    _onAddExercise(exercise) {
      if (!this.tray) return;
      this.tray.add(exercise);
    }

    _onTrayChange(items) {
      // Update count badges on visible rows
      if (this.grid && this.tray) {
        this.grid.setCounts(this.tray.countsByExerciseId());
      }

      // Continue CTA visibility + count
      const n = items.length;
      if (this.dom.continueCta) {
        this.dom.continueCta.hidden = n === 0;
      }
      if (this.dom.continueCount) {
        this.dom.continueCount.textContent = n;
      }

      // Drop organize state for instances that no longer exist in the tray
      if (this.organizeState.size > 0) {
        const live = new Set(items.map((it) => it.instanceId));
        for (const id of this.organizeState.keys()) {
          if (!live.has(id)) this.organizeState.delete(id);
        }
      }

      // Re-render Page 2 if we're on it. If the tray empties while on Page 2,
      // bounce back to Page 1 to avoid a dead-end state.
      if (this.currentView === 'organize') {
        if (n === 0) {
          this._showView('select');
        } else {
          this._renderOrganize();
        }
      }
    }
  }

  function boot() {
    const controller = new WorkoutStudioController();
    controller.init();
    window.workoutStudio = controller;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
