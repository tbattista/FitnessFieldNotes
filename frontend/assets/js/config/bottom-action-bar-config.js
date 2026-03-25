/**
 * Bottom Action Bar Configuration
 * Defines button layouts and actions for each page
 * Uses 4-button + right FAB layout for all pages
 *
 * Depends on: morphing-search.js (must be loaded before this file)
 */

(function() {
    'use strict';

    /**
     * Configuration for each page
     * Structure:
     * - leftActions: Array of left-side buttons
     * - fab: Center floating action button
     * - rightActions: Array of right-side buttons
     */
    window.BOTTOM_BAR_CONFIGS = {

        // ============================================
        // DASHBOARD PAGE
        // ============================================
        'dashboard': {
            buttons: [
                {
                    icon: 'bx-plus-circle',
                    label: 'Create',
                    title: 'Create new workout',
                    action: function() {
                        window.location.href = 'workout-builder.html';
                    }
                },
                {
                    icon: 'bx-search',
                    label: 'Find',
                    title: 'Find workouts',
                    action: function() {
                        window.location.href = 'workout-database.html';
                    }
                },
                {
                    icon: 'bx-history',
                    label: 'History',
                    title: 'View workout history',
                    action: function() {
                        window.location.href = 'workout-history.html';
                    }
                },
                {
                    icon: 'bx-cog',
                    label: 'Settings',
                    title: 'Settings',
                    action: function() {
                        // Open settings if available, or navigate to settings page
                        console.log('Settings clicked');
                    }
                }
            ],
            fab: {
                icon: 'bx-play',
                title: 'Start Workout',
                variant: 'success',
                action: function() {
                    // Navigate to workout mode with most recent workout
                    const workouts = window.dashboardDemo?.data?.workouts || [];
                    if (workouts.length > 0) {
                        window.location.href = `workout-mode.html?id=${workouts[0].id}`;
                    } else {
                        window.location.href = 'workout-database.html';
                    }
                }
            }
        },

        // ============================================
        // WORKOUT DATABASE PAGE
        // ============================================
        'workout-database': {
            buttons: [
                {
                    icon: 'bx-filter',
                    label: 'Filter',
                    title: 'Open filters',
                    action: function() {
                        const offcanvas = new bootstrap.Offcanvas(
                            document.getElementById('filtersOffcanvas'),
                            { scroll: false }
                        );
                        offcanvas.show();

                        // Activate the Filters tab
                        const filtersTab = document.getElementById('filters-tab');
                        if (filtersTab) {
                            const tab = new bootstrap.Tab(filtersTab);
                            tab.show();
                        }
                    }
                },
                {
                    icon: 'bx-sort',
                    label: 'Sort',
                    title: 'Sort workouts',
                    action: function() {
                        const offcanvas = new bootstrap.Offcanvas(
                            document.getElementById('filtersOffcanvas'),
                            { scroll: false }
                        );
                        offcanvas.show();

                        // Activate the Sort tab
                        const sortTab = document.getElementById('sort-tab');
                        if (sortTab) {
                            const tab = new bootstrap.Tab(sortTab);
                            tab.show();
                        }
                    }
                },
                {
                    icon: 'bx-search',
                    label: 'Search',
                    title: 'Search workouts',
                    action: function() {
                        const searchFab = document.getElementById('searchFab');
                        const searchInput = document.getElementById('searchFabInput');
                        
                        if (!searchFab || !searchInput) {
                            console.error('❌ Search FAB elements not found');
                            return;
                        }
                        
                        // Only open if collapsed
                        if (!searchFab.classList.contains('expanded')) {
                            // Open search - morph FAB to search box
                            window.openMorphingSearch(searchFab, searchInput);
                        }
                    }
                },
                {
                    icon: 'bx-dots-vertical-rounded',
                    label: 'More',
                    title: 'More options',
                    action: function() {
                        // Use UnifiedOffcanvasFactory to create more menu
                        if (window.UnifiedOffcanvasFactory) {
                            window.UnifiedOffcanvasFactory.createMenuOffcanvas({
                                id: 'moreMenuOffcanvas',
                                title: 'More Options',
                                icon: 'bx-dots-vertical-rounded',
                                menuItems: [
                                    {
                                        icon: 'bx-trash',
                                        title: 'Delete Workouts',
                                        description: 'Toggle delete mode to remove workouts',
                                        onClick: () => {
                                            const toggle = document.getElementById('deleteModeToggle');
                                            if (toggle) {
                                                toggle.checked = !toggle.checked;
                                                toggle.dispatchEvent(new Event('change'));
                                            }
                                        }
                                    },
                                    {
                                        icon: 'bx-info-circle',
                                        title: 'Page Information',
                                        description: 'Learn how to use this page',
                                        onClick: () => {
                                            // Show info modal with page explanation
                                            const modalHtml = `
                                                <div class="modal fade" id="workoutDatabaseInfoModal" tabindex="-1" aria-hidden="true">
                                                    <div class="modal-dialog modal-dialog-centered">
                                                        <div class="modal-content">
                                                            <div class="modal-header">
                                                                <h5 class="modal-title">
                                                                    <i class="bx bx-info-circle me-2"></i>
                                                                    Workout Database
                                                                </h5>
                                                                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                                                            </div>
                                                            <div class="modal-body">
                                                                <h6 class="mb-3">📚 What is this page?</h6>
                                                                <p class="mb-3">This is your personal workout library where you can browse, search, and manage all your workout templates.</p>
                                                                
                                                                <h6 class="mb-3">🔍 How to use:</h6>
                                                                <ul class="mb-3">
                                                                    <li><strong>Search:</strong> Tap the Search button to find workouts by name, description, or tags</li>
                                                                    <li><strong>Filter:</strong> Use the Filter button to narrow down by tags</li>
                                                                    <li><strong>Sort:</strong> Tap Sort to organize by date, name, or exercise count</li>
                                                                    <li><strong>Create:</strong> Tap the + button to build a new workout</li>
                                                                </ul>
                                                                
                                                                <h6 class="mb-3">💡 Quick Actions:</h6>
                                                                <ul class="mb-0">
                                                                    <li><strong>Start Workout:</strong> Tap the purple button on any workout card</li>
                                                                    <li><strong>View Details:</strong> Tap "View" to see full workout information</li>
                                                                    <li><strong>Edit:</strong> Tap "Edit" to modify a workout template</li>
                                                                </ul>
                                                            </div>
                                                            <div class="modal-footer">
                                                                <button type="button" class="btn btn-primary" data-bs-dismiss="modal">Got it!</button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            `;
                                            
                                            // Remove existing modal if present
                                            const existingModal = document.getElementById('workoutDatabaseInfoModal');
                                            if (existingModal) {
                                                existingModal.remove();
                                            }
                                            
                                            // Add modal to body
                                            document.body.insertAdjacentHTML('beforeend', modalHtml);
                                            
                                            // Show modal
                                            const modal = new bootstrap.Modal(document.getElementById('workoutDatabaseInfoModal'));
                                            modal.show();
                                            
                                            // Clean up after modal is hidden
                                            document.getElementById('workoutDatabaseInfoModal').addEventListener('hidden.bs.modal', function() {
                                                this.remove();
                                            });
                                        }
                                    }
                                ]
                            });
                        } else {
                            console.error('❌ UnifiedOffcanvasFactory not loaded');
                            if (window.ffnModalManager) ffnModalManager.alert('Loading', 'More options is loading. Please try again in a moment.', 'info');
                        }
                    }
                }
            ],
            fab: {
                icon: 'bx-plus',
                title: 'Create new workout',
                variant: 'primary',
                action: function() {
                    console.log('➕ Create new workout FAB clicked');
                    // Navigate with URL parameter (sessionStorage no longer used)
                    window.location.href = 'workout-builder.html?new=true';
                }
            },
            // Hidden search FAB config (renders the morphing search elements but triggered by button)
            searchFab: {
                icon: 'bx-search',
                title: 'Search workouts',
                variant: 'primary'
            }
        },

        // ============================================
        // EXERCISE DATABASE PAGE (NEW 4-BUTTON LAYOUT)
        // ============================================
        'exercise-database': {
            buttons: [
                {
                    icon: 'bx-heart',
                    label: 'Favorites',
                    title: 'Show only favorites',
                    action: function() {
                        console.log('❤️ Favorites button clicked');
                        
                        // Work directly with global filter state (no dependency on FilterBar)
                        if (!window.currentFilters) {
                            console.warn('⚠️ Filter state not initialized');
                            return;
                        }
                        
                        // Toggle the favoritesOnly state
                        const isActive = !window.currentFilters.favoritesOnly;
                        window.currentFilters.favoritesOnly = isActive;
                        
                        console.log('🔄 Toggling favorites filter:', isActive ? 'ON' : 'OFF');
                        
                        // Apply filters with the updated favoritesOnly state
                        if (window.applyFiltersAndRender) {
                            window.applyFiltersAndRender(window.currentFilters);
                        }
                        
                        // Update button visual state with animation
                        if (window.bottomActionBar) {
                            const btn = document.querySelector('[data-action="btn-0"]');
                            
                            // Add pulse animation
                            if (btn) {
                                btn.classList.add('pulse-animation');
                                setTimeout(() => btn.classList.remove('pulse-animation'), 300);
                            }
                            
                            // Update icon and title
                            window.bottomActionBar.updateButton('btn-0', {
                                icon: isActive ? 'bxs-heart' : 'bx-heart',
                                title: isActive ? 'Show all exercises' : 'Show only favorites'
                            });
                            
                            // Add/remove active class for color change
                            if (btn) {
                                btn.classList.toggle('active', isActive);
                            }
                        }
                        
                        console.log('✅ Favorites filter updated');
                    }
                },
                {
                    icon: 'bx-filter',
                    label: 'Filters',
                    title: 'Open filters',
                    action: function() {
                        // Use UnifiedOffcanvasFactory to create filters offcanvas (muscle group, equipment, custom only)
                        if (window.UnifiedOffcanvasFactory && window.filterBarConfig) {
                            // Create filter config with only muscle group, equipment, and custom only
                            const filtersOnly = window.filterBarConfig.filters.filter(f =>
                                f.key === 'muscleGroup' || f.key === 'equipment' || f.key === 'customOnly'
                            );
                            
                            const { offcanvas, offcanvasElement } = window.UnifiedOffcanvasFactory.createFilterOffcanvas({
                                id: 'filtersOffcanvas',
                                title: 'Filters',
                                icon: 'bx-filter',
                                filterBarContainerId: 'offcanvasFilterBarContainer',
                                clearButtonId: 'clearFiltersBtn',
                                onApply: function() {
                                    console.log('✅ Filters applied');
                                    // Sync FilterBar state to global state
                                    if (window.filterBar) {
                                        const filterBarState = window.filterBar.getFilters();
                                        // Merge with current filters (preserve favoritesOnly)
                                        window.currentFilters = {
                                            ...window.currentFilters,
                                            ...filterBarState
                                        };
                                    }
                                },
                                onClear: function() {
                                    // Clear all filters in FilterBar
                                    if (window.filterBar) {
                                        window.filterBar.clearAll();
                                    }
                                }
                            });
                            
                            // Initialize FilterBar inside the offcanvas after it's shown
                            offcanvasElement.addEventListener('shown.bs.offcanvas', function initFilterBar() {
                                console.log('🔧 Initializing FilterBar in offcanvas');
                                
                                // Always recreate FilterBar to ensure fresh state
                                const container = document.getElementById('offcanvasFilterBarContainer');
                                if (!container) {
                                    console.error('❌ FilterBar container not found');
                                    return;
                                }
                                
                                // Clear container
                                container.innerHTML = '';
                                
                                // Create new FilterBar instance with filters only (no sort)
                                const filterBarConfig = {
                                    ...window.filterBarConfig,
                                    filters: filtersOnly,
                                    onFilterChange: (filters) => {
                                        console.log('🔍 Filters changed in offcanvas:', filters);
                                        // Update global state
                                        window.currentFilters = {
                                            ...window.currentFilters,
                                            ...filters
                                        };
                                        // Apply filters immediately
                                        if (window.applyFiltersAndRender) {
                                            window.applyFiltersAndRender(window.currentFilters);
                                        }
                                    }
                                };
                                
                                window.filterBar = new window.FFNFilterBar('offcanvasFilterBarContainer', filterBarConfig);
                                
                                // Set current filter values (excluding favoritesOnly which isn't in FilterBar)
                                if (window.currentFilters) {
                                    const filterBarState = { ...window.currentFilters };
                                    delete filterBarState.favoritesOnly; // This is handled separately
                                    window.filterBar.setFilters(filterBarState);
                                }
                                
                                console.log('✅ FilterBar initialized in offcanvas');
                            }, { once: true });
                        } else {
                            console.error('❌ UnifiedOffcanvasFactory or filterBarConfig not loaded');
                            if (window.ffnModalManager) ffnModalManager.alert('Loading', 'Filter feature is loading. Please try again in a moment.', 'info');
                        }
                    }
                },
                {
                    icon: 'bx-sort-alt-2',
                    label: 'Sort',
                    title: 'Sort and filter',
                    action: function() {
                        // Create sort offcanvas with sortBy, difficulty, and tier
                        if (window.UnifiedOffcanvasFactory && window.filterBarConfig) {
                            // Get sortBy, difficulty, and exerciseTier filters
                            const sortFilters = window.filterBarConfig.filters.filter(f =>
                                f.key === 'sortBy' || f.key === 'difficulty' || f.key === 'exerciseTier'
                            );
                            
                            if (sortFilters.length === 0) {
                                console.error('❌ Sort filters not found');
                                return;
                            }
                            
                            const { offcanvas, offcanvasElement } = window.UnifiedOffcanvasFactory.createFilterOffcanvas({
                                id: 'sortOffcanvas',
                                title: 'Sort & Filter',
                                icon: 'bx-sort-alt-2',
                                filterBarContainerId: 'offcanvasSortBarContainer',
                                clearButtonId: 'clearSortBtn',
                                onApply: function() {
                                    console.log('✅ Sort applied');
                                    if (window.sortBar) {
                                        const sortState = window.sortBar.getFilters();
                                        window.currentFilters = {
                                            ...window.currentFilters,
                                            ...sortState
                                        };
                                    }
                                },
                                onClear: function() {
                                    if (window.sortBar) {
                                        window.sortBar.clearAll();
                                    }
                                }
                            });
                            
                            // Initialize sort bar
                            offcanvasElement.addEventListener('shown.bs.offcanvas', function initSortBar() {
                                console.log('🔧 Initializing Sort Bar in offcanvas');
                                
                                const container = document.getElementById('offcanvasSortBarContainer');
                                if (!container) {
                                    console.error('❌ Sort Bar container not found');
                                    return;
                                }
                                
                                container.innerHTML = '';
                                
                                const sortBarConfig = {
                                    showSearch: false,
                                    showClearAll: false,
                                    filters: sortFilters,
                                    onFilterChange: (filters) => {
                                        console.log('🔄 Sort/Filter changed:', filters);
                                        window.currentFilters = {
                                            ...window.currentFilters,
                                            ...filters
                                        };
                                        if (window.applyFiltersAndRender) {
                                            window.applyFiltersAndRender(window.currentFilters);
                                        }
                                    }
                                };
                                
                                window.sortBar = new window.FFNFilterBar('offcanvasSortBarContainer', sortBarConfig);
                                
                                // Set current values for all sort filters
                                if (window.currentFilters) {
                                    const currentSortState = {};
                                    if (window.currentFilters.sortBy) currentSortState.sortBy = window.currentFilters.sortBy;
                                    if (window.currentFilters.difficulty) currentSortState.difficulty = window.currentFilters.difficulty;
                                    if (window.currentFilters.exerciseTier) currentSortState.exerciseTier = window.currentFilters.exerciseTier;
                                    window.sortBar.setFilters(currentSortState);
                                }
                                
                                console.log('✅ Sort Bar initialized');
                            }, { once: true });
                        } else {
                            console.error('❌ UnifiedOffcanvasFactory or filterBarConfig not loaded');
                            if (window.ffnModalManager) ffnModalManager.alert('Loading', 'Sort feature is loading. Please try again in a moment.', 'info');
                        }
                    }
                },
                {
                    icon: 'bx-dots-vertical-rounded',
                    label: 'More',
                    title: 'More options',
                    action: function() {
                        // Use UnifiedOffcanvasFactory to create more menu
                        if (window.UnifiedOffcanvasFactory) {
                            window.UnifiedOffcanvasFactory.createMenuOffcanvas({
                                id: 'moreMenuOffcanvas',
                                title: 'More Options',
                                icon: 'bx-dots-vertical-rounded',
                                menuItems: [
                                    {
                                        icon: 'bx-plus',
                                        title: 'Add Custom Exercise',
                                        description: 'Create your own exercise',
                                        onClick: () => {
                                            const modal = new bootstrap.Modal(
                                                document.getElementById('customExerciseModal')
                                            );
                                            modal.show();
                                        }
                                    },
                                    {
                                        icon: 'bx-dumbbell',
                                        title: 'Go to Workouts',
                                        description: 'View your workout templates',
                                        onClick: () => {
                                            window.location.href = 'workout-database.html';
                                        }
                                    }
                                ]
                            });
                        } else {
                            console.error('❌ UnifiedOffcanvasFactory not loaded');
                            if (window.ffnModalManager) ffnModalManager.alert('Loading', 'More options is loading. Please try again in a moment.', 'info');
                        }
                    }
                }
            ],
            fab: {
                icon: 'bx-search',
                title: 'Search exercises',
                variant: 'primary',
                action: function() {
                    const searchFab = document.getElementById('searchFab');
                    const searchInput = document.getElementById('searchFabInput');
                    
                    if (!searchFab || !searchInput) {
                        console.error('❌ Search FAB elements not found');
                        return;
                    }
                    
                    // Only open if collapsed - when expanded, do nothing (let clicks pass through)
                    if (!searchFab.classList.contains('expanded')) {
                        // Open search - morph FAB to search box
                        window.openMorphingSearch(searchFab, searchInput);
                    } else {
                        console.log('🔍 Search already expanded, ignoring click');
                    }
                }
            }
        },

        // ============================================
        // PROGRAMS PAGE
        // ============================================
        'programs': {
            buttons: [
                {
                    icon: 'bx-filter',
                    label: 'Filter',
                    title: 'Open filters',
                    action: function() {
                        // Open the filters offcanvas
                        const offcanvas = new bootstrap.Offcanvas(
                            document.getElementById('filtersOffcanvas'),
                            { scroll: false }
                        );
                        offcanvas.show();
                    }
                },
                {
                    icon: 'bx-sort',
                    label: 'Sort',
                    title: 'Sort programs',
                    action: function() {
                        // Cycle through sort options using programs-page.js function
                        if (window.cycleProgramSort) {
                            window.cycleProgramSort();
                        } else {
                            console.error('❌ cycleProgramSort not available');
                        }
                    }
                },
                {
                    icon: 'bx-search',
                    label: 'Search',
                    title: 'Search programs',
                    action: function() {
                        const searchFab = document.getElementById('searchFab');
                        const searchInput = document.getElementById('searchFabInput');

                        if (!searchFab || !searchInput) {
                            console.error('❌ Search FAB elements not found');
                            return;
                        }

                        // Only open if collapsed
                        if (!searchFab.classList.contains('expanded')) {
                            window.openMorphingSearch(searchFab, searchInput);
                        }
                    }
                },
                {
                    icon: 'bx-dots-vertical-rounded',
                    label: 'More',
                    title: 'More options',
                    action: function() {
                        // Use UnifiedOffcanvasFactory to create more menu
                        if (window.UnifiedOffcanvasFactory) {
                            window.UnifiedOffcanvasFactory.createMenuOffcanvas({
                                id: 'moreMenuOffcanvas',
                                title: 'More Options',
                                icon: 'bx-dots-vertical-rounded',
                                menuItems: [
                                    {
                                        icon: 'bx-trash',
                                        title: 'Delete Programs',
                                        description: 'Toggle delete mode to remove programs',
                                        onClick: () => {
                                            const toggle = document.getElementById('deleteModeToggle');
                                            if (toggle) {
                                                toggle.checked = !toggle.checked;
                                                toggle.dispatchEvent(new Event('change'));
                                            }
                                        }
                                    },
                                    {
                                        icon: 'bx-info-circle',
                                        title: 'Page Information',
                                        description: 'Learn how to use this page',
                                        onClick: () => {
                                            const modalHtml = `
                                                <div class="modal fade" id="programsInfoModal" tabindex="-1" aria-hidden="true">
                                                    <div class="modal-dialog modal-dialog-centered">
                                                        <div class="modal-content">
                                                            <div class="modal-header">
                                                                <h5 class="modal-title">
                                                                    <i class="bx bx-info-circle me-2"></i>
                                                                    Programs
                                                                </h5>
                                                                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                                                            </div>
                                                            <div class="modal-body">
                                                                <h6 class="mb-3">What is this page?</h6>
                                                                <p class="mb-3">This is your program library where you can organize workouts into structured training programs.</p>

                                                                <h6 class="mb-3">How to use:</h6>
                                                                <ul class="mb-3">
                                                                    <li><strong>Search:</strong> Tap the Search button to find programs by name, description, or tags</li>
                                                                    <li><strong>Filter:</strong> Use the Filter button to filter by difficulty or tags</li>
                                                                    <li><strong>Sort:</strong> Tap Sort to organize by date, name, or workout count</li>
                                                                    <li><strong>Create:</strong> Tap the + button to create a new program</li>
                                                                </ul>

                                                                <h6 class="mb-3">Quick Actions:</h6>
                                                                <ul class="mb-0">
                                                                    <li><strong>View Details:</strong> Tap a program card to see workouts and details</li>
                                                                    <li><strong>Add Workouts:</strong> Use the "Add Workouts" button in the detail view</li>
                                                                    <li><strong>Reorder:</strong> Drag and drop workouts to reorder them</li>
                                                                    <li><strong>Delete Mode:</strong> Use More menu to toggle delete mode</li>
                                                                </ul>
                                                            </div>
                                                            <div class="modal-footer">
                                                                <button type="button" class="btn btn-primary" data-bs-dismiss="modal">Got it!</button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            `;

                                            // Remove existing modal if present
                                            const existingModal = document.getElementById('programsInfoModal');
                                            if (existingModal) {
                                                existingModal.remove();
                                            }

                                            // Add modal to body
                                            document.body.insertAdjacentHTML('beforeend', modalHtml);

                                            // Show modal
                                            const modal = new bootstrap.Modal(document.getElementById('programsInfoModal'));
                                            modal.show();

                                            // Clean up after modal is hidden
                                            document.getElementById('programsInfoModal').addEventListener('hidden.bs.modal', function() {
                                                this.remove();
                                            });
                                        }
                                    }
                                ]
                            });
                        } else {
                            console.error('❌ UnifiedOffcanvasFactory not loaded');
                            if (window.ffnModalManager) ffnModalManager.alert('Loading', 'More options is loading. Please try again in a moment.', 'info');
                        }
                    }
                }
            ],
            fab: {
                icon: 'bx-plus',
                title: 'Create new program',
                variant: 'primary',
                action: function() {
                    // Open program modal
                    if (window.showProgramModal) {
                        window.showProgramModal();
                    } else {
                        console.error('❌ showProgramModal not available');
                    }
                }
            },
            // Hidden search FAB config (renders the morphing search elements but triggered by button)
            searchFab: {
                icon: 'bx-search',
                title: 'Search programs',
                variant: 'primary'
            }
        }
    };

    // workout-mode configs removed — now uses WorkoutModeFabManager (workout-mode-fab-manager.js)

    console.log('✅ Bottom Action Bar configurations loaded');
})();
