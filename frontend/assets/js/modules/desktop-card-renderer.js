/**
 * Desktop Card Renderer Module
 * Renders activity rows (exercise, note, cardio) as table rows with inline editing
 * Works alongside (not replacing) the mobile CardRenderer
 * @version 3.0.0 — Split into DesktopCardData, DesktopInlineEditor, DesktopCardRenderer
 */

class DesktopCardRenderer {
    constructor() {
        this.activeEdit = null;
        this.autocompleteInstances = new Map();
        this._inlineEditor = new window.DesktopInlineEditor(this);
    }

    // =========================================
    // Row Shell (shared base for all card types)
    // =========================================

    /**
     * Create the shared row wrapper with drag handle (col 1) and dropdown menu (col 6).
     * Callers provide columns 2-5 content and type-specific menu items.
     * @param {Object} opts
     * @param {string} opts.groupId - Group ID (data-group-id)
     * @param {string} opts.cardType - 'exercise' | 'note' | 'cardio'
     * @param {string[]} opts.extraClasses - Additional CSS classes
     * @param {Object} opts.dataAttrs - Extra data-* attributes (key-value)
     * @param {string} opts.columnsHtml - HTML for columns 2-5
     * @param {string} opts.menuItemsHtml - Type-specific menu items (before Convert To)
     * @param {number} [opts.index] - Row index
     * @returns {string} HTML string
     */
    _createRowShell(opts) {
        const { groupId, cardType, extraClasses = [], dataAttrs = {}, columnsHtml, menuItemsHtml, index } = opts;

        const classes = ['desktop-exercise-row', 'desktop-activity-row', 'exercise-group-card', ...extraClasses].join(' ');
        const dataStr = Object.entries(dataAttrs).map(([k, v]) => `data-${k}="${this.escapeHtml(String(v))}"`).join(' ');
        const indexAttr = index !== undefined ? `data-index="${index}"` : '';

        // Build Convert To menu items (omit current type)
        const convertItems = [];
        if (cardType !== 'exercise') {
            convertItems.push(`<li><a class="dropdown-item" href="#" data-action="convert-to-exercise" data-group-id="${groupId}"><i class="bx bx-dumbbell me-2"></i>Convert to Exercise</a></li>`);
        }
        if (cardType !== 'note') {
            convertItems.push(`<li><a class="dropdown-item" href="#" data-action="convert-to-note" data-group-id="${groupId}"><i class="bx bx-comment me-2"></i>Convert to Note</a></li>`);
        }
        if (cardType !== 'cardio') {
            convertItems.push(`<li><a class="dropdown-item" href="#" data-action="convert-to-cardio" data-group-id="${groupId}"><i class="bx bx-heart-circle me-2"></i>Convert to Activity</a></li>`);
        }

        const deleteAction = 'delete-group'; // All types use unified delete

        return `
            <div class="${classes}" data-group-id="${groupId}" data-card-type="${cardType}" ${indexAttr} ${dataStr}>
                <div class="drag-handle" title="Drag to reorder">
                    <i class="bx bx-grid-vertical"></i>
                </div>
                ${columnsHtml}
                <button class="row-edit-btn" type="button" data-action="row-edit" data-group-id="${groupId}" title="Edit">
                    <i class="bx bx-pencil"></i>
                </button>
                <div class="dropdown">
                    <button class="row-menu-btn" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                        <i class="bx bx-dots-vertical"></i>
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end">
                        ${menuItemsHtml}
                        <li><hr class="dropdown-divider"></li>
                        ${convertItems.join('\n')}
                        <li><hr class="dropdown-divider"></li>
                        <li>
                            <a class="dropdown-item text-danger" href="#" data-action="${deleteAction}" data-group-id="${groupId}">
                                <i class="bx bx-trash me-2"></i>Delete
                            </a>
                        </li>
                    </ul>
                </div>
            </div>`;
    }

