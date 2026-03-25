/**
 * Section Sortable Module
 * Handles all SortableJS integration for workout sections:
 * two-level sorting (section reorder + exercise drag between sections).
 *
 * Extracted from SectionManager to separate drag-and-drop concerns.
 */
(function () {
    'use strict';

    const SectionSortable = {

        /**
         * Initialize two-level SortableJS:
         * - Level 1: Section reorder (parent container)
         * - Level 2: Exercise reorder within named sections
         */
        initSortable(container) {
            if (!window.Sortable) {
                console.warn('⚠️ SortableJS not loaded, cannot init sorting');
                return;
            }

            // Destroy desktop-view-adapter's flat Sortable if present (prevents dual-sortable conflict)
            if (container.sortableInstance) {
                container.sortableInstance.destroy();
                container.sortableInstance = null;
            }

            // Destroy existing section Sortable instances
            if (container._sectionSortable) {
                container._sectionSortable.destroy();
            }

            const renderer = window.SectionRenderer;
            const moveOps = window.SectionMoveOps;

            // Level 1: Section reorder + exercise drop zone
            container._sectionSortable = new Sortable(container, {
                animation: 150,
                handle: '.section-drag-handle',
                draggable: '.workout-section',
                ghostClass: 'section-ghost',
                group: { name: 'sections', put: ['exercises'] },
                onStart: function() {
                    container.classList.add('is-dragging');
                },
                onEnd: function() {
                    container.classList.remove('is-dragging');
                    if (window.markEditorDirty) window.markEditorDirty();
                },
                onAdd: (evt) => {
                    // An exercise card was dropped between sections — wrap in a new standard section
                    const card = evt.item;
                    card.classList.remove('exercise-in-block', 'block-first', 'block-middle', 'block-last');

                    const newSectionId = `section-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

                    const newSection = document.createElement('div');
                    newSection.className = 'workout-section';
                    newSection.dataset.sectionId = newSectionId;
                    newSection.dataset.sectionType = 'standard';

                    const exercisesEl = document.createElement('div');
                    exercisesEl.className = 'section-exercises';
                    newSection.appendChild(exercisesEl);

                    // Replace the bare card (now a direct child of #exerciseGroups) with the section wrapper
                    container.replaceChild(newSection, card);
                    exercisesEl.appendChild(card);

                    // Init inner Sortable on the new standard section
                    this._initExerciseSortable(exercisesEl, false);

                    // Cleanup source section and re-chain remaining cards
                    const fromSectionEl = evt.from.closest('.workout-section');
                    if (fromSectionEl) {
                        moveOps.cleanupSection(fromSectionEl);
                        const fromExercises = fromSectionEl.querySelector('.section-exercises');
                        if (fromExercises && fromSectionEl.dataset.sectionType !== 'standard') {
                            renderer.applyBlockChainClasses(fromExercises);
                        }
                    }

                    if (window.markEditorDirty) window.markEditorDirty();
                }
            });

            // Level 2: Inner Sortables on ALL sections for cross-section exercise drag
            container.querySelectorAll('.workout-section .section-exercises').forEach(el => {
                const isNamed = el.closest('.workout-section').dataset.sectionType !== 'standard';
                this._initExerciseSortable(el, isNamed);
            });
        },

        /**
         * Initialize exercise-level Sortable on a single section's exercise container.
         * @param {HTMLElement} exercisesEl - The .section-exercises container
         * @param {boolean} isNamed - true for named sections (pull+put), false for standard (pull only)
         */
        _initExerciseSortable(exercisesEl, isNamed = true) {
            if (!window.Sortable) return;

            const renderer = window.SectionRenderer;
            const moveOps = window.SectionMoveOps;

            // Destroy existing if present
            if (exercisesEl._exerciseSortable) {
                exercisesEl._exerciseSortable.destroy();
            }

            exercisesEl._exerciseSortable = new Sortable(exercisesEl, {
                animation: 150,
                handle: '.drag-handle',
                draggable: '.exercise-group-card',
                ghostClass: 'sortable-ghost',
                group: isNamed
                    ? 'exercises'
                    : { name: 'exercises', pull: true, put: false },
                onStart: () => {
                    document.getElementById('exerciseGroups')?.classList.add('is-exercise-dragging');
                },
                onAdd: (evt) => {
                    // Exercise arrived from another section — remove placeholder if present
                    const placeholder = exercisesEl.querySelector('.section-placeholder');
                    if (placeholder) placeholder.remove();

                    // Re-chain target section
                    if (isNamed) {
                        renderer.applyBlockChainClasses(exercisesEl);
                        // Ensure add zone exists
                        const sectionEl = exercisesEl.closest('.workout-section');
                        if (sectionEl && !sectionEl.querySelector('.section-add-zone')) {
                            sectionEl.insertAdjacentHTML('beforeend', renderer.addZoneHtml(sectionEl.dataset.sectionId));
                        }
                    }

                    // Cleanup source section and re-chain remaining cards
                    const fromSectionEl = evt.from.closest('.workout-section');
                    if (fromSectionEl) {
                        moveOps.cleanupSection(fromSectionEl);
                        const fromExercises = fromSectionEl.querySelector('.section-exercises');
                        if (fromExercises && fromSectionEl.dataset.sectionType !== 'standard') {
                            renderer.applyBlockChainClasses(fromExercises);
                        }
                    }

                    // Strip block classes if card landed in a standard section
                    if (!isNamed) {
                        evt.item.classList.remove('exercise-in-block', 'block-first', 'block-middle', 'block-last');
                    }

                    if (window.markEditorDirty) window.markEditorDirty();
                },
                onEnd: () => {
                    document.getElementById('exerciseGroups')?.classList.remove('is-exercise-dragging');
                    // Re-chain after internal reorder within same section
                    if (isNamed) renderer.applyBlockChainClasses(exercisesEl);
                    if (window.markEditorDirty) window.markEditorDirty();
                }
            });
        },

        /**
         * Ensure sorting is available for a newly added section.
         * If the parent Sortable doesn't exist yet, does a full init (parent + all inner).
         * If the parent already exists, only initializes the new section's inner Sortable.
         * @param {HTMLElement} container - The #exerciseGroups container
         * @param {HTMLElement} newExercisesEl - The new section's .section-exercises element
         * @param {boolean} isNamed - true for named sections (pull+put), false for standard
         */
        ensureSortable(container, newExercisesEl, isNamed = false) {
            if (!container._sectionSortable) {
                // No parent Sortable yet — full init (creates parent + ALL inner)
                this.initSortable(container);
            } else {
                // Parent exists — only init the new section's inner Sortable
                this._initExerciseSortable(newExercisesEl, isNamed);
            }
        }
    };

    // Expose globally
    window.SectionSortable = SectionSortable;

    console.log('📦 SectionSortable module loaded');
})();
