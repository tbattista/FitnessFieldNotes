/**
 * Ghost Gym - ModalManager Component
 * Simplified modal creation and management
 * @version 1.0.0
 */

class FFNModalManager {
    constructor() {
        this.modals = new Map();
        this.modalCounter = 0;
    }
    
    /**
     * Create a new modal
     * @param {string} id - Unique modal ID
     * @param {Object} options - Modal configuration
     * @returns {Object} Modal instance
     */
    create(id, options = {}) {
        if (this.modals.has(id)) {
            console.warn(`⚠️ Modal with id "${id}" already exists`);
            return this.modals.get(id);
        }
        
        const defaultOptions = {
            title: 'Modal',
            body: '',
            size: 'md', // 'sm', 'md', 'lg', 'xl'
            backdrop: true,
            keyboard: true,
            focus: true,
            buttons: [],
            onShow: null,
            onHide: null,
            onSubmit: null,
            closeButton: true,
            ...options
        };
        
        const modalElement = this.createModalElement(id, defaultOptions);
        document.body.appendChild(modalElement);
        
        const bsModal = new bootstrap.Modal(modalElement, {
            backdrop: defaultOptions.backdrop,
            keyboard: defaultOptions.keyboard,
            focus: defaultOptions.focus
        });
        
        const modal = {
            id,
            element: modalElement,
            bsModal,
            options: defaultOptions
        };
        
        this.attachEventListeners(modal);
        this.modals.set(id, modal);
        
        return modal;
    }
    
    createModalElement(id, options) {
        const sizeClass = options.size !== 'md' ? `modal-${options.size}` : '';
        
        const modalHtml = `
            <div class="modal fade" id="${id}" tabindex="-1" aria-labelledby="${id}Label" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered ${sizeClass}">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="${id}Label">${options.title}</h5>
                            ${options.closeButton ? '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' : ''}
                        </div>
                        <div class="modal-body">
                            ${options.body}
                        </div>
                        ${options.buttons.length > 0 ? `
                        <div class="modal-footer">
                            ${this.createButtonsHtml(options.buttons)}
                        </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
        
        const temp = document.createElement('div');
        temp.innerHTML = modalHtml.trim();
        return temp.firstChild;
    }
    
    createButtonsHtml(buttons) {
        return buttons.map((button, index) => {
            const btnClass = button.class || 'btn-secondary';
            const btnId = button.id || `modal-btn-${index}`;
            const dismiss = button.dismiss ? 'data-bs-dismiss="modal"' : '';
            const disabled = button.disabled ? 'disabled' : '';

            return `
                <button type="button"
                        class="btn ${btnClass}"
                        id="${btnId}"
                        ${dismiss}
                        ${disabled}>
                    ${button.icon ? `<i class="${button.icon} me-1"></i>` : ''}
                    ${button.text}
                </button>
            `;
        }).join('');
    }
    
    attachEventListeners(modal) {
        const { element, options } = modal;
        
        // Show event
        element.addEventListener('show.bs.modal', () => {
            if (options.onShow) {
                options.onShow(modal);
            }
        });
        
        // Hide event
        element.addEventListener('hide.bs.modal', () => {
            if (options.onHide) {
                options.onHide(modal);
            }
        });
        
        // Button click events
        options.buttons.forEach((button, index) => {
            if (button.onClick) {
                const btnId = button.id || `modal-btn-${index}`;
                const btnElement = element.querySelector(`#${btnId}`);
                if (btnElement) {
                    btnElement.addEventListener('click', () => {
                        button.onClick(modal);
                    });
                }
            }
        });
    }
    
    /**
     * Show a modal
     * @param {string} id - Modal ID
     * @param {Object} data - Optional data to pass to modal
     */
    show(id, data = null) {
        const modal = this.modals.get(id);
        if (!modal) {
            console.error(`❌ Modal with id "${id}" not found`);
            return;
        }
        
        if (data) {
            modal.data = data;
        }
        
        modal.bsModal.show();
    }
    
    /**
     * Hide a modal
     * @param {string} id - Modal ID
     */
    hide(id) {
        const modal = this.modals.get(id);
        if (!modal) {
            console.error(`❌ Modal with id "${id}" not found`);
            return;
        }
        
        modal.bsModal.hide();
    }
    
