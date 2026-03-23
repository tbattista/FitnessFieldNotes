/**
 * Navbar Template Component
 * Generates the top navigation bar HTML with dynamic page title
 * Follows Sneat template patterns for consistency
 */

/**
 * Generate the complete navbar HTML
 * @param {string} pageTitle - The title to display in the navbar
 * @param {string} pageIcon - Boxicons class for the page icon (e.g., 'bx-home')
 * @param {Object} options - Optional configuration
 * @param {boolean} options.showSearch - Whether to show search in navbar (default: false)
 * @param {string} options.searchPlaceholder - Placeholder text for search input
 * @returns {string} Complete navbar HTML
 */
function getNavbarHTML(pageTitle = 'Fitness Field Notes', pageIcon = 'bx-home', options = {}) {
    const showSearch = options.showSearch || false;
    const searchPlaceholder = options.searchPlaceholder || 'Search...';
    return `
        <nav class="layout-navbar navbar navbar-expand-xl align-items-center bg-navbar-theme"
             id="layout-navbar">
            <div class="container-xxl">
                <!-- Left Section: Hamburger + Site Brand -->
                <div class="navbar-nav-left d-flex align-items-center flex-grow-1">
                    <!-- Hamburger Menu Toggle (mobile only) -->
                    <a class="nav-item nav-link px-0 me-3 me-xl-4 layout-menu-toggle"
                       href="javascript:void(0)"
                       aria-label="Toggle navigation menu">
                        <i class="bx bx-menu bx-sm"></i>
                    </a>
                    <!-- Site Brand -->
                    <a href="/" class="navbar-brand-link">
                        <span class="navbar-brand-text">Fitness Field Notes</span>
                    </a>
                </div>
                
                <!-- Center Section: Search (responsive) -->
                ${showSearch ? `
                <div class="navbar-search-container" id="navbarSearchContainer">
                    <!-- Desktop Search (always visible) -->
                    <div class="navbar-search-desktop d-none d-md-flex">
                        <div class="search-input-wrapper">
                            <i class="bx bx-search search-icon"></i>
                            <input
                                type="text"
                                id="navbarSearchInput"
                                class="form-control navbar-search-input"
                                placeholder="${searchPlaceholder}"
                                autocomplete="off"
                                autocapitalize="off"
                                spellcheck="false"
                            />
                            <button class="btn-close search-clear d-none" id="navbarSearchClear" aria-label="Clear search"></button>
                        </div>
                    </div>
                    
                    <!-- Mobile Search Toggle (collapsed state) -->
                    <button class="navbar-search-toggle d-md-none" id="navbarSearchToggle" title="Search" aria-label="Open search">
                        <i class="bx bx-search"></i>
                    </button>
                    
                    <!-- Mobile Search (expanded state - top dropdown) -->
                    <div class="navbar-search-mobile d-md-none" id="navbarSearchMobile">
                        <div class="search-input-wrapper">
                            <i class="bx bx-search search-icon"></i>
                            <input
                                type="text"
                                id="navbarSearchInputMobile"
                                class="form-control navbar-search-input"
                                placeholder="${searchPlaceholder}"
                                autocomplete="off"
                                autocapitalize="off"
                                spellcheck="false"
                            />
                            <button class="navbar-search-close" id="navbarSearchClose" aria-label="Clear search">
                                <i class="bx bx-x"></i>
                            </button>
                        </div>
                    </div>
                </div>
                ` : ''}
                
                <!-- Right Section: Utility Icons -->
                <ul class="navbar-nav flex-row align-items-center ms-auto">
                

                <!-- Feedback Button (hidden when signed out) -->
                <li class="nav-item me-2 me-xl-3 auth-sign-out d-none">
                    <a class="nav-link hide-arrow"
                       href="javascript:void(0);"
                       id="navbarFeedbackBtn"
                       title="Send Feedback">
                        <i class="bx bx-message-dots bx-sm"></i>
                        <span class="ms-1">Feedback</span>
                    </a>
                </li>
                
                <!-- Dark Mode Toggle (hidden when signed out) -->
                <li class="nav-item me-2 me-xl-3 auth-sign-out d-none">
                    <a class="nav-link style-switcher-toggle hide-arrow"
                       href="javascript:void(0);"
                       id="navbarDarkModeToggle"
                       title="Toggle theme">
                        <i class="bx bx-sm" id="navbarThemeIcon"></i>
                    </a>
                </li>
                
                <!-- User Profile Dropdown -->
                <li class="nav-item navbar-dropdown dropdown-user dropdown">
                    <!-- Signed Out State: Simple Sign In Button -->
                    <a class="nav-link hide-arrow auth-sign-in" 
                       href="javascript:void(0);" 
                       id="navbarSignInBtn" 
                       title="Sign In">
                        <div class="avatar">
                            <i class="bx bx-user-circle bx-md"></i>
                        </div>
                    </a>
                    
                    <!-- Signed In State: User Avatar with Dropdown -->
                    <a class="nav-link dropdown-toggle hide-arrow auth-sign-out d-none" 
                       href="javascript:void(0);" 
                       data-bs-toggle="dropdown" 
                       aria-expanded="false"
                       id="navbarUserDropdown">
                        <div class="avatar avatar-online">
                            <span class="avatar-initial rounded-circle bg-label-primary" 
                                  id="navbarUserAvatar">U</span>
                        </div>
                    </a>
                    
                    <!-- User Dropdown Menu -->
                    <ul class="dropdown-menu dropdown-menu-end auth-sign-out d-none">
                        <!-- User Info Header -->
                        <li>
                            <a class="dropdown-item" href="javascript:void(0);">
                                <div class="d-flex">
                                    <div class="flex-shrink-0 me-3">
                                        <div class="avatar avatar-online">
                                            <span class="avatar-initial rounded-circle bg-label-primary" 
                                                  id="navbarUserAvatarDropdown">U</span>
                                        </div>
                                    </div>
                                    <div class="flex-grow-1">
                                        <span class="fw-medium d-block" id="navbarUserName">User</span>
                                        <small class="text-muted" id="navbarUserEmail">user@example.com</small>
                                    </div>
                                </div>
                            </a>
                        </li>
                        <li><div class="dropdown-divider"></div></li>
                        
                        <!-- Admin Dashboard (visible only to admin) -->
                        <li class="d-none" id="navbarAdminMenuItem">
                            <a class="dropdown-item" href="/feedback-admin.html">
                                <i class="bx bx-shield me-2"></i>
                                <span>Admin Dashboard</span>
                            </a>
                        </li>
                        
                        <!-- Account Settings -->
                        <li>
                            <a class="dropdown-item" href="/profile.html">
                                <i class="bx bx-user me-2"></i>
                                <span>My Profile</span>
                            </a>
                        </li>
                        <li>
                            <a class="dropdown-item" href="/settings.html">
                                <i class="bx bx-cog me-2"></i>
                                <span>Settings</span>
                            </a>
                        </li>
                        
                        <li><div class="dropdown-divider"></div></li>
                        
                        <!-- Sign Out -->
                        <li>
                            <a class="dropdown-item" href="javascript:void(0);" id="navbarSignOutBtn">
                                <i class="bx bx-power-off me-2"></i>
                                <span>Sign Out</span>
                            </a>
                        </li>
                    </ul>
                </li>
                </ul>
            </div>
        </nav>
    `;
}

