/**
 * Section Manager Module (Orchestrator)
 * Manages workout sections (containers for exercises).
 * Delegates to focused sub-modules:
 *   - SectionRenderer:       rendering, HTML generation, block chain classes
 *   - SectionSortable:       SortableJS two-level drag-and-drop
 *   - SectionMoveOps:        moving exercises between sections, dissolve, context menus
 *   - SectionDataCollector:  serializing DOM state back to data
 *
 * This file retains:
 *   - Constructor / state
 *   - Section CRUD (add, remove, rename, delete)
 *   - Event delegation (initHeaderListeners)
 *   - isSectionsMode() utility
 */

const SectionManager = {

    // ─── Delegated Rendering ─────────────────────────────────────

    renderSections(sections, container) {
        window.SectionRenderer.renderSections(sections, container);
    },

    createSectionElement(section) {
        return window.SectionRenderer.createSectionElement(section);
    },

    // ─── Delegated Sortable ──────────────────────────────────────

    initSortable(container) {
        window.SectionSortable.initSortable(container);
    },

    ensureSortable(container, newExercisesEl, isNamed = false) {
        window.SectionSortable.ensureSortable(container, newExercisesEl, isNamed);
    },

    // ─── Delegated Move Operations ───────────────────────────────

    populateCardSectionMenu(groupId, menuEl) {
        window.SectionMoveOps.populateCardSectionMenu(groupId, menuEl);
    },

    moveExerciseToSection(exerciseId, targetSectionId) {
        window.SectionMoveOps.moveExerciseToSection(exerciseId, targetSectionId);
    },

    dissolveSection(sectionId) {
        window.SectionMoveOps.dissolveSection(sectionId);
    },

    // ─── Delegated Data Collection ───────────────────────────────

    collectSections() {
        return window.SectionDataCollector.collectSections();
    },

    // ─── Section CRUD ────────────────────────────────────────────

    /**
     * Add a new standard section with one empty exercise.
     * Equivalent to the old ExerciseGroupManager.add().
     */
    addStandardSection() {
        const container = document.getElementById('exerciseGroups');
        if (!container) return;

        const sectionId = `section-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        const exerciseId = `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const section = {
            section_id: sectionId,
            type: 'standard',
            name: null,
            exercises: [{
                exercise_id: exerciseId,
                name: '',
                alternates: [],
                sets: '3',
                reps: '8-12',
                rest: '60s',
                default_weight: null,
                default_weight_unit: 'lbs'
            }]
        };

        const sectionEl = window.SectionRenderer.createSectionElement(section);
        container.appendChild(sectionEl);

        // Ensure sorting is available for the new section
        window.SectionSortable.ensureSortable(container, sectionEl.querySelector('.section-exercises'), false);

        // Auto-open editor for the new exercise
        setTimeout(() => {
            if (window.openExerciseGroupEditor) {
                window.openExerciseGroupEditor(exerciseId);
            }
        }, 100);

        if (window.markEditorDirty) window.markEditorDirty();
        return { sectionId, exerciseId };
    },

    /**
     * Add a new empty named section.
     * User adds exercises by clicking the placeholder or the add zone.
     * @param {string} type - Section type: 'superset', 'circuit', 'tabata', 'emom', 'amrap'
     */
    addNamedSection(type = 'superset') {
        const container = document.getElementById('exerciseGroups');
        if (!container) return;

        const sectionId = `section-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

        const section = {
            section_id: sectionId,
            type: type,
            name: null,
            description: null,
            exercises: []
        };

        const sectionEl = window.SectionRenderer.createSectionElement(section);
        container.appendChild(sectionEl);

        // Ensure sorting is available for the new section
        window.SectionSortable.ensureSortable(container, sectionEl.querySelector('.section-exercises'), true);

        if (window.markEditorDirty) window.markEditorDirty();

        // Scroll into view
        sectionEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

        return { sectionId };
    },

    /** Alias for backward compat with ExerciseGroupManager.addBlock() routing */
    addSupersetSection() {
        return this.addNamedSection('superset');
    },

    /**
     * Add an exercise to an existing section.
     * Replaces old ExerciseGroupManager.addToBlock(blockId).
     */
    addExerciseToSection(sectionId) {
        const sectionEl = document.querySelector(`.workout-section[data-section-id="${sectionId}"]`);
        if (!sectionEl) return;

        const exercisesContainer = sectionEl.querySelector('.section-exercises');

        // Remove placeholder if present
        const placeholder = exercisesContainer.querySelector('.section-placeholder');
        if (placeholder) placeholder.remove();

        const exerciseId = `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const groupData = {
            exercises: { a: '' },
            sets: '3',
            reps: '8-12',
            rest: '60s',
            default_weight: null,
            default_weight_unit: 'lbs'
        };

        const existingCards = exercisesContainer.querySelectorAll('.exercise-group-card');
        const totalCards = existingCards.length + 1;
        const cardHtml = window.createExerciseGroupCard(
            exerciseId, groupData, totalCards, totalCards - 1, totalCards
        );
        exercisesContainer.insertAdjacentHTML('beforeend', cardHtml);

        window.exerciseGroupsData[exerciseId] = groupData;

        // Re-apply block chain classes
        if (sectionEl.dataset.sectionType !== 'standard') {
            window.SectionRenderer.applyBlockChainClasses(exercisesContainer);

            // Ensure add zone exists
            if (!sectionEl.querySelector('.section-add-zone')) {
                sectionEl.insertAdjacentHTML('beforeend', window.SectionRenderer.addZoneHtml(sectionId));
            }
        }

        // Auto-open editor
        setTimeout(() => {
            if (window.openExerciseGroupEditor) {
                window.openExerciseGroupEditor(exerciseId);
            }
        }, 100);

        if (window.markEditorDirty) window.markEditorDirty();
    },

    /**
     * Remove an exercise from a named section, making it a standalone standard section.
     * Replaces old ExerciseGroupManager.removeFromBlock(groupId).
     */
    removeExerciseFromSection(exerciseId) {
        const cardEl = document.querySelector(`.exercise-group-card[data-group-id="${exerciseId}"]`);
        if (!cardEl) return;

        const sectionEl = cardEl.closest('.workout-section');
        const sectionType = sectionEl?.dataset.sectionType;

        // Only meaningful for named sections (superset, circuit, etc.)
        if (!sectionType || sectionType === 'standard') return;

        const newSectionId = `section-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

        // Create a new standard section
        const newSection = document.createElement('div');
        newSection.className = 'workout-section';
        newSection.dataset.sectionId = newSectionId;
        newSection.dataset.sectionType = 'standard';

        // Strip block chain classes from the card
        cardEl.classList.remove('exercise-in-block', 'block-first', 'block-middle', 'block-last');

        const exercisesEl = document.createElement('div');
        exercisesEl.className = 'section-exercises';
        exercisesEl.appendChild(cardEl); // Move card to new section
        newSection.appendChild(exercisesEl);

        // Insert after the current section
        sectionEl.after(newSection);

        // Init inner Sortable so this exercise can be dragged to named sections
        window.SectionSortable._initExerciseSortable(exercisesEl, false);

        // Clean up source section and re-chain remaining cards
        window.SectionMoveOps.cleanupSection(sectionEl);
        const sourceExercises = sectionEl.querySelector('.section-exercises');
        if (sourceExercises) window.SectionRenderer.applyBlockChainClasses(sourceExercises);

        if (window.markEditorDirty) window.markEditorDirty();
    },

    /**
     * Rename a section.
     * Replaces old ExerciseGroupManager.renameBlock(blockId).
     */
    renameSection(sectionId) {
        const sectionEl = document.querySelector(`.workout-section[data-section-id="${sectionId}"]`);
        if (!sectionEl) return;

        const nameInput = sectionEl.querySelector('.section-name-input');
        if (nameInput) {
            nameInput.focus();
            nameInput.select();
        }
    },

    /**
     * Delete an entire section and all its exercises.
     */
    deleteSection(sectionId) {
        const sectionEl = document.querySelector(`.workout-section[data-section-id="${sectionId}"]`);
        if (!sectionEl) return;

        const exerciseCount = sectionEl.querySelectorAll('.exercise-group-card').length;
        const doDelete = () => {
            // Remove exercise data from global store
            sectionEl.querySelectorAll('.exercise-group-card').forEach(card => {
                const groupId = card.dataset.groupId;
                if (groupId) delete window.exerciseGroupsData[groupId];
            });

            sectionEl.remove();
            if (window.markEditorDirty) window.markEditorDirty();
        };

        if (exerciseCount > 0) {
            ffnModalManager.confirm('Delete Section', `Delete this section and its ${exerciseCount} exercise(s)?`, doDelete, { confirmText: 'Delete', confirmClass: 'btn-danger', size: 'sm' });
        } else {
            doDelete();
        }
    },

    // ─── Backward-compat delegations for external callers ──────

    _cleanupSection(sectionEl) {
        window.SectionMoveOps.cleanupSection(sectionEl);
    },

    _applyBlockChainClasses(exercisesEl) {
        window.SectionRenderer.applyBlockChainClasses(exercisesEl);
    },

    _placeholderHtml(sectionId) {
        return window.SectionRenderer.placeholderHtml(sectionId);
    },

    _addZoneHtml(sectionId) {
        return window.SectionRenderer.addZoneHtml(sectionId);
    },

    _showSectionMenu(sectionId, anchorEl) {
        window.SectionMoveOps.showSectionMenu(sectionId, anchorEl);
    },

    _initExerciseSortable(exercisesEl, isNamed) {
        window.SectionSortable._initExerciseSortable(exercisesEl, isNamed);
    },

    // ─── Event Delegation ────────────────────────────────────────

    /**
     * Initialize event delegation for section header buttons.
     */
    initHeaderListeners(container) {
        if (!container || container._sectionHeaderListenersInit) return;
        container._sectionHeaderListenersInit = true;

        container.addEventListener('click', (e) => {
            // Section menu button
            const menuBtn = e.target.closest('.btn-section-menu');
            if (menuBtn) {
                const sectionId = menuBtn.dataset.sectionId;
                if (sectionId) window.SectionMoveOps.showSectionMenu(sectionId, menuBtn);
                return;
            }

            // Placeholder click to add exercise (empty named sections)
            const placeholder = e.target.closest('.section-placeholder');
            if (placeholder) {
                const sectionId = placeholder.dataset.sectionId
                    || placeholder.closest('.workout-section')?.dataset.sectionId;
                if (sectionId) this.addExerciseToSection(sectionId);
                return;
            }

            // Add zone click to add exercise (bottom of populated named sections)
            const addZone = e.target.closest('.section-add-zone');
            if (addZone) {
                const sectionId = addZone.dataset.sectionId
                    || addZone.closest('.workout-section')?.dataset.sectionId;
                if (sectionId) this.addExerciseToSection(sectionId);
                return;
            }
        });

        // Mark dirty on name/description blur
        container.addEventListener('blur', (e) => {
            if (e.target.matches('.section-name-input') || e.target.matches('.section-description-input')) {
                if (window.markEditorDirty) window.markEditorDirty();
            }
        }, true); // useCapture for blur
    },

    // ─── Utility ─────────────────────────────────────────────────

    /**
     * Check if the builder is currently using sections-based layout.
     * Returns true if the container has .workout-section children.
     */
    isSectionsMode() {
        const container = document.getElementById('exerciseGroups');
        return container && container.querySelector('.workout-section') !== null;
    }
};

// Expose globally
window.SectionManager = SectionManager;

console.log('📦 SectionManager module loaded');
