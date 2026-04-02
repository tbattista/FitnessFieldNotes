/**
 * Ghost Gym - Programs Page Controller
 * Manages the programs library page with grid, filtering, and CRUD operations
 * Delegates to ProgramsPageFilters and ProgramsPageCrud modules
 * @version 2.0.0
 */

(function() {
    'use strict';

    // ============================================
    // STATE
    // ============================================

    const state = {
        all: [],           // All programs from database
        filtered: [],      // After search/filter
        workouts: [],      // All workouts (for program stats)
        deleteMode: false,
        currentSortIndex: 0,
        editingProgramId: null,  // ID of program being edited in modal
        filters: {
            search: '',
            tags: [],
            difficulty: null,
            sortBy: 'modified_date',
            sortOrder: 'desc'
        }
    };

    // Component instances
    let programGrid = null;
    let programDetailOffcanvas = null;
    let workoutPickerOffcanvas = null;
    let searchDebounceTimer = null;

    // Module references
    const Filters = window.ProgramsPageFilters;
    const Crud = window.ProgramsPageCrud;

    // ============================================
    // INITIALIZATION
    // ============================================

    /**
     * Initialize the programs page
     */
    async function initProgramsPage() {
        // Prevent double initialization
        if (window._programsPageInitialized) {
            console.log('Programs Page already initialized, skipping');
            return;
        }
        window._programsPageInitialized = true;

        console.log('Initializing Programs Page Controller');

        // Debug: Check if required dependencies are available
        console.log('Dependencies check:', {
            ProgramGrid: typeof ProgramGrid !== 'undefined',
            ProgramCard: typeof ProgramCard !== 'undefined',
            ProgramDetailOffcanvas: typeof ProgramDetailOffcanvas !== 'undefined',
            WorkoutPickerOffcanvas: typeof WorkoutPickerOffcanvas !== 'undefined',
            ProgramsPageFilters: !!window.ProgramsPageFilters,
            ProgramsPageCrud: !!window.ProgramsPageCrud,
            dataManager: !!window.dataManager,
            authService: !!window.authService,
            isAuthenticated: window.authService?.isUserAuthenticated?.()
        });

        try {
            // Initialize components
            initProgramGrid();
            initProgramDetailOffcanvas();
            initWorkoutPickerOffcanvas();
            initToolbar();
            initFiltersOffcanvas();
            initDeleteModeToggle();

            // Load data
            await loadData();

            console.log('Programs Page Controller initialized');
        } catch (error) {
            console.error('Error initializing programs page:', error);
            showError('Failed to initialize page');
        }
    }

    /**
     * Initialize the program grid component
     */
    function initProgramGrid() {
        programGrid = new ProgramGrid('programsGridContainer', {
            pageSize: 50,
            showPagination: true,
            emptyIcon: 'bx-folder-open',
            emptyTitle: 'No Programs Yet',
            emptyMessage: 'Create your first program to organize your workouts',
            emptyAction: {
                label: 'Create Your First Program',
                icon: 'bx-plus',
                onClick: () => showProgramModal()
            },
            cardConfig: {
                showStats: true,
                showTags: true,
                showDescription: true,
                showDifficulty: true,
                showDuration: true,
                deleteMode: false,
                // Dropdown menu actions (3-dot menu)
                dropdownActions: ['edit', 'generate', 'delete'],
                // Callbacks
                onCardClick: (program) => openProgramDetail(program),
                onEdit: (program) => editProgram(program.id),
                onGenerate: (program) => showGenerateModal(program),
                onDelete: (programId, programName) => {
                    Crud.handleDeleteProgram(programId, programName, {
                        onSuccess: (id) => {
                            state.all = state.all.filter(p => p.id !== id);
                            applyFiltersAndRender();
                        }
                    });
                },
                onSetActive: (program, setActive) => handleSetActiveProgram(program, setActive),
                onToggleTracker: (program, enable) => handleToggleTracker(program, enable)
            },
            onPageChange: (page) => {
                console.log('Page changed to:', page);
            },
            onBatchDelete: (programIds) => {
                Crud.handleBatchDelete(programIds, {
                    onSuccess: (ids) => {
                        const idsToRemove = new Set(ids);
                        state.all = state.all.filter(p => !idsToRemove.has(p.id));

                        // Exit delete mode
                        const toggle = document.getElementById('deleteModeToggle');
                        if (toggle) {
                            toggle.checked = false;
                            toggle.dispatchEvent(new Event('change'));
                        }

                        applyFiltersAndRender();
                    }
                });
            }
        });

        // Make grid accessible globally for selection action bar
        window.programGrid = programGrid;
    }

    /**
     * Initialize the program detail offcanvas
     */
    function initProgramDetailOffcanvas() {
        programDetailOffcanvas = new ProgramDetailOffcanvas({
            showStats: true,
            showDates: true,
            showDescription: true,
            workouts: state.workouts,
            actions: [
                {
                    id: 'edit',
                    label: 'Edit Details',
                    icon: 'bx-edit',
                    variant: 'outline-secondary',
                    onClick: (program) => {
                        programDetailOffcanvas.hide();
                        editProgram(program.id);
                    }
                },
                {
                    id: 'save',
                    label: 'Done',
                    icon: 'bx-check',
                    variant: 'primary',
                    primary: true,
                    onClick: async (program) => {
                        if (programDetailOffcanvas?.isDirty) {
                            await Crud.saveProgram(program, {
                                getLatest: () => programDetailOffcanvas?.getCurrentProgram(),
                                allPrograms: state.all
                            });
                        }
                        programDetailOffcanvas.hide();
                        applyFiltersAndRender();
                    }
                }
            ],
            onAddWorkouts: (program) => {
                workoutPickerOffcanvas.show(program, state.workouts);
            },
            onRemoveWorkout: async (programId, workoutId) => {
                await Crud.removeWorkoutFromProgram(programId, workoutId, state.all);
            },
            onReorderWorkouts: async (programId, newOrder) => {
                await Crud.reorderProgramWorkouts(programId, newOrder, state.all);
            }
        });
    }

    /**
     * Initialize the workout picker offcanvas
     */
    function initWorkoutPickerOffcanvas() {
        workoutPickerOffcanvas = new WorkoutPickerOffcanvas({
            onConfirm: async (workoutIds, program) => {
                await Crud.addWorkoutsToProgram(program.id, workoutIds, state.all);

                // Refresh program detail
                const updatedProgram = state.all.find(p => p.id === program.id);
                if (updatedProgram && programDetailOffcanvas) {
                    programDetailOffcanvas.update(updatedProgram);
                }
            }
        });
    }

    /**
     * Initialize toolbar event handlers
     */
    function initToolbar() {
        // Search input
        const searchInput = document.getElementById('programSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchDebounceTimer);
                searchDebounceTimer = setTimeout(() => {
                    state.filters.search = e.target.value;
                    applyFiltersAndRender();
                }, 300);
                updateClearButton();
            });
        }

        // Clear search button
        const clearBtn = document.getElementById('clearSearchBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                const searchInput = document.getElementById('programSearchInput');
                if (searchInput) {
                    searchInput.value = '';
                    state.filters.search = '';
                    applyFiltersAndRender();
                    updateClearButton();
                }
            });
        }

        // Sort cycle button
        const sortBtn = document.getElementById('sortCycleBtn');
        if (sortBtn) {
            sortBtn.addEventListener('click', () => handleCycleSort());
        }

        // Create button
        const createBtn = document.getElementById('createProgramBtn');
        if (createBtn) {
            createBtn.addEventListener('click', () => showProgramModal());
        }

        // Delete mode button
        const deleteModeBtn = document.getElementById('deleteModeBtn');
        if (deleteModeBtn) {
            deleteModeBtn.addEventListener('click', () => toggleDeleteMode());
        }

        // Save program button (in modal)
        const saveProgramBtn = document.getElementById('saveProgramBtn');
        if (saveProgramBtn) {
            saveProgramBtn.addEventListener('click', () => handleSaveProgramModal());
        }

        // Tracker toggle (show/hide goal selector)
        const trackerToggle = document.getElementById('programTrackerEnabled');
        const trackerGoalGroup = document.getElementById('trackerGoalGroup');
        if (trackerToggle && trackerGoalGroup) {
            trackerToggle.addEventListener('change', () => {
                trackerGoalGroup.style.display = trackerToggle.checked ? '' : 'none';
            });
        }
    }

    /**
     * Toggle delete mode on/off
     */
    function toggleDeleteMode() {
        const toggle = document.getElementById('deleteModeToggle');
        if (toggle) {
            toggle.checked = !toggle.checked;
            toggle.dispatchEvent(new Event('change'));
        }
    }

    /**
     * Initialize filters offcanvas
     */
    function initFiltersOffcanvas() {
        // Clear filters button
        const clearFiltersBtn = document.getElementById('clearFiltersBtn');
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', () => {
                handleClearFilters();
            });
        }

        // Difficulty filter
        document.querySelectorAll('[data-filter-difficulty]').forEach(btn => {
            btn.addEventListener('click', () => {
                const difficulty = btn.dataset.filterDifficulty;
                state.filters.difficulty = difficulty === 'all' ? null : difficulty;
                applyFiltersAndRender();
                updateFilterBadge();
            });
        });
    }

    /**
     * Initialize delete mode toggle
     */
    function initDeleteModeToggle() {
        const toggle = document.getElementById('deleteModeToggle');
        if (!toggle) return;

        toggle.addEventListener('change', function() {
            state.deleteMode = this.checked;
            document.body.classList.toggle('delete-mode-active', this.checked);

            if (programGrid) {
                programGrid.setDeleteMode(this.checked);
            }

            // Sync delete mode button appearance
            updateDeleteModeButton();
        });
    }

    /**
     * Update delete mode button appearance based on current state
     */
    function updateDeleteModeButton() {
        const deleteModeBtn = document.getElementById('deleteModeBtn');
        if (!deleteModeBtn) return;

        if (state.deleteMode) {
            deleteModeBtn.classList.remove('btn-outline-secondary');
            deleteModeBtn.classList.add('btn-danger');
            deleteModeBtn.querySelector('.delete-label').textContent = 'Cancel';
            deleteModeBtn.title = 'Exit delete mode';
        } else {
            deleteModeBtn.classList.remove('btn-danger');
            deleteModeBtn.classList.add('btn-outline-secondary');
            deleteModeBtn.querySelector('.delete-label').textContent = 'Delete';
            deleteModeBtn.title = 'Toggle delete mode';
        }
    }

    // ============================================
    // DATA LOADING
    // ============================================

    /**
     * Load all data (programs and workouts)
     */
    async function loadData() {
        console.log('Loading programs data...');

        showLoading();

        try {
            // Check if dataManager exists
            if (!window.dataManager) {
                console.error('dataManager is not available!');
                showError('Data manager not initialized');
                return;
            }

            // Load programs and workouts in parallel
            const [programs, workouts] = await Promise.all([
                window.dataManager.getPrograms(),
                window.dataManager.getWorkouts()
            ]);

            state.all = programs || [];
            state.workouts = workouts || [];

            // Update offcanvas workouts reference
            if (programDetailOffcanvas) {
                programDetailOffcanvas.config.workouts = state.workouts;
            }

            console.log(`Loaded ${state.all.length} programs, ${state.workouts.length} workouts`);

            // Update UI
            applyFiltersAndRender();
            updateStats();
            renderTagFilters();
        } catch (error) {
            console.error('Error loading data:', error);
            showError('Failed to load programs');
        }
    }

    // ============================================
    // FILTERING & SORTING (delegates to Filters module)
    // ============================================

    /**
     * Apply current filters and update the grid
     */
    function applyFiltersAndRender() {
        // Filter
        let filtered = Filters.filterPrograms(state.all, state.filters);

        // Sort
        filtered = Filters.sortPrograms(filtered, state.filters.sortBy, state.filters.sortOrder);

        state.filtered = filtered;

        // Update grid
        if (programGrid) {
            programGrid.setWorkouts(state.workouts);
            programGrid.setData(filtered);
        }

        updateStats();
    }

    /**
     * Cycle through sort options
     */
    function handleCycleSort() {
        const result = Filters.cycleSort(state.currentSortIndex);

        state.currentSortIndex = result.index;
        state.filters.sortBy = result.sortBy;
        state.filters.sortOrder = result.sortOrder;

        // Update button label
        const sortLabel = document.querySelector('#sortCycleBtn .sort-label');
        if (sortLabel) {
            sortLabel.textContent = result.label;
        }

        applyFiltersAndRender();
    }

    /**
     * Clear all filters
     */
    function handleClearFilters() {
        state.filters = Filters.getDefaultFilters();
        state.currentSortIndex = 0;

        // Clear UI
        const searchInput = document.getElementById('programSearchInput');
        if (searchInput) searchInput.value = '';

        const sortLabel = document.querySelector('#sortCycleBtn .sort-label');
        if (sortLabel) sortLabel.textContent = 'Newest';

        updateClearButton();
        updateFilterBadge();
        applyFiltersAndRender();
    }

    /**
     * Render tag filters using the Filters module
     */
    function renderTagFilters() {
        const container = document.getElementById('tagsFilterContainer');
        Filters.renderTagFilters(container, state.all, state.filters.tags, (tag, isActive) => {
            const index = state.filters.tags.indexOf(tag);
            if (isActive && index < 0) {
                state.filters.tags.push(tag);
            } else if (!isActive && index >= 0) {
                state.filters.tags.splice(index, 1);
            }
            applyFiltersAndRender();
            updateFilterBadge();
        });
    }

    // ============================================
    // PROGRAM OPERATIONS
    // ============================================

    /**
     * Open program detail offcanvas
     */
    function openProgramDetail(program) {
        if (state.deleteMode) return;  // Don't open detail in delete mode

        if (programDetailOffcanvas) {
            programDetailOffcanvas.config.workouts = state.workouts;
            programDetailOffcanvas.show(program);
        }
    }

    /**
     * Handle set/unset active program
     */
    async function handleSetActiveProgram(program, setActive) {
        try {
            // For authenticated users, sync with backend API
            if (window.dataManager?.isAuthenticated) {
                if (setActive) {
                    const response = await window.dataManager.authenticatedFetch('/api/user/active-program', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ program_id: program.id })
                    });
                    if (!response.ok) throw new Error(`Server returned ${response.status}`);
                } else {
                    const response = await window.dataManager.authenticatedFetch('/api/user/active-program', {
                        method: 'DELETE'
                    });
                    if (!response.ok) throw new Error(`Server returned ${response.status}`);
                }
            }

            // Update localStorage (works for both authenticated and anonymous users)
            if (setActive) {
                localStorage.setItem('ffn_active_program_id', program.id);
                if (window.showAlert) window.showAlert(`"${program.name}" set as active program`, 'success');
            } else {
                localStorage.removeItem('ffn_active_program_id');
                if (window.showAlert) window.showAlert('Active program removed', 'info');
            }

            // Re-render grid to update badges
            if (programGrid) programGrid.renderCards();
        } catch (err) {
            console.error('Error setting active program:', err);
            if (window.showAlert) window.showAlert('Failed to update active program', 'danger');
        }
    }

    /**
     * Handle toggle tracker enabled on a program
     */
    async function handleToggleTracker(program, enable) {
        try {
            const updatedProgram = await window.dataManager.updateProgram(program.id, {
                tracker_enabled: enable,
                tracker_goal: enable ? (program.tracker_goal || '3/week') : program.tracker_goal
            });

            // Update local state
            const index = state.all.findIndex(p => p.id === program.id);
            if (index >= 0) {
                state.all[index] = updatedProgram;
            }

            if (enable) {
                if (window.showAlert) window.showAlert(`Tracker enabled for "${program.name}"`, 'success');
            } else {
                if (window.showAlert) window.showAlert(`Tracker disabled for "${program.name}"`, 'info');
            }

            applyFiltersAndRender();
        } catch (err) {
            console.error('Error toggling tracker:', err);
            if (window.showAlert) window.showAlert('Failed to update tracker setting', 'danger');
        }
    }

    /**
     * Start first workout in program
     */
    function startFirstWorkout(program) {
        const firstWorkout = program.workouts?.[0];
        if (!firstWorkout) {
            showError('No workouts in this program');
            return;
        }

        window.location.href = `/workout-mode.html?workoutId=${firstWorkout.workout_id}`;
    }

    // ============================================
    // UI HELPERS
    // ============================================

    /**
     * Show loading state
     */
    function showLoading() {
        if (programGrid) {
            programGrid.showLoading();
        }
    }

    /**
     * Update stats display
     */
    function updateStats() {
        const countEl = document.getElementById('totalProgramsCount');
        if (countEl) {
            countEl.textContent = state.all.length;
        }

        const showingEl = document.getElementById('showingCount');
        if (showingEl) {
            showingEl.textContent = state.filtered.length;
        }

        const totalEl = document.getElementById('totalCount');
        if (totalEl) {
            totalEl.textContent = state.all.length;
        }
    }

    /**
     * Update clear button visibility
     */
    function updateClearButton() {
        const clearBtn = document.getElementById('clearSearchBtn');
        const searchInput = document.getElementById('programSearchInput');
        if (clearBtn && searchInput) {
            clearBtn.style.display = searchInput.value ? 'block' : 'none';
        }
    }

    /**
     * Update filter badge
     */
    function updateFilterBadge() {
        const badge = document.getElementById('filterBadge');
        if (!badge) return;

        let count = 0;
        if (state.filters.difficulty) count++;
        if (state.filters.tags.length > 0) count += state.filters.tags.length;

        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'inline';
        } else {
            badge.style.display = 'none';
        }
    }

    /**
     * Show success message
     */
    function showSuccess(message) {
        if (window.showAlert) {
            window.showAlert(message, 'success');
        } else {
            console.log(message);
        }
    }

    /**
     * Show error message
     */
    function showError(message) {
        if (window.showAlert) {
            window.showAlert(message, 'danger');
        } else {
            console.error(message);
        }
    }

    // ============================================
    // MODAL FUNCTIONS (kept for compatibility)
    // ============================================

    /**
     * Show program modal (create or edit)
     */
    function showProgramModal(programId = null) {
        // Use existing modal from programs.html
        if (window.showProgramModal) {
            window.showProgramModal(programId);
        } else {
            // Fallback: trigger modal directly
            clearProgramForm();
            const modal = new bootstrap.Modal(document.getElementById('programModal'));
            modal.show();
        }
    }

    /**
     * Edit program - populate modal with existing data
     */
    function editProgram(programId) {
        const program = state.all.find(p => p.id === programId);
        if (!program) {
            console.error('Program not found:', programId);
            return;
        }

        // Set editing state
        state.editingProgramId = programId;

        // Populate form fields
        document.getElementById('programName').value = program.name || '';
        document.getElementById('programDescription').value = program.description || '';
        document.getElementById('programDuration').value = program.duration_weeks || '';
        document.getElementById('programDifficulty').value = program.difficulty_level || 'intermediate';
        document.getElementById('programTags').value = (program.tags || []).join(', ');
        document.getElementById('programModalTitle').textContent = 'Edit Program';

        // Populate tracker fields
        const trackerToggle = document.getElementById('programTrackerEnabled');
        const trackerGoal = document.getElementById('programTrackerGoal');
        const trackerGoalGroup = document.getElementById('trackerGoalGroup');
        if (trackerToggle) {
            trackerToggle.checked = program.tracker_enabled || false;
        }
        if (trackerGoal) {
            trackerGoal.value = program.tracker_goal || '';
        }
        if (trackerGoalGroup) {
            trackerGoalGroup.style.display = program.tracker_enabled ? '' : 'none';
        }

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('programModal'));
        modal.show();
    }

    /**
     * Show generate modal
     */
    function showGenerateModal(program) {
        if (window.previewProgram) {
            window.previewProgram(program.id);
        }
    }

    /**
     * Clear program form
     */
    function clearProgramForm() {
        document.getElementById('programName').value = '';
        document.getElementById('programDescription').value = '';
        document.getElementById('programDuration').value = '';
        document.getElementById('programDifficulty').value = 'intermediate';
        document.getElementById('programTags').value = '';
        document.getElementById('programModalTitle').textContent = 'Create Program';

        // Clear tracker fields
        const trackerToggle = document.getElementById('programTrackerEnabled');
        const trackerGoal = document.getElementById('programTrackerGoal');
        const trackerGoalGroup = document.getElementById('trackerGoalGroup');
        if (trackerToggle) trackerToggle.checked = false;
        if (trackerGoal) trackerGoal.value = '';
        if (trackerGoalGroup) trackerGoalGroup.style.display = 'none';

        // Clear any stored editing program ID
        state.editingProgramId = null;
    }

    /**
     * Handle save program from modal (create or edit)
     */
    async function handleSaveProgramModal() {
        try {
            // Collect form data
            const programData = {
                name: document.getElementById('programName')?.value?.trim(),
                description: document.getElementById('programDescription')?.value?.trim() || '',
                duration_weeks: parseInt(document.getElementById('programDuration')?.value) || null,
                difficulty_level: document.getElementById('programDifficulty')?.value || 'intermediate',
                tags: document.getElementById('programTags')?.value?.split(',').map(tag => tag.trim()).filter(tag => tag) || [],
                tracker_enabled: document.getElementById('programTrackerEnabled')?.checked || false,
                tracker_goal: document.getElementById('programTrackerGoal')?.value || null
            };

            // Validate required fields
            if (!programData.name) {
                showError('Program name is required');
                return;
            }

            // Show loading state
            const saveBtn = document.getElementById('saveProgramBtn');
            const originalText = saveBtn.innerHTML;
            saveBtn.innerHTML = '<i class="bx bx-loader-alt bx-spin me-1"></i>Saving...';
            saveBtn.disabled = true;

            let savedProgram;

            try {
                if (state.editingProgramId) {
                    // Update existing program
                    savedProgram = await window.dataManager.updateProgram(state.editingProgramId, programData);

                    // Update local state
                    const index = state.all.findIndex(p => p.id === state.editingProgramId);
                    if (index >= 0) {
                        state.all[index] = savedProgram;
                    }

                    showSuccess(`Program "${savedProgram.name}" updated successfully!`);
                } else {
                    // Create new program
                    savedProgram = await window.dataManager.createProgram(programData);

                    // Add to local state
                    state.all.unshift(savedProgram);

                    showSuccess(`Program "${savedProgram.name}" created successfully!`);
                }

                // Refresh grid
                applyFiltersAndRender();

                // Close modal
                const modal = bootstrap.Modal.getInstance(document.getElementById('programModal'));
                if (modal) {
                    modal.hide();
                }

                // Clear form
                clearProgramForm();

            } finally {
                // Reset button state
                saveBtn.innerHTML = originalText;
                saveBtn.disabled = false;
            }

        } catch (error) {
            console.error('Error saving program:', error);
            showError('Failed to save program: ' + error.message);
        }
    }

    // ============================================
    // EXPORTS
    // ============================================

    // Expose functions globally
    window.initProgramsPage = initProgramsPage;
    window.loadProgramsData = loadData;
    window.filterPrograms = applyFiltersAndRender;
    window.cycleProgramSort = handleCycleSort;
    window.clearProgramFilters = handleClearFilters;
    window.toggleProgramDeleteMode = function(enabled) {
        state.deleteMode = enabled;
        if (programGrid) programGrid.setDeleteMode(enabled);
    };

    // Initialize on DOMContentLoaded if not already handled
    document.addEventListener('DOMContentLoaded', function() {
        // Check if already initialized (programs.html inline script may call initProgramsPage)
        if (!window._programsPageInitialized) {
            // Wait for Firebase
            if (window.firebaseReady) {
                initProgramsPage();
            } else {
                window.addEventListener('firebaseReady', initProgramsPage);
            }
        }
    });

    // Listen for auth state changes to reload data (e.g., after login)
    window.addEventListener('authStateChanged', function(event) {
        console.log('Auth state changed, reloading programs data...', event.detail);
        if (window._programsPageInitialized && event.detail?.isAuthenticated) {
            // User just signed in, reload from Firestore
            loadData();
        }
    });

    // Re-render grid when active program sync completes (fixes race condition on page load)
    window.addEventListener('activeProgramSynced', function() {
        if (window._programsPageInitialized && programGrid) {
            programGrid.renderCards();
        }
    });

    console.log('Programs Page Controller loaded');

})();