    // =========================================
    // Exercise Row
    // =========================================

    createExerciseGroupRow(groupId, groupData = null, groupNumber = 1, index = 0, totalRows = 1) {
        const data = groupData || {
            exercises: { a: '', b: '', c: '' },
            sets: '3', reps: '8-12', rest: '60s',
            default_weight: '', default_weight_unit: 'lbs'
        };

        window.exerciseGroupsData[groupId] = data;

        const primaryName = data.exercises.a || '';
        const alternates = [];
        if (data.exercises.b) alternates.push(data.exercises.b);
        if (data.exercises.c) alternates.push(data.exercises.c);

        const weightDisplay = data.default_weight
            ? `${data.default_weight}${data.default_weight_unit && data.default_weight_unit !== 'other' ? ' ' + data.default_weight_unit : ''}`
            : '';

        const nameHtml = primaryName
            ? `<span class="display-value">${this.escapeHtml(primaryName)}</span>`
            : `<span class="display-value empty-exercise">Click to add exercise</span>`;

        const alternatesHtml = alternates.length > 0
            ? `<div class="alternate-exercises">${alternates.map((alt, i) =>
                `<span>Alt${i > 0 ? (i + 1) : ''}: ${this.escapeHtml(alt)}</span>`
              ).join(' &middot; ')}</div>`
            : '';

        const protocolDisplay = data.sets && data.reps ? `${data.sets}×${data.reps}` : (data.sets || data.reps || '');

        const columnsHtml = `
            <div class="exercise-name-col">
                <div class="inline-editable exercise-name-editable" data-field="exercise-a" data-group-id="${groupId}">
                    ${nameHtml}
                </div>
                ${alternatesHtml}
            </div>
            <div class="inline-editable" data-field="protocol" data-group-id="${groupId}">
                <span class="display-value${!protocolDisplay ? ' empty-value' : ''}">${protocolDisplay || '-'}</span>
            </div>
            <div class="inline-editable" data-field="rest" data-group-id="${groupId}">
                <span class="display-value${!data.rest ? ' empty-value' : ''}">${data.rest || '-'}</span>
            </div>
            <div class="inline-editable" data-field="weight" data-group-id="${groupId}">
                <span class="display-value${!weightDisplay ? ' empty-value' : ''}">${weightDisplay || '-'}</span>
            </div>`;

        const menuItemsHtml = `
            <li>
                <a class="dropdown-item" href="#" data-action="full-edit" data-group-id="${groupId}">
                    <i class="bx bx-edit me-2"></i>Full Edit
                </a>
            </li>
            <li>
                <a class="dropdown-item" href="#" data-action="add-alternate" data-group-id="${groupId}">
                    <i class="bx bx-plus me-2"></i>Add Alternate
                </a>
            </li>`;

        return this._createRowShell({
            groupId, cardType: 'exercise', index,
            columnsHtml, menuItemsHtml
        });
    }

