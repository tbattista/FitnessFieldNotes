/**
 * Morphing Search FAB
 * Handles the expanding search bar animation and behavior
 * Used by bottom-action-bar-config.js page configurations
 */

(function() {
    'use strict';

    /**
     * Open search with morphing animation
     * @param {HTMLElement} searchFab - Search FAB element
     * @param {HTMLElement} searchInput - Search input element
     */
    function openMorphingSearch(searchFab, searchInput) {
        if (window.bottomNavState?.animating) return;

        console.log('🔍 Opening morphing search with mobile keyboard optimization');
        window.bottomNavState = window.bottomNavState || {};
        window.bottomNavState.animating = true;

        // Get elements
        const bottomNav = document.querySelector('.bottom-action-bar');

        // CRITICAL: Focus IMMEDIATELY during user interaction (before any delays)
        // This maintains the user interaction chain required by mobile browsers
        if (searchInput) {
            // Attempt 1: Immediate focus (most important for mobile)
            searchInput.focus();

            // iOS Safari workaround: trigger click event as well
            const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
            if (isIOS) {
                searchInput.click();
                console.log('📱 iOS detected - triggered click for keyboard');
            }
        }

        // Note: No backdrop needed - search stays above action bar

        // Note: Bottom nav stays visible - no need to hide

        // Stage 1: Start morphing (add morphing class)
        searchFab.classList.add('morphing');

        // Stage 2: Complete expansion after 150ms
        setTimeout(() => {
            searchFab.classList.remove('morphing');
            searchFab.classList.add('expanded');

            // Attempt 2: Focus after expansion completes
            if (searchInput) {
                searchInput.focus();

                // Additional iOS workaround
                const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
                if (isIOS) {
                    searchInput.click();
                }
            }
        }, 150);

        // Attempt 3: Final focus attempt after all animations
        setTimeout(() => {
            if (searchInput && document.activeElement !== searchInput) {
                console.log('🔄 Final focus attempt for mobile keyboard');
                searchInput.focus();

                // Last resort for iOS
                const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
                if (isIOS) {
                    searchInput.click();
                }
            }
        }, 200);

        // Update state
        window.bottomNavState.isHidden = true;
        window.bottomNavState.searchActive = true;

        // Animation complete
        setTimeout(() => {
            window.bottomNavState.animating = false;
        }, 300);
    }

    /**
     * Close search with morphing animation (without clearing)
     * @param {HTMLElement} searchFab - Search FAB element
     */
    function closeMorphingSearch(searchFab) {
        if (window.bottomNavState?.animating) return;

        console.log('🔍 Closing morphing search (keeping search term)');
        window.bottomNavState = window.bottomNavState || {};
        window.bottomNavState.animating = true;

        // Note: No backdrop to hide
        // Note: Bottom nav stays visible

        // Stage 1: Start collapsing (remove expanded, add morphing)
        searchFab.classList.remove('expanded');
        searchFab.classList.add('morphing');

        // Stage 2: Complete collapse after 150ms
        setTimeout(() => {
            searchFab.classList.remove('morphing');
        }, 150);

        // Update state
        window.bottomNavState.isHidden = false;
        window.bottomNavState.searchActive = false;

        // Animation complete
        setTimeout(() => {
            window.bottomNavState.animating = false;
        }, 300);
    }

    /**
     * Clear search and close
     * @param {HTMLElement} searchFab - Search FAB element
     */
    function clearAndCloseSearch(searchFab) {
        console.log('🔍 Clearing search and closing');

        const searchInput = document.getElementById('searchFabInput');
        const searchClose = document.getElementById('searchFabClose');

        // Clear search input and trigger search with empty term
        if (searchInput) {
            searchInput.value = '';
            // Trigger search to clear results
            if (window.currentFilters && window.applyFiltersAndRender) {
                window.currentFilters.search = '';
                window.applyFiltersAndRender(window.currentFilters);
            } else if (window.ffn?.workoutDatabase && window.filterWorkouts) {
                window.ffn.workoutDatabase.filters.search = '';
                window.filterWorkouts();
            } else if (window.ffn?.programsPage && window.renderProgramsGrid) {
                window.ffn.programsPage.filters.search = '';
                window.renderProgramsGrid();
            }
        }

        // Remove has-text class from close button
        if (searchClose) {
            searchClose.classList.remove('has-text');
        }

        // Close the search
        closeMorphingSearch(searchFab);
    }

    /**
     * Set up document-level click handler for click-outside detection
     * This replaces the backdrop approach which was unreliable
     */
    let clickOutsideHandlerAttached = false;

    function setupClickOutsideHandler() {
        if (clickOutsideHandlerAttached) return;
        clickOutsideHandlerAttached = true;

        // Use capture phase to catch clicks before they reach other handlers
        document.addEventListener('click', (e) => {
            const searchFab = document.getElementById('searchFab');

            // Only handle if search is expanded
            if (!searchFab || !searchFab.classList.contains('expanded')) {
                return;
            }

            // Check if click is inside the search FAB (including all children)
            if (searchFab.contains(e.target)) {
                console.log('🔍 Click inside search FAB - keeping open');
                return;
            }

            console.log('🔍 Click outside search FAB - closing');
            closeMorphingSearch(searchFab);
        }, true); // true = capture phase

        console.log('✅ Click-outside handler attached to document');
    }

    /**
     * Get or create backdrop element (now only for visual dimming, no click handling)
     * @returns {HTMLElement} Backdrop element
     */
    function getOrCreateBackdrop() {
        let backdrop = document.querySelector('.search-backdrop');

        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.className = 'search-backdrop';
            document.body.appendChild(backdrop);
        }

        return backdrop;
    }

    /**
     * Initialize morphing search FAB event listeners
     * Called after bottom action bar is rendered
     */
    function initializeMorphingSearch() {
        const searchFab = document.getElementById('searchFab');
        const searchInput = document.getElementById('searchFabInput');
        const searchClose = document.getElementById('searchFabClose');
        const searchIcon = searchFab?.querySelector('.search-icon-expanded');

        if (!searchFab || !searchInput || !searchClose) {
            console.warn('⚠️ Morphing search elements not found');
            return;
        }

        console.log('🔧 Initializing morphing search');

        // Set up document-level click-outside handler (replaces backdrop click handling)
        setupClickOutsideHandler();

        // Close button handler - CLEARS search and closes
        searchClose.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();

            // Add pulse animation
            searchClose.classList.add('pulse');
            setTimeout(() => searchClose.classList.remove('pulse'), 300);

            // Clear search and close
            clearAndCloseSearch(searchFab);
        });

        // ESC key handler - just closes without clearing
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeMorphingSearch(searchFab);
            }
        });

        // Search input handler with debouncing
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);

            // Update close button visibility based on input
            const hasText = e.target.value.trim().length > 0;
            if (hasText) {
                searchClose.classList.add('has-text');
            } else {
                searchClose.classList.remove('has-text');
            }

            searchTimeout = setTimeout(() => {
                const searchTerm = e.target.value.trim();
                console.log('🔍 Search term:', searchTerm);

                // Update the appropriate filter based on current page
                if (window.currentFilters && window.applyFiltersAndRender) {
                    // Exercise database page
                    window.currentFilters.search = searchTerm;
                    window.applyFiltersAndRender(window.currentFilters);
                } else if (window.ffn?.workoutDatabase && window.filterWorkouts) {
                    // Workout database page
                    window.ffn.workoutDatabase.filters.search = searchTerm;
                    window.filterWorkouts();
                } else if (window.ffn?.programsPage && window.renderProgramsGrid) {
                    // Programs page
                    window.ffn.programsPage.filters.search = searchTerm;
                    window.renderProgramsGrid();
                }
            }, 300);
        });

        console.log('✅ Morphing search initialized');
    }

    // Initialize morphing search when bottom action bar is ready
    window.addEventListener('bottomActionBarReady', () => {
        console.log('🎯 Bottom Action Bar ready, initializing morphing search');
        initializeMorphingSearch();
    });

    // Also try to initialize if bottom action bar is already ready
    if (document.getElementById('searchFab')) {
        console.log('🎯 Search FAB already exists, initializing morphing search');
        initializeMorphingSearch();
    }

    // Register on window for use by bottom-action-bar-config.js
    window.openMorphingSearch = openMorphingSearch;
    window.closeMorphingSearch = closeMorphingSearch;
    window.clearAndCloseSearch = clearAndCloseSearch;
    window.initializeMorphingSearch = initializeMorphingSearch;

    console.log('✅ Morphing search module loaded');
})();
