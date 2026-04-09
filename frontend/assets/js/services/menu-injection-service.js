/**
 * Menu Injection Service
 * Dynamically injects menu and modals into pages
 * Ensures consistent UI components across all pages
 */

class MenuInjectionService {
    constructor() {
        this.init();
    }
    
    /**
     * Initialize the service - must run BEFORE DOMContentLoaded to inject menu before menu.js initializes
     */
    init() {
        // Inject immediately if DOM is already interactive or complete
        if (document.readyState === 'interactive' || document.readyState === 'complete') {
            this.injectComponents();
        } else {
            // Otherwise inject as soon as DOM is interactive (before DOMContentLoaded)
            document.addEventListener('readystatechange', () => {
                if (document.readyState === 'interactive') {
                    this.injectComponents();
                }
            });
        }
    }
    
    /**
     * Inject all components (menu and modals)
     */
    injectComponents() {
        try {
            this.injectMenu();
            this.injectModals();
            console.log('✅ Menu and modals injected successfully');
            
            // Re-initialize menu functionality after injection
            this.reinitializeMenu();
            
            // Initialize theme toggle functionality
            this.initializeThemeToggle();
        } catch (error) {
            console.error('❌ Error injecting components:', error);
        }
    }
    
    /**
     * Initialize theme toggle functionality after menu injection
     */
    initializeThemeToggle() {
        // Wait a bit for menu to be fully rendered
        setTimeout(() => {
            if (window.initializeThemeToggle) {
                window.initializeThemeToggle();
            } else {
                console.warn('⚠️ initializeThemeToggle not available yet');
            }
        }, 200);
    }
    
    /**
     * Re-initialize menu functionality after injection
     * Dispatches event for main.js to handle Menu class initialization
     */
    reinitializeMenu() {
        // Dispatch event to notify that menu content is ready
        // main.js uses event delegation, so no need to re-attach toggle listeners
        window.dispatchEvent(new CustomEvent('menuContentInjected'));
        console.log('✅ Menu content injected, initialization event dispatched');
    }



    /**
     * Inject the sidebar menu and global log FAB
     */
    injectMenu() {
        const menuContainer = document.getElementById('layout-menu');

        if (!menuContainer) {
            console.warn('⚠️ Menu container (#layout-menu) not found');
            return;
        }

        if (!window.getMenuHTML) {
            console.error('❌ getMenuHTML function not available. Make sure menu-template.js is loaded first.');
            return;
        }

        // Determine active page from URL
        const activePage = this.getActivePageFromURL();

        // Inject sidebar menu HTML
        menuContainer.innerHTML = window.getMenuHTML(activePage);

        // Inject global log FAB (skip on workout-mode and workout-builder)
        if (window.getGlobalLogFabHTML) {
            const filename = window.location.pathname.split('/').pop() || '';
            const excludedPages = ['workout-mode', 'workout-builder'];
            const isExcluded = excludedPages.some(p => filename.includes(p));
            if (!isExcluded) {
                const fabWrapper = document.createElement('div');
                fabWrapper.innerHTML = window.getGlobalLogFabHTML();
                const fab = fabWrapper.firstElementChild;
                if (fab) {
                    document.body.appendChild(fab);
                    document.body.classList.add('has-global-log-fab');
                }
            }
        }

        console.log(`✅ Menu injected with active page: ${activePage}`);
    }

    /**
     * Inject modals at the end of the body
     */
    injectModals() {
        if (!window.getAuthModalsHTML) {
            console.error('❌ getAuthModalsHTML function not available. Make sure auth-modals-template.js is loaded first.');
            return;
        }
        
        // Check if modals are already injected
        if (document.getElementById('authModal')) {
            console.log('ℹ️ Modals already injected, skipping');
            return;
        }
        
        // Inject modals at end of body
        document.body.insertAdjacentHTML('beforeend', window.getAuthModalsHTML());
        
        console.log('✅ Authentication modals injected');
    }
    
    /**
     * Determine the active page from the current URL
     * Maps all pages to one of: home, workout-database, workout-history, profile
     * Sub-pages map to their parent nav item
     * @returns {string} The active page identifier
     */
    getActivePageFromURL() {
        const path = window.location.pathname;
        const filename = path.split('/').pop() || 'index.html';

        // Primary nav pages
        if (filename.includes('workout-history')) return 'workout-history';
        if (filename.includes('workout-database')) return 'workout-database';
        if (filename.includes('profile')) return 'profile';

        // Sub-pages map to "Workouts" parent
        if (filename.includes('workout-builder')) return 'workout-database';
        if (filename.includes('programs')) return 'workout-database';
        if (filename.includes('public-workouts')) return 'workout-database';
        if (filename.includes('exercise-database')) return 'exercise-database';
        if (filename.includes('exercise-edit')) return 'exercise-database';

        // Lab Projects
        if (filename.includes('spin-ride')) return 'spin-ride';

        // Everything else maps to Home
        if (filename.includes('index') || filename === '') return 'home';

        return 'home';
    }
}

// Initialize immediately when script loads
new MenuInjectionService();