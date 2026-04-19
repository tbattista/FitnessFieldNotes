/**
 * Fitness Field Notes - Workout Render Manager
 * Orchestrates rendering workout cards, timers, and field controllers
 * Extracted from WorkoutModeController to separate rendering concerns
 * @version 1.0.0
 * @date 2026-02-13
 */

class WorkoutRenderManager {
    constructor(options) {
        this.sessionService = options.sessionService;
        this.cardRenderer = options.cardRenderer;
        this.noteCardRenderer = options.noteCardRenderer;
        this.timerManager = options.timerManager;
        this.onAutoSave = options.onAutoSave || (() => Promise.resolve());
        this.onRenderWorkout = options.onRenderWorkout || (() => {});
        this.onGetCurrentWorkout = options.onGetCurrentWorkout || (() => null);
        this.cardManager = null;
        this._lastSectionMeta = null;

        console.log('🎨 Workout Render Manager initialized');
    }

    /**
     * Main render method - builds and injects exercise card HTML into the DOM
     * Handles template notes, session notes, and custom ordering
     * @param {Object} currentWorkout - The current workout object
     * @param {boolean} forceRender - Force re-render even if unchanged
     */
    render(currentWorkout, forceRender = false) {
        const container = document.getElementById('exerciseCardsContainer');
        if (!container) return;

        if (!currentWorkout) {
            console.warn('⚠️ Cannot render workout: currentWorkout is undefined');
            return;
        }

        let html = '';
        let exerciseIndex = 0;

        // Calculate total cards
        const regularCount = currentWorkout.exercise_groups?.length || 0;
        const sessionNotes = this.sessionService.getSessionNotes();
        const noteCount = sessionNotes?.length || 0;
        const templateNotes = currentWorkout.template_notes || [];
        const templateNoteCount = templateNotes.length;
        const totalCards = regularCount + noteCount + templateNoteCount;

        // Build combined item list (exercises + notes)
        const hasSectionBlocks = currentWorkout.sections?.some(s => s.type !== 'standard');
        const allItems = hasSectionBlocks
            ? this._buildSectionedItemList(currentWorkout, sessionNotes, templateNotes)
            : this._buildItemList(currentWorkout, sessionNotes, templateNotes);
        if (!hasSectionBlocks) this._lastSectionMeta = null;

        // Apply custom order if exists
        const customOrder = this.sessionService.getExerciseOrder();
        if (customOrder.length > 0) {
            console.log('📋 Applying custom item order:', customOrder);
            this._applyCustomOrder(allItems, customOrder);
        }

        // Compute section position metadata after custom ordering
        if (hasSectionBlocks) {
            this._lastSectionMeta = this._computeSectionMeta(allItems);
        }

        // Render items in order
        allItems.forEach((item) => {
            if (item.type === 'template_note') {
                html += this.renderReadOnlyTemplateNote(item.data, exerciseIndex, totalCards);
            } else if (item.type === 'note') {
                if (this.noteCardRenderer) {
                    html += this.noteCardRenderer.renderCard(item.data, exerciseIndex, totalCards);
                } else {
                    console.warn('⚠️ NoteCardRenderer not available');
                }
            } else if (item.type === 'cardio') {
                html += this.renderCardioCard(item.data, exerciseIndex, totalCards);
            } else {
                html += this.cardRenderer.renderCard(item.data, exerciseIndex, false, totalCards);
            }
            exerciseIndex++;
        });

        // Build & Log empty state: show prompt when no exercises yet
        const isBuildMode = window.workoutModeController?.isBuildMode;
        if (allItems.length === 0 && isBuildMode) {
            html = `<div class="text-center py-5" id="buildModeEmptyState">
                <i class="bx bx-plus-circle" style="font-size: 3rem; opacity: 0.3;"></i>
                <h6 class="mt-3 text-muted">No exercises yet</h6>
                <p class="text-muted small mb-0">Tap <strong>Add Exercise</strong> below to start building</p>
            </div>`;
        }

        container.innerHTML = html;


        // Apply visual block grouping for sectioned workouts
        if (this._lastSectionMeta) {
            this._applyWorkoutBlockGrouping(container);
        }

        // Initialize or update Card Manager
        if (!this.cardManager) {
            this.cardManager = new ExerciseCardManager({
                containerSelector: '#exerciseCardsContainer',
                sessionService: this.sessionService,
                timerManager: this.timerManager,
                workout: currentWorkout
            });
        } else {
            this.cardManager.updateWorkout(currentWorkout);
        }

        // Initialize timers
        this.timerManager.initializeGlobalTimer();
        this.timerManager.initializeCardTimers();

        // Initialize logbook field controllers
        this._initializeLogbookControllers();
    }

