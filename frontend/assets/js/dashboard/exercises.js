/**
 * Exercise Database - Main Controller
 * Orchestrates initialization and coordinates between modules
 *
 * @module exercises
 * @version 3.0.0
 *
 * Dependencies (load in order before this file):
 * - exercise-rendering.js
 * - exercise-filters.js
 * - exercise-toolbar.js
 */

// Initialize page with BasePage component
const exercisePage = new FFNBasePage({
    requireAuth: false,
    autoLoad: true,
    onDataLoad: async (page) => {
        console.log('🚀 Initializing Exercise Database with components');
        await initializeExerciseDatabase(page);
    },
    onAuthStateChange: async (user) => {
        console.log('🔄 Auth state changed, user:', user?.email || 'null');
        if (user) {
            await loadUserExerciseData(user);
            if (window.exerciseTable) {
                window.exerciseTable.refresh();
            }
        } else {
            // Clear user data
            window.ffn.exercises.favorites.clear();
            window.ffn.exercises.custom = [];
            if (window.exerciseTable) {
                window.exerciseTable.refresh();
            }
        }
    }
});

// Global state
window.ffn = window.ffn || {
    exercises: {
        all: [],
        favorites: new Set(),
        custom: [],
        filtered: [],
        displayed: []
    }
};

// Component instances
let exerciseTable = null;
let filterBar = null;

/**
 * Initialize exercise database with components
 */
async function initializeExerciseDatabase(page) {
    try {
        // Load all exercise data
        await loadAllExerciseData(page);

        // Initialize filter state
        window.currentFilters = {
            sortBy: 'popularity',
            muscleGroup: '',
            equipment: [],
            difficulty: '',
            customOnly: false,
            favoritesOnly: false,
            search: ''
        };

        // Store filter configuration for offcanvas
        window.filterBarConfig = {
            showSearch: false,
            filters: [
                {
                    key: 'sortBy',
                    label: 'Sort By',
                    type: 'select',
                    options: [
                        { value: 'name', label: 'Alphabetical (A-Z)' },
                        { value: 'popularity', label: 'Most Popular' },
                        { value: 'favorites', label: 'My Favorites First' }
                    ],
                    defaultValue: 'popularity'
                },
                {
                    key: 'muscleGroup',
                    label: 'Muscle Group',
                    type: 'select',
                    options: window.getUniqueMuscleGroups ? window.getUniqueMuscleGroups() : [],
                    placeholder: 'All Muscle Groups'
                },
                {
                    key: 'equipment',
                    label: 'Equipment',
                    type: 'multiselect',
                    options: window.getUniqueEquipment ? window.getUniqueEquipment() : [],
                    placeholder: 'All Equipment'
                },
                {
                    key: 'difficulty',
                    label: 'Difficulty',
                    type: 'select',
                    options: ['Beginner', 'Intermediate', 'Advanced'],
                    placeholder: 'All Levels'
                },
                {
                    key: 'customOnly',
                    label: 'Custom Exercises Only',
                    type: 'checkbox'
                }
            ],
            onFilterChange: (filters) => {
                console.log('🔍 Filters changed:', filters);
                if (window.applyFiltersAndRender) {
                    window.applyFiltersAndRender(filters);
                }
            }
        };

        // Initialize DataTable component
        exerciseTable = new FFNDataTable('exerciseTableContainer', {
            columns: [
                {
                    key: 'card',
                    label: '',
                    sortable: false,
                    render: (value, row) => renderExerciseCard(row)
                }
            ],
            data: [],
            pageSize: 50,
            pageSizeOptions: [25, 50, 100, 250],
            emptyMessage: 'No exercises found. Try adjusting your filters or search query.',
            loadingMessage: 'Loading exercises...',
            onRowClick: null,
            onPageChange: (page, info) => {
                console.log(`📄 Page ${page}: showing ${info.startIndex}-${info.endIndex} of ${info.totalItems}`);
            }
        });

        // Make exerciseTable globally available
        window.exerciseTable = exerciseTable;

        // Initialize popovers after table renders
        setTimeout(() => {
            if (window.initializePopovers) {
                window.initializePopovers();
            }
        }, 100);

        // Add event delegation for buttons
        document.getElementById('exerciseTableContainer').addEventListener('click', handleTableClick);

        // Add event delegation for panel favorite button (desktop)
        const detailPanel = document.getElementById('exerciseDetailPanel');
        if (detailPanel) {
            detailPanel.addEventListener('click', async (e) => {
                const favBtn = e.target.closest('.panel-favorite-btn');
                if (favBtn) {
                    e.stopPropagation();
                    const exerciseId = favBtn.dataset.exerciseId;
                    if (window.toggleExerciseFavorite) {
                        await window.toggleExerciseFavorite(exerciseId);
                        // Re-render panel to update heart state
                        if (window.showExerciseDetailsInPanel) {
                            window.showExerciseDetailsInPanel(exerciseId);
                        }
                    }
                }
            });
        }

        // Initialize toolbar components
        if (window.initExerciseToolbar) {
            window.initExerciseToolbar();
        }

        // Set initial data with default filters
        if (window.applyFiltersAndRender) {
            window.applyFiltersAndRender(window.currentFilters);
        }

        // Mobile: initialize exercise detail offcanvas
        if (!isDesktopView() && window.ExerciseDetailOffcanvas) {
            window._exerciseDetailOffcanvas = new ExerciseDetailOffcanvas();
        }

        // Initialize exercise cart tray (restore from sessionStorage)
        if (window.ExerciseCart) {
            window.ExerciseCart.init();
        }

        // Deep link from a workout: ?find=<exercise name>
        openExerciseFromURL();

        console.log('✅ Exercise Database initialized with components');

    } catch (error) {
        console.error('❌ Error initializing exercise database:', error);
        if (window.showAlert) {
            window.showAlert('Failed to initialize exercise database. Please refresh the page.', 'danger');
        }
    }
}