    /**
     * Update modal content
     * @param {string} id - Modal ID
     * @param {Object} updates - Content to update
     */
    update(id, updates = {}) {
        const modal = this.modals.get(id);
        if (!modal) {
            console.error(`❌ Modal with id "${id}" not found`);
            return;
        }
        
        const { element } = modal;
        
        if (updates.title) {
            const titleElement = element.querySelector('.modal-title');
            if (titleElement) {
                titleElement.textContent = updates.title;
            }
        }
        
        if (updates.body) {
            const bodyElement = element.querySelector('.modal-body');
            if (bodyElement) {
                bodyElement.innerHTML = updates.body;
            }
        }
    }
    
    /**
     * Destroy a modal
     * @param {string} id - Modal ID
     */
    destroy(id) {
        const modal = this.modals.get(id);
        if (!modal) {
            return;
        }
        
        modal.bsModal.dispose();
        modal.element.remove();
        this.modals.delete(id);
    }
    
    /**
     * Destroy all modals
     */
    destroyAll() {
        this.modals.forEach((modal, id) => {
            this.destroy(id);
        });
    }
    
    // Pre-configured Modal Templates
    
    /**
     * Show a confirmation dialog
     * @param {string} title - Dialog title
     * @param {string} message - Dialog message
     * @param {Function} onConfirm - Callback when confirmed
     * @param {Object} options - Additional options
     */
    confirm(title, message, onConfirm, options = {}) {
        const id = `confirm-modal-${this.modalCounter++}`;
        let pendingConfirm = null;

        const modal = this.create(id, {
            title: title || 'Confirm',
            body: `<p>${message}</p>`,
            size: options.size || 'md',
            buttons: [
                {
                    text: options.cancelText || 'Cancel',
                    class: 'btn-secondary',
                    dismiss: true
                },
                {
                    text: options.confirmText || 'Confirm',
                    class: options.confirmClass || 'btn-primary',
                    icon: options.confirmIcon || null,
                    onClick: (modal) => {
                        pendingConfirm = onConfirm;
                        this.hide(id);
                    }
                }
            ]
        });

        // Single cleanup point: wait for Bootstrap transition to fully complete
        modal.element.addEventListener('hidden.bs.modal', () => {
            const callback = pendingConfirm;
            this.destroy(id);
            if (callback) callback();
        }, { once: true });

        this.show(id);
        return modal;
    }
    
