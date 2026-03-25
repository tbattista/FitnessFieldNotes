/**
 * Section Renderer Module
 * Handles rendering of workout sections: creating section elements, exercise cards,
 * headers, placeholders, and block chain classes.
 *
 * Extracted from SectionManager to separate rendering concerns.
 */
(function () {
    'use strict';

    const SectionRenderer = {

        /**
         * Render sections from workout data into the container.
         * Replaces the old flat-card + applyBlockGrouping() approach.
         */
        renderSections(sections, container) {
            container.innerHTML = '';
            // Clear existing object to preserve cardRenderer reference (don't replace with new {})
            const existing = window.exerciseGroupsData;
            if (existing) {
                Object.keys(existing).forEach(k => delete existing[k]);
            } else {
                window.exerciseGroupsData = {};
            }

            sections.forEach(section => {
                const sectionEl = this.createSectionElement(section);
                container.appendChild(sectionEl);
            });

            window.SectionSortable.initSortable(container);
        },

        /**
         * Create a complete section wrapper element with header (if named) and exercise cards.
         */
        createSectionElement(section) {
            const sectionEl = document.createElement('div');
            const isNamed = section.type !== 'standard';
            sectionEl.className = `workout-section${isNamed ? ` section-${section.type}` : ''}`;
            sectionEl.dataset.sectionId = section.section_id;
            sectionEl.dataset.sectionType = section.type;
            if (section.description) {
                sectionEl.dataset.sectionDescription = section.description;
            }

            // Named sections: header + description as direct children (no card wrapper)
            if (isNamed) {
                sectionEl.insertAdjacentHTML('beforeend', this._createSectionHeaderHtml(section));
            }

            // Exercise container — always a direct child of .workout-section
            const exercisesEl = document.createElement('div');
            exercisesEl.className = 'section-exercises';

            if (section.exercises.length === 0 && isNamed) {
                exercisesEl.innerHTML = this.placeholderHtml(section.section_id);
            } else {
                const totalExercises = section.exercises.length;
                section.exercises.forEach((exercise, exIndex) => {
                    const groupData = this._exerciseToGroupData(exercise);

                    const cardHtml = window.createExerciseGroupCard(
                        exercise.exercise_id, groupData, exIndex + 1, exIndex, totalExercises
                    );
                    exercisesEl.insertAdjacentHTML('beforeend', cardHtml);

                    window.exerciseGroupsData[exercise.exercise_id] = groupData;
                });
            }

            sectionEl.appendChild(exercisesEl);

            // Apply left-border chain classes to exercise cards in named sections
            if (isNamed) {
                this.applyBlockChainClasses(exercisesEl);
            }

            // Add zone for named sections with exercises
            if (isNamed && section.exercises.length > 0) {
                sectionEl.insertAdjacentHTML('beforeend', this.addZoneHtml(section.section_id));
            }

            return sectionEl;
        },

        /**
         * Convert a SectionExercise object to the groupData format used by card renderers.
         */
        _exerciseToGroupData(exercise) {
            const groupData = {
                exercises: { a: exercise.name || '' },
                sets: exercise.sets || '3',
                reps: exercise.reps || '10',
                rest: exercise.rest || '60s',
                default_weight: exercise.default_weight || null,
                default_weight_unit: exercise.default_weight_unit || 'lbs'
            };

            // Add alternates as b, c, d, ...
            (exercise.alternates || []).forEach((alt, i) => {
                const key = String.fromCharCode(98 + i); // b=98, c=99, ...
                groupData.exercises[key] = alt;
            });

            // Preserve note card properties
            if (exercise.group_type === 'note') {
                groupData.group_type = 'note';
                groupData.note_content = exercise.note_content || '';
            }

            // Preserve cardio/activity card properties
            if (exercise.group_type === 'cardio') {
                groupData.group_type = 'cardio';
                groupData.cardio_config = exercise.cardio_config || {};
            }

            return groupData;
        },

        /**
         * Placeholder HTML for empty named sections (clickable).
         */
        placeholderHtml(sectionId) {
            return `<div class="section-placeholder text-center py-4" data-section-id="${sectionId}">
            <i class="bx bx-plus-circle text-muted" style="font-size: 1.5rem;"></i>
            <div class="text-muted mt-1" style="font-size: 0.8rem;">
                Drop exercises here or tap to add
            </div>
        </div>`;
        },

        /**
         * Add-zone HTML for the bottom of populated named sections.
         */
        addZoneHtml(sectionId) {
            return `<div class="section-add-zone" data-section-id="${sectionId}">
            <i class="bx bx-plus"></i> Add Exercise
        </div>`;
        },

        /**
         * Apply left-border chain positional classes to exercise cards in a named section.
         * Adds exercise-in-block + block-first/block-middle/block-last to each card.
         */
        applyBlockChainClasses(exercisesEl) {
            const cards = exercisesEl.querySelectorAll('.exercise-group-card');
            cards.forEach(card => {
                card.classList.remove('exercise-in-block', 'block-first', 'block-middle', 'block-last');
            });
            if (cards.length === 0) return;

            cards.forEach((card, idx) => {
                card.classList.add('exercise-in-block');
                if (cards.length === 1) {
                    card.classList.add('block-first', 'block-last');
                } else if (idx === 0) {
                    card.classList.add('block-first');
                } else if (idx === cards.length - 1) {
                    card.classList.add('block-last');
                } else {
                    card.classList.add('block-middle');
                }
            });
        },

        /**
         * Create HTML for a section header.
         */
        _createSectionHeaderHtml(section) {
            const displayName = section.name || 'Block';
            const description = section.description || '';
            const hasDescription = !!description;

            return `
            <div class="section-block-header">
                <div class="section-header-left">
                    <span class="section-drag-handle"><i class="bx bx-grid-vertical"></i></span>
                    <input type="text" class="section-name-input" value="${displayName}"
                           placeholder="Block name..." maxlength="50">
                </div>
                <div class="section-actions">
                    <button type="button" class="btn-section-menu" data-section-id="${section.section_id}">
                        <i class="bx bx-dots-vertical-rounded"></i>
                    </button>
                </div>
            </div>
            <div class="section-description-area" style="display: ${hasDescription ? 'block' : 'none'};">
                <textarea class="section-description-input" placeholder="Add notes..."
                          maxlength="500">${description}</textarea>
            </div>`;
        }
    };

    // Expose globally
    window.SectionRenderer = SectionRenderer;

    console.log('📦 SectionRenderer module loaded');
})();
