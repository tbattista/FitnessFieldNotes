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

  const TABS = ['history', 'mine', 'all'];
  const LIST_LIMIT = 60;

  class WorkoutStudioController {
    constructor() {
      this.dom = {};
      this.tray = null;
      this.grid = null;
      this.activeTab = 'history';
      this.searchQuery = '';
      this.mode = 'plan'; // 'plan' | 'log'
      this.allExercises = [];
      this.customExercises = [];
      this.favoriteIds = new Set();
      this._searchDebounceTimer = null;
    }

    init() {
      this._cacheDom();
      if (!this.dom.studio) return; // not on this page

      this._initTray();
      this._initGrid();
      this._bindHeader();
      this._bindSearch();
      this._bindTabs();
      this._bindQuickTiles();
      this._bindContinue();

      this._loadExercises().catch((err) => {
        console.error('[WorkoutStudio] Failed to load exercises:', err);
        this._showEmpty('Could not load exercises. Try reloading.');
      });

      console.log('🎬 Workout Studio controller ready');
    }

    _cacheDom() {
      this.dom.studio = document.getElementById('studio');
      this.dom.backBtn = document.getElementById('studioBackBtn');
      this.dom.workoutPicker = document.getElementById('studioWorkoutPicker');
      this.dom.modePlanBtn = document.getElementById('studioModePlan');
      this.dom.modeLogBtn = document.getElementById('studioModeLog');

      this.dom.tray = document.getElementById('studioTray');
      this.dom.trayChips = document.getElementById('studioTrayChips');

      this.dom.searchInput = document.getElementById('studioSearchInput');
      this.dom.searchClear = document.getElementById('studioSearchClear');

      this.dom.tabs = document.querySelectorAll('.studio-tab');
      this.dom.quickTiles = document.querySelectorAll('.studio-quick-tile');

      this.dom.sectionTitle = document.getElementById('studioSectionTitle');
      this.dom.list = document.getElementById('studioList');
      this.dom.empty = document.getElementById('studioEmpty');
      this.dom.emptyText = document.getElementById('studioEmptyText');

      this.dom.continueCta = document.getElementById('studioContinueCta');
      this.dom.continueBtn = document.getElementById('studioContinueBtn');
      this.dom.continueCount = document.getElementById('studioContinueCount');
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
      if (this.dom.backBtn) {
        this.dom.backBtn.addEventListener('click', () => {
          // Navigate back to the prior page (history.back when there is history,
          // otherwise the dashboard).
          if (window.history.length > 1) {
            window.history.back();
          } else {
            window.location.href = '/';
          }
        });
      }

      if (this.dom.workoutPicker) {
        this.dom.workoutPicker.addEventListener('click', () => {
          // Sheet UI lands in a later commit. For now, log so the click is visibly wired.
          console.log('[WorkoutStudio] Workout picker tapped (sheet coming in next commit)');
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

    _bindTabs() {
      this.dom.tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
          const next = tab.dataset.tab;
          if (!TABS.includes(next)) return;
          this._setActiveTab(next);
        });
      });
    }

    _setActiveTab(tab) {
      this.activeTab = tab;
      this.dom.tabs.forEach((t) => {
        const active = t.dataset.tab === tab;
        t.classList.toggle('is-active', active);
        t.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      if (this.dom.sectionTitle) {
        this.dom.sectionTitle.textContent =
          tab === 'history' ? 'Recent' :
          tab === 'mine'    ? 'My Exercises' :
                              'All Exercises';
      }
      this._refreshList();
    }

    _bindQuickTiles() {
      this.dom.quickTiles.forEach((tile) => {
        tile.addEventListener('click', () => {
          const action = tile.dataset.action;
          // Stubs in this commit; future commits wire these up.
          console.log(`[WorkoutStudio] Quick tile tapped: ${action} (handler coming soon)`);
          if (action === 'favorites') {
            // Cheap shortcut already possible: switch to All and filter to favorites
            // when favorites are loaded. For now, switch tab as a hint.
            this._setActiveTab('mine');
          }
        });
      });
    }

    _bindContinue() {
      if (!this.dom.continueBtn) return;
      this.dom.continueBtn.addEventListener('click', () => {
        console.log('[WorkoutStudio] Continue tapped (Page 2 lands in next commit)');
      });
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
        if (this.activeTab === 'mine') this._refreshList();
      });

      // Favorites: loaded lazily — try to read from a global set if dashboard
      // exercises module is also present. Safe no-op otherwise.
      this.favoriteIds = (window.ffn && window.ffn.exercises && window.ffn.exercises.favorites)
        || new Set();

      this._refreshList();
    }

    _refreshList() {
      if (!this.grid) return;
      const rows = this._computeListForActiveTab();
      if (rows.length === 0) {
        this.grid.setExercises([]);
        this._showEmpty(this._emptyMessageForTab());
        return;
      }
      this._hideEmpty();
      this.grid.setExercises(rows);
      if (this.tray) this.grid.setCounts(this.tray.countsByExerciseId());
    }

    _computeListForActiveTab() {
      const query = this.searchQuery;
      const usage = (window.exerciseCacheService && window.exerciseCacheService.usageData) || {};

      let pool;
      switch (this.activeTab) {
        case 'history': {
          // Exercises with usage records, sorted by lastUsed desc.
          const usedIds = Object.keys(usage);
          const byId = new Map();
          for (const ex of this.allExercises) {
            byId.set(String(ex.id || ex.name), ex);
          }
          for (const ex of this.customExercises) {
            byId.set(String(ex.id || ex.name), ex);
          }
          pool = usedIds
            .map((id) => {
              const ex = byId.get(String(id));
              return ex ? { ex, lastUsed: usage[id].lastUsed || 0 } : null;
            })
            .filter(Boolean)
            .sort((a, b) => b.lastUsed - a.lastUsed)
            .map((entry) => entry.ex);
          break;
        }
        case 'mine': {
          pool = this.customExercises.slice();
          // Also include favorites from the global catalog
          if (this.favoriteIds && this.favoriteIds.size > 0) {
            for (const ex of this.allExercises) {
              if (this.favoriteIds.has(ex.id) && !pool.some((p) => p.id === ex.id)) {
                pool.push(ex);
              }
            }
          }
          break;
        }
        case 'all':
        default:
          pool = this.allExercises.slice();
          break;
      }

      if (query && query.length >= 2 && window.exerciseCacheService) {
        // Use the cache service's search if we're looking at the full catalog;
        // otherwise filter the in-memory pool by name/muscle/equipment substring.
        if (this.activeTab === 'all') {
          return window.exerciseCacheService.searchExercises(query, { limit: LIST_LIMIT });
        }
        const q = query.toLowerCase();
        return pool.filter((ex) => {
          const hay = `${ex.name || ''} ${ex.targetMuscleGroup || ''} ${ex.primaryEquipment || ''}`.toLowerCase();
          return hay.includes(q);
        }).slice(0, LIST_LIMIT);
      }

      return pool.slice(0, LIST_LIMIT);
    }

    _emptyMessageForTab() {
      if (this.searchQuery && this.searchQuery.length >= 2) {
        return `No exercises match "${this.searchQuery}".`;
      }
      switch (this.activeTab) {
        case 'history':
          return 'No recent exercises yet — pick one from "All Exercises" to start building history.';
        case 'mine':
          return 'No custom or favorited exercises yet.';
        case 'all':
        default:
          return 'No exercises available.';
      }
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