    /**
     * Show a prompt dialog with text input
     * @param {string} title - Dialog title
     * @param {string} message - Label/description text
     * @param {string} defaultValue - Pre-filled input value
     * @param {Function} onConfirm - Callback receiving the input value string
     * @param {Function} [onCancel] - Callback when cancelled
     * @param {Object} [options] - Additional options
     */
    prompt(title, message, defaultValue = '', onConfirm, onCancel, options = {}) {
        const id = `prompt-modal-${this.modalCounter++}`;
        const inputId = `${id}-input`;
        let pendingConfirm = null;

        const body = `
            <div class="mb-3">
                <label for="${inputId}" class="form-label">${message}</label>
                <input type="${options.inputType || 'text'}"
                       class="form-control"
                       id="${inputId}"
                       value="${String(defaultValue).replace(/"/g, '&quot;')}"
                       placeholder="${options.placeholder || ''}">
            </div>
        `;

        const modal = this.create(id, {
            title: title || 'Input',
            body: body,
            size: options.size || 'sm',
            buttons: [
                {
                    text: options.cancelText || 'Cancel',
                    class: 'btn-secondary',
                    dismiss: true
                },
                {
                    text: options.confirmText || 'Save',
                    class: options.confirmClass || 'btn-primary',
                    onClick: () => {
                        const input = document.getElementById(inputId);
                        pendingConfirm = input ? input.value : '';
                        this.hide(id);
                    }
                }
            ]
        });

        // Auto-focus and select input when modal is shown
        modal.element.addEventListener('shown.bs.modal', () => {
            const input = document.getElementById(inputId);
            if (input) {
                input.focus();
                input.select();
            }
        }, { once: true });

        // Allow Enter key to confirm
        modal.element.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const input = document.getElementById(inputId);
                pendingConfirm = input ? input.value : '';
                this.hide(id);
            }
        });

        // Cleanup on close
        modal.element.addEventListener('hidden.bs.modal', () => {
            const value = pendingConfirm;
            this.destroy(id);
            if (value !== null) {
                if (onConfirm) onConfirm(value);
            } else {
                if (onCancel) onCancel();
            }
        }, { once: true });

        this.show(id);
        return modal;
    }

    /**
     * Show a destructive-action confirmation gated by typing a required
     * phrase. The confirm button is disabled until the input value matches
     * (case-insensitive trim). Use for genuinely irreversible actions like
     * permanent delete — the typing requirement makes accidental confirms
     * (autocomplete, double-tap, fat-finger) effectively impossible.
     *
     * @param {string} title
     * @param {string} message - HTML allowed
     * @param {string} requiredText - the phrase the user must type
     * @param {Function} onConfirm - invoked AFTER hide if confirmed
     * @param {Object} [options] - { confirmText, confirmClass, placeholder, size }
     */
    typeToConfirm(title, message, requiredText, onConfirm, options = {}) {
        const id = `type-to-confirm-modal-${this.modalCounter++}`;
        const inputId = `${id}-input`;
        const confirmBtnId = `${id}-confirm`;
        const required = String(requiredText || '').trim();
        let pendingConfirm = null;

        const body = `
            <p class="mb-3">${message}</p>
            <label for="${inputId}" class="form-label small text-muted">
                Type <code class="text-danger">${required}</code> to confirm
            </label>
            <input type="text"
                   class="form-control"
                   id="${inputId}"
                   autocomplete="off"
                   autocapitalize="off"
                   spellcheck="false"
                   placeholder="${options.placeholder || required}">
        `;

        const modal = this.create(id, {
            title: title || 'Confirm',
            body: body,
            size: options.size || 'sm',
            buttons: [
                { text: options.cancelText || 'Cancel', class: 'btn-secondary', dismiss: true },
                {
                    text: options.confirmText || 'Delete permanently',
                    class: options.confirmClass || 'btn-danger',
                    id: confirmBtnId,
                    disabled: true,
                    onClick: () => {
                        const input = document.getElementById(inputId);
                        const val = input ? String(input.value).trim() : '';
                        if (val.toLowerCase() !== required.toLowerCase()) return;
                        pendingConfirm = onConfirm;
                        this.hide(id);
                    }
                }
            ]
        });

        modal.element.addEventListener('shown.bs.modal', () => {
            const input = document.getElementById(inputId);
            const btn = document.getElementById(confirmBtnId);
            if (!input) return;
            input.focus();
            const sync = () => {
                const match = input.value.trim().toLowerCase() === required.toLowerCase();
                if (btn) btn.disabled = !match;
            };
            input.addEventListener('input', sync);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && input.value.trim().toLowerCase() === required.toLowerCase()) {
                    e.preventDefault();
                    pendingConfirm = onConfirm;
                    this.hide(id);
                }
            });
        }, { once: true });

        modal.element.addEventListener('hidden.bs.modal', () => {
            const cb = pendingConfirm;
            this.destroy(id);
            if (cb) cb();
        }, { once: true });

        this.show(id);
        return modal;
    }

    /**
     * Show an alert dialog
     * @param {string} title - Dialog title
     * @param {string} message - Dialog message
     * @param {string} type - Alert type ('info', 'success', 'warning', 'danger')
     */
    alert(title, message, type = 'info') {
        const id = `alert-modal-${this.modalCounter++}`;
        
        const iconMap = {
            info: 'bx bx-info-circle text-info',
            success: 'bx bx-check-circle text-success',
            warning: 'bx bx-error text-warning',
            danger: 'bx bx-error-circle text-danger'
        };
        
        const icon = iconMap[type] || iconMap.info;
        
        const modal = this.create(id, {
            title: title || 'Alert',
            body: `
                <div class="d-flex align-items-start">
                    <i class="${icon} me-3" style="font-size: 2rem;"></i>
                    <p class="mb-0">${message}</p>
                </div>
            `,
            buttons: [
                {
                    text: 'OK',
                    class: 'btn-primary',
                    dismiss: true
                }
            ]
        });

        modal.element.addEventListener('hidden.bs.modal', () => {
            this.destroy(id);
        }, { once: true });

        this.show(id);
        return modal;
    }
    
    /**
     * Show a form dialog
     * @param {string} title - Dialog title
     * @param {Array} fields - Form field definitions
     * @param {Function} onSubmit - Callback when form is submitted
     * @param {Object} options - Additional options
     */
    form(title, fields, onSubmit, options = {}) {
        const id = `form-modal-${this.modalCounter++}`;
        const formId = `${id}-form`;
        
        const formHtml = `
            <form id="${formId}">
                ${fields.map(field => this.createFormFieldHtml(field)).join('')}
            </form>
        `;
        
        const modal = this.create(id, {
            title: title || 'Form',
            body: formHtml,
            size: options.size || 'md',
            buttons: [
                {
                    text: options.cancelText || 'Cancel',
                    class: 'btn-secondary',
                    dismiss: true
                },
                {
                    text: options.submitText || 'Submit',
                    class: options.submitClass || 'btn-primary',
                    icon: options.submitIcon || 'bx bx-check',
                    onClick: (modal) => {
                        const form = document.getElementById(formId);
                        if (form.checkValidity()) {
                            const formData = this.getFormData(form, fields);
                            if (onSubmit) {
                                const result = onSubmit(formData);
                                // If onSubmit returns false, don't close modal
                                if (result !== false) {
                                    this.hide(id);
                                }
                            }
                        } else {
                            form.reportValidity();
                        }
                    }
                }
            ]
        });

        modal.element.addEventListener('hidden.bs.modal', () => {
            this.destroy(id);
        }, { once: true });

        this.show(id);
        return modal;
    }
    
    createFormFieldHtml(field) {
        const required = field.required ? 'required' : '';
        const value = field.value || '';
        
        switch (field.type) {
            case 'text':
            case 'email':
            case 'number':
            case 'password':
                return `
                    <div class="mb-3">
                        <label for="${field.name}" class="form-label">${field.label}${field.required ? ' *' : ''}</label>
                        <input type="${field.type}" 
                               class="form-control" 
                               id="${field.name}" 
                               name="${field.name}"
                               value="${value}"
                               placeholder="${field.placeholder || ''}"
                               ${required}>
                    </div>
                `;
            
            case 'textarea':
                return `
                    <div class="mb-3">
                        <label for="${field.name}" class="form-label">${field.label}${field.required ? ' *' : ''}</label>
                        <textarea class="form-control" 
                                  id="${field.name}" 
                                  name="${field.name}"
                                  rows="${field.rows || 3}"
                                  placeholder="${field.placeholder || ''}"
                                  ${required}>${value}</textarea>
                    </div>
                `;
            
            case 'select':
                return `
                    <div class="mb-3">
                        <label for="${field.name}" class="form-label">${field.label}${field.required ? ' *' : ''}</label>
                        <select class="form-select" 
                                id="${field.name}" 
                                name="${field.name}"
                                ${required}>
                            <option value="">Select...</option>
                            ${(field.options || []).map(opt => {
                                const optValue = typeof opt === 'object' ? opt.value : opt;
                                const optLabel = typeof opt === 'object' ? opt.label : opt;
                                const selected = optValue === value ? 'selected' : '';
                                return `<option value="${optValue}" ${selected}>${optLabel}</option>`;
                            }).join('')}
                        </select>
                    </div>
                `;
            
            case 'checkbox':
                return `
                    <div class="mb-3">
                        <div class="form-check">
                            <input class="form-check-input" 
                                   type="checkbox" 
                                   id="${field.name}" 
                                   name="${field.name}"
                                   ${value ? 'checked' : ''}
                                   ${required}>
                            <label class="form-check-label" for="${field.name}">
                                ${field.label}
                            </label>
                        </div>
                    </div>
                `;
            
            default:
                return '';
        }
    }
    
    getFormData(form, fields) {
        const formData = {};
        
        fields.forEach(field => {
            const element = form.querySelector(`[name="${field.name}"]`);
            if (!element) return;
            
            if (field.type === 'checkbox') {
                formData[field.name] = element.checked;
            } else if (field.type === 'number') {
                formData[field.name] = element.value ? parseFloat(element.value) : null;
            } else {
                formData[field.name] = element.value;
            }
        });
        
        return formData;
    }
    
    // Utility Methods
    
    /**
     * Check if a modal exists
     * @param {string} id - Modal ID
     * @returns {boolean}
     */
    exists(id) {
        return this.modals.has(id);
    }
    
    /**
     * Get a modal instance
     * @param {string} id - Modal ID
     * @returns {Object|null}
     */
    get(id) {
        return this.modals.get(id) || null;
    }
    
    /**
     * Get all modal IDs
     * @returns {Array}
     */
    getAllIds() {
        return Array.from(this.modals.keys());
    }
}

// Create global instance
window.ffnModalManager = new FFNModalManager();

// Export class for custom instances
window.FFNModalManager = FFNModalManager;

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FFNModalManager;
}

console.log('📦 FFNModalManager component loaded');