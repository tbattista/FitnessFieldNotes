/**
 * Desktop Inline Editor Module
 * Handles inline editing, autocomplete, tab navigation, and menu actions for desktop rows.
 * Extracted from DesktopCardRenderer for modularity.
 * @version 1.0.0
 */
(function() {
    'use strict';

    class DesktopInlineEditor {
        /**
         * @param {DesktopCardRenderer} renderer - The renderer instance for state access
         */
        constructor(renderer) {
            this.renderer = renderer;
        }

        // =========================================
        // Inline Editing
        // =========================================

        initInlineEditing(container) {
            if (!container) return;

            // Click handler for inline editing
            container.addEventListener('click', (e) => {
                const editable = e.target.closest('.inline-editable');
                if (!editable || editable.classList.contains('editing')) return;
                if (e.target.closest('.exercise-autocomplete-dropdown')) return;
                this.startInlineEdit(editable);
            });

            // Dropdown menu action handler (delegated)
            container.addEventListener('click', (e) => {
                const actionEl = e.target.closest('[data-action]');
                if (!actionEl) return;
                e.preventDefault();

                const action = actionEl.dataset.action;
                const groupId = actionEl.dataset.groupId;

                switch (action) {
                    case 'row-edit': {
                        const row = actionEl.closest('.desktop-activity-row');
                        const cardType = row?.dataset.cardType;
                        if (cardType === 'note') {
                            if (window.openNoteEditor) window.openNoteEditor(groupId);
                            else if (window.handleEditTemplateNote) window.handleEditTemplateNote(groupId);
                        } else if (cardType === 'cardio') {
                            if (window.openCardioEditor) window.openCardioEditor(groupId);
                        } else {
                            if (window.openExerciseGroupEditor) window.openExerciseGroupEditor(groupId);
                        }
                        break;
                    }
                    case 'full-edit':
                        if (window.openExerciseGroupEditor) window.openExerciseGroupEditor(groupId);
                        break;
                    case 'full-edit-cardio':
                        if (window.openCardioEditor) {
                            window.openCardioEditor(groupId);
                        } else {
                            console.log('Cardio full-edit offcanvas not yet implemented');
                        }
                        break;
                    case 'edit-note':
                        if (window.openNoteEditor) {
                            window.openNoteEditor(groupId);
                        } else if (window.handleEditTemplateNote) {
                            window.handleEditTemplateNote(groupId);
                        }
                        break;
                    case 'add-alternate':
                        this.handleAddAlternate(groupId);
                        break;
                    case 'delete-group':
                        if (window.deleteExerciseGroupCard) window.deleteExerciseGroupCard(groupId);
                        break;
                    case 'activity-display-settings':
                        if (window.openActivityDisplaySettings) window.openActivityDisplaySettings();
                        break;
                    case 'convert-to-exercise': {
                        const row = actionEl.closest('.desktop-activity-row');
                        const fromType = row?.dataset.cardType;
                        if (fromType) window.DesktopCardData.convertCardType(groupId, fromType, 'exercise');
                        break;
                    }
                    case 'convert-to-note': {
                        const row = actionEl.closest('.desktop-activity-row');
                        const fromType = row?.dataset.cardType;
                        if (fromType) window.DesktopCardData.convertCardType(groupId, fromType, 'note');
                        break;
                    }
                    case 'convert-to-cardio': {
                        const row = actionEl.closest('.desktop-activity-row');
                        const fromType = row?.dataset.cardType;
                        if (fromType) window.DesktopCardData.convertCardType(groupId, fromType, 'cardio');
                        break;
                    }
                }
            });
        }

        startInlineEdit(element) {
            if (this.renderer.activeEdit && this.renderer.activeEdit !== element) {
                this.finishInlineEdit(this.renderer.activeEdit, false);
            }

            const field = element.dataset.field;
            const groupId = element.dataset.groupId;
            const displayValue = element.querySelector('.display-value');
            if (!displayValue) return;

            const currentValue = window.DesktopCardData.getFieldValue(groupId, field);

            const input = document.createElement('input');
            input.type = 'text';
            input.value = currentValue;
            input.className = 'inline-edit-input';

            if (field === 'exercise-a') {
                input.placeholder = 'Search exercises...';
            } else if (field === 'activity-name') {
                input.placeholder = 'Activity type...';
            } else {
                input.placeholder = window.DesktopCardData.getPlaceholder(field);
            }

            // Hide display elements, show input
            displayValue.style.display = 'none';
            const icon = element.querySelector('.cardio-type-icon');
            if (icon) icon.style.display = 'none';
            element.classList.add('editing');
            element.appendChild(input);
            input.focus();
            input.select();

            this.renderer.activeEdit = element;

            const handleBlur = () => {
                setTimeout(() => {
                    if (element.classList.contains('editing')) {
                        this.finishInlineEdit(element, true);
                    }
                }, 200);
            };
            input.addEventListener('blur', handleBlur);

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); this.finishInlineEdit(element, true); }
                if (e.key === 'Escape') { e.preventDefault(); this.finishInlineEdit(element, false); }
                if (e.key === 'Tab') {
                    e.preventDefault();
                    this.finishInlineEdit(element, true);
                    this.tabToNextField(element, e.shiftKey);
                }
            });

            // Autocomplete for exercise name
            if (field === 'exercise-a' && window.ExerciseAutocomplete) {
                setTimeout(() => {
                    try {
                        const autocomplete = new ExerciseAutocomplete(input, {
                            minChars: 1, maxResults: 8, allowAutoCreate: true,
                            onSelect: (exercise) => {
                                input.value = exercise.name;
                                this.finishInlineEdit(element, true);
                            }
                        });
                        this.renderer.autocompleteInstances.set(groupId + '-' + field, autocomplete);
                    } catch (err) {
                        console.warn('Desktop: Could not init autocomplete', err);
                    }
                }, 50);
            }

            // Autocomplete for cardio activity name
            if (field === 'activity-name' && window.ActivityTypeRegistry) {
                setTimeout(() => {
                    this._initActivityAutocomplete(input, element, groupId);
                }, 50);
            }
        }

        /**
         * Simple autocomplete dropdown for activity types
         */
        _initActivityAutocomplete(input, element, groupId) {
            const allTypes = window.ActivityTypeRegistry.getAll();

            const dropdown = document.createElement('div');
            dropdown.className = 'activity-autocomplete-dropdown';
            element.appendChild(dropdown);

            const showResults = () => {
                const query = input.value.toLowerCase().trim();
                const matches = query
                    ? allTypes.filter(t => t.name.toLowerCase().includes(query) || t.id.includes(query)).slice(0, 8)
                    : allTypes.slice(0, 8);

                dropdown.innerHTML = matches.map(t =>
                    `<div class="activity-autocomplete-item" data-activity-id="${t.id}">
                        <i class="bx ${t.icon}"></i> ${t.name}
                    </div>`
                ).join('');
                dropdown.style.display = matches.length ? 'block' : 'none';
            };

            input.addEventListener('input', showResults);
            input.addEventListener('focus', showResults);

            dropdown.addEventListener('mousedown', (e) => {
                e.preventDefault(); // Prevent blur
                const item = e.target.closest('.activity-autocomplete-item');
                if (item) {
                    input.value = item.dataset.activityId;
                    dropdown.style.display = 'none';
                    this.finishInlineEdit(element, true);
                }
            });

            this.renderer.autocompleteInstances.set(groupId + '-activity-name', { destroy: () => dropdown.remove() });
            showResults();
        }

        finishInlineEdit(element, save) {
            if (!element.classList.contains('editing')) return;

            const input = element.querySelector('.inline-edit-input');
            const displayValue = element.querySelector('.display-value');
            const field = element.dataset.field;
            const groupId = element.dataset.groupId;

            if (input && save) {
                const newValue = input.value.trim();
                window.DesktopCardData.setFieldValue(groupId, field, newValue);

                if (field === 'exercise-a') {
                    displayValue.textContent = newValue || 'Click to add exercise';
                    displayValue.classList.toggle('empty-exercise', !newValue);
                } else if (field === 'activity-name') {
                    // Resolve display name from registry
                    let displayName = newValue;
                    let iconClass = 'bx-heart-circle';
                    if (newValue && window.ActivityTypeRegistry) {
                        const type = window.ActivityTypeRegistry.getById(newValue);
                        if (type) {
                            displayName = type.name;
                            iconClass = type.icon;
                        }
                    }
                    displayValue.textContent = displayName || 'Click to set activity';
                    displayValue.classList.toggle('empty-exercise', !displayName);
                    // Update icon
                    const icon = element.querySelector('.cardio-type-icon');
                    if (icon) icon.className = `bx ${iconClass} cardio-type-icon`;
                } else if (field === 'weight') {
                    const data = window.exerciseGroupsData[groupId];
                    const weightDisplay = data.default_weight
                        ? `${data.default_weight}${data.default_weight_unit && data.default_weight_unit !== 'other' ? ' ' + data.default_weight_unit : ''}`
                        : '';
                    displayValue.textContent = weightDisplay || '-';
                    displayValue.classList.toggle('empty-value', !weightDisplay);
                } else {
                    // Use ActivityDisplayConfig formatter for cardio fields, plain fallback for others
                    const ADC = window.ActivityDisplayConfig;
                    const def = ADC ? ADC.getFieldDef(field) : null;
                    if (def) {
                        const data = window.exerciseGroupsData[groupId];
                        const cfg = data?.cardio_config || {};
                        const formatted = def.format(cfg);
                        displayValue.textContent = formatted || '-';
                        displayValue.classList.toggle('empty-value', !formatted);
                    } else {
                        displayValue.textContent = newValue || '-';
                        displayValue.classList.toggle('empty-value', !newValue);
                    }
                }

                if (window.markEditorDirty) window.markEditorDirty();
            }

            // Clean up
            if (input) input.remove();
            if (displayValue) displayValue.style.display = '';
            const icon = element.querySelector('.cardio-type-icon');
            if (icon) icon.style.display = '';
            element.classList.remove('editing');

            // Remove autocomplete dropdown
            const acDropdown = element.querySelector('.activity-autocomplete-dropdown');
            if (acDropdown) acDropdown.remove();

            // Clean up autocomplete instance
            const acKey = groupId + '-' + field;
            const autocomplete = this.renderer.autocompleteInstances.get(acKey);
            if (autocomplete && autocomplete.destroy) autocomplete.destroy();
            this.renderer.autocompleteInstances.delete(acKey);
            // Legacy key cleanup
            if (field === 'exercise-a') {
                const legacyAc = this.renderer.autocompleteInstances.get(groupId);
                if (legacyAc && legacyAc.destroy) legacyAc.destroy();
                this.renderer.autocompleteInstances.delete(groupId);
            }

            if (this.renderer.activeEdit === element) this.renderer.activeEdit = null;
        }

        tabToNextField(currentElement, reverse) {
            const row = currentElement.closest('.desktop-exercise-row');
            if (!row) return;

            const editables = Array.from(row.querySelectorAll('.inline-editable'));
            const currentIndex = editables.indexOf(currentElement);
            const nextIndex = reverse ? currentIndex - 1 : currentIndex + 1;

            if (nextIndex >= 0 && nextIndex < editables.length) {
                this.startInlineEdit(editables[nextIndex]);
            } else if (!reverse) {
                const nextRow = row.nextElementSibling;
                if (nextRow && nextRow.classList.contains('desktop-exercise-row')) {
                    const firstEditable = nextRow.querySelector('.inline-editable');
                    if (firstEditable) this.startInlineEdit(firstEditable);
                }
            }
        }

        handleAddAlternate(groupId) {
            if (window.openExerciseGroupEditor) window.openExerciseGroupEditor(groupId);
        }
    }

    window.DesktopInlineEditor = DesktopInlineEditor;

    console.log('📦 Desktop Inline Editor module loaded');
})();