    updateExerciseGroupRowPreview(groupId, groupData) {
        const row = document.querySelector(`.desktop-exercise-row[data-group-id="${groupId}"]`);
        if (!row) return;

        const nameEditable = row.querySelector('[data-field="exercise-a"]');
        if (nameEditable) {
            const displayValue = nameEditable.querySelector('.display-value');
            if (displayValue) {
                if (groupData.exercises.a) {
                    displayValue.textContent = groupData.exercises.a;
                    displayValue.classList.remove('empty-exercise');
                } else {
                    displayValue.textContent = 'Click to add exercise';
                    displayValue.classList.add('empty-exercise');
                }
            }
        }

        const nameCol = row.querySelector('.exercise-name-col');
        const existingAlts = nameCol.querySelector('.alternate-exercises');
        const alternates = [];
        if (groupData.exercises.b) alternates.push(groupData.exercises.b);
        if (groupData.exercises.c) alternates.push(groupData.exercises.c);

        if (alternates.length > 0) {
            const altsHtml = alternates.map((alt, i) =>
                `<span>Alt${i > 0 ? (i + 1) : ''}: ${this.escapeHtml(alt)}</span>`
            ).join(' &middot; ');
            if (existingAlts) {
                existingAlts.innerHTML = altsHtml;
            } else {
                nameCol.insertAdjacentHTML('beforeend',
                    `<div class="alternate-exercises">${altsHtml}</div>`
                );
            }
        } else if (existingAlts) {
            existingAlts.remove();
        }

        const protocolDisplay = groupData.sets && groupData.reps
            ? `${groupData.sets}×${groupData.reps}` : (groupData.sets || groupData.reps || '');
        this.updateFieldDisplay(row, 'protocol', protocolDisplay);
        this.updateFieldDisplay(row, 'rest', groupData.rest);

        const weightDisplay = groupData.default_weight
            ? `${groupData.default_weight}${groupData.default_weight_unit && groupData.default_weight_unit !== 'other' ? ' ' + groupData.default_weight_unit : ''}`
            : '';
        this.updateFieldDisplay(row, 'weight', weightDisplay);
    }

    // =========================================
    // Note Row
    // =========================================

    createNoteRow(groupId, groupData) {
        const data = groupData || { group_type: 'note', note_content: '' };
        window.exerciseGroupsData[groupId] = data;

        const content = data.note_content || '';
        const hasContent = content.length > 0;

        const contentHtml = hasContent
            ? `<span class="template-note-text">${this.escapeHtml(content)}</span>`
            : `<span class="template-note-text text-muted">Click edit to add note content</span>`;

        const columnsHtml = `
            <div class="note-content-spanning">
                <i class="bx bx-comment note-row-icon"></i>
                <span class="note-row-text text-muted small">${contentHtml}</span>
            </div>`;

        const menuItemsHtml = `
            <li>
                <a class="dropdown-item" href="#" data-action="edit-note" data-group-id="${groupId}">
                    <i class="bx bx-pencil me-2"></i>Edit Note
                </a>
            </li>`;

        return this._createRowShell({
            groupId,
            cardType: 'note',
            extraClasses: ['desktop-note-row'],
            columnsHtml,
            menuItemsHtml
        });
    }

    updateNoteRowPreview(groupId, content) {
        const row = document.querySelector(`.desktop-note-row[data-group-id="${groupId}"]`);
        if (!row) return;

        const noteTextSpan = row.querySelector('.template-note-text');
        if (noteTextSpan) {
            if (content && content.length > 0) {
                noteTextSpan.textContent = content;
                noteTextSpan.classList.remove('text-muted');
            } else {
                noteTextSpan.textContent = 'Click edit to add note content';
                noteTextSpan.classList.add('text-muted');
            }
        }
    }

    // =========================================
    // Cardio Row
    // =========================================