    /**
     * Build the combined item list from exercises, notes, and template notes
     * @private
     */
    _buildItemList(currentWorkout, sessionNotes, templateNotes) {
        const allItems = [];

        // Build template notes map for interleaving
        const templateNotesMap = new Map();
        templateNotes.forEach((note) => {
            templateNotesMap.set(note.order_index, {
                type: 'template_note',
                data: note,
                name: `template-note-${note.id}`,
                order_index: note.order_index
            });
        });

        // Add regular exercises with interleaved template notes
        if (currentWorkout.exercise_groups && currentWorkout.exercise_groups.length > 0) {
            let currentIndex = 0;
            currentWorkout.exercise_groups.forEach((group) => {
                while (templateNotesMap.has(currentIndex)) {
                    allItems.push(templateNotesMap.get(currentIndex));
                    templateNotesMap.delete(currentIndex);
                    currentIndex++;
                }
                allItems.push({
                    type: group.group_type === 'cardio' ? 'cardio' : 'exercise',
                    subtype: 'regular',
                    data: group,
                    name: group.exercises?.a
                });
                currentIndex++;
            });

            // Add remaining template notes at the end
            templateNotesMap.forEach((noteItem) => {
                allItems.push(noteItem);
            });
        } else {
            // No exercises, just add template notes
            templateNotes.forEach((note) => {
                allItems.push({
                    type: 'template_note',
                    data: note,
                    name: `template-note-${note.id}`
                });
            });
        }

        // Add session notes
        if (sessionNotes && sessionNotes.length > 0) {
            sessionNotes.forEach((note) => {
                allItems.push({
                    type: 'note',
                    data: note,
                    name: `note-${note.id}`
                });
            });
        }

        return allItems;
    }

    /**
     * Build item list using sections data for structured block grouping.
     * @private
     */
    _buildSectionedItemList(currentWorkout, sessionNotes, templateNotes) {
        const allItems = [];

        // Build lookup: group_id -> exercise_group
        const groupLookup = new Map();
        (currentWorkout.exercise_groups || []).forEach(g => {
            groupLookup.set(g.group_id, g);
        });

        // Fallback: name -> exercise_group
        const nameLookup = new Map();
        (currentWorkout.exercise_groups || []).forEach(g => {
            const name = g.exercises?.a;
            if (name && !nameLookup.has(name)) nameLookup.set(name, g);
        });

        const placedGroupIds = new Set();

        // Build template notes map for interleaving
        const templateNotesMap = new Map();
        (templateNotes || []).forEach(note => {
            templateNotesMap.set(note.order_index, {
                type: 'template_note',
                data: note,
                name: `template-note-${note.id}`,
                order_index: note.order_index
            });
        });

        // Iterate sections in order
        let currentIndex = 0;
        (currentWorkout.sections || []).forEach(section => {
            const isNamed = section.type !== 'standard';

            section.exercises.forEach(sectionExercise => {
                // Interleave template notes by order_index
                while (templateNotesMap.has(currentIndex)) {
                    allItems.push(templateNotesMap.get(currentIndex));
                    templateNotesMap.delete(currentIndex);
                    currentIndex++;
                }

                // Find matching exercise_group
                let group = groupLookup.get(sectionExercise.exercise_id);
                if (!group) group = nameLookup.get(sectionExercise.name);

                if (group) {
                    allItems.push({
                        type: group.group_type === 'cardio' ? 'cardio' : 'exercise',
                        subtype: 'regular',
                        data: group,
                        name: group.exercises?.a,
                        sectionId: isNamed ? section.section_id : null,
                        sectionType: isNamed ? section.type : null,
                        sectionName: isNamed ? (section.name || section.type) : null
                    });
                    placedGroupIds.add(group.group_id);
                }
                currentIndex++;
            });
        });

        // Add remaining template notes
        templateNotesMap.forEach(noteItem => allItems.push(noteItem));

        // Safety net: add exercise_groups not covered by sections
        (currentWorkout.exercise_groups || []).forEach(group => {
            if (!placedGroupIds.has(group.group_id)) {
                allItems.push({
                    type: group.group_type === 'cardio' ? 'cardio' : 'exercise',
                    subtype: 'regular',
                    data: group,
                    name: group.exercises?.a
                });
            }
        });

        // Add session notes
        if (sessionNotes && sessionNotes.length > 0) {
            sessionNotes.forEach(note => {
                allItems.push({
                    type: 'note',
                    data: note,
                    name: `note-${note.id}`
                });
            });
        }

        return allItems;
    }

