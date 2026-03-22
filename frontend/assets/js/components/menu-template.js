/**
 * Menu Template Component
 * Single source of truth for the sidebar menu HTML
 * Provides consistent menu structure across all pages
 */

/**
 * Generate the complete menu HTML
 * Simplified to 3 primary nav items with no section headers
 * @param {string} activePage - The currently active page identifier
 * @returns {string} Complete menu HTML
 */
function getMenuHTML(activePage = 'home') {
    const isHome = activePage === 'home';
    const isWorkouts = activePage === 'workout-database';
    const isHistory = activePage === 'workout-history';
    const isExercises = activePage === 'exercise-database';

    return `
        <nav aria-label="Main navigation">
            <ul class="menu-inner py-1">
                <li class="menu-header small text-uppercase">
                    <span class="menu-header-text">Navigation</span>
                </li>

                <li class="menu-item ${isHome ? 'active' : ''}"${isHome ? ' aria-current="page"' : ''}>
                    <a href="index.html" class="menu-link">
                        <i class="menu-icon tf-icons bx ${isHome ? 'bxs-home' : 'bx-home'}"></i>
                        <div class="text-truncate">Home</div>
                    </a>
                </li>

                <li class="menu-item ${isWorkouts ? 'active' : ''}"${isWorkouts ? ' aria-current="page"' : ''}>
                    <a href="workout-database.html" class="menu-link">
                        <i class="menu-icon tf-icons bx ${isWorkouts ? 'bx-dumbbell' : 'bx-dumbbell'}"></i>
                        <div class="text-truncate">Workouts</div>
                    </a>
                </li>

                <li class="menu-item ${isHistory ? 'active' : ''}"${isHistory ? ' aria-current="page"' : ''}>
                    <a href="workout-history.html?all=true" class="menu-link">
                        <i class="menu-icon tf-icons bx bx-history"></i>
                        <div class="text-truncate">History</div>
                    </a>
                </li>

                <li class="menu-header small text-uppercase">
                    <span class="menu-header-text">Data Management</span>
                </li>

                <li class="menu-item ${isExercises ? 'active' : ''}"${isExercises ? ' aria-current="page"' : ''}>
                    <a href="exercise-database.html" class="menu-link">
                        <i class="menu-icon tf-icons bx ${isExercises ? 'bxs-data' : 'bx-data'}"></i>
                        <div class="text-truncate">Exercises</div>
                    </a>
                </li>
            </ul>
        </nav>
    `;
}

/**
 * Generate the global floating log button HTML
 * @returns {string} FAB button that opens the log session bottom sheet
 */
function getGlobalLogFabHTML() {
    return `
        <button type="button" class="global-log-fab" id="globalLogFab" aria-label="Log a workout">
            <i class="bx bx-plus"></i>
            <span class="global-log-fab-label">Log Session</span>
        </button>
    `;
}

// Make globally available immediately
window.getMenuHTML = getMenuHTML;
window.getGlobalLogFabHTML = getGlobalLogFabHTML;

/**
 * Cycle through theme options: auto → dark → light → auto
 * Shared function used by both navbar and any other theme toggles
 */
function cycleTheme() {
    if (!window.themeManager) return;

    const currentPreference = window.themeManager.getPreference();
    let nextTheme;

    switch (currentPreference) {
        case 'auto':
            nextTheme = 'dark';
            break;
        case 'dark':
            nextTheme = 'light';
            break;
        case 'light':
            nextTheme = 'auto';
            break;
        default:
            nextTheme = 'auto';
    }

    console.log('🎨 Cycling theme from', currentPreference, 'to', nextTheme);
    window.themeManager.setPreference(nextTheme);
    
    // Dispatch event so all theme toggles can update
    window.dispatchEvent(new Event('themeChanged'));
}

// Make globally available
window.cycleTheme = cycleTheme;