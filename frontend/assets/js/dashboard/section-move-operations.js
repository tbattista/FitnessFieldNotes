/**
 * Section Move Operations Module
 * Handles moving exercises between sections, dissolving sections,
 * cleaning up empty sections, and section context menus.
 *
 * Extracted from SectionManager to separate move/menu concerns.
 */
(function () {
    'use strict';

    const SectionMoveOps = {

        /**
         * Populate the card menu with "Move to [Block]" / "Remove from Block" items.
         * Called by WorkoutBuilderCardMenu.toggleMenu() after opening.
         * @param {string} groupId - Exercise group ID
         * @param {HTMLElement} menuEl - The .builder-card-menu element
         */
        populateCardSectionMenu(groupId, menuEl) {
            const divider = menuEl.querySelector('.section-menu-divider');
            const itemsContainer = menuEl.querySelector('.section-menu-items');
            if (!divider || !itemsContainer) return;

            itemsContainer.innerHTML = '';

            const cardEl = document.querySelector(`.exercise-group-card[data-group-id="${groupId}"]`);
            if (!cardEl) { divider.style.display = 'none'; return; }

            const currentSection = cardEl.closest('.workout-section');
            const isInNamedSection = currentSection?.dataset.sectionType !== 'standard';

            // Find all named sections in the builder
            const namedSections = document.querySelectorAll('.workout-section:not([data-section-type="standard"])');
            const items = [];

            // "Remove from Block" if exercise is inside a named section
            if (isInNamedSection) {
                items.push(`<button type="button" class="builder-menu-item" data-action="remove-from-block" data-group-id="${groupId}">
                <i class="bx bx-unlink"></i> Remove from Block
            </button>`);
            }

            // "Move to [Block Name]" for each OTHER named section (max 8)
            let count = 0;
            namedSections.forEach(sectionEl => {
                if (count >= 8) return;
                const sectionId = sectionEl.dataset.sectionId;
                if (currentSection && sectionId === currentSection.dataset.sectionId) return;

                const nameInput = sectionEl.querySelector('.section-name-input');
                const blockName = nameInput?.value?.trim() || 'Block';
                items.push(`<button type="button" class="builder-menu-item" data-action="move-to-section" data-group-id="${groupId}" data-target-section="${sectionId}">
                <i class="bx bx-right-arrow-alt"></i> Move to ${blockName}
            </button>`);
                count++;
            });

            if (count >= 8 && namedSections.length > 9) {
                items.push(`<div class="builder-menu-hint text-muted" style="padding: 4px 14px; font-size: 0.7rem;">Use Reorder to manage more blocks</div>`);
            }

            if (items.length === 0) {
                divider.style.display = 'none';
                return;
            }

            divider.style.display = '';

            // Clone container to strip any previously accumulated event listeners
            const freshContainer = itemsContainer.cloneNode(false);
            itemsContainer.parentNode.replaceChild(freshContainer, itemsContainer);
            freshContainer.innerHTML = items.join('');

            // Delegate clicks on the fresh container
            freshContainer.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const btn = e.target.closest('[data-action]');
                if (!btn) return;

                const action = btn.dataset.action;
                const gId = btn.dataset.groupId;

                if (action === 'remove-from-block') {
                    window.SectionManager.removeExerciseFromSection(gId);
                } else if (action === 'move-to-section') {
                    this.moveExerciseToSection(gId, btn.dataset.targetSection);
                }

                window.builderCardMenu?.closeAllMenus();
            });
        },

        /**
         * Move an exercise card to a target named section.
         * @param {string} exerciseId - The exercise group ID
         * @param {string} targetSectionId - Target section ID
         */
        moveExerciseToSection(exerciseId, targetSectionId) {
            const cardEl = document.querySelector(`.exercise-group-card[data-group-id="${exerciseId}"]`);
            const targetSection = document.querySelector(`.workout-section[data-section-id="${targetSectionId}"]`);
            if (!cardEl || !targetSection) return;

            const renderer = window.SectionRenderer;
            const sourceSection = cardEl.closest('.workout-section');
            const targetExercises = targetSection.querySelector('.section-exercises');
            if (!targetExercises) return;

            // Remove placeholder in target if present
            const placeholder = targetExercises.querySelector('.section-placeholder');
            if (placeholder) placeholder.remove();

            // Move DOM element
            targetExercises.appendChild(cardEl);

            // Re-chain target section
            renderer.applyBlockChainClasses(targetExercises);

            // Ensure add zone exists on target
            if (!targetSection.querySelector('.section-add-zone')) {
                targetSection.insertAdjacentHTML('beforeend', renderer.addZoneHtml(targetSectionId));
            }

            // Cleanup source section and re-chain remaining cards
            if (sourceSection) {
                this.cleanupSection(sourceSection);
                const sourceExercises = sourceSection.querySelector('.section-exercises');
                if (sourceExercises && sourceSection.dataset.sectionType !== 'standard') {
                    renderer.applyBlockChainClasses(sourceExercises);
                }
            }

            if (window.markEditorDirty) window.markEditorDirty();

            if (window.showToast) {
                const targetName = targetSection.querySelector('.section-name-input')?.value?.trim() || 'Block';
                window.showToast({
                    message: `Moved to ${targetName}`,
                    type: 'success',
                    icon: 'bx-check',
                    delay: 2000
                });
            }
        },

        /**
         * Clean up a section after an exercise was removed:
         * - Standard section with 0 exercises: remove
         * - Named section with 0 exercises: show placeholder (keep section for user to re-add)
         * - Named section with 1+ exercises: keep as-is
         */
        cleanupSection(sectionEl) {
            const exercisesContainer = sectionEl.querySelector('.section-exercises');
            if (!exercisesContainer) return;

            const remainingCards = exercisesContainer.querySelectorAll('.exercise-group-card');
            const isNamed = sectionEl.dataset.sectionType !== 'standard';

            if (remainingCards.length === 0) {
                if (isNamed) {
                    // Remove add zone and show placeholder
                    const addZone = sectionEl.querySelector('.section-add-zone');
                    if (addZone) addZone.remove();
                    if (!exercisesContainer.querySelector('.section-placeholder')) {
                        exercisesContainer.innerHTML = window.SectionRenderer.placeholderHtml(sectionEl.dataset.sectionId);
                    }
                } else {
                    // Destroy inner Sortable before removing from DOM
                    if (exercisesContainer._exerciseSortable) {
                        exercisesContainer._exerciseSortable.destroy();
                        exercisesContainer._exerciseSortable = null;
                    }
                    sectionEl.remove();
                }
            }
        },

        /**
         * Dissolve a named section: move all exercises out as standalone standard sections.
         */
        dissolveSection(sectionId) {
            const sectionEl = document.querySelector(`.workout-section[data-section-id="${sectionId}"]`);
            if (!sectionEl) return;

            const cards = sectionEl.querySelectorAll('.section-exercises .exercise-group-card');

            // Move each exercise to its own standard section, inserted after the current section
            let insertAfter = sectionEl;
            cards.forEach(cardEl => {
                // Strip block chain classes
                cardEl.classList.remove('exercise-in-block', 'block-first', 'block-middle', 'block-last');

                const newSectionId = `section-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
                const newSection = document.createElement('div');
                newSection.className = 'workout-section';
                newSection.dataset.sectionId = newSectionId;
                newSection.dataset.sectionType = 'standard';

                const exercisesEl = document.createElement('div');
                exercisesEl.className = 'section-exercises';
                exercisesEl.appendChild(cardEl);
                newSection.appendChild(exercisesEl);

                insertAfter.after(newSection);
                insertAfter = newSection;

                // Init inner Sortable so this exercise can be dragged to named sections
                window.SectionSortable._initExerciseSortable(exercisesEl, false);
            });

            // Destroy old section's inner Sortable before removing from DOM
            const oldExercisesEl = sectionEl.querySelector('.section-exercises');
            if (oldExercisesEl?._exerciseSortable) {
                oldExercisesEl._exerciseSortable.destroy();
                oldExercisesEl._exerciseSortable = null;
            }
            sectionEl.remove();
            if (window.markEditorDirty) window.markEditorDirty();
        },

        /**
         * Show a context menu for a section (rename, dissolve, delete).
         */
        showSectionMenu(sectionId, anchorEl) {
            // Remove any existing menu
            document.querySelectorAll('.section-context-menu').forEach(m => m.remove());

            const sectionEl = document.querySelector(`.workout-section[data-section-id="${sectionId}"]`);
            const hasExercises = sectionEl?.querySelectorAll('.exercise-group-card').length > 0;
            const descArea = sectionEl?.querySelector('.section-description-area');
            const isDescVisible = descArea && descArea.style.display !== 'none';

            const menu = document.createElement('div');
            menu.className = 'section-context-menu';
            menu.innerHTML = `
            <button class="section-menu-item" data-action="toggle-notes">
                <i class="bx bx-note"></i> ${isDescVisible ? 'Hide Notes' : 'Notes'}
            </button>
            <button class="section-menu-item" data-action="rename">
                <i class="bx bx-edit-alt"></i> Rename
            </button>
            ${hasExercises ? `<button class="section-menu-item" data-action="dissolve">
                <i class="bx bx-layer-minus"></i> Ungroup Exercises
            </button>` : ''}
            <button class="section-menu-item section-menu-danger" data-action="delete">
                <i class="bx bx-trash"></i> Delete Block
            </button>
        `;

            menu.addEventListener('click', (e) => {
                const item = e.target.closest('.section-menu-item');
                if (!item) return;

                const action = item.dataset.action;
                if (action === 'toggle-notes') {
                    if (descArea) {
                        const isHidden = descArea.style.display === 'none';
                        descArea.style.display = isHidden ? 'block' : 'none';
                        if (isHidden) {
                            descArea.querySelector('.section-description-input')?.focus();
                        }
                    }
                }
                if (action === 'rename') window.SectionManager.renameSection(sectionId);
                if (action === 'dissolve') this.dissolveSection(sectionId);
                if (action === 'delete') window.SectionManager.deleteSection(sectionId);

                menu.remove();
            });

            // Position near the anchor
            anchorEl.style.position = 'relative';
            anchorEl.appendChild(menu);

            // Close on outside click
            setTimeout(() => {
                const closeHandler = (e) => {
                    if (!menu.contains(e.target)) {
                        menu.remove();
                        document.removeEventListener('click', closeHandler);
                    }
                };
                document.addEventListener('click', closeHandler);
            }, 0);
        }
    };

    // Expose globally
    window.SectionMoveOps = SectionMoveOps;

    console.log('📦 SectionMoveOps module loaded');
})();