/**
 * Render exercise card HTML
 */
function renderExerciseCard(row) {
    const isCustom = !row.isGlobal;
    const isFavorited = window.ffn.exercises.favorites.has(row.id);
    const difficultyBadge = row.difficultyLevel && window.getDifficultyBadgeWithPopover
        ? window.getDifficultyBadgeWithPopover(row.difficultyLevel) : '';

    return `
        <div class="card" data-exercise-id="${row.id}">
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-center">
                    <div class="flex-grow-1">
                        <div class="fw-semibold mb-2">
                            ${isCustom ? '<i class="bx bx-user text-primary me-1" style="font-size: 0.875rem;"></i>' : ''}
                            ${exercisePage.escapeHtml(row.name)}
                        </div>
                        <div class="d-flex gap-2 flex-wrap align-items-center">
                            ${difficultyBadge}
                            ${row.targetMuscleGroup ? `<span class="text-muted small">${exercisePage.escapeHtml(row.targetMuscleGroup)}</span>` : ''}
                            ${row.primaryEquipment ? `<span class="text-muted small">• ${exercisePage.escapeHtml(row.primaryEquipment)}</span>` : ''}
                        </div>
                    </div>
                    <div class="d-flex gap-2 align-items-center flex-shrink-0 ms-3">
                        <button class="btn btn-sm btn-icon favorite-btn ${isFavorited ? 'text-danger' : ''}"
                                data-exercise-id="${row.id}"
                                title="${isFavorited ? 'Remove from favorites' : 'Add to favorites'}">
                            <i class="bx ${isFavorited ? 'bxs-heart' : 'bx-heart'}"></i>
                        </button>
                        <div class="exercise-card-dropdown dropdown">
                            <button type="button" class="btn btn-sm btn-icon dropdown-toggle hide-arrow" data-bs-toggle="dropdown">
                                <i class="bx bx-dots-vertical-rounded"></i>
                            </button>
                            <div class="dropdown-menu dropdown-menu-end">
                                <a class="dropdown-item view-details-link" href="javascript:void(0);" data-exercise-id="${row.id}">
                                    <i class="bx bx-info-circle me-2"></i>View Details
                                </a>
                                <a class="dropdown-item add-to-workout-link" href="javascript:void(0);"
                                   data-exercise-id="${row.id}" data-exercise-name="${exercisePage.escapeHtml(row.name)}">
                                    <i class="bx bx-plus me-2"></i>Add to Workout
                                </a>
                                ${isCustom ? `
                                <div class="dropdown-divider"></div>
                                <a class="dropdown-item edit-exercise-link" href="javascript:void(0);" data-exercise-id="${row.id}">
                                    <i class="bx bx-edit me-2"></i>Edit Exercise
                                </a>
                                <a class="dropdown-item link-exercise-link" href="javascript:void(0);" data-exercise-id="${row.id}">
                                    <i class="bx bx-link me-2"></i>Link to Exercise
                                </a>
                                <a class="dropdown-item text-danger delete-exercise-link" href="javascript:void(0);" data-exercise-id="${row.id}">
                                    <i class="bx bx-trash me-2"></i>Delete Exercise
                                </a>
                                ` : ''}
                            </div>
                        </div>
                        <i class="bx bx-chevron-right exercise-card-chevron text-muted" style="font-size: 1.25rem;"></i>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Check if we're in desktop split-view mode
 */
function isDesktopView() {
    return document.documentElement.classList.contains('desktop-view');
}

/**
 * Show exercise details — routes to panel (desktop) or modal (mobile)
 */
function showExerciseDetailsAdaptive(exerciseId) {
    if (isDesktopView() && window.showExerciseDetailsInPanel) {
        window.showExerciseDetailsInPanel(exerciseId);
    } else if (window._exerciseDetailOffcanvas) {
        window._exerciseDetailOffcanvas.show(exerciseId);
    } else if (window.showExerciseDetails) {
        window.showExerciseDetails(exerciseId);
    }
}

/**
 * Handle click events on exercise table
 */
async function handleTableClick(e) {
    const favoriteBtn = e.target.closest('.favorite-btn');
    if (favoriteBtn) {
        e.stopPropagation();
        const exerciseId = favoriteBtn.dataset.exerciseId;
        if (window.toggleExerciseFavorite) {
            await window.toggleExerciseFavorite(exerciseId);
        }
        return;
    }

    // Handle dropdown menu item clicks before the generic dropdown guard
    const viewDetailsLink = e.target.closest('.view-details-link');
    if (viewDetailsLink) {
        e.preventDefault();
        const exerciseId = viewDetailsLink.dataset.exerciseId;
        showExerciseDetailsAdaptive(exerciseId);
        return;
    }

    const addToWorkoutLink = e.target.closest('.add-to-workout-link');
    if (addToWorkoutLink) {
        e.preventDefault();
        const exerciseId = addToWorkoutLink.dataset.exerciseId;
        const exerciseName = addToWorkoutLink.dataset.exerciseName;
        if (window.addExerciseToWorkout) {
            window.addExerciseToWorkout({ id: exerciseId, name: exerciseName });
        }
        return;
    }

    const editLink = e.target.closest('.edit-exercise-link');
    if (editLink) {
        e.preventDefault();
        const exerciseId = editLink.dataset.exerciseId;
        window.location.href = `exercise-edit.html?id=${exerciseId}`;
        return;
    }

    const linkLink = e.target.closest('.link-exercise-link');
    if (linkLink) {
        e.preventDefault();
        const exerciseId = linkLink.dataset.exerciseId;
        window.location.href = `exercise-edit.html?id=${exerciseId}&focus=link`;
        return;
    }

    const deleteLink = e.target.closest('.delete-exercise-link');
    if (deleteLink) {
        e.preventDefault();
        const exerciseId = deleteLink.dataset.exerciseId;
        if (window.deleteExercise) {
            window.deleteExercise(exerciseId);
        }
        return;
    }

    // Ignore other clicks on dropdown area (prevent card selection)
    if (e.target.closest('.dropdown-toggle')) {
        return;
    }

    // Clicking anywhere on a card opens details (panel on desktop, offcanvas on mobile)
    const card = e.target.closest('.card');
    if (card) {
        const exerciseId = card.dataset.exerciseId;
        if (exerciseId) {
            showExerciseDetailsAdaptive(exerciseId);
        }
    }
}

/**
 * Load exercise data progressively:
 * 1. localStorage cache → instant render
 * 2. Seed data fallback → instant render with 139 exercises
 * 3. Background fetch → swap in full dataset when ready
 */
async function loadAllExerciseData(page) {
    const cacheService = window.exerciseCacheService;

    if (!cacheService) {
        // Fallback: direct API fetch (should not happen if scripts loaded correctly)
        console.warn('[ExerciseDB] ExerciseCacheService not available, falling back to direct fetch');
        const PAGE_SIZE = 500;
        let allExercises = [];
        let pageNum = 1;
        let hasMore = true;

        while (hasMore) {
            const response = await fetch(page.getApiUrl(`/api/v3/exercises?page=${pageNum}&page_size=${PAGE_SIZE}`));
            if (!response.ok) throw new Error(`Failed to load exercises (page ${pageNum})`);

            const data = await response.json();
            const exercises = data.exercises || [];
            allExercises = [...allExercises, ...exercises];
            hasMore = exercises.length === PAGE_SIZE;
            pageNum++;
        }

        window.ffn.exercises.all = allExercises;
        updateExerciseCount();
        await loadUserExerciseData();
        return;
    }

    // Try localStorage full-database cache first (instant)
    const cached = cacheService._getFullFromLocalStorage();
    if (cached) {
        window.ffn.exercises.all = cached.exercises;
        updateExerciseCount();
        console.log(`[ExerciseDB] Instant load from cache: ${cached.exercises.length} exercises`);

        // Validate cache in background; re-fetch if stale
        cacheService.isCacheValid(cached).then(valid => {
            if (!valid) {
                console.log('[ExerciseDB] Cache stale, fetching fresh data...');
                fetchFullDatabaseInBackground(cacheService);
            }
        });

        await loadUserExerciseData();
        return;
    }

    // No cache — use seed data for instant display
    if (window.EXERCISE_SEED_DATA) {
        window.ffn.exercises.all = window.EXERCISE_SEED_DATA;
        updateExerciseCount();
        console.log(`[ExerciseDB] Using seed data: ${window.EXERCISE_SEED_DATA.length} exercises`);
    }

    // Fetch full database in background
    fetchFullDatabaseInBackground(cacheService);

    // Load user data in parallel
    await loadUserExerciseData();
}

/**
 * Fetch full database in background and update table when ready
 */
function fetchFullDatabaseInBackground(cacheService) {
    cacheService.fetchFullDatabase().then(fullExercises => {
        window.ffn.exercises.all = fullExercises;
        updateExerciseCount();

        // Re-apply current filters with new data (soft refresh preserves page)
        if (window.applyFiltersAndRender && window.currentFilters) {
            window.applyFiltersAndRender({ ...window.currentFilters, _softRefresh: true });
        }

        // A ?find= link that the starter data couldn't match may match the full database
        if (_findFromURL && !_findFromURL.opened) openExerciseFromURL();

        console.log(`[ExerciseDB] Background load complete: ${fullExercises.length} exercises`);
    }).catch(error => {
        console.error('[ExerciseDB] Background fetch failed:', error);
    });
}

/**
 * ?find=<name> (from a Tabata workout or library page): open the best-matching
 * exercise's details, or fall back to search results for the move's core words.
 */
let _findFromURL = null;

function openExerciseFromURL() {
    if (!window.ExerciseLink) return;
    if (!_findFromURL) {
        const name = new URLSearchParams(window.location.search).get('find');
        if (!name) return;
        _findFromURL = { name, opened: false };
    }
    const exercises = [...window.ffn.exercises.all, ...window.ffn.exercises.custom];
    const { match, query } = window.ExerciseLink.findMatch(_findFromURL.name, exercises);

    // Search for the move itself; if no exercise has every word, widen to its last words
    const words = query.split(' ').filter(Boolean);
    let search = query;
    for (let n = words.length; n >= 1; n--) {
        const terms = words.slice(-n);
        const hits = exercises.some((e) => {
            const text = `${e.name} ${e.targetMuscleGroup || ''} ${e.primaryEquipment || ''}`.toLowerCase();
            return terms.every((t) => text.includes(t));
        });
        if (hits) { search = terms.join(' '); break; }
    }
    if (match) search = match.name;

    const searchInput = document.getElementById('exerciseSearchInput');
    if (searchInput) searchInput.value = search;
    const clearBtn = document.getElementById('clearSearchBtn');
    if (clearBtn) clearBtn.style.display = search ? 'block' : 'none';
    window.currentFilters.search = search;
    if (window.applyFiltersAndRender) window.applyFiltersAndRender(window.currentFilters);

    if (match) {
        _findFromURL.opened = true;
        showExerciseDetailsAdaptive(match.id);
    }
}

/**
 * Update the total exercise count display
 */
function updateExerciseCount() {
    const totalCount = document.getElementById('totalExercisesCount');
    if (totalCount) totalCount.textContent = window.ffn.exercises.all.length.toLocaleString();
}

/**
 * Load user-specific exercise data (favorites and custom)
 * @param {Object} userOverride - Optional user object to use instead of checking firebaseAuth
 */
async function loadUserExerciseData(userOverride = null) {
    const user = userOverride || window.firebaseAuth?.currentUser;
    console.log('📥 loadUserExerciseData called, user:', user?.email || 'null');

    if (!user) {
        window.ffn.exercises.favorites.clear();
        window.ffn.exercises.custom = [];
        console.log('⏭️ No user, clearing custom exercises');
        return;
    }

    try {
        const token = await user.getIdToken();

        // Load favorites
        const favUrl = exercisePage.getApiUrl('/api/v3/users/me/favorites');
        const favResponse = await fetch(favUrl, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (favResponse.ok) {
            const favData = await favResponse.json();
            window.ffn.exercises.favorites = new Set(favData.favorites.map(f => f.exerciseId));
            console.log(`✅ Loaded ${window.ffn.exercises.favorites.size} favorites`);
        }

        // Load custom exercises via ExerciseCacheService (avoids duplicate API call)
        const cacheService = window.exerciseCacheService;
        if (cacheService) {
            await cacheService.loadCustomExercisesBackground();
            window.ffn.exercises.custom = cacheService.customExercises || [];
            console.log(`[ExerciseDB] Loaded ${window.ffn.exercises.custom.length} custom exercises via cache service`);
        } else {
            // Fallback: direct API call
            const customExercisesUrl = exercisePage.getApiUrl('/api/v3/users/me/exercises');
            const customResponse = await fetch(customExercisesUrl, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (customResponse.ok) {
                const customData = await customResponse.json();
                window.ffn.exercises.custom = customData.exercises || [];
            }
        }

        // Refresh table if it exists
        if (window.exerciseTable) {
            console.log('🔄 Refreshing table with updated favorites');
            window.exerciseTable.refresh();
        }

    } catch (error) {
        console.error('❌ Error loading user exercise data:', error);
    }
}

// Export for global access
window.exercisePage = exercisePage;
window.exerciseTable = exerciseTable;
window.filterBar = filterBar;

console.log('📦 Exercise Database controller loaded');