    /**
     * Create cardio activity row HTML
     * @param {string} groupId - Unique group ID
     * @param {object} groupData - Group data with cardio_config
     * @returns {string} HTML string
     */
    createCardioRow(groupId, groupData = null) {
        const data = groupData || {
            exercises: { a: '' },
            sets: '', reps: '', rest: '',
            group_type: 'cardio',
            cardio_config: {
                activity_type: '', duration_minutes: null,
                distance: null, distance_unit: 'mi', target_pace: ''
            }
        };

        window.exerciseGroupsData[groupId] = data;

        const config = data.cardio_config || {};
        const activityType = config.activity_type || '';

        // Get icon from activity type registry
        let iconClass = 'bx-heart-circle';
        let activityName = activityType;
        if (activityType && window.ActivityTypeRegistry) {
            iconClass = window.ActivityTypeRegistry.getIcon(activityType);
            activityName = window.ActivityTypeRegistry.getName(activityType);
        }

        // Build dynamic data columns from user settings
        const ADC = window.ActivityDisplayConfig;
        const columns = ADC ? ADC.getColumns() : ['duration', 'distance', 'pace'];

        let dataColumnsHtml = '';
        columns.forEach(fieldId => {
            const def = ADC ? ADC.getFieldDef(fieldId) : null;
            const displayVal = def ? def.format(config) : '';
            const label = def ? def.label : fieldId;
            dataColumnsHtml += `
            <div class="inline-editable" data-field="${fieldId}" data-label="${this.escapeHtml(label)}" data-group-id="${groupId}">
                <span class="display-value${!displayVal ? ' empty-value' : ''}">${displayVal || '-'}</span>
            </div>`;
        });

        const columnsHtml = `
            <div class="exercise-name-col">
                <div class="inline-editable cardio-name-editable" data-field="activity-name" data-group-id="${groupId}">
                    <i class="bx ${iconClass} cardio-type-icon"></i>
                    ${activityName
                        ? `<span class="display-value">${this.escapeHtml(activityName)}</span>`
                        : `<span class="display-value empty-exercise">Click to set activity</span>`
                    }
                </div>
            </div>
            ${dataColumnsHtml}`;

        const menuItemsHtml = `
            <li>
                <a class="dropdown-item" href="#" data-action="full-edit-cardio" data-group-id="${groupId}">
                    <i class="bx bx-edit me-2"></i>Full Edit
                </a>
            </li>
            <li>
                <a class="dropdown-item" href="#" data-action="activity-display-settings" data-group-id="${groupId}">
                    <i class="bx bx-slider me-2"></i>Display Settings
                </a>
            </li>`;

        return this._createRowShell({
            groupId, cardType: 'cardio',
            extraClasses: ['desktop-cardio-row'],
            columnsHtml, menuItemsHtml
        });
    }

    /**
     * Update cardio row preview after data changes
     */
    updateCardioRowPreview(groupId, groupData) {
        const row = document.querySelector(`.desktop-cardio-row[data-group-id="${groupId}"]`);
        if (!row) return;

        const config = groupData.cardio_config || {};
        const activityType = config.activity_type || '';

        // Update activity name + icon
        const nameEditable = row.querySelector('[data-field="activity-name"]');
        if (nameEditable) {
            let iconClass = 'bx-heart-circle';
            let activityName = activityType;
            if (activityType && window.ActivityTypeRegistry) {
                iconClass = window.ActivityTypeRegistry.getIcon(activityType);
                activityName = window.ActivityTypeRegistry.getName(activityType);
            }
            const icon = nameEditable.querySelector('.cardio-type-icon');
            if (icon) {
                icon.className = `bx ${iconClass} cardio-type-icon`;
            }
            const displayValue = nameEditable.querySelector('.display-value');
            if (displayValue) {
                if (activityName) {
                    displayValue.textContent = activityName;
                    displayValue.classList.remove('empty-exercise');
                } else {
                    displayValue.textContent = 'Click to set activity';
                    displayValue.classList.add('empty-exercise');
                }
            }
        }

        // Update dynamic data columns using ActivityDisplayConfig
        const ADC = window.ActivityDisplayConfig;
        const columns = ADC ? ADC.getColumns() : ['duration', 'distance', 'pace'];
        columns.forEach(fieldId => {
            const def = ADC ? ADC.getFieldDef(fieldId) : null;
            const displayVal = def ? def.format(config) : '';
            this.updateFieldDisplay(row, fieldId, displayVal);
        });
    }

    /**
     * Re-render all cardio rows with current display settings.
     * Called after the user changes Activity Display Settings.
     */
    refreshAllCardioRows() {
        const rows = document.querySelectorAll('.desktop-cardio-row');
        rows.forEach(row => {
            const groupId = row.dataset.groupId;
            if (!groupId) return;
            const data = window.exerciseGroupsData?.[groupId];
            if (!data) return;

            // Re-create the row HTML and swap in place
            const newHtml = this.createCardioRow(groupId, data);
            row.insertAdjacentHTML('afterend', newHtml);
            row.remove();
        });
    }

