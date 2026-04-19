/**
 * Exercise Group Manager Module
 * Handles exercise group CRUD, sorting, previews, and weight unit toggles
 * Extracted from workouts.js
 *
 * Shim methods (add, addBlock, addToBlock, removeFromBlock, renameBlock)
 * route to SectionManager for sections-based workout editing.
 * Active methods: remove, renumber, updatePreview, initSorting, addExercise,
 * removeExercise, addWeightUnitListeners.
 */

const ExerciseGroupManager = {

    /** Route to SectionManager.addStandardSection() — or addTabataSection() in tabata mode. */
    add() {
        if (!window.SectionManager) return;
        const isTabataMode = window.ffn?.workoutBuilder?.workoutType === 'tabata';
        if (isTabataMode && window.SectionManager.addTabataSection) {
            window.SectionManager.addTabataSection();
        } else {
            window.SectionManager.addStandardSection();
        }
    },

    /** Route to SectionManager.addSupersetSection() */
    addBlock() {
        if (window.SectionManager) {
            window.SectionManager.addSupersetSection();
        }
    },

    /** Route to SectionManager.addExerciseToSection() */
    addToBlock(blockId) {
        if (window.SectionManager) {
            window.SectionManager.addExerciseToSection(blockId);
        }
    },

    /** Route to SectionManager.removeExerciseFromSection() */
    removeFromBlock(groupId) {
        if (window.SectionManager) {
            window.SectionManager.removeExerciseFromSection(groupId);
        }
    },

    /** Route to SectionManager.renameSection() */
    renameBlock(blockId) {
        if (window.SectionManager) {
            window.SectionManager.renameSection(blockId);
        }
    },

    /**
     * Remove exercise group with confirmation
     */
    remove(button) {
        const group = button.closest('.exercise-group');
        if (!group) return;

        const exerciseInputs = group.querySelectorAll('.exercise-input');
        const exerciseNames = Array.from(exerciseInputs)
            .map(input => input.value.trim())
            .filter(name => name);

        let confirmMessage = 'Are you sure you want to delete this exercise?';
        if (exerciseNames.length > 0) {
            confirmMessage += '\n\nExercises in this group:\n• ' + exerciseNames.join('\n• ');
        }
        confirmMessage += '\n\nThis action cannot be undone.';

        ffnModalManager.confirm('Delete Exercise', confirmMessage, () => {
            group.remove();
            ExerciseGroupManager.renumber();
            if (window.markEditorDirty) window.markEditorDirty();
            showAlert('Exercise deleted', 'success');
        }, { confirmText: 'Delete', confirmClass: 'btn-danger', size: 'sm' });
    },

    /**
     * Renumber exercise groups after removal or reordering
     */
    renumber() {
        const groups = document.querySelectorAll('#exerciseGroups .exercise-group');
        groups.forEach((group, index) => {
            const accordionTitle = group.querySelector('.group-title');
            if (accordionTitle) {
                accordionTitle.textContent = `Exercise ${index + 1}`;
            } else {
                const cardHeader = group.querySelector('.card-header h6');
                if (cardHeader) {
                    cardHeader.textContent = `Exercise ${index + 1}`;
                }
            }
        });
    },

    /**
     * Update exercise group preview in header
     */
    updatePreview(groupElement) {
        if (!groupElement) return;

        const exerciseInputs = groupElement.querySelectorAll('.exercise-input');
        const previewMain = groupElement.querySelector('.exercise-preview-main');
        const previewSecondaries = groupElement.querySelectorAll('.exercise-preview-secondary');
        const previewInfo = groupElement.querySelector('.exercise-preview-info');
        const previewWeight = groupElement.querySelector('.exercise-preview-weight');

        if (!previewMain) return;

        const exercises = Array.from(exerciseInputs).map(input => input.value.trim()).filter(v => v);

        const bodyEl = groupElement.querySelector('.accordion-body') || groupElement.querySelector('.card-body');
        const sets = bodyEl?.querySelector('.sets-input')?.value || '3';
        const reps = bodyEl?.querySelector('.reps-input')?.value || '8-12';
        const rest = bodyEl?.querySelector('.rest-input')?.value || '60s';

        if (exercises.length > 0) {
            previewMain.textContent = exercises[0];
            previewMain.style.display = 'block';
        } else {
            previewMain.textContent = '';
            previewMain.style.display = 'none';
        }

        previewSecondaries.forEach((preview, index) => {
            const exerciseIndex = index + 1;
            if (exercises.length > exerciseIndex) {
                preview.textContent = exercises[exerciseIndex];
                preview.style.display = 'block';
            } else {
                preview.textContent = '';
                preview.style.display = 'none';
            }
        });

        if (previewInfo && exercises.length > 0) {
            previewInfo.textContent = `${sets} Sets • ${reps} Reps • ${rest} Rest`;
            previewInfo.style.display = 'block';
        } else if (previewInfo) {
            previewInfo.textContent = '';
            previewInfo.style.display = 'none';
        }

        if (previewWeight && exercises.length > 0) {
            const weightInput = bodyEl?.querySelector('.weight-input');
            const weight = weightInput?.value?.trim();
            const activeUnitBtn = bodyEl?.querySelector('.weight-unit-btn.active');
            const weightUnit = activeUnitBtn?.getAttribute('data-unit') || 'lbs';

            if (weight) {
                previewWeight.textContent = `${weight} ${weightUnit}`;
            } else {
                previewWeight.textContent = 'Weight';
            }
            previewWeight.style.display = 'block';
        } else if (previewWeight) {
            previewWeight.textContent = '';
            previewWeight.style.display = 'none';
        }
    },

    /**
     * Initialize drag-and-drop sorting for exercise groups.
     * Routes to SectionManager's two-level Sortable in sections mode.
     */
    initSorting() {
        const container = document.getElementById('exerciseGroups');
        if (!container) return;

        if (window.SectionManager && container.querySelector('.workout-section')) {
            window.SectionManager.initSortable(container);
            window.SectionManager.initHeaderListeners(container);
        }
    },

    /**
     * Add exercise to existing group
     */
    addExercise(button) {
        const group = button.closest('.exercise-group');
        const exerciseInputs = group.querySelectorAll('.exercise-input');
        const nextLetter = String.fromCharCode(97 + exerciseInputs.length);

        if (exerciseInputs.length >= 6) {
            showAlert('Maximum 6 exercises per group', 'warning');
            return;
        }

        const groupId = group.dataset.groupId;
        const exerciseId = `exercise-${groupId}-${nextLetter}`;

        const newExerciseHtml = `
            <div class="col-md-6 mb-3">
                <label class="form-label">Exercise ${nextLetter.toUpperCase()} (optional)</label>
                <div class="input-group">
                    <input type="text" class="form-control exercise-input exercise-autocomplete-input"
                           id="${exerciseId}" placeholder="Search exercises...">
                    <button type="button" class="btn btn-outline-danger" onclick="removeExerciseFromGroup(this)">
                        <i class="bx bx-trash"></i>
                    </button>
                </div>
            </div>
        `;

        const lastRow = group.querySelector('.row:last-of-type');
        lastRow.insertAdjacentHTML('beforebegin', `<div class="row">${newExerciseHtml}</div>`);

        if (window.initializeExerciseAutocompletes) {
            window.initializeExerciseAutocompletes();
        }

        ExerciseGroupManager.updatePreview(group);
    },

    /**
     * Remove exercise from group
     */
    removeExercise(button) {
        const exerciseDiv = button.closest('.col-md-6');
        const row = exerciseDiv.parentElement;

        exerciseDiv.remove();

        if (row.children.length === 0) {
            row.remove();
        }
    },

    /**
     * Add weight unit button listeners to a group
     */
    addWeightUnitListeners(groupElement) {
        const unitButtons = groupElement.querySelectorAll('.weight-unit-btn');

        unitButtons.forEach(button => {
            button.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();

                const allButtons = this.closest('.row').querySelectorAll('.weight-unit-btn');
                allButtons.forEach(btn => {
                    btn.classList.remove('active');
                    btn.classList.add('btn-outline-secondary');
                    btn.classList.remove('btn-secondary');
                });

                this.classList.add('active');
                this.classList.remove('btn-outline-secondary');
                this.classList.add('btn-secondary');

                if (window.markEditorDirty) window.markEditorDirty();
            });
        });

        const defaultButton = groupElement.querySelector('.weight-unit-btn[data-unit="lbs"]');
        if (defaultButton) {
            defaultButton.classList.add('active');
            defaultButton.classList.remove('btn-outline-secondary');
            defaultButton.classList.add('btn-secondary');
        }
    }
};

// Expose module
window.ExerciseGroupManager = ExerciseGroupManager;

// Backward-compat globals
window.addExerciseGroup = ExerciseGroupManager.add;
window.addExerciseBlock = ExerciseGroupManager.addBlock;
window.addToBlock = ExerciseGroupManager.addToBlock;
window.removeExerciseGroup = ExerciseGroupManager.remove;
window.renumberExerciseGroups = ExerciseGroupManager.renumber;
window.updateExerciseGroupPreview = ExerciseGroupManager.updatePreview;
window.initializeExerciseGroupSorting = ExerciseGroupManager.initSorting;
window.addExerciseToGroup = ExerciseGroupManager.addExercise;
window.removeExerciseFromGroup = ExerciseGroupManager.removeExercise;
window.addWeightUnitButtonListeners = ExerciseGroupManager.addWeightUnitListeners;

console.log('📦 ExerciseGroupManager module loaded');
