/**
 * Workouts Tab Bar Template
 * Shared page-routing tab bar for the Workouts section pages:
 * My Workouts (workout-database.html), Programs (programs.html), Explore (public-workouts.html)
 */

/**
 * Generate the workouts tab bar HTML
 * @param {string} activeTab - 'my-workouts' | 'programs' | 'explore'
 * @returns {string} Tab bar HTML
 */
function getWorkoutsTabBarHTML(activeTab = 'my-workouts') {
    const tabs = [
        { id: 'my-workouts', label: 'My Workouts', href: 'workout-database.html', icon: 'bx-dumbbell' },
        { id: 'programs', label: 'Programs', href: 'programs.html', icon: 'bx-folder' },
        { id: 'explore', label: 'Explore', href: 'public-workouts.html', icon: 'bx-globe' }
    ];

    const tabItems = tabs.map(tab => {
        const isActive = tab.id === activeTab;
        return `
            <li class="nav-item" role="presentation">
                <a class="nav-link ${isActive ? 'active' : ''}" href="${tab.href}"
                   role="tab" ${isActive ? 'aria-current="page"' : ''}>
                    <i class="bx ${tab.icon} me-1"></i>${tab.label}
                </a>
            </li>`;
    }).join('');

    return `
        <nav class="workouts-tab-bar" aria-label="Workouts sections">
            <ul class="nav nav-tabs" role="tablist">
                ${tabItems}
            </ul>
        </nav>
    `;
}

window.getWorkoutsTabBarHTML = getWorkoutsTabBarHTML;