// Make globally available
window.getNavbarHTML = getNavbarHTML;

/**
 * Initialize navbar theme toggle functionality
 * Connects to the existing theme manager
 */
function initializeNavbarThemeToggle() {
    // Wait for theme manager to be available
    if (!window.themeManager) {
        console.warn('⚠️ Theme manager not available yet, retrying...');
        setTimeout(initializeNavbarThemeToggle, 100);
        return;
    }

    console.log('🎨 Initializing navbar theme toggle...');

    const toggleBtn = document.getElementById('navbarDarkModeToggle');
    if (!toggleBtn) {
        console.warn('⚠️ Navbar theme toggle button not found');
        return;
    }

    // Set up click handler
    toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        cycleTheme();
    });

    // Update icon to show current theme
    updateNavbarThemeIcon();

    // Listen for theme changes from other sources (e.g., sidebar toggle)
    window.addEventListener('themeChanged', () => {
        updateNavbarThemeIcon();
    });

    console.log('✅ Navbar theme toggle initialized');
}

/**
 * Update navbar theme icon to reflect current theme
 */
function updateNavbarThemeIcon() {
    if (!window.themeManager) return;

    const icon = document.getElementById('navbarThemeIcon');
    if (!icon) return;

    const currentPreference = window.themeManager.getPreference();

    switch (currentPreference) {
        case 'auto':
            icon.className = 'bx bx-desktop bx-sm';
            break;
        case 'dark':
            icon.className = 'bx bx-moon bx-sm';
            break;
        case 'light':
            icon.className = 'bx bx-sun bx-sm';
            break;
    }
}

