/**
 * Ghost Gym - Public Workouts Page
 * Browse and save shared workout templates
 * @version 3.0.0 - Refactored to use shared components
 */

(function() {
    'use strict';

    // Shared component instances
    let workoutGrid = null;
    let workoutDetailOffcanvas = null;

    // Page state
    let currentPage = 1;
    let pageSize = 20;
    let totalCount = 0;
    let currentFilters = {
        search: '',
        tags: [],
        sortBy: 'created_at'
    };

    // Sort options for cycle button
    const SORT_OPTIONS = [
        { value: 'created_at', label: 'Newest', icon: 'bx-sort-alt-2' },
        { value: 'view_count', label: 'Most Viewed', icon: 'bx-show' },
        { value: 'save_count', label: 'Most Saved', icon: 'bx-bookmark' }
    ];
    let currentSortIndex = 0;

    /**
     * Initialize the public workouts page
     */
    window.initPublicWorkoutsPage = async function() {
        console.log('🚀 Initializing Public Workouts Page');

        // Initialize shared components
        initializeComponents();

        // Set up event listeners
        setupEventListeners();

        // Initialize category chips
        initCategoryChips();

        // Check for direct workout ID in URL (from share link)
        const urlParams = new URLSearchParams(window.location.search);
        const workoutId = urlParams.get('id');

        if (workoutId) {
            // Open workout detail directly
            console.log('📋 Opening workout from URL:', workoutId);
            await openWorkoutDetail(workoutId);
        }

        // Show share button if user is authenticated
        showShareButtonIfAuth();

        // Load workouts
        await loadPublicWorkouts();

        console.log('✅ Public Workouts page initialized');
    };

    /**
     * Initialize shared components
     */
    function initializeComponents() {
        console.log('🔧 Initializing shared components...');
        
        // Initialize WorkoutDetailOffcanvas for public workouts
        workoutDetailOffcanvas = new WorkoutDetailOffcanvas({
            showCreator: true,      // Show who created it
            showStats: true,        // Show view/save counts
            showDates: true,        // Show creation date
            actions: [
                {
                    id: 'save',
                    label: 'Save to My Workouts',
                    icon: 'bx-bookmark',
                    variant: 'primary',
                    onClick: (workout) => saveWorkout(workout)
                },
                {
                    id: 'do-once',
                    label: 'Do Once',
                    icon: 'bx-play-circle',
                    variant: 'success',
                    primary: true,
                    onClick: (workout) => doOnceWorkout(workout)
                }
            ]
        });
        
        // Initialize WorkoutGrid for public workouts
        workoutGrid = new WorkoutGrid('publicWorkoutsContainer', {
            emptyMessage: 'No public workouts found',
            emptySubtext: 'Try adjusting your filters or check back later',
            cardConfig: {
                showCreator: true,      // Show creator name
                showStats: true,        // Show view/save counts
                showDates: true,        // Show creation date
                showTags: true,         // Show tags
                showExercisePreview: true, // Show exercise preview
                dropdownActions: ['view', 'save', 'save-and-edit'],  // View, Save, Copy and Edit
                actions: [],            // No action buttons at bottom
                onCardClick: (workout) => openWorkoutDetail(workout.id),  // Click card to view details
                onViewDetails: (workout) => openWorkoutDetail(workout.id),
                onSave: (workout) => saveWorkout(workout),
                onSaveAndEdit: (workout) => saveAndEditWorkout(workout)
            },
            onPageChange: (page) => {
                currentPage = page;
                loadPublicWorkouts();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
        
        console.log('✅ Shared components initialized');
    }

    /**
     * Save workout to user's library
     */
    async function saveWorkout(workout) {
        console.log('💾 Saving workout:', workout);
        
        try {
            // Check if user is authenticated
            if (!window.dataManager || !window.dataManager.isUserAuthenticated()) {
                if (window.toastNotifications) {
                    window.toastNotifications.warning('Please sign in to save workouts');
                }
                // Optionally show login modal
                const loginModal = document.getElementById('authModal');
                if (loginModal) {
                    const modal = new bootstrap.Modal(loginModal);
                    modal.show();
                }
                return;
            }
            
            // Show loading state on the save button
            const saveButton = document.querySelector('[data-action="save"]');
            const originalHTML = saveButton ? saveButton.innerHTML : null;
            if (saveButton) {
                saveButton.disabled = true;
                saveButton.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving...';
            }
            
            // Get auth token
            const authToken = await window.dataManager.getAuthToken();
            
            // Call API to save workout
            const url = window.config.api.getUrl(`/api/v3/sharing/public-workouts/${workout.id}/save`);
            console.log('📡 Saving workout to:', url);
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({
                    custom_name: null // Could add UI for custom name later
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to save workout (${response.status})`);
            }
            
            const savedWorkout = await response.json();
            console.log('✅ Workout saved successfully:', savedWorkout);
            
            // Show success toast
            if (window.toastNotifications) {
                window.toastNotifications.success(
                    `"${savedWorkout.name}" has been added to your workouts!`,
                    'Workout Saved'
                );
            }
            
            // Close the detail offcanvas
            if (workoutDetailOffcanvas) {
                workoutDetailOffcanvas.hide();
            }
            
            // Restore button state
            if (saveButton && originalHTML) {
                saveButton.disabled = false;
                saveButton.innerHTML = originalHTML;
            }
            
        } catch (error) {
            console.error('❌ Error saving workout:', error);
            
            // Show error toast
            if (window.toastNotifications) {
                window.toastNotifications.error(
                    error.message || 'Failed to save workout. Please try again.',
                    'Save Failed'
                );
            }
            
            // Restore button state
            const saveButton = document.querySelector('[data-action="save"]');
            if (saveButton) {
                saveButton.disabled = false;
                saveButton.innerHTML = '<i class="bx bx-bookmark me-1"></i>Save to My Workouts';
            }
        }
    }

    /**
     * Save workout to user's library and open in editor
     */
    async function saveAndEditWorkout(workout) {
        console.log('💾 Saving and editing workout:', workout);

        try {
            // Check if user is authenticated
            if (!window.dataManager || !window.dataManager.isUserAuthenticated()) {
                if (window.toastNotifications) {
                    window.toastNotifications.warning('Please sign in to save and edit workouts');
                }
                // Show login modal
                const loginModal = document.getElementById('authModal');
                if (loginModal) {
                    const modal = new bootstrap.Modal(loginModal);
                    modal.show();
                }
                return;
            }

            // Get auth token
            const authToken = await window.dataManager.getAuthToken();

            // Call API to save workout
            const url = window.config.api.getUrl(`/api/v3/sharing/public-workouts/${workout.id}/save`);
            console.log('📡 Saving workout to:', url);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({
                    custom_name: null
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to save workout (${response.status})`);
            }

            const savedWorkout = await response.json();
            console.log('✅ Workout saved, opening editor:', savedWorkout);

            // 'Save and Edit' from the public workouts library — open the
            // copy in the studio (new default editor) so the user gets the
            // modern picker + organize flow. Builder still reachable via
            // the per-card 'Edit in Builder' menu item from the library.
            window.location.href = `/workout-studio.html?id=${savedWorkout.id}`;

        } catch (error) {
            console.error('❌ Error saving workout:', error);

            if (window.toastNotifications) {
                window.toastNotifications.error(
                    error.message || 'Failed to save workout. Please try again.',
                    'Save Failed'
                );
            }
        }
    }

    /**
     * Load a public workout into workout mode for a single session
     * Saves as archived so it exists in Firestore but stays hidden from library
     */
    async function doOnceWorkout(workout) {
        console.log('🏋️ Do Once workout:', workout);

        try {
            // Show loading state
            const doOnceBtn = document.querySelector('[data-action="do-once"]');
            const saveBtn = document.querySelector('[data-action="save"]');
            if (doOnceBtn) {
                doOnceBtn.disabled = true;
                doOnceBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Starting...';
            }
            if (saveBtn) saveBtn.disabled = true;

            const isAuthenticated = window.dataManager && window.dataManager.isUserAuthenticated();

            if (isAuthenticated) {
                // Authenticated flow: save via API, archive, navigate
                const authToken = await window.dataManager.getAuthToken();

                const url = window.config.api.getUrl(`/api/v3/sharing/public-workouts/${workout.id}/save`);
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${authToken}`
                    },
                    body: JSON.stringify({ custom_name: null })
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.detail || `Failed to load workout (${response.status})`);
                }

                const savedWorkout = await response.json();
                console.log('✅ Workout saved for Do Once:', savedWorkout);

                await window.dataManager.updateWorkout(savedWorkout.id, { is_archived: true });
                console.log('📦 Workout archived:', savedWorkout.id);

                window.location.href = `workout-studio.html?id=${savedWorkout.id}&start=1`;
            } else {
                // Anonymous flow: save to localStorage, navigate with source=public
                console.log('👤 Anonymous Do Once - saving to localStorage');

                const workoutData = {
                    name: workout.name,
                    description: workout.description || '',
                    exercise_groups: workout.exercise_groups || [],
                    tags: workout.tags || [],
                    is_archived: true
                };

                const localWorkout = window.dataManager.createLocalStorageWorkout(workoutData);
                console.log('✅ Workout saved to localStorage for Do Once:', localWorkout.id);

                window.location.href = `workout-studio.html?id=${localWorkout.id}&start=1&source=public`;
            }

        } catch (error) {
            console.error('❌ Error starting Do Once workout:', error);

            if (window.toastNotifications) {
                window.toastNotifications.error(
                    error.message || 'Failed to start workout. Please try again.',
                    'Start Failed'
                );
            }

            // Restore button states
            const doOnceBtn = document.querySelector('[data-action="do-once"]');
            const saveBtn = document.querySelector('[data-action="save"]');
            if (doOnceBtn) {
                doOnceBtn.disabled = false;
                doOnceBtn.innerHTML = '<i class="bx bx-play-circle me-1"></i>Do Once';
            }
            if (saveBtn) saveBtn.disabled = false;
        }
    }

    /**
     * Set up event listeners
     */
    function setupEventListeners() {
        // Sort select in offcanvas - sync with toolbar button
        const sortSelect = document.getElementById('sortBySelect');
        if (sortSelect) {
            sortSelect.addEventListener('change', () => {
                currentFilters.sortBy = sortSelect.value;

                // Sync cycle button with select
                const sortOption = SORT_OPTIONS.find(o => o.value === sortSelect.value);
                if (sortOption) {
                    currentSortIndex = SORT_OPTIONS.indexOf(sortOption);
                    const btn = document.getElementById('sortCycleBtn');
                    if (btn) {
                        btn.querySelector('.sort-label').textContent = sortOption.label;
                        btn.querySelector('i').className = `bx ${sortOption.icon}`;
                    }
                }

                currentPage = 1;
                loadPublicWorkouts();
            });
        }

        // Sort cycle button in toolbar
        const sortCycleBtn = document.getElementById('sortCycleBtn');
        if (sortCycleBtn) {
            sortCycleBtn.addEventListener('click', cycleSort);
        }

        // Apply filters button
        const applyFiltersBtn = document.getElementById('applyFiltersBtn');
        if (applyFiltersBtn) {
            applyFiltersBtn.addEventListener('click', () => {
                applyFilters();
            });
        }

        // Clear filters button
        const clearFiltersBtn = document.getElementById('clearFiltersBtn');
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', () => {
                clearFilters();
            });
        }

        // Tags input (apply on Enter)
        const tagsInput = document.getElementById('tagsInput');
        if (tagsInput) {
            tagsInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    applyFilters();
                    // Close offcanvas
                    const offcanvas = bootstrap.Offcanvas.getInstance(document.getElementById('filtersOffcanvas'));
                    if (offcanvas) offcanvas.hide();
                }
            });
        }

        // Initialize toolbar search
        initToolbarSearch();
    }

    /**
     * Initialize category filter chips
     */
    function initCategoryChips() {
        const container = document.getElementById('categoryChips');
        if (!container) return;

        const chips = container.querySelectorAll('.category-chip');
        chips.forEach(chip => {
            chip.addEventListener('click', () => {
                const tag = chip.dataset.tag;
                const isActive = chip.classList.contains('active');

                // Deactivate all chips
                chips.forEach(c => c.classList.remove('active'));

                if (isActive) {
                    // Toggle off - remove tag filter
                    currentFilters.tags = currentFilters.tags.filter(t => t !== tag);
                } else {
                    // Activate this chip - set tag as sole filter
                    chip.classList.add('active');
                    currentFilters.tags = [tag];
                    // Sync the tags input in offcanvas
                    const tagsInput = document.getElementById('tagsInput');
                    if (tagsInput) tagsInput.value = tag;
                }

                currentPage = 1;
                updateFilterBadge();
                loadPublicWorkouts();
            });
        });

        console.log('✅ Category chips initialized');
    }

    /**
     * Initialize toolbar search with debounce
     */
    function initToolbarSearch() {
        const searchInput = document.getElementById('workoutSearchInput');
        const clearBtn = document.getElementById('clearSearchBtn');
        if (!searchInput) return;

        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim();
            clearBtn.style.display = query ? 'block' : 'none';

            searchTimeout = setTimeout(() => {
                currentFilters.search = query;
                currentPage = 1;
                loadPublicWorkouts();
            }, 300);
        });

        clearBtn?.addEventListener('click', () => {
            searchInput.value = '';
            clearBtn.style.display = 'none';
            currentFilters.search = '';
            currentPage = 1;
            loadPublicWorkouts();
        });
    }

    /**
     * Cycle through sort options
     */
    function cycleSort() {
        currentSortIndex = (currentSortIndex + 1) % SORT_OPTIONS.length;
        const sortOption = SORT_OPTIONS[currentSortIndex];

        currentFilters.sortBy = sortOption.value;

        // Update toolbar button
        const btn = document.getElementById('sortCycleBtn');
        if (btn) {
            btn.querySelector('.sort-label').textContent = sortOption.label;
            btn.querySelector('i').className = `bx ${sortOption.icon}`;
        }

        // Sync offcanvas select
        const sortSelect = document.getElementById('sortBySelect');
        if (sortSelect) sortSelect.value = sortOption.value;

        currentPage = 1;
        loadPublicWorkouts();
    }

    /**
     * Update filter badge count
     */
    function updateFilterBadge() {
        const badge = document.getElementById('filterBadge');
        if (!badge) return;

        const count = currentFilters.tags.length;
        badge.textContent = count;
        badge.style.display = count > 0 ? 'inline-block' : 'none';
    }

    /**
     * Load public workouts from API
     */
    async function loadPublicWorkouts() {
        console.log('📡 Loading public workouts...', { page: currentPage, filters: currentFilters });

        // Show loading state via grid component
        if (workoutGrid) {
            workoutGrid.showLoading();
        }

        try {
            // Build query parameters
            const params = new URLSearchParams({
                page: currentPage,
                page_size: pageSize,
                sort_by: currentFilters.sortBy
            });

            // Add tags if present
            if (currentFilters.tags && currentFilters.tags.length > 0) {
                currentFilters.tags.forEach(tag => {
                    params.append('tags', tag);
                });
            }

            // Add search if present
            if (currentFilters.search) {
                params.append('search', currentFilters.search);
            }

            // Call API
            const response = await fetch(`/api/v3/sharing/public-workouts?${params.toString()}`);

            if (!response.ok) {
                throw new Error('Failed to load workouts');
            }

            const data = await response.json();
            console.log('✅ Loaded public workouts:', data);

            // Update state
            window.ffn.publicWorkouts.all = data.workouts;
            window.ffn.publicWorkouts.displayed = data.workouts;
            window.ffn.publicWorkouts.currentPage = data.page;
            window.ffn.publicWorkouts.totalCount = data.total_count;
            totalCount = data.total_count;

            // Update UI
            updateStats(data.total_count, data.workouts.length);
            updateFilterBadge();

            // Use WorkoutGrid component to render with server-side pagination info
            if (workoutGrid) {
                workoutGrid.setData(data.workouts, {
                    totalItems: data.total_count,
                    currentPage: data.page
                });
            }

        } catch (error) {
            console.error('❌ Error loading public workouts:', error);
            if (workoutGrid) {
                workoutGrid.setData([]); // Show empty state
            }
            if (window.toastNotifications) {
                window.toastNotifications.error(error.message, 'Failed to load workouts');
            }
        }
    }

    /**
     * Open workout detail using shared component
     */
    window.openWorkoutDetail = async function(workoutId) {
        console.log('📋 Opening workout detail:', workoutId);

        try {
            // Fetch workout details from API
            const response = await fetch(`/api/v3/sharing/public-workouts/${workoutId}`);
            
            if (!response.ok) {
                throw new Error('Failed to load workout details');
            }
            
            const workout = await response.json();
            
            // Show using shared component
            if (workoutDetailOffcanvas) {
                workoutDetailOffcanvas.show(workout);
            }
            
        } catch (error) {
            console.error('❌ Error loading workout details:', error);
            if (window.toastNotifications) {
                window.toastNotifications.error(error.message, 'Failed to load workout details');
            }
        }
    };

    /**
     * Apply filters
     */
    function applyFilters() {
        const tagsInput = document.getElementById('tagsInput');
        const sortSelect = document.getElementById('sortBySelect');

        // Parse tags
        if (tagsInput && tagsInput.value.trim()) {
            currentFilters.tags = tagsInput.value
                .split(',')
                .map(t => t.trim())
                .filter(t => t);
        } else {
            currentFilters.tags = [];
        }

        // Update sort
        if (sortSelect) {
            currentFilters.sortBy = sortSelect.value;
        }

        // Reset to page 1 and reload
        currentPage = 1;
        loadPublicWorkouts();
    }

    /**
     * Clear all filters
     */
    function clearFilters() {
        const tagsInput = document.getElementById('tagsInput');
        const sortSelect = document.getElementById('sortBySelect');
        const searchInput = document.getElementById('workoutSearchInput');
        const clearSearchBtn = document.getElementById('clearSearchBtn');

        if (tagsInput) tagsInput.value = '';
        if (sortSelect) sortSelect.value = 'created_at';
        if (searchInput) searchInput.value = '';
        if (clearSearchBtn) clearSearchBtn.style.display = 'none';

        // Reset sort cycle button
        currentSortIndex = 0;
        const sortBtn = document.getElementById('sortCycleBtn');
        if (sortBtn) {
            sortBtn.querySelector('.sort-label').textContent = 'Newest';
            sortBtn.querySelector('i').className = 'bx bx-sort-alt-2';
        }

        currentFilters = {
            search: '',
            tags: [],
            sortBy: 'created_at'
        };

        // Clear active category chips
        const chips = document.querySelectorAll('.category-chip');
        chips.forEach(c => c.classList.remove('active'));

        currentPage = 1;
        loadPublicWorkouts();
    }

    /**
     * Update stats display
     */
    function updateStats(total, showing) {
        const totalCountEl = document.getElementById('totalCount');
        const showingCountEl = document.getElementById('showingCount');
        const toolbarCountEl = document.getElementById('toolbarCount');

        if (totalCountEl) totalCountEl.textContent = total;
        if (showingCountEl) showingCountEl.textContent = showing;

        // Update toolbar results count
        if (toolbarCountEl) {
            if (total === 0) {
                toolbarCountEl.textContent = '';
            } else if (showing < total) {
                toolbarCountEl.textContent = `${showing} of ${total} workouts`;
            } else {
                toolbarCountEl.textContent = `${total} ${total === 1 ? 'workout' : 'workouts'}`;
            }
        }
    }

    /**
     * Show the "Share a Workout" button if user is authenticated
     */
    function showShareButtonIfAuth() {
        const btn = document.getElementById('shareWorkoutBtn');
        if (!btn) return;

        if (window.dataManager && window.dataManager.isUserAuthenticated()) {
            btn.classList.remove('d-none');
        }

        // Also listen for auth state changes
        window.addEventListener('authStateChanged', (e) => {
            if (e.detail && e.detail.isAuthenticated) {
                btn.classList.remove('d-none');
            } else {
                btn.classList.add('d-none');
            }
        });
    }

    /**
     * Initialize share picker offcanvas - load user workouts when opened
     */
    const sharePickerEl = document.getElementById('sharePickerOffcanvas');
    if (sharePickerEl) {
        sharePickerEl.addEventListener('show.bs.offcanvas', loadSharePickerWorkouts);
    }

    async function loadSharePickerWorkouts() {
        const loadingEl = document.getElementById('sharePickerLoading');
        const emptyEl = document.getElementById('sharePickerEmpty');
        const listEl = document.getElementById('sharePickerList');
        const optionsEl = document.getElementById('sharePickerOptions');

        // Show loading
        loadingEl.style.display = 'block';
        emptyEl.style.display = 'none';
        listEl.style.display = 'none';
        optionsEl.style.display = 'none';

        try {
            if (!window.dataManager || !window.dataManager.getWorkouts) {
                throw new Error('Data manager not available');
            }

            const workouts = await window.dataManager.getWorkouts();

            loadingEl.style.display = 'none';

            if (!workouts || workouts.length === 0) {
                emptyEl.style.display = 'block';
                return;
            }

            // Render workout list
            listEl.innerHTML = '';
            workouts.forEach(w => {
                const workoutData = w.workout_data || w;
                const name = workoutData.name || w.name || 'Untitled Workout';
                const exerciseCount = window.ExerciseDataUtils
                    ? ExerciseDataUtils.getExerciseCount(workoutData)
                    : 0;

                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
                item.innerHTML = `
                    <div>
                        <div class="fw-semibold">${escapeHtml(name)}</div>
                        <small class="text-muted">${exerciseCount} exercise${exerciseCount !== 1 ? 's' : ''}</small>
                    </div>
                    <i class="bx bx-chevron-right text-muted"></i>
                `;
                item.addEventListener('click', () => handleSharePickerSelect(w));
                listEl.appendChild(item);
            });

            listEl.style.display = 'block';
            optionsEl.style.display = 'block';

        } catch (error) {
            console.error('❌ Error loading workouts for share picker:', error);
            loadingEl.style.display = 'none';
            emptyEl.style.display = 'block';
            emptyEl.querySelector('p').textContent = 'Failed to load your workouts.';
        }
    }

    async function handleSharePickerSelect(workout) {
        const showName = document.getElementById('sharePickerShowName')?.checked ?? true;

        try {
            if (!window.dataManager || !window.dataManager.isUserAuthenticated()) {
                if (window.toastNotifications) {
                    window.toastNotifications.warning('Please sign in to share workouts');
                }
                return;
            }

            const authToken = await window.dataManager.getAuthToken();

            const response = await fetch('/api/v3/sharing/share-public', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    workout_id: workout.id,
                    show_creator_name: showName
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Failed to share workout');
            }

            const publicWorkout = await response.json();
            console.log('✅ Workout shared publicly:', publicWorkout);

            // Close offcanvas
            const offcanvasInstance = bootstrap.Offcanvas.getInstance(document.getElementById('sharePickerOffcanvas'));
            if (offcanvasInstance) offcanvasInstance.hide();

            // Show success toast
            const workoutData = workout.workout_data || workout;
            const name = workoutData.name || workout.name || 'Workout';
            if (window.toastNotifications) {
                window.toastNotifications.success(
                    `"${name}" is now shared publicly!`,
                    'Workout Shared'
                );
            }

            // Reload the public workouts list
            currentPage = 1;
            await loadPublicWorkouts();

        } catch (error) {
            console.error('❌ Error sharing workout:', error);
            if (window.toastNotifications) {
                window.toastNotifications.error(error.message, 'Share Failed');
            }
        }
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    console.log('📦 Public Workouts page script loaded (v3.0 - using shared components)');

})();