    // =========================================
    // Shared Utilities
    // =========================================

    updateFieldDisplay(row, field, value) {
        const editable = row.querySelector(`[data-field="${field}"]`);
        if (!editable) return;
        const displayValue = editable.querySelector('.display-value');
        if (!displayValue) return;
        displayValue.textContent = value || '-';
        displayValue.classList.toggle('empty-value', !value);
    }

    // =========================================
    // Delegated methods (backward compatibility)
    // =========================================

    initInlineEditing(container) {
        this._inlineEditor.initInlineEditing(container);
    }

    startInlineEdit(element) {
        this._inlineEditor.startInlineEdit(element);
    }

    finishInlineEdit(element, save) {
        this._inlineEditor.finishInlineEdit(element, save);
    }

    tabToNextField(currentElement, reverse) {
        this._inlineEditor.tabToNextField(currentElement, reverse);
    }

    getFieldValue(groupId, field) {
        return window.DesktopCardData.getFieldValue(groupId, field);
    }

    setFieldValue(groupId, field, value) {
        window.DesktopCardData.setFieldValue(groupId, field, value);
    }

    getPlaceholder(field) {
        return window.DesktopCardData.getPlaceholder(field);
    }

    convertCardType(groupId, fromType, toType) {
        window.DesktopCardData.convertCardType(groupId, fromType, toType);
    }

    handleAddAlternate(groupId) {
        this._inlineEditor.handleAddAlternate(groupId);
    }

    // =========================================
    // Block Grouping
    // =========================================

    applyBlockGrouping() {
        const container = document.getElementById('exerciseGroups');
        if (!container) return;

        container.querySelectorAll('.block-group-header').forEach(h => h.remove());
        container.querySelectorAll('.exercise-in-block').forEach(r => {
            r.classList.remove('exercise-in-block', 'block-first', 'block-middle', 'block-last');
            r.removeAttribute('data-block-id');
        });

        const rows = Array.from(container.querySelectorAll('.desktop-exercise-row'));
        let i = 0;

        while (i < rows.length) {
            const groupId = rows[i].dataset.groupId;
            const data = window.exerciseGroupsData?.[groupId];
            const blockId = data?.block_id;

            if (!blockId) { i++; continue; }

            let j = i;
            while (j < rows.length) {
                const jGroupId = rows[j].dataset.groupId;
                const jData = window.exerciseGroupsData?.[jGroupId];
                if (jData?.block_id !== blockId) break;
                j++;
            }

            const groupRows = rows.slice(i, j);
            const blockName = data.group_name || 'Block';

            const headerHtml = `<div class="block-group-header" data-block-id="${blockId}">
                <span class="block-group-label">
                    <i class="bx bx-collection"></i>
                    ${this.escapeHtml(blockName)}
                </span>
                <div class="block-group-actions">
                    <button class="block-group-btn" onclick="window.ExerciseGroupManager?.addToBlock?.('${blockId}')" title="Add exercise to block">
                        <i class="bx bx-plus"></i> Add
                    </button>
                </div>
            </div>`;
            groupRows[0].insertAdjacentHTML('beforebegin', headerHtml);

            groupRows.forEach((row, idx) => {
                row.classList.add('exercise-in-block');
                row.setAttribute('data-block-id', blockId);
                if (groupRows.length === 1) {
                    row.classList.add('block-first', 'block-last');
                } else if (idx === 0) {
                    row.classList.add('block-first');
                } else if (idx === groupRows.length - 1) {
                    row.classList.add('block-last');
                } else {
                    row.classList.add('block-middle');
                }
            });

            i = j;
        }
    }

    escapeHtml(text) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(text);
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize global instance
window.desktopCardRenderer = new DesktopCardRenderer();

console.log('📦 Desktop Card Renderer module loaded (v3.0 — Split modules)');