/**
 * Initialize navbar authentication UI
 * Connects to the existing auth service
 */
function initializeNavbarAuth() {
    console.log('🔐 Initializing navbar auth UI...');

    // Sign in button
    const signInBtn = document.getElementById('navbarSignInBtn');
    if (signInBtn) {
        signInBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.showAuthModal) {
                window.showAuthModal('signin');
            } else {
                console.warn('⚠️ showAuthModal not available');
            }
        });
    }

    // Sign out button
    const signOutBtn = document.getElementById('navbarSignOutBtn');
    if (signOutBtn) {
        signOutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (window.authService) {
                try {
                    await window.authService.signOut();
                    console.log('✅ Signed out, redirecting to home...');
                    // Redirect to home page after sign out
                    window.location.href = '/';
                } catch (error) {
                    console.error('❌ Sign out error:', error);
                    if (window.showToast) {
                        window.showToast('Sign out failed. Please try again.', 'danger');
                    }
                }
            } else {
                console.warn('⚠️ authService not available');
            }
        });
    }

    // Listen for auth state changes
    window.addEventListener('authStateChanged', (event) => {
        updateNavbarAuthUI(event.detail);
    });

    // Initial auth state check
    if (window.authService && window.authService.currentUser) {
        updateNavbarAuthUI(window.authService.currentUser);
    }

    console.log('✅ Navbar auth UI initialized');
}

/**
 * Update navbar UI based on authentication state
 * @param {Object|null} user - Current user object or null if signed out
 */
function updateNavbarAuthUI(userDetail) {
    // Extract user from event detail if needed
    const user = userDetail?.user !== undefined ? userDetail.user : userDetail;
    
    const signInElements = document.querySelectorAll('.auth-sign-in');
    const signOutElements = document.querySelectorAll('.auth-sign-out');
    
    console.log('🔄 updateNavbarAuthUI called with user:', user?.email || 'null');
    
    if (user && user.email) {
        // User is signed in
        signInElements.forEach(el => el.classList.add('d-none'));
        signOutElements.forEach(el => el.classList.remove('d-none'));
        
        // Update user info
        const displayName = user.displayName || user.email?.split('@')[0] || 'User';
        const email = user.email || '';
        const initial = displayName.charAt(0).toUpperCase();
        
        // Update all user name displays
        document.querySelectorAll('#navbarUserName').forEach(el => {
            el.textContent = displayName;
        });
        
        // Update all email displays
        document.querySelectorAll('#navbarUserEmail').forEach(el => {
            el.textContent = email;
        });
        
        // Update all avatar initials
        document.querySelectorAll('#navbarUserAvatar, #navbarUserAvatarDropdown').forEach(el => {
            el.textContent = initial;
        });
        
        // Show/hide admin button based on email
        updateAdminButtonVisibility(user);
        
        console.log('✅ Navbar updated for signed-in user:', displayName);
    } else {
        // User is signed out
        signInElements.forEach(el => el.classList.remove('d-none'));
        signOutElements.forEach(el => el.classList.add('d-none'));
        
        // Hide admin button
        updateAdminButtonVisibility(null);
        
        console.log('✅ Navbar updated for signed-out state');
    }
}

