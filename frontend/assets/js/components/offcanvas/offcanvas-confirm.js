/**
 * Ghost Gym - Confirm Offcanvas Component
 * Creates a generic confirmation offcanvas
 *
 * @module offcanvas-confirm
 * @version 1.0.0
 */

import { createOffcanvas, escapeHtml } from './offcanvas-helpers.js';

/**
 * Create a generic confirmation offcanvas
 * @param {Object} config - Configuration options
 * @param {string} config.id - Unique offcanvas ID (default: 'confirmOffcanvas')
 * @param {string} config.title - Header title
 * @param {string} config.icon - Boxicon class (default: 'bx-question-mark')
 * @param {string} config.iconColor - Bootstrap color class (default: 'warning')
 * @param {string} config.message - Main message text
 * @param {string} config.subMessage - Optional sub-message text
 * @param {string} config.confirmText - Confirm button text (default: 'Confirm')
 * @param {string} config.confirmVariant - Bootstrap button variant (default: 'primary')
 * @param {string} config.cancelText - Cancel button text (default: 'Cancel')
 * @param {Function} config.onConfirm - Callback when confirmed
 * @param {Function} config.onCancel - Optional callback when cancelled
 * @returns {Object} Offcanvas instance
 */
export function createConfirmOffcanvas(config) {
    const {
        id = 'confirmOffcanvas',
        title = 'Confirm',
        icon = 'bx-question-mark',
        iconColor = 'warning',
        message = 'Are you sure?',
        subMessage = '',
        confirmText = 'Confirm',
        confirmVariant = 'primary',
        cancelText = 'Cancel',
        onConfirm,
        onCancel
    } = config;

    const offcanvasHtml = `
        <div class="offcanvas offcanvas-bottom offcanvas-bottom-base" tabindex="-1"
             id="${id}" aria-labelledby="${id}Label" data-bs-scroll="false">
            <div class="offcanvas-header border-bottom">
                <h5 class="offcanvas-title" id="${id}Label">
                    <i class="bx ${icon} me-2 text-${iconColor}"></i>${escapeHtml(title)}
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
            </div>
            <div class="offcanvas-body">
                <div class="text-center mb-4">
                    <div class="mb-3">
                        <i class="bx ${icon}" style="font-size: 3rem; color: var(--bs-${iconColor});"></i>
                    </div>
                    <h5 class="mb-2">${escapeHtml(message)}</h5>
                    ${subMessage ? `<p class="text-muted mb-0">${escapeHtml(subMessage)}</p>` : ''}
                </div>

                <div class="d-flex gap-2">
                    <button type="button" class="btn btn-outline-secondary flex-fill" data-bs-dismiss="offcanvas" id="${id}CancelBtn">
                        <i class="bx bx-x me-1"></i>${escapeHtml(cancelText)}
                    </button>
                    <button type="button" class="btn btn-${confirmVariant} flex-fill" id="${id}ConfirmBtn">
                        <i class="bx bx-check me-1"></i>${escapeHtml(confirmText)}
                    </button>
                </div>
            </div>
        </div>
    `;

    return createOffcanvas(id, offcanvasHtml, (offcanvas) => {
        const confirmBtn = document.getElementById(`${id}ConfirmBtn`);
        const cancelBtn = document.getElementById(`${id}CancelBtn`);

        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                offcanvas.hide();
                if (onConfirm) {
                    onConfirm();
                }
            });
        }

        if (cancelBtn && onCancel) {
            cancelBtn.addEventListener('click', () => {
                onCancel();
            });
        }
    });
}
