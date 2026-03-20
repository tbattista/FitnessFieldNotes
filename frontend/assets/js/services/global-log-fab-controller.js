/**
 * Global Log FAB Controller
 * Handles the floating "+" button that opens a bottom sheet
 * with 4 logging options: Start Saved, Build As You Go, Quick Log, Log Activity.
 *
 * Self-contained IIFE — loaded on all pages that show the FAB.
 */
(function () {
    'use strict';

    const OFFCANVAS_ID = 'logSessionOffcanvas';

    const LOG_OPTIONS = [
        {
            icon: 'bx-list-check',
            title: 'Start a Saved Workout',
            description: 'Pick from your library',
            action: () => { window.location.href = 'workout-database.html'; }
        },
        {
            icon: 'bx-edit-alt',
            title: 'Build As You Go',
            description: 'Add exercises as you work out',
            action: () => { window.location.href = 'workout-mode.html?mode=build'; }
        },
        {
            icon: 'bx-camera',
            title: 'Quick Log / AI Import',
            description: 'Photo, screenshot, or describe it',
            action: () => {
                if (window.createUniversalLogger) {
                    const { offcanvas } = window.createUniversalLogger();
                    if (offcanvas) offcanvas.show();
                } else {
                    window.location.href = 'activity-log.html?action=quicklog';
                }
            }
        },
        {
            icon: 'bx-run',
            title: 'Log an Activity',
            description: 'Run, bike, row, swim, etc.',
            action: () => { window.location.href = 'activity-log.html'; }
        }
    ];

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function buildOffcanvasHTML() {
        const rows = LOG_OPTIONS.map((opt, i) => `
            <div class="more-menu-item" data-log-action="${i}" role="button" tabindex="0">
                <i class="bx ${opt.icon} more-menu-item-icon"></i>
                <div class="more-menu-item-content">
                    <div class="more-menu-item-title">${escapeHtml(opt.title)}</div>
                    <small class="more-menu-item-description">${escapeHtml(opt.description)}</small>
                </div>
                <i class="bx bx-chevron-right more-menu-item-chevron"></i>
            </div>
        `).join('');

        return `
            <div class="offcanvas offcanvas-bottom offcanvas-bottom-base" tabindex="-1"
                 id="${OFFCANVAS_ID}" aria-labelledby="${OFFCANVAS_ID}Label"
                 data-bs-scroll="false">
                <div class="offcanvas-header border-bottom">
                    <h5 class="offcanvas-title" id="${OFFCANVAS_ID}Label">
                        <i class="bx bx-plus-circle me-2"></i>Log Session
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
                </div>
                <div class="offcanvas-body py-2">
                    <div class="more-menu-list px-2">
                        ${rows}
                    </div>
                </div>
            </div>
        `;
    }

    function openBottomSheet() {
        // Remove any existing instance
        const existing = document.getElementById(OFFCANVAS_ID);
        if (existing) existing.remove();

        // Create and inject
        const wrapper = document.createElement('div');
        wrapper.innerHTML = buildOffcanvasHTML();
        const offcanvasEl = wrapper.firstElementChild;
        document.body.appendChild(offcanvasEl);

        // Wire up row clicks
        offcanvasEl.querySelectorAll('[data-log-action]').forEach(row => {
            row.addEventListener('click', () => {
                const index = parseInt(row.dataset.logAction, 10);
                const option = LOG_OPTIONS[index];
                if (option) {
                    // Close offcanvas first, then navigate
                    const bsOffcanvas = bootstrap.Offcanvas.getInstance(offcanvasEl);
                    if (bsOffcanvas) bsOffcanvas.hide();
                    // Small delay so the offcanvas animation finishes before navigation
                    setTimeout(() => option.action(), 150);
                }
            });
        });

        // Clean up DOM when hidden
        offcanvasEl.addEventListener('hidden.bs.offcanvas', () => {
            offcanvasEl.remove();
            // Remove open state from FAB
            const fab = document.getElementById('globalLogFab');
            if (fab) fab.classList.remove('is-open');
        });

        // Show
        const bsOffcanvas = new bootstrap.Offcanvas(offcanvasEl);
        bsOffcanvas.show();

        // Add open state to FAB (rotates + to ×)
        const fab = document.getElementById('globalLogFab');
        if (fab) fab.classList.add('is-open');
    }

    // Expose globally so home page Log button can also open the sheet
    window.openLogSessionSheet = openBottomSheet;

    // Attach on DOM ready
    document.addEventListener('DOMContentLoaded', () => {
        // Use event delegation in case the FAB is injected after DOMContentLoaded
        document.addEventListener('click', (e) => {
            const fab = e.target.closest('#globalLogFab');
            if (!fab) return;
            e.preventDefault();
            openBottomSheet();
        });
    });

    console.log('📦 Global Log FAB Controller loaded');
})();