    /**
     * Compute section position metadata from the final ordered items array.
     * Finds consecutive runs of exercises sharing a sectionId and assigns positional labels.
     * @private
     */
    _computeSectionMeta(allItems) {
        const meta = new Map();

        // Collect exercise items that have section metadata, with their render indices
        const sectionItems = [];
        let renderIndex = 0;
        allItems.forEach(item => {
            if (item.sectionId) {
                sectionItems.push({
                    renderIndex,
                    sectionId: item.sectionId,
                    sectionType: item.sectionType,
                    sectionName: item.sectionName
                });
            }
            renderIndex++;
        });

        // Find consecutive runs of same sectionId and assign positions
        let i = 0;
        while (i < sectionItems.length) {
            const sectionId = sectionItems[i].sectionId;
            let j = i;
            while (j < sectionItems.length && sectionItems[j].sectionId === sectionId) j++;

            const runLength = j - i;
            for (let k = i; k < j; k++) {
                let position;
                if (runLength === 1) position = 'only';
                else if (k === i) position = 'first';
                else if (k === j - 1) position = 'last';
                else position = 'middle';

                meta.set(sectionItems[k].renderIndex, {
                    sectionId: sectionItems[k].sectionId,
                    sectionType: sectionItems[k].sectionType,
                    sectionName: sectionItems[k].sectionName,
                    position
                });
            }
            i = j;
        }

        return meta;
    }

    /**
     * Apply visual block grouping to rendered workout cards.
     * Adds CSS classes and injects block-group-header divs.
     * @private
     */
    _applyWorkoutBlockGrouping(container) {
        if (!this._lastSectionMeta || this._lastSectionMeta.size === 0) return;

        const iconMap = {
            circuit: 'bx-refresh',
            superset: 'bx-transfer',
            tabata: 'bx-timer',
            emom: 'bx-time-five',
            amrap: 'bx-infinite'
        };

        this._lastSectionMeta.forEach((info, exerciseIndex) => {
            const card = container.querySelector(`.workout-card[data-exercise-index="${exerciseIndex}"]`);
            if (!card) return;

            card.classList.add('exercise-in-block');

            switch (info.position) {
                case 'only':
                    card.classList.add('block-first', 'block-last');
                    break;
                case 'first':
                    card.classList.add('block-first');
                    break;
                case 'middle':
                    card.classList.add('block-middle');
                    break;
                case 'last':
                    card.classList.add('block-last');
                    break;
            }

            // Inject block header before first/only cards
            if (info.position === 'first' || info.position === 'only') {
                const icon = iconMap[info.sectionType] || 'bx-collection';
                const name = info.sectionName || info.sectionType || 'Block';
                const label = name.charAt(0).toUpperCase() + name.slice(1);

                card.insertAdjacentHTML('beforebegin',
                    `<div class="block-group-header" data-section-id="${info.sectionId}">
                        <span class="block-group-label">
                            <i class="bx ${icon}"></i>
                            ${label}
                        </span>
                    </div>`);
            }
        });
    }

