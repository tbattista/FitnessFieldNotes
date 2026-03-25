/**
 * Ghost Gym - Filter Offcanvas Component
 * Creates filter offcanvas with FilterBar component integration
 *
 * @module offcanvas-filter
 * @version 1.0.0
 */

import { createOffcanvas, escapeHtml } from './offcanvas-helpers.js';

/**
 * Create filter offcanvas with FilterBar component integration
 * @param {Object} config - Filter configuration
 * @param {string} config.id - Unique offcanvas ID
 * @param {string} config.title - Header title (default: "Filters")
 * @param {string} config.icon - Boxicon class (default: "bx-filter-alt")
 * @param {string} config.filterBarContainerId - ID for FilterBar container
 * @param {string} config.clearButtonId - ID for clear button
 * @param {Function} config.onApply - Callback when Apply is clicked
 * @param {Function} config.onClear - Callback when Clear is clicked
 * @returns {Object} Offcanvas instance
 */
export function createFilterOffcanvas(config) {
    const {
        id,
        title = 'Filters',
        icon = 'bx-filter',
        filterBarContainerId = 'filterBarContainer',
        clearButtonId = 'clearFiltersBtn',
        onApply,
        onClear
    } = config;

    const offcanvasHtml = `
        <div class="offcanvas offcanvas-bottom offcanvas-bottom-base offcanvas-bottom-tall"
             tabindex="-1" id="${id}" aria-labelledby="${id}Label"
             data-bs-scroll="false" style="height: 85vh;">
            <div class="offcanvas-header border-bottom">
                <h5 class="offcanvas-title" id="${id}Label">
                    <i class="bx ${icon} me-2"></i>${escapeHtml(title)}
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
            </div>
            <div class="offcanvas-body" style="overflow-y: auto;">
                <!-- FilterBar component will inject here -->
                <div id="${filterBarContainerId}"></div>

                <!-- Action Buttons -->
                <div class="row mt-3">
                    <div class="col-6">
                        <button type="button" class="btn btn-outline-secondary w-100" id="${clearButtonId}">
                            <i class="bx bx-x me-1"></i>Clear
                        </button>
                    </div>
                    <div class="col-6">
                        <button type="button" class="btn btn-primary w-100" data-bs-dismiss="offcanvas">
                            <i class="bx bx-check me-1"></i>Apply
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    return createOffcanvas(id, offcanvasHtml, (offcanvas, offcanvasElement) => {
        // Clear button handler
        if (onClear) {
            const clearBtn = offcanvasElement.querySelector(`#${clearButtonId}`);
            if (clearBtn) {
                clearBtn.addEventListener('click', onClear);
            }
        }

        // Apply button handler
        if (onApply) {
            const applyBtn = offcanvasElement.querySelector('[data-bs-dismiss="offcanvas"]');
            if (applyBtn) {
                applyBtn.addEventListener('click', onApply);
            }
        }
    });
}