/**
 * Show/hide admin menu item based on user email
 * @param {Object|null} user - Current user object or null
 */
function updateAdminButtonVisibility(user) {
    console.log('🔍 updateAdminButtonVisibility called with user:', user?.email);
    
    const adminMenuItem = document.getElementById('navbarAdminMenuItem');
    console.log('🔍 Admin menu item element:', adminMenuItem ? 'found' : 'NOT FOUND');
    
    if (!adminMenuItem) {
        console.warn('⚠️ Admin menu item not found in DOM');
        return;
    }
    
    const ADMIN_EMAIL = 'tbattista@gmail.com';
    console.log('🔍 Checking email:', user?.email, 'against:', ADMIN_EMAIL);
    console.log('🔍 Match:', user?.email === ADMIN_EMAIL);
    
    if (user && user.email === ADMIN_EMAIL) {
        adminMenuItem.classList.remove('d-none');
        console.log('✅ Admin menu item shown for:', user.email);
    } else {
        adminMenuItem.classList.add('d-none');
        console.log('❌ Admin menu item hidden. User email:', user?.email || 'none');
    }
}

/**
 * Initialize Navbar Search
 * Handles both desktop and mobile search functionality
 */
function initializeNavbarSearch() {
    console.log('🔍 Initializing navbar search...');
    
    const searchToggle = document.getElementById('navbarSearchToggle');
    const searchMobile = document.getElementById('navbarSearchMobile');
    const searchClose = document.getElementById('navbarSearchClose');
    const searchInputDesktop = document.getElementById('navbarSearchInput');
    const searchInputMobile = document.getElementById('navbarSearchInputMobile');
    const searchClear = document.getElementById('navbarSearchClear');
    
    // Check if search is enabled on this page
    if (!searchToggle && !searchInputDesktop) {
        console.log('ℹ️ Search not enabled on this page');
        return;
    }
    
    let searchTimeout = null;
    
    // Mobile: Toggle search expansion
    if (searchToggle && searchMobile) {
        searchToggle.addEventListener('click', () => {
            // Add haptic feedback on supported devices
            if (navigator.vibrate) {
                navigator.vibrate(10);
            }
            
            searchMobile.classList.add('active');
            document.body.classList.add('mobile-search-active');
            
            // Focus input after animation completes
            setTimeout(() => {
                searchInputMobile?.focus();
            }, 300);
            
            console.log('📱 Mobile search expanded');
        });
    }
    
    // Mobile: Close search function
    const closeMobileSearch = () => {
        // Add haptic feedback
        if (navigator.vibrate) {
            navigator.vibrate(10);
        }
        
        searchMobile?.classList.remove('active');
        document.body.classList.remove('mobile-search-active');
        
        console.log('📱 Mobile search collapsed');
    };
    
    // Mobile: Close button
    if (searchClose) {
        searchClose.addEventListener('click', (e) => {
            e.stopPropagation();
            // Clear the search
            if (searchInputMobile) {
                searchInputMobile.value = '';
            }
            if (searchInputDesktop) {
                searchInputDesktop.value = '';
            }
            performSearch('');
            closeMobileSearch();
        });
    }
    
    // Desktop: Search input handler
    if (searchInputDesktop) {
        searchInputDesktop.addEventListener('input', (e) => {
            handleSearchInput(e.target.value, searchClear);
        });
        
        // ESC to clear
        searchInputDesktop.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                searchInputDesktop.value = '';
                performSearch('');
                searchClear?.classList.add('d-none');
            }
        });
    }
    
    // Mobile: Search input handler
    if (searchInputMobile) {
        searchInputMobile.addEventListener('input', (e) => {
            const value = e.target.value;
            handleSearchInput(value, null);
            
            // Sync with desktop input
            if (searchInputDesktop) {
                searchInputDesktop.value = value;
            }
            
            // Ensure search is performed
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                performSearch(value.trim());
            }, 300);
        });
        
        // ESC to close
        searchInputMobile.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeMobileSearch();
            }
        });
    }
    
    // Clear button handler
    if (searchClear) {
        searchClear.addEventListener('click', () => {
            if (searchInputDesktop) {
                searchInputDesktop.value = '';
                searchInputDesktop.focus();
            }
            if (searchInputMobile) {
                searchInputMobile.value = '';
            }
            performSearch('');
            searchClear.classList.add('d-none');
        });
    }
    
    /**
     * Handle search input with debouncing
     */
    function handleSearchInput(value, clearButton) {
        clearTimeout(searchTimeout);
        
        // Show/hide clear button
        if (clearButton) {
            if (value.trim()) {
                clearButton.classList.remove('d-none');
            } else {
                clearButton.classList.add('d-none');
            }
        }
        
        // Debounce actual search
        searchTimeout = setTimeout(() => {
            performSearch(value.trim());
        }, 300);
    }
    
    /**
     * Perform search (integrates with existing search logic)
     */
    function performSearch(searchTerm) {
        console.log('🔍 Searching:', searchTerm);
        
        // Call existing search function if available
        if (window.applyFiltersAndRender) {
            // Use window.currentFilters if available, otherwise try filterBar
            const currentFilters = window.currentFilters || window.filterBar?.getFilters() || {};
            currentFilters.search = searchTerm;
            window.applyFiltersAndRender(currentFilters);
        }
    }
    
    
    console.log('✅ Navbar search initialized');
}