    /**
     * Apply custom order to items array in-place
     * @private
     */
    _applyCustomOrder(allItems, customOrder) {
        const orderedItems = [];
        customOrder.forEach(name => {
            const item = allItems.find(ex => ex.name === name);
            if (item) orderedItems.push(item);
        });

        // Add any items not in custom order (safety)
        allItems.forEach(ex => {
            if (!customOrder.includes(ex.name)) {
                orderedItems.push(ex);
            }
        });

        allItems.splice(0, allItems.length, ...orderedItems);
    }

    /**
     * Render a read-only template note card
     * @param {Object} note - Template note data
     * @param {number} index - Card index
     * @param {number} totalCards - Total number of cards
     * @returns {string} HTML string
     */
    /**
     * Render a cardio/activity card for workout mode (fully interactive)
     */
    renderCardioCard(group, index, totalCards) {
        const templateConfig = group.cardio_config || {};
        const activityType = templateConfig.activity_type || '';
        const exercises = group.exercises || {};
        const exerciseName = exercises.a || activityType || 'Activity';

        // Get icon and display name from activity type registry
        let iconClass = 'bx-heart-circle';
        let activityName = activityType;
        if (activityType && window.ActivityTypeRegistry) {
            iconClass = window.ActivityTypeRegistry.getIcon(activityType) || 'bx-heart-circle';
            activityName = window.ActivityTypeRegistry.getName(activityType) || activityType;
        }

        // Session state
        const isSessionActive = this.sessionService?.isSessionActive();
        const exerciseData = this.sessionService?.getExerciseWeight(exerciseName);
        const isCompleted = exerciseData?.is_completed || false;
        const preSessionSkipped = !isSessionActive && this.sessionService?.isPreSessionSkipped?.(exerciseName);
        const isSkipped = exerciseData?.is_skipped || preSessionSkipped || false;
        const skipReason = exerciseData?.skip_reason || (preSessionSkipped ? 'Skipped before workout' : '');

        // Session overrides take priority over template config
        const sessionConfig = this.sessionService?.getActivitySessionConfig?.(exerciseName);
        const displayConfig = sessionConfig || templateConfig;
        const hasSessionOverrides = !!sessionConfig;

        // Build meta parts from display config
        const metaParts = [];
        if (displayConfig.duration_minutes) metaParts.push(`${displayConfig.duration_minutes} min`);
        if (displayConfig.distance) metaParts.push(`${displayConfig.distance} ${displayConfig.distance_unit || 'mi'}`);
        if (displayConfig.target_pace) metaParts.push(displayConfig.target_pace);
        if (displayConfig.target_rpe) metaParts.push(`RPE ${displayConfig.target_rpe}`);
        if (displayConfig.target_heart_rate) metaParts.push(`${displayConfig.target_heart_rate} bpm`);
        if (displayConfig.target_calories) metaParts.push(`${displayConfig.target_calories} cal`);
        const metaText = metaParts.join(' \u00b7 ');

        const escapeHtml = (text) => {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        };

        const displayName = activityName || 'Activity';
        const escapedName = escapeHtml(exerciseName);

        // State classes
        const stateClasses = ['workout-card'];
        if (isCompleted) stateClasses.push('logged');
        if (isSkipped) stateClasses.push('skipped');

        // Completion button (same pattern as standard exercise cards)
        let completionButtonHtml = '';
        if (isSessionActive && !isSkipped) {
            if (isCompleted) {
                completionButtonHtml = `
                    <div class="workout-actions">
                        <button class="workout-primary-action completed"
                                onclick="window.workoutModeController?.handleUncompleteExercise?.('${escapedName}', ${index}); event.stopPropagation();">
                            <i class="bx bx-check"></i> Completed
                        </button>
                    </div>`;
            } else {
                completionButtonHtml = `
                    <div class="workout-actions">
                        <button class="workout-primary-action save"
                                onclick="window.workoutModeController?.handleCompleteExercise?.('${escapedName}', ${index}); event.stopPropagation();">
                            Mark Done
                        </button>
                    </div>`;
            }
        }

        return `
            <div class="${stateClasses.join(' ')}"
                 data-exercise-index="${index}"
                 data-exercise-name="${escapedName}"
                 data-card-type="cardio"
                 onclick="if(!event.target.closest('.workout-more-btn, .workout-edit-btn, .workout-menu, .workout-primary-action')) { this.classList.toggle('expanded'); if(this.classList.contains('expanded')) setTimeout(() => this.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100); }">
                <div class="workout-card-header">
                    <div class="workout-exercise-name-row">
                        <div class="workout-exercise-name">
                            <i class="bx ${iconClass}" style="margin-right: 4px;"></i>${escapeHtml(displayName)}
                        </div>
                        <div class="workout-header-actions">
                            <button class="workout-edit-btn${isCompleted ? ' edit-locked' : ''}"
                                    onclick="window.workoutModeController?.handleEditActivity?.('${escapedName}', ${index}); event.stopPropagation();"
                                    aria-label="${isCompleted ? 'Editing locked - uncomplete to edit' : 'Edit activity'}"
                                    title="${isCompleted ? 'Uncomplete to edit' : 'Edit activity'}">
                                <i class="bx ${isCompleted ? 'bx-lock-alt' : 'bx-edit-alt'}"></i>
                            </button>
                            <button class="workout-more-btn"
                                    onclick="window.workoutModeController?.toggleExerciseMenu?.(this, '${escapedName}', ${index}); event.stopPropagation();"
                                    title="More options">
                                <i class="bx bx-dots-vertical"></i>
                            </button>
                            <i class="bx bx-chevron-down workout-chevron"></i>
                            ${this._renderActivityMoreMenu(exerciseName, index, isSkipped, isCompleted, totalCards)}
                        </div>
                    </div>
                    <div class="workout-exercise-info">
                        <span class="workout-meta">${metaText || 'Activity'}</span>
                        ${hasSessionOverrides ? '<span class="workout-state-item highlight"><i class="bx bx-pencil"></i> Modified</span>' : ''}
                    </div>
                </div>
                ${completionButtonHtml}
                <div class="workout-card-body" onclick="event.stopPropagation()">
                    ${isSkipped ? `
                        <div class="alert alert-warning">
                            <i class="bx bx-info-circle me-2"></i>
                            <strong>Activity Skipped</strong>
                            ${skipReason ? `<p class="mb-0 mt-1 small">${escapeHtml(skipReason)}</p>` : ''}
                        </div>
                    ` : `
                        <!-- Display Mode (click to edit) -->
                        <div class="activity-fields-display click-to-edit p-3 text-muted small">
                            ${displayConfig.duration_minutes ? `<div><i class="bx bx-time-five"></i> <strong>Duration:</strong> ${displayConfig.duration_minutes} min</div>` : ''}
                            ${displayConfig.distance ? `<div><i class="bx bx-ruler"></i> <strong>Distance:</strong> ${displayConfig.distance} ${displayConfig.distance_unit || 'mi'}</div>` : ''}
                            ${displayConfig.target_pace ? `<div><i class="bx bx-run"></i> <strong>Target Pace:</strong> ${displayConfig.target_pace}</div>` : ''}
                            ${displayConfig.target_rpe ? `<div><i class="bx bx-heart"></i> <strong>RPE:</strong> ${displayConfig.target_rpe}/10</div>` : ''}
                            ${displayConfig.target_heart_rate ? `<div><i class="bx bx-pulse"></i> <strong>Heart Rate:</strong> ${displayConfig.target_heart_rate} bpm</div>` : ''}
                            ${displayConfig.target_calories ? `<div><i class="bx bx-flame"></i> <strong>Calories:</strong> ${displayConfig.target_calories} cal</div>` : ''}
                            ${displayConfig.notes ? `<div class="mt-2"><i class="bx bx-note"></i> <strong>Notes:</strong> ${escapeHtml(displayConfig.notes)}</div>` : ''}
                            ${!displayConfig.duration_minutes && !displayConfig.distance && !displayConfig.target_pace && !displayConfig.target_rpe && !displayConfig.target_heart_rate && !displayConfig.target_calories ? '<div class="text-muted fst-italic">Tap to add details</div>' : ''}
                        </div>

                        <!-- Edit Mode (hidden initially) -->
                        <div class="activity-fields-editor" style="display: none;" onclick="event.stopPropagation();">
                            <div class="activity-edit-row">
                                <label><i class="bx bx-time-five"></i> Duration</label>
                                <div class="activity-edit-input-group">
                                    <input type="number" class="activity-edit-duration" data-field="duration_minutes" value="${displayConfig.duration_minutes || ''}" placeholder="0" min="0" step="1" inputmode="numeric" />
                                    <span class="activity-edit-suffix">min</span>
                                </div>
                            </div>
                            <div class="activity-edit-row">
                                <label><i class="bx bx-ruler"></i> Distance</label>
                                <div class="activity-edit-input-group">
                                    <input type="number" class="activity-edit-distance" data-field="distance" value="${displayConfig.distance || ''}" placeholder="0" min="0" step="0.1" inputmode="decimal" />
                                    <select class="activity-edit-distance-unit" data-field="distance_unit">
                                        <option value="mi" ${(displayConfig.distance_unit || 'mi') === 'mi' ? 'selected' : ''}>mi</option>
                                        <option value="km" ${displayConfig.distance_unit === 'km' ? 'selected' : ''}>km</option>
                                        <option value="m" ${displayConfig.distance_unit === 'm' ? 'selected' : ''}>m</option>
                                        <option value="yd" ${displayConfig.distance_unit === 'yd' ? 'selected' : ''}>yd</option>
                                    </select>
                                </div>
                            </div>
                            <div class="activity-edit-row">
                                <label><i class="bx bx-run"></i> Pace</label>
                                <input type="text" class="activity-edit-pace" data-field="target_pace" value="${escapeHtml(displayConfig.target_pace || '')}" placeholder="e.g. 10:00/mi" />
                            </div>
                            <div class="activity-edit-row">
                                <label><i class="bx bx-heart"></i> RPE</label>
                                <input type="number" class="activity-edit-rpe" data-field="target_rpe" value="${displayConfig.target_rpe || ''}" placeholder="1-10" min="1" max="10" step="1" inputmode="numeric" />
                            </div>
                            <div class="activity-edit-row">
                                <label><i class="bx bx-pulse"></i> Heart Rate</label>
                                <div class="activity-edit-input-group">
                                    <input type="number" class="activity-edit-hr" data-field="target_heart_rate" value="${displayConfig.target_heart_rate || ''}" placeholder="0" min="0" step="1" inputmode="numeric" />
                                    <span class="activity-edit-suffix">bpm</span>
                                </div>
                            </div>
                            <div class="activity-edit-row">
                                <label><i class="bx bx-flame"></i> Calories</label>
                                <div class="activity-edit-input-group">
                                    <input type="number" class="activity-edit-calories" data-field="target_calories" value="${displayConfig.target_calories || ''}" placeholder="0" min="0" step="1" inputmode="numeric" />
                                    <span class="activity-edit-suffix">cal</span>
                                </div>
                            </div>
                            <div class="activity-edit-row">
                                <label><i class="bx bx-note"></i> Notes</label>
                                <input type="text" class="activity-edit-notes" data-field="notes" value="${escapeHtml(displayConfig.notes || '')}" placeholder="Add notes..." />
                            </div>
                        </div>

                        <!-- Unified Save/Cancel Buttons -->
                        <div class="activity-unified-actions" style="display: none;" onclick="event.stopPropagation();">
                            <button class="btn btn-sm btn-success activity-unified-save-btn" type="button" aria-label="Save changes" title="Save">
                                <i class="bx bx-check"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-secondary activity-unified-cancel-btn" type="button" aria-label="Cancel changes" title="Cancel">
                                <i class="bx bx-x"></i>
                            </button>
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    /**
     * Render activity-specific more menu (kebab menu)
     * @private
     */
    _renderActivityMoreMenu(exerciseName, index, isSkipped, isCompleted, totalCards) {
        const escapeHtml = (text) => {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        };
        const escaped = escapeHtml(exerciseName);

        return `
            <div class="workout-menu" onclick="event.stopPropagation()">
                ${!isSkipped ? `
                    <button class="workout-menu-item" onclick="window.workoutModeController?.handleSkipExercise?.('${escaped}', ${index}); event.stopPropagation();">
                        <i class="bx bx-skip-next"></i>
                        Skip for today
                    </button>
                ` : `
                    <button class="workout-menu-item" onclick="window.workoutModeController?.handleUnskipExercise?.('${escaped}', ${index}); event.stopPropagation();" style="color: var(--workout-success);">
                        <i class="bx bx-undo" style="color: var(--workout-success);"></i>
                        Unskip activity
                    </button>
                `}
                <button class="workout-menu-item${isCompleted ? ' disabled' : ''}"
                        onclick="window.workoutModeController?.handleEditActivity?.('${escaped}', ${index}); event.stopPropagation();"${isCompleted ? ' disabled' : ''}>
                    <i class="bx ${isCompleted ? 'bx-lock-alt' : 'bx-edit-alt'}"></i>
                    ${isCompleted ? 'Edit (uncomplete first)' : 'Edit activity'}
                </button>
                <button class="workout-menu-item" onclick="window.workoutModeController?.handleReplaceActivity?.('${escaped}', ${index}); event.stopPropagation();">
                    <i class="bx bx-transfer-alt"></i>
                    Replace activity
                </button>
                <div class="workout-menu-divider"></div>
                <button class="workout-menu-item${index === 0 ? ' disabled' : ''}" onclick="window.workoutModeController?.handleMoveUp?.(${index}); event.stopPropagation();"${index === 0 ? ' disabled' : ''}>
                    <i class="bx bx-chevron-up"></i>
                    Move up
                </button>
                <button class="workout-menu-item${index >= totalCards - 1 ? ' disabled' : ''}" onclick="window.workoutModeController?.handleMoveDown?.(${index}); event.stopPropagation();"${index >= totalCards - 1 ? ' disabled' : ''}>
                    <i class="bx bx-chevron-down"></i>
                    Move down
                </button>
            </div>
        `;
    }

    renderReadOnlyTemplateNote(note, index, totalCards) {
        const noteId = note.id || `template-note-${Date.now()}`;
        const content = note.content || '';
        const preview = content.length > 80 ? content.substring(0, 80) + '...' : content;
        const displayText = preview || 'Empty note';

        const escapeHtml = (text) => {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        };

        return `
            <div class="exercise-group-card compact" data-note-id="${escapeHtml(noteId)}" data-card-type="note" data-card-index="${index}">
                <div class="card">
                    <div class="card-body">
                        <div class="exercise-content">
                            <div class="exercise-list">
                                <div class="exercise-line">
                                    <i class="bx bx-comment text-muted me-1"></i>${escapeHtml(displayText)}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Initialize inline rest timers for exercise cards
     * @private
     */
    _initializeInlineTimers() {
        this.timerManager.clearAllInlineTimers();

        const timerContainers = document.querySelectorAll('[data-inline-timer]');

        timerContainers.forEach(container => {
            const exerciseIndex = parseInt(container.getAttribute('data-inline-timer'));
            const timerWrapper = container.closest('.inline-rest-timer');
            const restSeconds = parseInt(timerWrapper?.getAttribute('data-rest-seconds')) || 60;
            const restDisplay = timerWrapper?.getAttribute('data-rest-display') || `${restSeconds}s`;

            if (window.InlineRestTimer) {
                const timer = new window.InlineRestTimer(exerciseIndex, restSeconds);
                timer.setRestDisplayText(restDisplay);
                this.timerManager.registerInlineTimer(exerciseIndex, timer);
                timer.render();
                console.log(`⏱️ Inline timer initialized for exercise ${exerciseIndex}: ${restDisplay}`);
            }
        });

        console.log(`✅ Initialized ${timerContainers.length} inline timers`);
    }

    /**
     * Initialize Logbook V2 field controllers after cards are rendered
     * @private
     */
    _initializeLogbookControllers() {
        try {
            // Weight field controllers
            if (window.initializeWeightFields) {
                window.initializeWeightFields(this.sessionService);
                console.log('✅ Logbook V2: Weight field controllers initialized');
            } else {
                console.warn('⚠️ Logbook V2: initializeWeightFields not available');
            }

            // Reps/sets field controllers
            if (window.initializeRepsSetsFields) {
                window.initializeRepsSetsFields(this.sessionService);
                console.log('✅ Logbook V2: Reps/Sets field controllers initialized');
            } else {
                console.warn('⚠️ Logbook V2: initializeRepsSetsFields not available');
            }

            // Unified edit controllers
            if (window.UnifiedEditController) {
                const exerciseCards = document.querySelectorAll('.workout-card');
                exerciseCards.forEach((card) => {
                    const exerciseIndex = card.getAttribute('data-exercise-index');
                    const exerciseName = card.getAttribute('data-exercise-name');

                    if (exerciseIndex !== null && exerciseName) {
                        const weightFieldContainer = card.querySelector('.workout-weight-field');
                        const repsSetsFieldContainer = card.querySelector('.workout-repssets-field');
                        const weightController = weightFieldContainer?.weightController;
                        const repsSetsController = repsSetsFieldContainer?.repsSetsController;

                        if (weightController && repsSetsController) {
                            const unifiedController = new window.UnifiedEditController(
                                card,
                                weightController,
                                repsSetsController
                            );
                            card.unifiedEditController = unifiedController;
                            console.log(`✅ Unified edit controller initialized for ${exerciseName} (index ${exerciseIndex})`);
                        } else {
                            console.warn(`⚠️ Missing field controllers for ${exerciseName} (index ${exerciseIndex})`, {
                                hasWeightContainer: !!weightFieldContainer,
                                hasRepsSetsContainer: !!repsSetsFieldContainer,
                                hasWeightController: !!weightController,
                                hasRepsSetsController: !!repsSetsController
                            });
                        }
                    }
                });
                console.log('✅ Logbook V2: Unified edit controllers initialized');
            } else {
                console.warn('⚠️ Logbook V2: UnifiedEditController not available');
            }

            // Activity field controllers (inline editing for cardio cards)
            if (window.ActivityFieldController) {
                const cardioCards = document.querySelectorAll('.workout-card[data-card-type="cardio"]');
                cardioCards.forEach((card) => {
                    const exerciseName = card.getAttribute('data-exercise-name');
                    if (exerciseName) {
                        const controller = new window.ActivityFieldController(
                            card,
                            this.sessionService,
                            () => this.onAutoSave(),
                            () => this.onRenderWorkout(),
                            () => this.onGetCurrentWorkout()
                        );
                        card.activityFieldController = controller;
                        console.log(`✅ Activity field controller initialized for ${exerciseName}`);
                    }
                });
                console.log(`✅ Logbook V2: Activity field controllers initialized (${cardioCards.length} cards)`);
            } else {
                console.warn('⚠️ Logbook V2: ActivityFieldController not available');
            }

            // Dispatch event for unified notes controller
            document.dispatchEvent(new CustomEvent('exerciseCardsRendered'));
            console.log('✅ exerciseCardsRendered event dispatched');
            console.log('✅ Logbook V2: All field controllers initialized');
        } catch (error) {
            console.error('❌ Error initializing Logbook V2 controllers:', error);
        }
    }

    /**
     * Get all exercise names in current render order
     * Used for updating exercise order during replacements
     * @param {Object} currentWorkout - Current workout object
     * @returns {string[]} Array of exercise names in order
     */
    getAllExerciseNames(currentWorkout) {
        const allExercises = [];

        // Add regular exercises
        if (currentWorkout?.exercise_groups && currentWorkout.exercise_groups.length > 0) {
            currentWorkout.exercise_groups.forEach((group) => {
                const exerciseName = group.exercises?.a;
                if (exerciseName) {
                    allExercises.push({ type: 'regular', name: exerciseName });
                }
            });
        }

        // Apply custom order if exists
        const customOrder = this.sessionService.getExerciseOrder();
        if (customOrder.length > 0) {
            const orderedExercises = [];
            customOrder.forEach(name => {
                const exercise = allExercises.find(ex => ex.name === name);
                if (exercise) orderedExercises.push(exercise);
            });
            allExercises.forEach(ex => {
                if (!customOrder.includes(ex.name)) orderedExercises.push(ex);
            });
            return orderedExercises.map(ex => ex.name);
        }

        return allExercises.map(ex => ex.name);
    }
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WorkoutRenderManager;
}

console.log('📦 Workout Render Manager loaded');
