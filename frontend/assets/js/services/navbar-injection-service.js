/**
 * Navbar Injection Service
 * Automatically injects the top navigation bar into pages
 * Works alongside the existing menu injection service
 */

(function() {
    'use strict';

    console.log('📦 Navbar Injection Service loading...');
    
    /**
     * Load Feedback Dropdown CSS
     */
    function loadFeedbackDropdownCSS() {
        // Check if already loaded
        if (document.querySelector('link[href*="feedback-dropdown.css"]')) {
            console.log('ℹ️ Feedback dropdown CSS already loaded');
            return;
        }
        
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/static/assets/css/feedback-dropdown.css';
        document.head.appendChild(link);
        console.log('✅ Feedback dropdown CSS loaded');
    }
    
    // Load CSS immediately
    loadFeedbackDropdownCSS();

    /**
     * Page configuration mapping
     * Maps page identifiers to their display titles, icons, and search settings
     */
    const PAGE_CONFIGS = {
        'index.html': {
            title: 'Dashboard',
            icon: 'bx-home',
            subtitle: 'Your fitness overview at a glance',
            showSearch: false
        },
        'workout-mode.html': {
            title: 'Workout Mode',
            icon: 'bx-play-circle',
            subtitle: 'Track your active workout session',
            showSearch: false
        },
        'workout-builder.html': {
            title: 'Workout Builder',
            icon: 'bx-dumbbell',
            subtitle: 'Create and customize your workouts',
            showSearch: false
        },
        'exercise-database.html': {
            title: 'Exercise Database',
            icon: 'bx-book-content',
            subtitle: 'Browse and manage exercises',
            showSearch: false
        },
        'workout-database.html': {
            title: 'Workout Library',
            icon: 'bx-library',
            subtitle: 'Your saved workout collection',
            showSearch: false
        },
        'programs.html': {
            title: 'My Programs',
            icon: 'bx-folder',
            subtitle: 'Organize workouts into training programs',
            showSearch: false
        },
        'public-workouts.html': {
            title: 'Public Workouts',
            icon: 'bx-globe',
            subtitle: 'Discover workouts shared by others',
            showSearch: false
        },
        'activity-log.html': {
            title: 'Activity Log',
            icon: 'bx-edit-alt',
            subtitle: 'Quick log your daily activities',
            showSearch: false
        },
        'workout-history.html': {
            title: 'Workout History',
            icon: 'bx-history',
            subtitle: 'Review your past workout sessions',
            showSearch: false
        },
        'profile.html': {
            title: 'My Profile',
            icon: 'bx-user',
            subtitle: 'Manage your account details',
            showSearch: false
        },
        'settings.html': {
            title: 'Settings',
            icon: 'bx-cog',
            subtitle: 'Configure your preferences',
            showSearch: false
        },
        'share.html': {
            title: 'Shared Workout',
            icon: 'bx-share-alt',
            subtitle: 'View a shared workout',
            showSearch: false
        },
        'exercise-edit.html': {
            title: 'Edit Exercise',
            icon: 'bx-edit',
            subtitle: 'Modify exercise details',
            showSearch: false
        },
        'feedback-admin.html': {
            title: 'Admin Dashboard',
            icon: 'bx-shield',
            subtitle: 'Manage feedback and feature requests',
            showSearch: false
        },
        // Fallback for unknown pages
        'default': {
            title: 'Fitness Field Notes',
            icon: 'bx-home',
            subtitle: '',
            showSearch: false
        }
    };

    /**
     * Get current page configuration
     * @returns {Object} Page config with title and icon
     */
    function getCurrentPageConfig() {
        const path = window.location.pathname;
        const filename = path.split('/').pop() || 'index.html';
        
        // Check if we have a specific config for this page
        if (PAGE_CONFIGS[filename]) {
            return PAGE_CONFIGS[filename];
        }
        
        // Check for partial matches (e.g., exercise-database-refactored.html)
        for (const [key, config] of Object.entries(PAGE_CONFIGS)) {
            if (filename.includes(key.replace('.html', ''))) {
                return config;
            }
        }
        
        // Return default config
        return PAGE_CONFIGS.default;
    }

    /**
     * Inject navbar into the page
     * On desktop, the navbar sits ABOVE the layout-container (full-width).
     * We inject it as the first child of .layout-wrapper so it spans
     * both the sidebar and the content area.
     */
    function injectNavbar() {
        console.log('🔧 Injecting navbar...');

        // Check if navbar template function is available
        if (typeof window.getNavbarHTML !== 'function') {
            console.error('❌ getNavbarHTML function not found. Make sure navbar-template.js is loaded first.');
            return false;
        }

        // Check if navbar already exists
        if (document.getElementById('layout-navbar')) {
            console.log('ℹ️ Navbar already exists, skipping injection');
            return true;
        }

        // Find injection target — .layout-wrapper is the outermost container
        const layoutWrapper = document.querySelector('.layout-wrapper');
        if (!layoutWrapper) {
            console.error('❌ .layout-wrapper element not found');
            return false;
        }

        // Get page configuration (still used for search settings)
        const pageConfig = getCurrentPageConfig();

        // Generate navbar HTML
        const navbarHTML = window.getNavbarHTML(pageConfig.title, pageConfig.icon, {
            showSearch: pageConfig.showSearch || false,
            searchPlaceholder: pageConfig.searchPlaceholder || 'Search...'
        });

        // Create element and insert as first child of layout-wrapper
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = navbarHTML.trim();
        const navbarElement = tempDiv.firstChild;

        layoutWrapper.insertBefore(navbarElement, layoutWrapper.firstChild);

        console.log('✅ Navbar injected successfully');
        return true;
    }

    /**
     * Initialize navbar functionality
     * Sets up theme toggle, auth UI, and other interactive features
     */
    function initializeNavbar() {
        console.log('🎬 Initializing navbar functionality...');

        // Wait a bit for other services to be ready
        setTimeout(() => {
            // Initialize theme toggle
            if (typeof window.initializeNavbarThemeToggle === 'function') {
                window.initializeNavbarThemeToggle();
            } else {
                console.warn('⚠️ initializeNavbarThemeToggle not available');
            }

            // Initialize auth UI
            if (typeof window.initializeNavbarAuth === 'function') {
                window.initializeNavbarAuth();
            } else {
                console.warn('⚠️ initializeNavbarAuth not available');
            }

            // Initialize search if enabled on this page
            if (typeof window.initializeNavbarSearch === 'function') {
                window.initializeNavbarSearch();
            } else {
                console.warn('⚠️ initializeNavbarSearch not available');
            }

            // Initialize feedback button
            if (typeof window.initializeNavbarFeedback === 'function') {
                window.initializeNavbarFeedback();
            } else {
                console.warn('⚠️ initializeNavbarFeedback not available');
            }

            console.log('✅ Navbar functionality initialized');
        }, 100);
    }

    /**
     * Main initialization function
     * Called when DOM is ready
     */
    function init() {
        console.log('🚀 Navbar Injection Service initializing...');

        // Inject the navbar
        const injected = injectNavbar();

        if (injected) {
            // Initialize navbar functionality
            initializeNavbar();
        } else {
            console.error('❌ Failed to inject navbar');
        }
    }

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // DOM is already ready
        init();
    }

    // Make functions globally available for debugging
    window.navbarInjectionService = {
        inject: injectNavbar,
        initialize: initializeNavbar,
        getPageConfig: getCurrentPageConfig
    };

    console.log('✅ Navbar Injection Service loaded');
})();