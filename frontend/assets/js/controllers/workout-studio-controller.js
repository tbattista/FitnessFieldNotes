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

  const LIST_PAGE_SIZE = 60;
  const DEFAULT_SETS = '3';
  const DEFAULT_REPS = '8-12';
  const DEFAULT_REST = '60s';

  class WorkoutStudioController {
    constructor() {
      this.dom = {};
      this.tray = null;
      this.grid = null;
      this.searchQuery = '';
      this.tags = [];
      this.description = '';
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
      // Live block components mounted on Page 2, keyed by blockId
      this.studioBlocks = new Map();
      // Live note components mounted on Page 2, keyed by noteId
      this.studioNotes = new Map();
      // Generic containers — Map<blockId, { name: string, instanceIds: string[] }>
      this.blocks = new Map();
      this._blockSeq = 1;
      // Workout-level free-text notes — Map<noteId, { content: string }>
      this.notes = new Map();
      this._noteSeq = 1;
      // Page 2 render order. Each entry is one of:
      //   { kind: 'card', instanceId }   — top-level (loose) exercise card
      //   { kind: 'block', blockId }     — block whose children live in blocks.get(blockId).instanceIds
      //   { kind: 'note', noteId }       — workout-level free-text note
      // Every instanceId in tray.items appears exactly once across this array
      // (as a top-level card OR inside one block's instanceIds).
      this.organizeOrder = [];
      this.workoutName = '';
      // Set when the studio was opened with ?id=<workout_id>. While set, the
      // save flow PUTs to /api/v3/workouts/{id} instead of POSTing a new one.
      this.workoutId = null;
      this._saveInFlight = false;
      // Active filter selections by group (Set per group). Empty Sets = no filter.
      this.filters = {
        personal: new Set(),    // 'favorites' | 'recent' | 'custom'
        type: new Set(),        // 'strength' | 'activities'
        muscleGroup: new Set(),
        equipment: new Set(),
      };
      this.allActivities = []; // populated from ActivityTypeRegistry on init
      // Pagination state — how many rows of the current filtered set we render.
      // Grows by LIST_PAGE_SIZE every time the infinite-scroll sentinel intersects
      // the viewport; resets on search or filter change.
      this.renderedCount = LIST_PAGE_SIZE;
      this.totalAvailable = 0;
      this._infiniteScrollObserver = null;
    }

    init() {
      this._cacheDom();
      if (!this.dom.studio) return; // not on this page

      this._initTray();
      this._initGrid();
      this._bindHeader();
      this._bindSearch();
      this._bindFilters();
      this._bindContinue();
      this._bindOrganize();
      this._bindDraftBanner();
      this._ensureSentinel();
      this._ensureFloatingCountObserver();

      // If we were opened with ?id=<workout_id>, load that workout into the
      // studio as an editing session. The loader skips both the default-name
      // seed AND the draft restore (the saved record is the source of truth).
      // Otherwise, restore any in-progress draft.
      //
      // CRITICAL: dataManager routes to Firebase OR localStorage based on the
      // resolved auth state. If we call getWorkouts() before auth resolves we
      // get an empty list for Firebase users and silently fall through to
      // "workout not found". Mirror the builder's pattern and gate the
      // loader on waitForAuthReady().
      const urlWorkoutId = this._readWorkoutIdFromUrl();
      if (urlWorkoutId) {
        this._showLoadingState();
        this._waitForDataManagerReady()
          .then(() => this._loadWorkoutById(urlWorkoutId))
          .catch((err) => {
            console.error('[WorkoutStudio] Failed to load workout:', err);
            this._showLoadErrorState(err);
          });
      } else {
        this._restoreDraftIfPresent();
      }

      this._loadExercises().catch((err) => {
        console.error('[WorkoutStudio] Failed to load exercises:', err);
        this._showEmpty('Could not load exercises. Try reloading.');
      });

      console.log('🎬 Workout Studio controller ready');
    }

    _cacheDom() {
      this.dom.studio = document.getElementById('studio');
      this.dom.workoutNameInput = document.getElementById('studioWorkoutNameInput');
      this.dom.tagsInput = document.getElementById('studioTagsInput');
      this.dom.descriptionInput = document.getElementById('studioDescriptionInput');
      this.dom.slimHeader = document.getElementById('studioSlimHeader');
      this.dom.metaRow = document.getElementById('studioMetaRow');
      this.dom.metaToggle = document.getElementById('studioMetaToggle');

      this.dom.tray = document.getElementById('studioTray');
      this.dom.trayChips = document.getElementById('studioTrayChips');

      this.dom.searchInput = document.getElementById('studioSearchInput');
      this.dom.searchClear = document.getElementById('studioSearchClear');
      this.dom.addCustomBtn = document.getElementById('studioAddCustomBtn');
      this.dom.addCustomLabel = document.getElementById('studioAddCustomLabel');
      this.dom.importBtn = document.getElementById('studioImportBtn');

      this.dom.filterBtn = document.getElementById('studioFilterBtn');
      this.dom.filterBadge = document.getElementById('studioFilterBadge');
      this.dom.filterPanel = document.getElementById('studioFilterPanel');
      this.dom.filterClearBtn = document.getElementById('studioFilterClear');
      this.dom.filterChips = document.querySelectorAll('.studio-filter-panel .studio-filter-chip');

      this.dom.sectionTitle = document.getElementById('studioSectionTitle');
      this.dom.listCount = document.getElementById('studioListCount');
      this.dom.floatingCount = document.getElementById('studioFloatingCount');
      this.dom.floatingCountText = document.getElementById('studioFloatingCountText');
      this.dom.list = document.getElementById('studioList');
      this.dom.empty = document.getElementById('studioEmpty');
      this.dom.emptyText = document.getElementById('studioEmptyText');
      this.dom.sentinel = null; // created lazily by _ensureSentinel

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
      this.dom.saveBtnLabel = document.getElementById('studioSaveBtnLabel');
      this.dom.organizeStatus = document.getElementById('studioOrganizeStatus');
      // Floating FAB row (Page 2 only)
      this.dom.fabs = document.getElementById('studioFloatingFabs');
      this.dom.fabMore = document.getElementById('studioFabMore');
      this.dom.fabSave = document.getElementById('studioFabSave');
      this.dom.fabGo = document.getElementById('studioFabGo');
      this.dom.addBlockBtn = document.getElementById('studioAddBlockBtn');
      this.dom.reorderBtn = document.getElementById('studioReorderBtn');
      this.dom.addNoteBtn = document.getElementById('studioAddNoteBtn');

      this.dom.draftBanner = document.getElementById('studioDraftBanner');
      this.dom.draftBannerTime = document.getElementById('studioDraftBannerTime');
      this.dom.draftBannerStartFresh = document.getElementById('studioDraftBannerStartFresh');
      this.dom.draftBannerDismiss = document.getElementById('studioDraftBannerDismiss');
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
        onInfo: (exercise) => this._openExerciseDetail(exercise),
      });
    }

    _openExerciseDetail(exercise, presentation) {
      if (!exercise) return;
      if (!window.ExerciseDetailOffcanvas) {
        console.warn('[WorkoutStudio] ExerciseDetailOffcanvas unavailable; cannot show detail');
        return;
      }
      // The detail offcanvas reads exercises out of window.ffn.exercises.{all,custom}.
      // The studio sources its data from a different cache, so mirror what we
      // already have onto window.ffn before opening — this keeps the
      // offcanvas a pure consumer and avoids forking it for the studio.
      window.ffn = window.ffn || {};
      window.ffn.exercises = window.ffn.exercises || {};
      window.ffn.exercises.all = Array.isArray(this.allExercises) ? this.allExercises : [];
      window.ffn.exercises.custom = Array.isArray(this.customExercises) ? this.customExercises : [];
      if (!(window.ffn.exercises.favorites instanceof Set)) {
        window.ffn.exercises.favorites = this.favoriteIds instanceof Set
          ? this.favoriteIds
          : new Set();
      }

      if (!this._exerciseDetailOffcanvas) {
        try {
          this._exerciseDetailOffcanvas = new window.ExerciseDetailOffcanvas({
            context: 'studio',
            onAdd: (ex) => this._onAddExercise(ex),
          });
        } catch (err) {
          console.error('[WorkoutStudio] Failed to create ExerciseDetailOffcanvas:', err);
          return;
        }
      }
      const id = exercise.id || exercise.name;
      try {
        this._exerciseDetailOffcanvas.show(id, presentation || {});
      } catch (err) {
        console.error('[WorkoutStudio] ExerciseDetailOffcanvas.show threw:', err);
      }
    }

    _bindHeader() {
      if (this.dom.workoutNameInput) {
        // Seed a sensible default name so first-time users don't see a blank
        // field — matches the legacy workout-builder behavior.
        if (!this.dom.workoutNameInput.value) {
          const defaultName = this._defaultWorkoutName();
          this.dom.workoutNameInput.value = defaultName;
          this.workoutName = defaultName;
        }
        this.dom.workoutNameInput.addEventListener('input', (e) => {
          this.workoutName = String(e.target.value || '').trim();
          this._scheduleDraftSave();
          this._refreshFabState();
        });
      }

      if (this.dom.tagsInput) {
        this.dom.tagsInput.addEventListener('input', (e) => {
          const raw = String(e.target.value || '');
          this.tags = raw.split(',')
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 10);
          this._scheduleDraftSave();
        });
      }

      if (this.dom.descriptionInput) {
        this.dom.descriptionInput.addEventListener('input', (e) => {
          this.description = String(e.target.value || '').slice(0, 500);
          this._scheduleDraftSave();
        });
      }

      if (this.dom.metaToggle) {
        this.dom.metaToggle.addEventListener('click', () => this._toggleMetaRow());
      }
      // Auto-expand if either field is pre-populated (e.g. when editing an
      // existing workout in a later commit). Today both start empty so this
      // is a no-op, but the hook lets _setExpanded fire correctly later.
      const initialExpanded = !!(
        (this.dom.tagsInput && this.dom.tagsInput.value) ||
        (this.dom.descriptionInput && this.dom.descriptionInput.value)
      );
      if (initialExpanded) this._setMetaExpanded(true);
    }

    _toggleMetaRow() {
      const isExpanded = this.dom.slimHeader && this.dom.slimHeader.classList.contains('is-meta-expanded');
      this._setMetaExpanded(!isExpanded);
      if (!isExpanded && this.dom.tagsInput) {
        // Focus the tags field on first expand so keyboard users can start
        // typing immediately. Use rAF so the field is visible first.
        requestAnimationFrame(() => this.dom.tagsInput.focus());
      }
    }

    _setMetaExpanded(expanded) {
      if (this.dom.slimHeader) {
        this.dom.slimHeader.classList.toggle('is-meta-expanded', expanded);
      }
      if (this.dom.metaRow) {
        this.dom.metaRow.hidden = !expanded;
      }
      if (this.dom.metaToggle) {
        this.dom.metaToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        this.dom.metaToggle.setAttribute(
          'aria-label',
          expanded ? 'Hide tags and description' : 'Show tags and description'
        );
      }
    }

    _defaultWorkoutName() {
      const now = new Date();
      const month = now.toLocaleString('en-US', { month: 'short' });
      const day = now.getDate();
      let hours = now.getHours();
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const meridiem = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      return `New Workout - ${month} ${day} at ${hours}:${minutes} ${meridiem}`;
    }

    _bindSearch() {
      if (!this.dom.searchInput) return;
      this.dom.searchInput.addEventListener('input', (e) => {
        const q = String(e.target.value || '').trim();
        this.searchQuery = q;
        if (this.dom.searchClear) {
          this.dom.searchClear.style.display = q ? '' : 'none';
        }
        this._updateAddCustomButton();
        this._resetPagination();
        clearTimeout(this._searchDebounceTimer);
        this._searchDebounceTimer = setTimeout(() => this._refreshList(), 120);
      });

      if (this.dom.searchClear) {
        this.dom.searchClear.addEventListener('click', () => {
          this.dom.searchInput.value = '';
          this.searchQuery = '';
          this.dom.searchClear.style.display = 'none';
          this._updateAddCustomButton();
          this._resetPagination();
          this._refreshList();
          this.dom.searchInput.focus();
        });
      }

      if (this.dom.addCustomBtn) {
        this.dom.addCustomBtn.addEventListener('click', () => this._handleAddCustom());
      }
      if (this.dom.importBtn) {
        this.dom.importBtn.addEventListener('click', () => this._openImportWizard());
      }
      this._updateAddCustomButton();
    }

    _openImportWizard() {
      const factory = window.UnifiedOffcanvasFactory;
      if (!factory || typeof factory.createImportWizard !== 'function') {
        console.warn('[WorkoutStudio] UnifiedOffcanvasFactory.createImportWizard unavailable');
        return;
      }
      // The import service's populateBuilder is hard-wired to the legacy
      // workout-builder DOM and throws on this page. Neutralize it once
      // (idempotent) so finishImport reaches our onImportComplete callback.
      if (window.importService && !window.importService.__studioPatched) {
        window.importService.populateBuilder = () => {
          /* studio consumes workoutData via onImportComplete instead */
        };
        window.importService.__studioPatched = true;
      }
      try {
        factory.createImportWizard((workoutData) => this._onImportComplete(workoutData));
      } catch (err) {
        console.error('[WorkoutStudio] createImportWizard threw:', err);
      }
    }

    _onImportComplete(workoutData) {
      if (!workoutData || typeof workoutData !== 'object') return;

      // 1. Workout name + description + tags
      const name = String(workoutData.name || '').trim();
      if (name && this.dom.workoutNameInput) {
        this.dom.workoutNameInput.value = name;
        this.workoutName = name;
      }
      const desc = String(workoutData.description || '');
      if (desc) {
        this.description = desc.slice(0, 500);
        if (this.dom.descriptionInput) this.dom.descriptionInput.value = this.description;
      }
      const tags = Array.isArray(workoutData.tags) ? workoutData.tags.slice(0, 10) : [];
      if (tags.length > 0) {
        this.tags = tags;
        if (this.dom.tagsInput) this.dom.tagsInput.value = tags.join(', ');
      }
      // Auto-expand the meta card so the user can see what was imported
      if ((desc || tags.length > 0) && typeof this._setMetaExpanded === 'function') {
        this._setMetaExpanded(true);
      }

      // 2. Build tray + organize state from exercise_groups, grouping
      //    consecutive entries with the same block_id into a studio block.
      const groups = Array.isArray(workoutData.exercise_groups) ? workoutData.exercise_groups : [];
      let currentBlockId = null;
      let currentBlockMeta = null;
      groups.forEach((group, idx) => {
        const exName = this._extractGroupName(group);
        if (!exName) return;
        const exerciseLike = {
          // Generated id matches the custom-add pattern so the tray treats it
          // as a fresh selection. Real catalog matching can come later.
          id: `import-${Date.now()}-${idx}`,
          name: exName,
          targetMuscleGroup: '',
          primaryEquipment: '',
          exerciseTier: null,
          group_type: group.group_type || 'standard',
        };
        const instanceId = this.tray && this.tray.add(exerciseLike);
        if (!instanceId) return;

        // Seed organize state with the parsed protocol so cards render right
        const state = this._ensureOrganizeState(instanceId);
        state.sets = String(group.sets || state.sets || DEFAULT_SETS);
        state.reps = String(group.reps || state.reps || DEFAULT_REPS);
        state.rest = String(group.rest || state.rest || DEFAULT_REST);
        if (group.default_weight) state.weight = String(group.default_weight);
        if (group.default_weight_unit) state.weightUnit = String(group.default_weight_unit);

        // Block grouping: consecutive groups sharing a block_id collapse into
        // a studio block. The first entry in a run creates the block; the
        // subsequent ones get reassigned out of the loose top-level slot.
        const bid = group.block_id || null;
        if (bid) {
          if (bid !== currentBlockId) {
            // Start a new block for this run
            const newBlockId = `block-${Date.now()}-${this._blockSeq++}`;
            const blockName = String(group.group_name || group.block_name || '').trim();
            this.blocks.set(newBlockId, { name: blockName, instanceIds: [] });
            // Find this entry in organizeOrder (just appended as a card) and
            // replace it with a block whose first child is this instance.
            const lastIdx = this.organizeOrder.length - 1;
            this.organizeOrder[lastIdx] = { kind: 'block', blockId: newBlockId };
            this.blocks.get(newBlockId).instanceIds.push(instanceId);
            currentBlockId = bid;
            currentBlockMeta = newBlockId;
          } else if (currentBlockMeta) {
            // Same run — move this instanceId out of the top-level entry into
            // the existing block.
            this._removeInstanceFromOrder(instanceId);
            this.blocks.get(currentBlockMeta).instanceIds.push(instanceId);
          }
        } else {
          currentBlockId = null;
          currentBlockMeta = null;
        }
      });

      // 3. Template notes (order_index points into the flattened groups list)
      const notes = Array.isArray(workoutData.template_notes) ? workoutData.template_notes : [];
      notes.forEach((note) => {
        if (!note || typeof note !== 'object') return;
        const noteId = note.id || `template-note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        this.notes.set(noteId, { content: String(note.content || '').slice(0, 500) });
        // Insert at the right top-level position based on order_index.
        // organizeOrder positions where order_index counts cards/blocks (one
        // each), so map order_index → position in organizeOrder. Imperfect
        // for blocks (block counts as one slot, not N), but close enough for
        // a first-cut import; user can adjust via the reorder sheet.
        const target = Math.min(Math.max(0, note.order_index || 0), this.organizeOrder.length);
        this.organizeOrder.splice(target, 0, { kind: 'note', noteId });
      });

      // 4. Navigate to Page 2 if anything was imported
      if (this.tray && this.tray.size() > 0) {
        this._showView('organize');
      }
    }

    _extractGroupName(group) {
      if (!group) return '';
      if (typeof group.name === 'string' && group.name.trim()) return group.name.trim();
      const ex = group.exercises;
      if (ex && typeof ex === 'object') {
        const candidate = ex.a || ex.b || ex.c || Object.values(ex).find((v) => typeof v === 'string' && v.trim());
        if (candidate) return String(candidate).trim();
      }
      return '';
    }

    _updateAddCustomButton() {
      if (!this.dom.addCustomBtn) return;
      const q = this.searchQuery;
      const hasText = !!(q && q.length > 0);
      // Only reveal the button when there's text — otherwise it has no purpose
      // and would just take up space on the search row.
      this.dom.addCustomBtn.hidden = !hasText;
      this.dom.addCustomBtn.disabled = !hasText;
      if (this.dom.addCustomLabel) {
        this.dom.addCustomLabel.textContent = hasText ? `Add "${q}"` : 'Add custom';
      }
    }

    _handleAddCustom() {
      const q = (this.searchQuery || '').trim();
      if (!q || !this.tray) return;
      const adHoc = {
        id: `custom-${Date.now()}`,
        name: q,
        targetMuscleGroup: '',
        primaryEquipment: '',
        mechanics: '',
        exerciseTier: 2,
        isGlobal: false,
        isCustom: true,
      };
      this.tray.add(adHoc);
      // Clear search so the next add starts fresh
      if (this.dom.searchInput) this.dom.searchInput.value = '';
      this.searchQuery = '';
      if (this.dom.searchClear) this.dom.searchClear.style.display = 'none';
      this._updateAddCustomButton();
      this._resetPagination();
      this._refreshList();
    }

    _bindFilters() {
      if (this.dom.filterBtn) {
        this.dom.filterBtn.addEventListener('click', () => {
          const wasOpen = this.dom.filterBtn.getAttribute('aria-expanded') === 'true';
          this._setFilterPanelOpen(!wasOpen);
        });
      }

      this.dom.filterChips.forEach((chip) => {
        chip.addEventListener('click', () => {
          const group = chip.parentElement && chip.parentElement.dataset.group;
          const value = chip.dataset.value;
          if (!group || !value || !this.filters[group]) return;
          const set = this.filters[group];
          if (set.has(value)) set.delete(value);
          else set.add(value);
          chip.classList.toggle('is-active', set.has(value));
          this._updateFilterBadge();
          this._resetPagination();
          this._refreshList();
        });
      });

      if (this.dom.filterClearBtn) {
        this.dom.filterClearBtn.addEventListener('click', () => this._clearFilters());
      }
    }

    _setFilterPanelOpen(open) {
      if (!this.dom.filterPanel || !this.dom.filterBtn) return;
      this.dom.filterPanel.hidden = !open;
      this.dom.filterBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    _clearFilters() {
      Object.keys(this.filters).forEach((g) => this.filters[g].clear());
      this.dom.filterChips.forEach((chip) => chip.classList.remove('is-active'));
      this._updateFilterBadge();
      this._resetPagination();
      this._refreshList();
    }

    _activeFilterCount() {
      return Object.values(this.filters).reduce((n, set) => n + set.size, 0);
    }

    _updateFilterBadge() {
      const n = this._activeFilterCount();
      if (this.dom.filterBadge) {
        if (n > 0) {
          this.dom.filterBadge.textContent = String(n);
          this.dom.filterBadge.hidden = false;
        } else {
          this.dom.filterBadge.hidden = true;
        }
      }
      if (this.dom.filterBtn) {
        this.dom.filterBtn.classList.toggle('has-active', n > 0);
      }
    }

    _bindContinue() {
      if (!this.dom.continueBtn) return;
      this.dom.continueBtn.addEventListener('click', () => {
        if (!this.tray || this.tray.size() === 0) return;
        this._showView('organize');
      });
    }

    _bindDraftBanner() {
      if (this.dom.draftBannerStartFresh) {
        this.dom.draftBannerStartFresh.addEventListener('click', () => this._handleStartFresh());
      }
      if (this.dom.draftBannerDismiss) {
        this.dom.draftBannerDismiss.addEventListener('click', () => this._hideDraftBanner());
      }
    }

    _showDraftBanner(savedAt) {
      if (!this.dom.draftBanner) return;
      if (this.dom.draftBannerTime && window.StudioDraftService) {
        this.dom.draftBannerTime.textContent = window.StudioDraftService.relativeTime(savedAt);
      }
      this.dom.draftBanner.hidden = false;
    }

    _hideDraftBanner() {
      if (this.dom.draftBanner) this.dom.draftBanner.hidden = true;
    }

    _handleStartFresh() {
      // Clear persisted draft + reset in-memory state to defaults
      if (window.StudioDraftService) window.StudioDraftService.clear();
      this._suppressDraftSave = true;
      try {
        // Wipe content
        if (this.tray && typeof this.tray.clear === 'function') this.tray.clear();
        this.organizeOrder = [];
        this.blocks = new Map();
        this.notes = new Map();
        this.organizeState = new Map();
        this.tags = [];
        this.description = '';

        // Reset DOM
        const fresh = this._defaultWorkoutName();
        this.workoutName = fresh;
        if (this.dom.workoutNameInput) this.dom.workoutNameInput.value = fresh;
        if (this.dom.tagsInput) this.dom.tagsInput.value = '';
        if (this.dom.descriptionInput) this.dom.descriptionInput.value = '';
        if (typeof this._setMetaExpanded === 'function') this._setMetaExpanded(false);

        // Re-render so Page 2 reflects the empty state
        this._renderOrganize();
      } finally {
        this._suppressDraftSave = false;
      }
      this._hideDraftBanner();
      // Show on Page 1 (the user's now-clean workspace)
      this._showView('select');
    }

    /**
     * Wait for dataManager + Firebase auth state to be fully resolved.
     * Without this, Firebase users see an empty workout list on first call
     * because storage routing isn't yet set up — and the loader silently
     * fails into "workout not found". Mirrors workout-builder.html's pattern.
     * Times out after 5s so tests / anonymous flows aren't blocked.
     */
    async _waitForDataManagerReady() {
      const deadline = Date.now() + 5000;
      // First, poll briefly for window.dataManager to exist at all.
      while (!window.dataManager && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50));
      }
      if (!window.dataManager) return; // raw fallback will handle it
      if (typeof window.dataManager.waitForAuthReady === 'function') {
        try {
          // The dataManager surfaces its own internal timeout; wrap so a
          // hung auth call doesn't stall the studio forever.
          await Promise.race([
            window.dataManager.waitForAuthReady(),
            new Promise((resolve) => setTimeout(resolve, Math.max(0, deadline - Date.now()))),
          ]);
        } catch (err) {
          console.warn('[WorkoutStudio] waitForAuthReady warned:', err);
        }
      }
    }

    /**
     * Show a Page-1-visible "Loading…" placeholder so the user knows the
     * loader is working. Replaces the default empty workspace until either
     * hydration completes or the error state takes over.
     */
    _showLoadingState() {
      if (!this.dom.continueCta) return;
      this._setStatus('Loading workout…', null);
      // Optional inline hint near the search row, in case the user looks
      // at Page 1 first. Soft-fail if the element doesn't exist.
      const host = this.dom.studio;
      if (!host) return;
      let banner = host.querySelector('.studio-load-banner');
      if (!banner) {
        banner = document.createElement('div');
        banner.className = 'studio-load-banner';
        banner.setAttribute('role', 'status');
        banner.style.cssText = 'padding:0.75rem 1rem;margin:0.5rem 0;border-radius:0.5rem;background:rgba(201,124,93,0.1);color:#C97C5D;font-size:0.9rem;text-align:center;';
        host.insertBefore(banner, host.firstChild);
      }
      banner.textContent = 'Loading workout…';
      banner.hidden = false;
    }

    _hideLoadingBanner() {
      const banner = this.dom.studio && this.dom.studio.querySelector('.studio-load-banner');
      if (banner) banner.remove();
    }

    /**
     * Surface a load failure prominently on Page 1 (where the user lands)
     * with a Back-to-library escape hatch. The Page-2 status div alone
     * isn't enough — the user never reaches that page when the load fails.
     */
    _showLoadErrorState(err) {
      this._hideLoadingBanner();
      this._setStatus(`Could not load workout: ${err.message || 'unknown error'}`, 'error');
      const host = this.dom.studio;
      if (!host) return;
      let banner = host.querySelector('.studio-load-error');
      if (!banner) {
        banner = document.createElement('div');
        banner.className = 'studio-load-error alert alert-danger';
        banner.setAttribute('role', 'alert');
        banner.style.cssText = 'margin:0.75rem 0;padding:0.9rem 1rem;border-radius:0.5rem;';
        host.insertBefore(banner, host.firstChild);
      }
      const msg = String(err && err.message ? err.message : 'Workout not found');
      banner.innerHTML = `
        <strong>Couldn't load this workout.</strong>
        <span class="d-block small mt-1">${msg}</span>
        <a href="/workout-database.html" class="btn btn-sm btn-outline-light mt-2">
          <i class="bx bx-arrow-back"></i> Back to library
        </a>
      `;
    }

    /** Read ?id=<workout_id> from window.location, return null if absent. */
    _readWorkoutIdFromUrl() {
      try {
        const params = new URLSearchParams(window.location.search);
        const id = params.get('id');
        return id && String(id).trim() ? String(id).trim() : null;
      } catch (_err) {
        return null;
      }
    }

    /**
     * Fetch a saved workout by id and hydrate the studio into editing mode.
     * Defaults the data-source to window.dataManager.getWorkouts() so it picks
     * up Firebase-or-localStorage routing automatically.
     */
    async _loadWorkoutById(id) {
      const dm = window.dataManager;
      if (!dm || typeof dm.getWorkouts !== 'function') {
        // Raw fallback so the loader still works in test contexts that
        // delete window.dataManager to force the network path.
        return this._loadWorkoutByIdRaw(id);
      }
      this._setStatus('Loading workout…', null);
      try {
        const workouts = await dm.getWorkouts();
        const workout = Array.isArray(workouts) ? workouts.find((w) => String(w.id) === String(id)) : null;
        if (!workout) {
          throw new Error('Workout not found');
        }
        this._hydrateFromWorkoutData(workout);
        this._hideLoadingBanner();
        this._setStatus('', null);
      } catch (err) {
        // Final fallback: try the raw endpoint in case dataManager's cache
        // is stale or the workout is reachable only via the API.
        try {
          await this._loadWorkoutByIdRaw(id);
        } catch (_) {
          throw err;
        }
      }
    }

    async _loadWorkoutByIdRaw(id) {
      this._setStatus('Loading workout…', null);
      const url = `/api/v3/workouts/${encodeURIComponent(id)}`;
      const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!resp.ok) throw new Error(`Load failed (${resp.status})`);
      const workout = await resp.json();
      if (!workout || !workout.id) throw new Error('Workout not found');
      this._hydrateFromWorkoutData(workout);
      this._setStatus('', null);
    }

    /**
     * Apply a saved workout payload to the studio state.
     * Prefers sections[] when present (blocks-aware); falls back to
     * exercise_groups[] with block_id-collapsing for legacy records.
     * Suppresses draft saves during hydration so we don't write a partial
     * snapshot while restoring.
     */
    _hydrateFromWorkoutData(workout) {
      if (!workout || typeof workout !== 'object') return;

      this._suppressDraftSave = true;
      // Also block the tray's emit-driven _onTrayChange from auto-syncing
      // organizeOrder while we're mid-hydration. Without this, each
      // tray.add() in _hydrateFromSections would push the just-added
      // instanceId onto organizeOrder as a loose card, defeating the block
      // grouping we're constructing on the same pass.
      this._suppressTrayChange = true;
      try {
        // Track id so subsequent saves UPDATE rather than CREATE.
        this.workoutId = workout.id || null;
        if (this.dom.saveBtnLabel && this.workoutId) {
          this.dom.saveBtnLabel.textContent = 'Update Workout';
        }

        // Clear in-memory state to defaults before populating from the
        // saved record. Any default name seeded by _bindHeader is replaced.
        if (this.tray && typeof this.tray.clear === 'function') this.tray.clear();
        this.organizeOrder = [];
        this.blocks = new Map();
        this.notes = new Map();
        this.organizeState = new Map();

        // Metadata
        const name = String(workout.name || '').trim();
        this.workoutName = name;
        if (this.dom.workoutNameInput) this.dom.workoutNameInput.value = name;

        const tags = Array.isArray(workout.tags) ? workout.tags.slice(0, 10) : [];
        this.tags = tags;
        if (this.dom.tagsInput) this.dom.tagsInput.value = tags.join(', ');

        const desc = String(workout.description || '');
        this.description = desc;
        if (this.dom.descriptionInput) this.dom.descriptionInput.value = desc;

        // Auto-expand the meta card when there's anything to show
        if ((tags.length > 0 || desc.length > 0) && typeof this._setMetaExpanded === 'function') {
          this._setMetaExpanded(true);
        }

        // Sections > exercise_groups for shape fidelity (blocks survive)
        const sections = Array.isArray(workout.sections) ? workout.sections : null;
        if (sections && sections.length > 0) {
          this._hydrateFromSections(sections);
        } else if (Array.isArray(workout.exercise_groups)) {
          this._hydrateFromExerciseGroups(workout.exercise_groups);
        }

        // Notes — interleave by order_index against the flattened
        // exercise_groups slot count (matches what _buildSavePayload writes
        // and what _buildMergedItems on the read side expects).
        const notes = Array.isArray(workout.template_notes) ? workout.template_notes : [];
        const sortedNotes = notes.slice().sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
        sortedNotes.forEach((note) => {
          if (!note || typeof note !== 'object') return;
          const noteId = note.id || `template-note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          this.notes.set(noteId, { content: String(note.content || '').slice(0, 500) });
          // order_index counts flattened exercise_groups; in organizeOrder a
          // block is one slot, so map to the nth top-level position best-effort.
          const target = Math.min(Math.max(0, note.order_index || 0), this.organizeOrder.length);
          this.organizeOrder.splice(target, 0, { kind: 'note', noteId });
        });

        // Render Page 2 reflecting the loaded structure
        this._renderOrganize();

        // Now that the tray + organizeOrder are coherent, run the derived
        // Page 1 UI that _onTrayChange would have updated: count badges on
        // the selection grid, Continue CTA visibility, count text.
        if (this.tray) {
          const items = this.tray.getItems();
          if (this.grid) this.grid.setCounts(this.tray.countsByExerciseId());
          const n = items.length;
          if (this.dom.continueCta) this.dom.continueCta.hidden = n === 0;
          if (this.dom.continueCount) this.dom.continueCount.textContent = String(n);
        }
      } finally {
        this._suppressDraftSave = false;
        this._suppressTrayChange = false;
      }
    }

    /** sections[] shape: each section may be a block (>1 exercises with optional name). */
    _hydrateFromSections(sections) {
      sections.forEach((section, sIdx) => {
        const exercises = Array.isArray(section.exercises) ? section.exercises : [];
        if (exercises.length === 0) return;

        if (exercises.length === 1) {
          // Single-exercise section becomes a loose top-level card.
          const instanceId = this._addLoadedExerciseToTray(exercises[0], sIdx, 0);
          if (instanceId) this.organizeOrder.push({ kind: 'card', instanceId });
        } else {
          // Multi-exercise section becomes a studio block.
          const blockId = `block-${Date.now()}-${this._blockSeq++}`;
          const blockName = String(section.name || '').trim();
          const instanceIds = [];
          exercises.forEach((ex, eIdx) => {
            const iid = this._addLoadedExerciseToTray(ex, sIdx, eIdx);
            if (iid) instanceIds.push(iid);
          });
          this.blocks.set(blockId, { name: blockName, instanceIds });
          this.organizeOrder.push({ kind: 'block', blockId });
        }
      });
    }

    /**
     * Legacy fallback: walk exercise_groups[] and collapse consecutive groups
     * sharing a block_id into a studio block — same algorithm the AI Import
     * uses on the parsed payload.
     */
    _hydrateFromExerciseGroups(groups) {
      let currentBlockId = null;
      let currentBlockKey = null;
      groups.forEach((group, idx) => {
        const exShape = this._exerciseFromGroup(group, idx);
        const instanceId = this._addLoadedExerciseToTray(exShape, idx, 0);
        if (!instanceId) return;

        const bid = group.block_id || null;
        if (bid) {
          if (bid !== currentBlockKey) {
            const newBlockId = `block-${Date.now()}-${this._blockSeq++}`;
            const blockName = String(group.group_name || group.block_name || '').trim();
            this.blocks.set(newBlockId, { name: blockName, instanceIds: [instanceId] });
            this.organizeOrder.push({ kind: 'block', blockId: newBlockId });
            currentBlockKey = bid;
            currentBlockId = newBlockId;
          } else if (currentBlockId) {
            this.blocks.get(currentBlockId).instanceIds.push(instanceId);
          }
        } else {
          this.organizeOrder.push({ kind: 'card', instanceId });
          currentBlockKey = null;
          currentBlockId = null;
        }
      });
    }

    /**
     * Push one saved exercise into the tray and seed its organize state.
     * Accepts either a section_exercise (has .name + .exercise_id) or a
     * legacy exercise_group (has .exercises.{a,b,c} + .sets/.reps/.rest).
     */
    _addLoadedExerciseToTray(saved, idxA, idxB) {
      if (!saved || !this.tray) return null;
      const groupType = String(saved.group_type || 'standard').toLowerCase();
      const cardioCfg = saved.cardio_config || null;

      // For cardio, prefer the activity_type (registry display name) over
      // any raw `name` carried by the section. The registry name is what
      // the user actually sees in the activity picker.
      let name = saved.name || (saved.exercises && (saved.exercises.a || saved.exercises.b || saved.exercises.c)) || '';
      let activityId = '';
      if (groupType === 'cardio' && cardioCfg && cardioCfg.activity_type) {
        activityId = String(cardioCfg.activity_type);
        const reg = window.ActivityTypeRegistry;
        const resolved = reg && typeof reg.getName === 'function' ? reg.getName(activityId) : null;
        if (resolved) name = resolved;
      }
      if (!name) return null;

      const exerciseLike = {
        id: saved.exercise_id || saved.id || `load-${idxA}-${idxB}-${Date.now()}`,
        name: String(name).trim(),
        targetMuscleGroup: '',
        primaryEquipment: '',
        exerciseTier: null,
        group_type: groupType,
      };
      if (activityId) exerciseLike._activityId = activityId;
      const instanceId = this.tray.add(exerciseLike);
      if (!instanceId) return null;

      const state = this._ensureOrganizeState(instanceId);
      if (groupType === 'cardio') {
        // Activity payload lives on cardioConfig — skip seeding sets/reps,
        // they don't apply and would emit dead fields in the save payload.
        state.cardioConfig = cardioCfg ? Object.assign({}, cardioCfg) : {};
      } else {
        state.sets = String(saved.sets || state.sets || DEFAULT_SETS);
        state.reps = String(saved.reps || state.reps || DEFAULT_REPS);
        state.rest = String(saved.rest || state.rest || DEFAULT_REST);
        if (saved.default_weight) state.weight = String(saved.default_weight);
        if (saved.default_weight_unit) state.weightUnit = String(saved.default_weight_unit);
      }
      return instanceId;
    }

    /** Build a synthetic 'section exercise' shape from a legacy exercise_group. */
    _exerciseFromGroup(group, idx) {
      const exes = group && group.exercises;
      const name = (exes && (exes.a || exes.b || exes.c)) || group?.name || '';
      return {
        exercise_id: group?.exercise_id || group?.group_id || `eg-${idx}`,
        name,
        sets: group?.sets,
        reps: group?.reps,
        rest: group?.rest,
        default_weight: group?.default_weight,
        default_weight_unit: group?.default_weight_unit,
        group_type: group?.group_type || 'standard',
        // Carry cardio_config through the legacy-shape adapter too —
        // exercise_groups[] records may have it set alongside group_type='cardio'.
        cardio_config: group?.cardio_config || null,
      };
    }

    _restoreDraftIfPresent() {
      if (!window.StudioDraftService) return;
      const draft = window.StudioDraftService.load();
      if (!draft) return;

      // Only restore non-trivial drafts. A draft with nothing the user
      // actually built (no items, no tags, no description, default name)
      // is noise — clear it and start fresh silently.
      const hasContent =
        (Array.isArray(draft.items) && draft.items.length > 0) ||
        (Array.isArray(draft.tags) && draft.tags.length > 0) ||
        (typeof draft.description === 'string' && draft.description.trim().length > 0) ||
        (typeof draft.name === 'string' && draft.name.trim() && !/^New Workout - /.test(draft.name));
      if (!hasContent) {
        window.StudioDraftService.clear();
        return;
      }

      this._suppressDraftSave = true;
      try {
        if (typeof draft.name === 'string' && draft.name.trim()) {
          this.workoutName = draft.name;
          if (this.dom.workoutNameInput) this.dom.workoutNameInput.value = draft.name;
        }
        if (Array.isArray(draft.tags)) {
          this.tags = draft.tags.slice();
          if (this.dom.tagsInput) this.dom.tagsInput.value = this.tags.join(', ');
        }
        if (typeof draft.description === 'string') {
          this.description = draft.description;
          if (this.dom.descriptionInput) this.dom.descriptionInput.value = draft.description;
        }
        if ((this.tags.length || this.description) && typeof this._setMetaExpanded === 'function') {
          this._setMetaExpanded(true);
        }

        if (Array.isArray(draft.blocks)) {
          this.blocks = new Map(draft.blocks.map(([k, v]) => [k, {
            name: String(v?.name || ''),
            instanceIds: Array.isArray(v?.instanceIds) ? v.instanceIds.slice() : [],
          }]));
        }
        if (Array.isArray(draft.notes)) {
          this.notes = new Map(draft.notes.map(([k, v]) => [k, { content: String(v?.content || '') }]));
        }
        if (Array.isArray(draft.organizeOrder)) {
          this.organizeOrder = draft.organizeOrder.slice();
        }
        if (Array.isArray(draft.organizeState)) {
          this.organizeState = new Map(draft.organizeState.map(([k, v]) => [k, Object.assign({}, v)]));
        }
        // Bump the block sequence past anything we restored so newly-created
        // blocks don't collide with existing ids.
        if (this.blocks.size > 0) {
          const maxSeq = Array.from(this.blocks.keys()).reduce((m, id) => {
            const match = String(id).match(/block-\d+-(\d+)/);
            return match ? Math.max(m, parseInt(match[1], 10)) : m;
          }, 0);
          if (maxSeq >= this._blockSeq) this._blockSeq = maxSeq + 1;
        }

        // Restore tray items by assigning directly — we want the saved
        // instanceIds to survive so they keep matching organizeOrder.
        if (Array.isArray(draft.items) && this.tray) {
          this.tray.items = draft.items.map((it) => ({
            instanceId: String(it.instanceId),
            exerciseId: String(it.exerciseId),
            name: String(it.name || ''),
            exercise: it.exercise || { id: it.exerciseId, name: it.name },
          }));
          // Push the sequence past the highest restored id
          const maxSeq = this.tray.items.reduce((m, it) => {
            const match = String(it.instanceId).match(/^tray-(\d+)$/);
            return match ? Math.max(m, parseInt(match[1], 10)) : m;
          }, 0);
          this.tray._instanceSeq = maxSeq + 1;
          this.tray._render();

          // Manually trigger the derived UI that _onTrayChange normally
          // handles, but DO NOT run _syncOrganizeOrderWithTray — that
          // would clobber the carefully-restored block/note structure.
          if (this.grid) this.grid.setCounts(this.tray.countsByExerciseId());
          const n = this.tray.items.length;
          if (this.dom.continueCta) this.dom.continueCta.hidden = n === 0;
          if (this.dom.continueCount) this.dom.continueCount.textContent = String(n);
        }

        this._showDraftBanner(draft.savedAt);
      } finally {
        this._suppressDraftSave = false;
      }
    }

    _scheduleDraftSave() {
      if (this._suppressDraftSave) return;
      // When editing an existing saved workout, the saved record is the
      // source of truth — don't write parallel state into the new-workout
      // draft slot (it would surface as a 'Resumed draft' banner the next
      // time the user opens the studio fresh).
      if (this.workoutId) return;
      clearTimeout(this._draftSaveTimer);
      this._draftSaveTimer = setTimeout(() => this._saveDraft(), 400);
    }

    _saveDraft() {
      if (!window.StudioDraftService || !this.tray) return;
      const items = this.tray.getItems();
      const tagsArr = Array.isArray(this.tags) ? this.tags : [];
      const desc = String(this.description || '');
      const nameStr = String(this.workoutName || '');

      // "Trivial" = no exercises, no metadata, default-shaped name.
      // Don't write a draft for that state — clear any existing one so
      // a fresh open isn't greeted by a phantom "Resumed" banner.
      const isTrivial =
        items.length === 0 &&
        tagsArr.length === 0 &&
        desc.trim().length === 0 &&
        (!nameStr || /^New Workout - /.test(nameStr));
      if (isTrivial) {
        window.StudioDraftService.clear();
        return;
      }

      const snapshot = {
        name: nameStr,
        tags: tagsArr.slice(),
        description: desc,
        items: items.map((it) => ({
          instanceId: it.instanceId,
          exerciseId: it.exerciseId,
          name: it.name,
          // Strip down to the fields the studio actually reads back —
          // the full exercise object can be hundreds of bytes per row.
          exercise: it.exercise ? {
            id: it.exercise.id,
            name: it.exercise.name,
            targetMuscleGroup: it.exercise.targetMuscleGroup,
            primaryEquipment: it.exercise.primaryEquipment,
            group_type: it.exercise.group_type,
          } : null,
        })),
        organizeOrder: this.organizeOrder.map((e) => Object.assign({}, e)),
        blocks: Array.from(this.blocks.entries()).map(([k, v]) => [k, {
          name: v.name,
          instanceIds: v.instanceIds.slice(),
        }]),
        notes: Array.from(this.notes.entries()).map(([k, v]) => [k, { content: v.content }]),
        organizeState: Array.from(this.organizeState.entries()).map(([k, v]) => [k, Object.assign({}, v)]),
      };
      window.StudioDraftService.save(snapshot);
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

      // Floating FAB row — Page 2's mobile-primary action surface.
      if (this.dom.fabSave) {
        this.dom.fabSave.addEventListener('click', () => this._handleSave());
      }
      if (this.dom.fabGo) {
        this.dom.fabGo.addEventListener('click', () => this._handleStartFromFab());
      }
      if (this.dom.fabMore) {
        this.dom.fabMore.addEventListener('click', () => this._openMoreSheet());
      }

      if (this.dom.addBlockBtn) {
        this.dom.addBlockBtn.addEventListener('click', () => this._createBlock());
      }

      if (this.dom.reorderBtn) {
        this.dom.reorderBtn.addEventListener('click', () => this._openReorderSheet());
      }

      if (this.dom.addNoteBtn) {
        this.dom.addNoteBtn.addEventListener('click', () => this._createNote());
      }
    }

    _createNote() {
      const noteId = `template-note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      this.notes.set(noteId, { content: '' });
      this.organizeOrder.push({ kind: 'note', noteId });
      this._renderOrganize();
      // Focus the new note's textarea so the user can type immediately
      requestAnimationFrame(() => {
        const node = this.dom.organizeList && this.dom.organizeList.querySelector(
          `.studio-note-card[data-note-id="${noteId}"] .studio-note-textarea`
        );
        if (node) node.focus();
      });
    }

    _onNoteChange(noteId, partial) {
      const note = this.notes.get(noteId);
      if (!note) return;
      if (partial && typeof partial.content === 'string') {
        note.content = partial.content;
        this._scheduleDraftSave();
      }
    }

    _onNoteMenuAction(noteId, action) {
      switch (action) {
        case 'move-up':
          this._moveOrderEntry({ kind: 'note', noteId }, -1);
          break;
        case 'move-down':
          this._moveOrderEntry({ kind: 'note', noteId }, +1);
          break;
        case 'delete':
          this._deleteNote(noteId);
          break;
      }
    }

    _deleteNote(noteId) {
      this.notes.delete(noteId);
      this.organizeOrder = this.organizeOrder.filter(
        (e) => !(e.kind === 'note' && e.noteId === noteId)
      );
      this._renderOrganize();
    }

    _openReorderSheet() {
      if (!window.StudioReorderSheet) return;
      const items = this.tray ? this.tray.getItems() : [];
      if (items.length === 0) return;
      const sheet = new window.StudioReorderSheet({
        onSave: (next) => this._applyReorder(next),
      });
      // Snapshot the current structure so the sheet renders the live state.
      sheet.open({
        organizeOrder: this.organizeOrder.slice(),
        blocks: this.blocks,
        notes: this.notes,
        items,
      });
    }

    /**
     * Apply the new structure produced by the reorder sheet.
     * next: { organizeOrder: [...], blockInstanceIds: Map<blockId, string[]> }
     */
    _applyReorder(next) {
      if (!next) return;
      // Update each block's child list to the new order
      if (next.blockInstanceIds instanceof Map) {
        for (const [blockId, ids] of next.blockInstanceIds.entries()) {
          const block = this.blocks.get(blockId);
          if (block) block.instanceIds = Array.isArray(ids) ? ids.slice() : [];
        }
      }
      // Replace the top-level order
      if (Array.isArray(next.organizeOrder)) {
        this.organizeOrder = next.organizeOrder.slice();
      }
      this._renderOrganize();
    }

    _createBlock() {
      const blockId = `block-${Date.now()}-${this._blockSeq++}`;
      this.blocks.set(blockId, { name: '', instanceIds: [] });
      this.organizeOrder.push({ kind: 'block', blockId });
      this._renderOrganize();
      // Focus the new block's name input so the user can type immediately
      requestAnimationFrame(() => {
        const node = this.dom.organizeList && this.dom.organizeList.querySelector(
          `.studio-block[data-block-id="${blockId}"] .studio-block-name-input`
        );
        if (node) node.focus();
      });
    }

    _onBlockRename(blockId, name) {
      const b = this.blocks.get(blockId);
      if (!b) return;
      b.name = name;
      // Re-render cards so any "Move to: <name>" menu items pick up the new label.
      this._renderOrganize();
    }

    _onBlockMenuAction(blockId, action) {
      switch (action) {
        case 'move-up':
          this._moveOrderEntry({ kind: 'block', blockId }, -1);
          break;
        case 'move-down':
          this._moveOrderEntry({ kind: 'block', blockId }, +1);
          break;
        case 'delete':
          this._deleteBlock(blockId);
          break;
      }
    }

    _deleteBlock(blockId) {
      const block = this.blocks.get(blockId);
      if (!block) return;
      const blockOrderIdx = this.organizeOrder.findIndex(
        (e) => e.kind === 'block' && e.blockId === blockId
      );
      if (blockOrderIdx === -1) return;
      // Promote each child instanceId back to a top-level card at the block's position,
      // preserving their internal order.
      const promoted = block.instanceIds.map((iid) => ({ kind: 'card', instanceId: iid }));
      this.organizeOrder.splice(blockOrderIdx, 1, ...promoted);
      this.blocks.delete(blockId);
      this._renderOrganize();
    }

    _moveOrderEntry(matchEntry, delta) {
      const idx = this.organizeOrder.findIndex((e) => {
        if (e.kind !== matchEntry.kind) return false;
        if (matchEntry.kind === 'card') return e.instanceId === matchEntry.instanceId;
        if (matchEntry.kind === 'block') return e.blockId === matchEntry.blockId;
        if (matchEntry.kind === 'note') return e.noteId === matchEntry.noteId;
        return false;
      });
      if (idx === -1) return;
      const target = idx + delta;
      if (target < 0 || target >= this.organizeOrder.length) return;
      const [moved] = this.organizeOrder.splice(idx, 1);
      this.organizeOrder.splice(target, 0, moved);
      this._renderOrganize();
    }

    _moveCardToBlock(instanceId, blockId) {
      const block = this.blocks.get(blockId);
      if (!block) return;
      // Remove the instanceId wherever it currently lives.
      this._removeInstanceFromOrder(instanceId);
      // Append to the destination block.
      if (!block.instanceIds.includes(instanceId)) {
        block.instanceIds.push(instanceId);
      }
      this._renderOrganize();
    }

    _moveCardOutOfBlock(instanceId) {
      // Find the block holding this instanceId, if any.
      let sourceBlockId = null;
      for (const [bid, b] of this.blocks.entries()) {
        if (b.instanceIds.includes(instanceId)) { sourceBlockId = bid; break; }
      }
      if (!sourceBlockId) return;
      const block = this.blocks.get(sourceBlockId);
      block.instanceIds = block.instanceIds.filter((id) => id !== instanceId);

      // Insert as a top-level card immediately after the source block in organizeOrder.
      const blockIdx = this.organizeOrder.findIndex(
        (e) => e.kind === 'block' && e.blockId === sourceBlockId
      );
      const insertAt = blockIdx === -1 ? this.organizeOrder.length : blockIdx + 1;
      this.organizeOrder.splice(insertAt, 0, { kind: 'card', instanceId });
      this._renderOrganize();
    }

    /** Remove an instanceId from any location in organizeOrder/blocks. */
    _removeInstanceFromOrder(instanceId) {
      const looseIdx = this.organizeOrder.findIndex(
        (e) => e.kind === 'card' && e.instanceId === instanceId
      );
      if (looseIdx !== -1) {
        this.organizeOrder.splice(looseIdx, 1);
        return;
      }
      for (const b of this.blocks.values()) {
        const i = b.instanceIds.indexOf(instanceId);
        if (i !== -1) {
          b.instanceIds.splice(i, 1);
          return;
        }
      }
    }

    /** Find which block (if any) currently holds the given instanceId. */
    _findBlockOf(instanceId) {
      for (const [bid, b] of this.blocks.entries()) {
        if (b.instanceIds.includes(instanceId)) return { blockId: bid, block: b };
      }
      return null;
    }

    /** Snapshot of blocks for menu rendering: [{ blockId, name }, ...] in organizeOrder order. */
    _blockOptionsList() {
      const out = [];
      for (const entry of this.organizeOrder) {
        if (entry.kind === 'block') {
          const b = this.blocks.get(entry.blockId);
          if (b) out.push({ blockId: entry.blockId, name: b.name || 'Block' });
        }
      }
      return out;
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

      // FAB row is Page-2 only — Page 1's CTA is the centered Continue button.
      if (this.dom.fabs) this.dom.fabs.hidden = view !== 'organize';
      this._refreshFabState();

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
      const itemMap = new Map(items.map((it) => [it.instanceId, it]));

      if (this.dom.organizeCount) {
        this.dom.organizeCount.textContent = String(items.length);
      }
      // The empty-state + save-disabled signal is driven by tray contents, not
      // by organizeOrder (empty blocks are allowed and should still let users save).
      const hasExercises = items.length > 0;
      if (this.dom.organizeEmpty) this.dom.organizeEmpty.hidden = hasExercises;
      if (this.dom.saveBtn) this.dom.saveBtn.disabled = !hasExercises;
      // Add-Block + Reorder + Add-Note are irrelevant on the dead-end empty state.
      if (this.dom.addBlockBtn) this.dom.addBlockBtn.hidden = !hasExercises;
      if (this.dom.addNoteBtn) this.dom.addNoteBtn.hidden = !hasExercises;
      // Reorder needs at least 2 items in the organize order to be useful.
      if (this.dom.reorderBtn) {
        this.dom.reorderBtn.hidden = !hasExercises || this.organizeOrder.length < 2;
      }

      // Full rebuild — card count per workout is typically <20 so a diff is overkill,
      // and re-binding live field controllers cleanly is easier with a fresh tree.
      this._destroyAllCards();
      this._destroyAllBlocks();
      this._destroyAllNotes();
      this.dom.organizeList.innerHTML = '';

      if (!hasExercises) return;

      const blockOptions = this._blockOptionsList();

      // We compute a flat sequence position for top-level entries so that
      // Move Up / Move Down on cards and blocks can disable correctly at the ends.
      const total = this.organizeOrder.length;
      this.organizeOrder.forEach((entry, idx) => {
        if (entry.kind === 'card') {
          const item = itemMap.get(entry.instanceId);
          if (!item) return; // referenced item was removed
          const card = this._mountCard(item, { idx, total, container: this.dom.organizeList, blockOptions, inBlock: null });
          card.setIndex(idx, total);
        } else if (entry.kind === 'note') {
          const note = this.notes.get(entry.noteId);
          if (!note) return;
          if (!window.StudioNoteCard) return;
          const noteComp = new window.StudioNoteCard({
            noteId: entry.noteId,
            content: note.content,
            callbacks: {
              onChange: (noteId, partial) => this._onNoteChange(noteId, partial),
              onMenuAction: (noteId, action) => this._onNoteMenuAction(noteId, action),
            },
          });
          const noteNode = noteComp.render();
          this.dom.organizeList.appendChild(noteNode);
          noteComp.setIndex(idx, total);
          this.studioNotes.set(entry.noteId, noteComp);
        } else if (entry.kind === 'block') {
          const block = this.blocks.get(entry.blockId);
          if (!block) return;
          const blockComp = new window.StudioBlock({
            blockId: entry.blockId,
            name: block.name,
            callbacks: {
              onRename: (blockId, name) => this._onBlockRename(blockId, name),
              onMenuAction: (blockId, action) => this._onBlockMenuAction(blockId, action),
            },
          });
          const blockNode = blockComp.render();
          this.dom.organizeList.appendChild(blockNode);
          blockComp.setIndex(idx, total);
          this.studioBlocks.set(entry.blockId, blockComp);

          // Mount each child card into the block's children slot
          const slot = blockComp.getChildrenSlot();
          const childCount = block.instanceIds.length;
          block.instanceIds.forEach((iid, childIdx) => {
            const item = itemMap.get(iid);
            if (!item) return;
            const card = this._mountCard(item, {
              idx: childIdx,
              total: childCount,
              container: slot,
              blockOptions,
              inBlock: { blockId: entry.blockId, blockName: block.name || '' },
            });
            card.setIndex(childIdx, childCount);
          });
          blockComp.setChildCount(childCount);
        }
      });

      // Any path that re-renders Page 2 has either mutated organize state
      // (blocks, notes, reorder, move-to-block, etc.) or restored it from a
      // draft. The draft-save method is internally debounced + clears
      // itself out when state is trivial, so we can hook here unconditionally.
      this._scheduleDraftSave();
    }

    _mountCard(item, { idx, total, container, blockOptions, inBlock }) {
      const state = this._ensureOrganizeState(item.instanceId);
      // Resolve the type-card visual metadata once per mount. The tray
      // stores the original exercise on the item, so we can read
      // group_type + the activity registry icon for cardio cards.
      const src = item.exercise || {};
      const groupType = String(src.group_type || 'standard').toLowerCase();
      const activityId = src._activityId || src.activity_id || (state.cardioConfig && state.cardioConfig.activity_type) || '';
      const activityIcon = groupType === 'cardio'
        ? (this._resolveActivityIcon(activityId) || 'bx-pulse')
        : '';
      const card = new window.StudioExerciseCard({
        instanceId: item.instanceId,
        name: item.name,
        state,
        inBlock,
        blockOptions,
        groupType,
        activityIcon,
        cardioConfig: state.cardioConfig || {},
        activityId,
        callbacks: {
          onChange: (instanceId, partial) => this._onCardChange(instanceId, partial),
          onInfo: (instanceId) => this._onCardInfo(instanceId),
          onMenuAction: (instanceId, action, blockId) => this._onCardMenuAction(instanceId, action, blockId),
          onEditCardio: (instanceId) => this._onEditCardio(instanceId),
        },
      });
      const node = card.render();
      container.appendChild(node);
      this.studioCards.set(item.instanceId, card);
      return card;
    }

    /** Look up the bx icon class for an activity id; '' when unresolved. */
    _resolveActivityIcon(activityId) {
      const reg = window.ActivityTypeRegistry;
      if (!reg || !activityId || typeof reg.getIcon !== 'function') return '';
      try { return reg.getIcon(activityId) || ''; } catch (_) { return ''; }
    }

    /**
     * Cardio card edit → open the shared cardio editor offcanvas. The
     * factory takes a groupId for its internal addressing, but the value
     * is opaque to it; we pass the studio's instanceId so the offcanvas
     * doesn't collide with any builder-side groups that might coexist
     * in window.exerciseGroupsData.
     */
    _onEditCardio(instanceId) {
      const item = this.tray ? this.tray.getItems().find((it) => it.instanceId === instanceId) : null;
      if (!item) return;
      const state = this._ensureOrganizeState(instanceId);
      const factory = window.UnifiedOffcanvasFactory;
      if (!factory || typeof factory.createCardioEditor !== 'function') {
        console.warn('[WorkoutStudio] Cardio editor factory unavailable');
        return;
      }
      factory.createCardioEditor({
        groupId: `studio:${instanceId}`,
        cardioConfig: state.cardioConfig || {},
        onSave: (updatedConfig) => this._applyCardioConfig(instanceId, updatedConfig),
      });
    }

    /**
     * Persist the offcanvas's new cardio_config back into organize state,
     * sync the tray item's display name to the activity name, and refresh
     * the card so the summary line + icon reflect the change.
     */
    _applyCardioConfig(instanceId, cfg) {
      const state = this._ensureOrganizeState(instanceId);
      state.cardioConfig = cfg ? Object.assign({}, cfg) : {};

      // Sync the human-visible name to the activity registry's display
      // name (falls back to the raw activity_type for unknown ids).
      const reg = window.ActivityTypeRegistry;
      const activityType = state.cardioConfig.activity_type || '';
      let displayName = activityType;
      let iconClass = '';
      if (reg && activityType) {
        if (typeof reg.getName === 'function') displayName = reg.getName(activityType) || activityType;
        if (typeof reg.getIcon === 'function') iconClass = reg.getIcon(activityType) || '';
      }

      const item = this.tray && this.tray.getItems().find((it) => it.instanceId === instanceId);
      if (item && displayName) {
        item.name = displayName;
        if (item.exercise) {
          item.exercise.name = displayName;
          item.exercise._activityId = activityType || item.exercise._activityId;
        }
      }

      const card = this.studioCards.get(instanceId);
      if (card && typeof card.setCardioConfig === 'function') {
        card.setCardioConfig(state.cardioConfig, {
          activityIcon: iconClass || 'bx-pulse',
          name: displayName,
          activityId: activityType,
        });
      }

      // Persist draft + refresh save button state (name may have changed).
      this._scheduleDraftSave();
      this._refreshFabState();
    }

    _destroyAllCards() {
      this.studioCards.forEach((c) => c.destroy && c.destroy());
      this.studioCards.clear();
    }

    _destroyAllBlocks() {
      this.studioBlocks.forEach((b) => b.destroy && b.destroy());
      this.studioBlocks.clear();
    }

    _destroyAllNotes() {
      this.studioNotes.forEach((n) => n.destroy && n.destroy());
      this.studioNotes.clear();
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
      if (!partial) return;
      // Name updates live on the tray item, not in organizeState — sync the
      // tray so the save payload picks up the renamed exercise.
      if (typeof partial.name === 'string' && this.tray) {
        const item = this.tray.getItems().find((it) => it.instanceId === instanceId);
        if (item) item.name = partial.name;
      }
      const state = this._ensureOrganizeState(instanceId);
      // Only protocol/weight/rest belong in organizeState; name lives elsewhere
      const { name, ...stateChanges } = partial;
      Object.assign(state, stateChanges);
      this.organizeState.set(instanceId, state);
      this._scheduleDraftSave();
    }

    _onCardMenuAction(instanceId, action, blockId) {
      if (!this.tray) return;

      switch (action) {
        case 'move-up':
          this._moveCardWithinContainer(instanceId, -1);
          break;
        case 'move-down':
          this._moveCardWithinContainer(instanceId, +1);
          break;
        case 'duplicate': {
          const src = this.tray.getItems().find((it) => it.instanceId === instanceId);
          if (src && src.exercise) this.tray.add(src.exercise);
          break;
        }
        case 'delete':
          this.tray.remove(instanceId);
          break;
        case 'move-to-block':
          if (blockId) this._moveCardToBlock(instanceId, blockId);
          break;
        case 'move-out-of-block':
          this._moveCardOutOfBlock(instanceId);
          break;
      }
    }

    /**
     * Move a card up (-1) or down (+1) within whatever container it currently
     * lives in — top-level (organizeOrder) or inside a block (block.instanceIds).
     */
    _moveCardWithinContainer(instanceId, delta) {
      // First check if it's inside a block
      const found = this._findBlockOf(instanceId);
      if (found) {
        const list = found.block.instanceIds;
        const idx = list.indexOf(instanceId);
        if (idx === -1) return;
        const target = idx + delta;
        if (target < 0 || target >= list.length) return;
        list.splice(idx, 1);
        list.splice(target, 0, instanceId);
        this._renderOrganize();
        return;
      }
      // Otherwise it's top-level: reorder organizeOrder entries
      this._moveOrderEntry({ kind: 'card', instanceId }, delta);
    }

    _onCardInfo(instanceId) {
      const item = this.tray && this.tray.getItems().find((it) => it.instanceId === instanceId);
      if (!item) return;
      // Reuse the same detail offcanvas the Page 1 info button opens, but
      // hide the 'Add to Workout' footer button — the exercise is already
      // in this workout, so the action is redundant here. Favorite stays.
      // Pairing chips still work (they target other exercises).
      this._openExerciseDetail(
        item.exercise || { id: item.exerciseId, name: item.name },
        { showAdd: false }
      );
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
      const itemMap = new Map(items.map((it) => [it.instanceId, it]));
      const ts = Date.now();

      const buildExercise = (item, suffix) => {
        const state = this.organizeState.get(item.instanceId) || {};
        const ex = item.exercise || {};
        const groupType = ex.group_type || 'standard';
        const base = {
          exercise_id: ex.id ? String(ex.id) : `ex-${suffix}`,
          name: item.name,
          alternates: [],
          group_type: groupType,
        };
        if (groupType === 'cardio') {
          // Cardio sections: the workout-mode runtime + the legacy builder
          // both expect cardio_config to carry the full activity payload
          // (duration_minutes, distance, target_pace, ...) — see
          // workout-exercise-operations-manager.js's add-cardio path.
          // Sets/reps/rest/weight don't apply to a cardio activity.
          return Object.assign(base, {
            cardio_config: state.cardioConfig ? Object.assign({}, state.cardioConfig) : {},
          });
        }
        return Object.assign(base, {
          sets: state.sets || DEFAULT_SETS,
          reps: state.reps || DEFAULT_REPS,
          rest: state.rest || DEFAULT_REST,
          default_weight: state.weight || '',
          default_weight_unit: state.weightUnit || 'lbs',
        });
      };

      // Walk organizeOrder. Top-level cards become single-exercise sections.
      // Blocks become multi-exercise sections with section.name set. Empty
      // blocks are silently dropped (saving an empty block has no semantic
      // value in the workout payload). Notes are collected separately and
      // emitted as template_notes with an order_index that points into the
      // flattened exercise_groups list (matches what _buildMergedItems in
      // workout-detail-offcanvas.js expects on read-back).
      const sections = [];
      const template_notes = [];
      let flatGroupCount = 0;
      this.organizeOrder.forEach((entry, idx) => {
        if (entry.kind === 'card') {
          const item = itemMap.get(entry.instanceId);
          if (!item) return;
          sections.push({
            section_id: `section-${ts}-${idx}`,
            type: 'standard',
            name: null,
            exercises: [buildExercise(item, `${idx}`)],
          });
          flatGroupCount += 1;
        } else if (entry.kind === 'block') {
          const block = this.blocks.get(entry.blockId);
          if (!block || block.instanceIds.length === 0) return;
          const exercises = block.instanceIds
            .map((iid, exIdx) => {
              const item = itemMap.get(iid);
              return item ? buildExercise(item, `${idx}-${exIdx}`) : null;
            })
            .filter(Boolean);
          if (exercises.length === 0) return;
          sections.push({
            section_id: `section-${ts}-${idx}`,
            type: 'standard',
            name: (block.name || '').trim() || null,
            exercises,
          });
          flatGroupCount += exercises.length;
        } else if (entry.kind === 'note') {
          const note = this.notes.get(entry.noteId);
          if (!note) return;
          // order_index reflects position in the flattened exercise_groups
          // list at the moment of save (notes don't consume a group slot)
          template_notes.push({
            id: entry.noteId,
            content: String(note.content || '').slice(0, 500),
            order_index: flatGroupCount,
          });
        }
      });

      // Flatten to exercise_groups for backward compatibility, mirroring the
      // shape produced by workout-editor-save-manager.js when sections mode
      // is active. Cardio entries carry cardio_config in place of the
      // sets/reps/rest/weight fields (which don't apply).
      const exercise_groups = sections.flatMap((s) => (s.exercises || []).map((e) => {
        const base = {
          group_id: e.exercise_id,
          exercises: { a: e.name },
          group_type: e.group_type || 'standard',
        };
        if ((e.group_type || 'standard') === 'cardio') {
          return Object.assign(base, { cardio_config: e.cardio_config || {} });
        }
        return Object.assign(base, {
          sets: e.sets,
          reps: e.reps,
          rest: e.rest,
          default_weight: e.default_weight,
          default_weight_unit: e.default_weight_unit || 'lbs',
        });
      }));

      return {
        name: this.workoutName,
        description: this.description || '',
        tags: Array.isArray(this.tags) ? this.tags.slice() : [],
        sections,
        exercise_groups,
        workout_type: 'standard',
        template_notes,
      };
    }

    /**
     * Sync FAB enabled state with what the user can actually do right now.
     * Save: needs at least one exercise + a name. Go: additionally needs
     * a workoutId (saved record), since workout-mode loads by id.
     */
    _refreshFabState() {
      const trayHas = this.tray && this.tray.size() > 0;
      const nameSet = !!(this.workoutName && this.workoutName.trim());
      // Save only requires at least one exercise — the name check lives
      // inside _handleSave so users get a friendly "Give your workout a
      // name first" error rather than a silent disabled button.
      const canSave = !!trayHas;
      // Go additionally requires both name + a saved workoutId, since
      // workout-mode is loaded by id.
      const canGo = canSave && nameSet && !!this.workoutId;
      if (this.dom.fabSave) {
        this.dom.fabSave.disabled = !canSave;
        this.dom.fabSave.title = canSave ? 'Save workout' : 'Add an exercise first';
      }
      if (this.dom.fabGo) {
        this.dom.fabGo.disabled = !canGo;
        this.dom.fabGo.title = canGo
          ? 'Start workout'
          : (trayHas ? (nameSet ? 'Save first to start' : 'Add a name then save') : 'Add an exercise to start');
      }
    }

    /**
     * Go-FAB: launch workout-mode for the saved workout. If unsaved edits
     * exist (or this is a brand-new workout that's never been saved), do a
     * save-then-navigate so the user lands in a coherent session. Falls
     * back to a friendly status hint when prerequisites are missing.
     */
    async _handleStartFromFab() {
      if (!this.tray || this.tray.size() === 0) {
        this._setStatus('Add at least one exercise first.', 'error');
        return;
      }
      if (!this.workoutName || !this.workoutName.trim()) {
        this._setStatus('Give your workout a name first.', 'error');
        if (this.dom.workoutNameInput) this.dom.workoutNameInput.focus();
        return;
      }
      // Save (creates on first call, updates on subsequent ones). _handleSave
      // sets this.workoutId on a successful create, so we re-read after.
      try {
        await this._handleSave();
      } catch (_) { /* status already surfaced by _handleSave */ }
      if (!this.workoutId) return; // save failed → don't navigate
      window.location.href = `/workout-mode.html?id=${encodeURIComponent(this.workoutId)}`;
    }

    /**
     * More-FAB sheet — quick actions that don't fit the always-visible
     * header. Prefer UnifiedOffcanvasFactory for parity with the rest of
     * the app; fall back to a native confirm for Discard if the factory
     * isn't loaded (defensive — the studio page may load before some
     * shared services).
     */
    _openMoreSheet() {
      const items = [];
      items.push({
        icon: 'bx-edit-alt',
        title: 'Edit metadata',
        description: 'Open the name / tags / description card',
        onClick: () => {
          if (typeof this._setMetaExpanded === 'function') this._setMetaExpanded(true);
          if (this.dom.workoutNameInput) this.dom.workoutNameInput.focus();
        },
      });
      items.push({
        icon: 'bx-arrow-back',
        title: 'Back to selection',
        description: 'Return to the exercise picker',
        onClick: () => this._showView('select'),
      });
      items.push({
        icon: 'bx-trash',
        title: 'Discard workout',
        description: this.workoutId ? 'Close without further edits' : 'Clear the in-progress workout',
        onClick: () => this._handleDiscardFromFab(),
        danger: true,
      });

      if (window.UnifiedOffcanvasFactory && typeof window.UnifiedOffcanvasFactory.createMenuOffcanvas === 'function') {
        window.UnifiedOffcanvasFactory.createMenuOffcanvas({
          id: 'studioMoreSheet',
          title: 'More options',
          icon: 'bx-dots-vertical-rounded',
          menuItems: items,
        });
      } else {
        // Native fallback — keeps the FAB useful when the factory isn't loaded.
        if (window.confirm('Discard this workout and start fresh?')) this._handleDiscardFromFab();
      }
    }

    _handleDiscardFromFab() {
      if (this.workoutId) {
        // Editing a saved workout — just navigate back, the record is intact.
        window.location.href = '/workout-database.html';
        return;
      }
      // New workout — same effect as the draft-banner Start fresh path.
      if (typeof this._handleStartFresh === 'function') this._handleStartFresh();
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
        const isUpdate = !!this.workoutId;
        if (window.dataManager) {
          if (isUpdate && typeof window.dataManager.updateWorkout === 'function') {
            saved = await window.dataManager.updateWorkout(this.workoutId, payload);
          } else if (!isUpdate && typeof window.dataManager.createWorkout === 'function') {
            saved = await window.dataManager.createWorkout(payload);
          } else {
            throw new Error('dataManager missing save method');
          }
        } else {
          // Fallback for environments without dataManager (e.g. anonymous tests)
          const url = isUpdate
            ? `/api/v3/workouts/${encodeURIComponent(this.workoutId)}`
            : '/api/v3/workouts';
          const resp = await fetch(url, {
            method: isUpdate ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!resp.ok) throw new Error(`Save failed (${resp.status})`);
          saved = await resp.json();
        }
        // After the first successful save of a brand-new workout, remember the
        // id so subsequent saves UPDATE rather than CREATE another copy.
        if (!isUpdate && saved && saved.id) this.workoutId = saved.id;
        // Go-FAB unlocks the moment workoutId exists; flash 'is-saved' on the
        // save FAB for a quick visual confirmation.
        this._refreshFabState();
        if (this.dom.fabSave) {
          this.dom.fabSave.classList.add('is-saved');
          setTimeout(() => this.dom.fabSave && this.dom.fabSave.classList.remove('is-saved'), 1200);
        }
        this._setStatus(isUpdate ? 'Updated!' : 'Saved!', 'success');
        console.log('[WorkoutStudio] Workout saved:', saved && saved.id);
        // Successful save → draft is no longer needed (the workout now lives
        // as a real saved template). Clear it so the next visit starts clean.
        if (window.StudioDraftService) window.StudioDraftService.clear();
        this._hideDraftBanner();
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
        if (this.filters.personal.has('custom')) this._refreshList();
      });

      // The cache service returns seed data instantly, then fetches the full
      // catalog in the background. Re-render when the full data lands so the
      // count jumps from ~139 to ~2,400+.
      window.exerciseCacheService.on('fullDataLoaded', () => {
        this.allExercises = window.exerciseCacheService.exercises || [];
        this._refreshList();
      });

      // Load activity catalog from the existing registry (sync, no network)
      this.allActivities = this._loadActivitiesAsRows();

      this._refreshList();

      // Kick off favorites load in the background; refresh when it lands.
      // Anonymous users have no favorites and the call is skipped.
      this._loadFavorites().then(() => {
        if (this.filters.personal.has('favorites')) this._refreshList();
      });
    }

    _loadActivitiesAsRows() {
      const reg = window.ActivityTypeRegistry;
      if (!reg || typeof reg.getAll !== 'function') return [];
      try {
        return reg.getAll().map((a) => ({
          id: `activity:${a.id}`,
          name: a.name,
          targetMuscleGroup: 'Cardio',
          primaryEquipment: a.category ? this._titleCase(a.category) : 'Activity',
          mechanics: 'Activity',
          exerciseTier: 1,
          isGlobal: true,
          isActivity: true,
          group_type: 'cardio',
          _activityId: a.id,
        }));
      } catch (err) {
        console.warn('[WorkoutStudio] Could not read activity registry:', err);
        return [];
      }
    }

    _titleCase(s) {
      return String(s || '').replace(/\b\w/g, (c) => c.toUpperCase());
    }

    async _loadFavorites() {
      try {
        if (!window.dataManager || !window.dataManager.isUserAuthenticated()) {
          return;
        }
        const token = await window.dataManager.getAuthToken();
        const url = (window.getApiUrl && window.getApiUrl('/api/v3/users/me/favorites')) || '/api/v3/users/me/favorites';
        const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!resp.ok) throw new Error(`favorites fetch ${resp.status}`);
        const data = await resp.json();
        const arr = Array.isArray(data && data.favorites) ? data.favorites : [];
        const ids = arr.map((f) => String(f.exerciseId || f.exercise_id || f.id)).filter(Boolean);
        window.ffn = window.ffn || {};
        window.ffn.exercises = window.ffn.exercises || {};
        window.ffn.exercises.favorites = new Set(ids);
      } catch (err) {
        // Anonymous or auth not ready — leave favorites empty silently
        console.debug('[WorkoutStudio] Favorites not loaded:', err && err.message);
      }
    }

    _refreshList() {
      if (!this.grid) return;
      const all = this._computeFilteredAll();
      this.totalAvailable = all.length;
      const rows = all.slice(0, this.renderedCount);

      if (this.dom.list) {
        this.dom.list.dataset.renderedCount = String(rows.length);
        this.dom.list.dataset.totalCount = String(this.totalAvailable);
      }

      this._updateListCount(rows.length, this.totalAvailable);

      if (rows.length === 0) {
        this.grid.setExercises([]);
        this._showEmpty(this._emptyMessage());
        this._setSentinelVisible(false);
        return;
      }
      this._hideEmpty();
      this.grid.setExercises(rows);
      if (this.tray) this.grid.setCounts(this.tray.countsByExerciseId());

      // Show the sentinel only when there are more rows we could reveal
      this._setSentinelVisible(rows.length < this.totalAvailable);
    }

    _updateListCount(rendered, total) {
      if (!this.dom.listCount) return;
      const fmt = (n) => n.toLocaleString();
      let label = '';
      if (total > 0) {
        label = rendered >= total
          ? `${fmt(total)} total`
          : `${fmt(rendered)} of ${fmt(total)}`;
      }

      this.dom.listCount.textContent = label;
      // Subtle nudge: when the unfiltered pool is large, hint that filters help.
      const hasFilters = this._activeFilterCount() > 0 || (this.searchQuery && this.searchQuery.length >= 2);
      this.dom.listCount.classList.toggle('is-hint', total > 200 && !hasFilters);

      // Mirror into the floating pill (visibility itself is controlled by
      // _ensureFloatingCountObserver, which watches the inline count).
      if (this.dom.floatingCountText) this.dom.floatingCountText.textContent = label;

      // Hide the floating pill entirely when there's nothing or when there's
      // no more to load (point of the pill is to nudge during deep scrolling).
      if (this.dom.floatingCount) {
        const shouldEverShow = total > 0 && rendered < total;
        if (!shouldEverShow) {
          this.dom.floatingCount.hidden = true;
          this.dom.floatingCount.classList.remove('is-visible');
        } else {
          this.dom.floatingCount.hidden = false;
          // Visible-state itself toggled by the IO observer in
          // _ensureFloatingCountObserver. Re-evaluate on next frame in case
          // the inline count is already off-screen.
          requestAnimationFrame(() => this._reevaluateFloatingCount());
        }
      }
    }

    _ensureFloatingCountObserver() {
      if (this._floatingCountObserver || !this.dom.listCount) return;
      if (typeof IntersectionObserver !== 'function') return;
      this._floatingCountObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          // Show floating pill when the inline count is NOT visible
          const inViewport = entry.isIntersecting;
          this._setFloatingCountVisible(!inViewport);
        }
      }, { threshold: 0 });
      this._floatingCountObserver.observe(this.dom.listCount);
    }

    _setFloatingCountVisible(visible) {
      if (!this.dom.floatingCount) return;
      if (this.dom.floatingCount.hidden) return; // pinned hidden by state
      this.dom.floatingCount.classList.toggle('is-visible', !!visible);
    }

    _reevaluateFloatingCount() {
      if (!this.dom.listCount || !this.dom.floatingCount) return;
      const rect = this.dom.listCount.getBoundingClientRect();
      const inViewport = rect.bottom > 0 && rect.top < (window.innerHeight || 0);
      this._setFloatingCountVisible(!inViewport);
    }

    _computeFilteredAll() {
      const query = this.searchQuery;
      const typeSet = this.filters.type;

      // Source pool: exercises and/or activities, depending on the Type filter.
      // Default (no Type chip selected) = exercises only.
      const includeExercises = typeSet.size === 0 || typeSet.has('strength');
      const includeActivities = typeSet.has('activities');

      let pool = [];

      if (includeExercises) {
        let exercisePool;
        if (query && query.length >= 2 && window.exerciseCacheService) {
          exercisePool = window.exerciseCacheService.searchExercises(query, { limit: 2000 });
        } else {
          exercisePool = this.allExercises;
        }
        pool = pool.concat(exercisePool);
      }

      if (includeActivities) {
        const q = (query || '').toLowerCase();
        const activityPool = this.allActivities.filter((a) => {
          if (!query || query.length < 2) return true;
          return (a.name || '').toLowerCase().includes(q) ||
                 (a.primaryEquipment || '').toLowerCase().includes(q);
        });
        pool = pool.concat(activityPool);
      }

      return this._applyFilters(pool);
    }

    _resetPagination() {
      this.renderedCount = LIST_PAGE_SIZE;
    }

    _loadMore() {
      if (this.renderedCount >= this.totalAvailable) return;
      this.renderedCount += LIST_PAGE_SIZE;
      this._refreshList();
    }

    _ensureSentinel() {
      if (this.dom.sentinel || !this.dom.list || !this.dom.list.parentElement) return;
      const sentinel = document.createElement('div');
      sentinel.className = 'studio-list-sentinel';
      sentinel.id = 'studioListSentinel';
      sentinel.setAttribute('aria-hidden', 'true');
      this.dom.list.parentElement.insertBefore(sentinel, this.dom.list.nextSibling);
      this.dom.sentinel = sentinel;

      if (typeof IntersectionObserver === 'function') {
        this._infiniteScrollObserver = new IntersectionObserver((entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) this._loadMore();
          }
        }, { rootMargin: '300px' });
        this._infiniteScrollObserver.observe(sentinel);
      }
    }

    _setSentinelVisible(visible) {
      if (!this.dom.sentinel) return;
      this.dom.sentinel.hidden = !visible;
    }

    _applyFilters(pool) {
      const muscleSet = this.filters.muscleGroup;
      const equipmentSet = this.filters.equipment;
      const personalSet = this.filters.personal;

      if (muscleSet.size === 0 && equipmentSet.size === 0 && personalSet.size === 0) {
        return pool;
      }

      const matchesMuscle = (ex) => {
        if (muscleSet.size === 0) return true;
        // Activities don't carry a muscle group; the muscle filter excludes them.
        if (ex.isActivity) return false;
        const target = String(ex.targetMuscleGroup || '');
        if (muscleSet.has(target)) return true;
        for (const v of muscleSet) {
          if (target && target.toLowerCase().includes(v.toLowerCase())) return true;
        }
        return false;
      };
      const matchesEquipment = (ex) => {
        if (equipmentSet.size === 0) return true;
        if (ex.isActivity) return false;
        const eq = String(ex.primaryEquipment || '');
        if (equipmentSet.has(eq)) return true;
        for (const v of equipmentSet) {
          if (eq && eq.toLowerCase().includes(v.toLowerCase())) return true;
        }
        return false;
      };
      // Personal is OR-within-section: an exercise passes if it matches ANY
      // selected personal chip.
      const favSet = (window.ffn && window.ffn.exercises && window.ffn.exercises.favorites) || new Set();
      const usage = (window.exerciseCacheService && window.exerciseCacheService.usageData) || {};
      const matchesPersonal = (ex) => {
        if (personalSet.size === 0) return true;
        if (personalSet.has('favorites') && favSet.has(ex.id)) return true;
        if (personalSet.has('recent') && usage[ex.id]) return true;
        if (personalSet.has('custom') && ex.isGlobal === false) return true;
        return false;
      };
      return pool.filter((ex) => matchesMuscle(ex) && matchesEquipment(ex) && matchesPersonal(ex));
    }

    _emptyMessage() {
      if (this._activeFilterCount() > 0) {
        return 'No exercises match the active filters.';
      }
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
      // Hydration paths (workout load, draft restore) populate the tray
      // directly with their own organizeOrder structure. Suppress this
      // handler during those windows so we don't auto-sync everything into
      // loose top-level cards.
      if (this._suppressTrayChange) return;

      // FAB save/go enable-state tracks tray contents.
      this._refreshFabState();

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

      // Keep organizeOrder + blocks in sync with the tray:
      //   - new tray items appear as top-level cards at the end
      //   - removed tray items vanish from whichever container they were in
      this._syncOrganizeOrderWithTray(items);

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

      this._scheduleDraftSave();
    }

    _syncOrganizeOrderWithTray(items) {
      const liveIds = new Set(items.map((it) => it.instanceId));

      // 1) Remove entries that reference deleted instanceIds
      this.organizeOrder = this.organizeOrder.filter((e) => {
        if (e.kind === 'card') return liveIds.has(e.instanceId);
        return true; // blocks survive even if all their children were removed
      });
      for (const b of this.blocks.values()) {
        b.instanceIds = b.instanceIds.filter((iid) => liveIds.has(iid));
      }

      // 2) Append any instanceIds that exist in the tray but aren't tracked yet
      const placedIds = new Set();
      for (const e of this.organizeOrder) {
        if (e.kind === 'card') placedIds.add(e.instanceId);
      }
      for (const b of this.blocks.values()) {
        for (const iid of b.instanceIds) placedIds.add(iid);
      }
      for (const it of items) {
        if (!placedIds.has(it.instanceId)) {
          this.organizeOrder.push({ kind: 'card', instanceId: it.instanceId });
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