/**
 * Initialize Navbar Feedback Button
 * Connects to the feedback offcanvas
 */
function initializeNavbarFeedback() {
    console.log('💬 Initializing navbar feedback button...');

    const feedbackBtn = document.getElementById('navbarFeedbackBtn');
    if (!feedbackBtn) {
        console.warn('⚠️ Navbar feedback button not found');
        return;
    }

    // Click handler to open feedback offcanvas
    feedbackBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openFeedbackPanel();
    });

    // Keyboard shortcut (Ctrl/Cmd + Shift + F)
    // Note: Also registered by feedback-injection-service.js as backup
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
            e.preventDefault();
            openFeedbackPanel();
        }
    });

    console.log('✅ Navbar feedback button initialized');
    console.log('💡 Tip: Press Ctrl/Cmd + Shift + F to open feedback');
}

/**
 * Open the feedback panel (offcanvas)
 * @param {Object} options - Options to pass to the offcanvas
 */
function openFeedbackPanel(options = {}) {
    // Try the global function first (set by feedback-injection-service)
    if (window.openFeedbackOffcanvas) {
        window.openFeedbackOffcanvas(options);
        return;
    }

    // Fallback: try UnifiedOffcanvasFactory directly
    if (window.UnifiedOffcanvasFactory?.createFeedbackOffcanvas) {
        window.UnifiedOffcanvasFactory.createFeedbackOffcanvas({
            defaultTab: options.tab || 'vote',
            presetType: options.type || 'feature'
        });
        return;
    }

    // Legacy fallback: try old dropdown
    if (window.feedbackDropdown) {
        window.feedbackDropdown.open();
        return;
    }

    console.warn('⚠️ Feedback system not available');
}

/**
 * Open feedback (backward compatibility alias)
 */
function openFeedbackModalWithRetry() {
    openFeedbackPanel();
}

// Make functions globally available
window.initializeNavbarThemeToggle = initializeNavbarThemeToggle;
window.updateNavbarThemeIcon = updateNavbarThemeIcon;
window.initializeNavbarAuth = initializeNavbarAuth;
window.updateNavbarAuthUI = updateNavbarAuthUI;
window.updateAdminButtonVisibility = updateAdminButtonVisibility;
window.initializeNavbarSearch = initializeNavbarSearch;
window.initializeNavbarFeedback = initializeNavbarFeedback;
window.openFeedbackPanel = openFeedbackPanel;
window.openFeedbackModalWithRetry = openFeedbackModalWithRetry;

console.log('📦 Navbar template component loaded');