/**
 * Ghost Gym - Workout Card Component
 * Reusable workout card with configurable actions and display options
 * @version 1.0.0
 */

class WorkoutCard {
    constructor(workout, config = {}) {
        this.workout = workout;
        this.config = {
            // Display options
            showCreator: false,
            showStats: false,
            showTags: true,
            showDescription: false,
            showExercisePreview: false,
            showMuscleGroups: true, // Show auto-generated muscle group summary

            // Action buttons (only primary CTA shown as button)
            actions: [],

            // Dropdown menu actions (Edit, Delete, View Details go here)
            dropdownActions: ['edit', 'delete'], // Default dropdown actions

            // Delete mode (checkbox selection for batch delete)
            deleteMode: false,
            onDelete: null,
            onSelectionChange: null, // Callback: (workoutId, isSelected) => {}
            isSelected: false,       // Current selection state

            // Custom metadata
            customMetadata: null,

            // Callbacks
            onCardClick: null,
            onViewDetails: null, // Optional view details callback for dropdown

            // Favorite/Save button options
            showFavorite: true,  // Show favorite heart (default true)
            onSave: null,        // Save callback for public workouts
            onSaveAndEdit: null, // Save and open in editor callback for public workouts

            ...config
        };

        this.element = null;
    }
    
    /**
     * Render the workout card
     * @returns {HTMLElement} The card element
     */
    render() {
        const workoutData = this.workout.workout_data || this.workout;
        const isArchived = workoutData.is_archived || false;
        let cardClass = this.config.deleteMode ? 'card workout-list-card delete-mode' : 'card workout-list-card';
        if (isArchived) cardClass += ' archived-card';

        const card = document.createElement('div');
        card.className = cardClass;
        card.setAttribute('data-workout-id', this.workout.id);
        if (isArchived) card.style.opacity = '0.7';
        
        card.innerHTML = `
            <div class="card-body position-relative">
                ${this._renderDeleteModeCheckbox()}
                ${this._renderDropdownMenu()}
                ${this._renderFavoriteButton()}
                ${this._renderHeader()}
                ${this._renderMetadata()}
                ${this._renderDescription()}
                ${this._renderExercisePreview()}
                ${this._renderTags()}
                ${this._renderStatsBar()}
                ${this._renderFooter()}
            </div>
        `;
        
        this.element = card;
        this._attachEventListeners();
        
        return card;
    }
    
    /**
     * Render dropdown menu (3 dots) with configurable actions
     */
    _renderDropdownMenu() {
        if (this.config.deleteMode) return '';

        const workoutData = this.workout.workout_data || this.workout;
        const isArchived = workoutData.is_archived || false;

        // Archived workouts get a different menu: Restore + Permanently Delete
        if (isArchived) {
            const workoutName = (workoutData.name || this.workout.name || 'Untitled Workout').replace(/'/g, "\\'").replace(/"/g, '&quot;');
            return `
                <div class="dropdown position-absolute" style="top: 8px; right: 8px; z-index: 1050;">
                    <button class="btn btn-icon btn-card-menu" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                        <i class="bx bx-dots-vertical-rounded"></i>
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end">
                        <li>
                            <a class="dropdown-item" href="javascript:void(0);" data-action="restore">
                                <i class="bx bx-undo me-2"></i>Restore
                            </a>
                        </li>
                        <li><hr class="dropdown-divider"></li>
                        <li>
                            <a class="dropdown-item text-danger" href="javascript:void(0);" data-action="permanent-delete">
                                <i class="bx bx-trash me-2"></i>Permanently Delete
                            </a>
                        </li>
                    </ul>
                </div>
            `;
        }

        const dropdownActions = this.config.dropdownActions || ['edit', 'delete'];
        let menuItems = '';

        // Build menu items based on configuration
        if (dropdownActions.includes('view') && this.config.onViewDetails) {
            menuItems += `
                    <li>
                        <a class="dropdown-item" href="javascript:void(0);" data-action="view-details">
                            <i class="bx bx-show me-2"></i>View Details
                        </a>
                    </li>`;
        }

        if (dropdownActions.includes('history')) {
            const historyAction = this.config.actions.find(a => a.id === 'history');
            if (historyAction) {
                menuItems += `
                    <li>
                        <a class="dropdown-item" href="javascript:void(0);" data-action="history">
                            <i class="bx bx-history me-2"></i>History
                        </a>
                    </li>`;
            }
        }

        if (dropdownActions.includes('edit')) {
            menuItems += `
                    <li>
                        <a class="dropdown-item" href="javascript:void(0);" data-action="edit">
                            <i class="bx bx-edit me-2"></i>Edit
                        </a>
                    </li>`;
        }

        if (dropdownActions.includes('duplicate')) {
            menuItems += `
                    <li>
                        <a class="dropdown-item" href="javascript:void(0);" data-action="duplicate">
                            <i class="bx bx-copy me-2"></i>Duplicate
                        </a>
                    </li>`;
        }

        if (dropdownActions.includes('share')) {
            menuItems += `
                    <li>
                        <a class="dropdown-item" href="javascript:void(0);" data-action="share">
                            <i class="bx bx-share-alt me-2"></i>Share
                        </a>
                    </li>`;
        }

        // Save to my workouts (for public workouts)
        if (dropdownActions.includes('save') && this.config.onSave) {
            menuItems += `
                    <li>
                        <a class="dropdown-item" href="javascript:void(0);" data-action="save">
                            <i class="bx bx-download me-2"></i>Save to My Workouts
                        </a>
                    </li>`;
        }

        // Copy and Edit (for public workouts)
        if (dropdownActions.includes('save-and-edit') && this.config.onSaveAndEdit) {
            menuItems += `
                    <li>
                        <a class="dropdown-item" href="javascript:void(0);" data-action="save-and-edit">
                            <i class="bx bx-edit-alt me-2"></i>Copy and Edit
                        </a>
                    </li>`;
        }

        if (dropdownActions.includes('delete')) {
            // Add divider before archive/delete if there are other items
            if (menuItems) {
                menuItems += `<li><hr class="dropdown-divider"></li>`;
            }
            menuItems += `
                    <li>
                        <a class="dropdown-item text-danger" href="javascript:void(0);" data-action="delete">
                            <i class="bx bx-archive-in me-2"></i>Archive
                        </a>
                    </li>`;
        }

        return `
            <div class="dropdown position-absolute" style="top: 8px; right: 8px; z-index: 1050;">
                <button class="btn btn-icon btn-card-menu" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                    <i class="bx bx-dots-vertical-rounded"></i>
                </button>
                <ul class="dropdown-menu dropdown-menu-end">${menuItems}
                </ul>
            </div>
        `;
    }

    /**
     * Render favorite heart toggle button or save button
     * Positioned to the left of the dropdown menu
     */
    _renderFavoriteButton() {
        // Don't show for starter template or in delete mode
        if (this.workout.isStarterTemplate || this.config.deleteMode) return '';

        // For public workouts (has onSave), show copy/save button instead of favorite
        if (this.config.onSave) {
            return `
                <button class="btn btn-icon btn-card-menu save-workout-btn"
                        data-workout-id="${this.workout.id}"
                        title="Save to My Workouts"
                        style="position: absolute; top: 8px; right: 44px; z-index: 1050;">
                    <i class="bx bx-bookmark-plus"></i>
                </button>
            `;
        }

        // Don't show favorite if explicitly disabled
        if (!this.config.showFavorite) return '';

        const workoutData = this.workout.workout_data || this.workout;
        const isFavorite = workoutData.is_favorite || false;
        const iconClass = isFavorite ? 'bxs-heart' : 'bx-heart';
        const colorClass = isFavorite ? 'text-danger' : '';

        return `
            <button class="btn btn-icon btn-card-menu favorite-toggle ${colorClass}"
                    data-workout-id="${this.workout.id}"
                    data-is-favorite="${isFavorite}"
                    title="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}"
                    style="position: absolute; top: 8px; right: 44px; z-index: 1050;">
                <i class="bx ${iconClass}"></i>
            </button>
        `;
    }

    /**
     * Render delete mode checkbox on the left side of the card
     */
    _renderDeleteModeCheckbox() {
        if (!this.config.deleteMode) return '';

        const isSelected = this.config.isSelected || false;
        const checkedAttr = isSelected ? 'checked' : '';

        return `
            <div class="delete-mode-checkbox position-absolute" style="top: 12px; left: 12px; z-index: 1050;">
                <input type="checkbox"
                       class="form-check-input workout-select-checkbox"
                       id="select-${this.workout.id}"
                       ${checkedAttr}
                       style="width: 1.25rem; height: 1.25rem; cursor: pointer;">
            </div>
        `;
    }

    /**
     * Render card header (title)
     */
    _renderHeader() {
        const workoutData = this.workout.workout_data || this.workout;
        const name = workoutData.name || this.workout.name || 'Untitled Workout';
        const isArchived = workoutData.is_archived || false;
        const isTabata = (workoutData.workout_type || this.workout.workout_type) === 'tabata';

        // Add left padding when in delete mode to accommodate checkbox
        const paddingLeft = this.config.deleteMode ? 'padding-left: 32px;' : '';
        const archivedBadge = isArchived ? ' <span class="badge bg-label-secondary badge-sm ms-1"><i class="bx bx-archive bx-xs"></i> Archived</span>' : '';
        const tabataBadge = isTabata ? ' <span class="badge bg-label-primary badge-sm ms-1" title="Tabata workout"><i class="bx bx-time-five bx-xs"></i> Tabata</span>' : '';

        return `
            <h5 class="card-title mb-2" style="${paddingLeft}">${this._escapeHtml(name)}${tabataBadge}${archivedBadge}</h5>
        `;
    }
    
    /**
     * Render metadata - clean single line with exercise count and estimated duration
     */
    _renderMetadata() {
        const workoutData = this.workout.workout_data || this.workout;
        const totalExercises = this._getTotalExerciseCount(workoutData);
        const estimatedMinutes = this._getEstimatedDuration(workoutData);

        let html = `
            <div class="workout-meta mb-2">
                ${totalExercises} ${totalExercises === 1 ? 'exercise' : 'exercises'} • ~${estimatedMinutes} min
            </div>
        `;

        // Show creator for public workouts
        if (this.config.showCreator && this.workout.creator_name) {
            const creatorName = this._escapeHtml(this.workout.creator_name);
            const displayName = creatorName.startsWith('@') ? creatorName : `@${creatorName}`;
            html += `
                <p class="creator-badge mb-2">${displayName}</p>
            `;
        }

        // Allow custom metadata injection
        if (this.config.customMetadata) {
            html += this.config.customMetadata(this.workout);
        }

        return html;
    }

    /**
     * Render muscle group summary - DEPRECATED
     * Now integrated into _renderStatsBar() via _getMuscleGroupsHtml()
     * Kept for backwards compatibility if needed
     */
    _renderMuscleGroups() {
        const html = this._getMuscleGroupsHtml();
        if (!html) return '';
        return `<div class="muscle-group-summary mb-2">${html}</div>`;
    }

    /**
     * Get estimated workout duration in minutes
     * @returns {number} Estimated duration (~5 min per exercise)
     */
    _getEstimatedDuration(workoutData) {
        const totalExercises = this._getTotalExerciseCount(workoutData);
        return totalExercises * 5; // ~5 min per exercise baseline
    }
    
    /**
     * Render description preview
     */
    _renderDescription() {
        if (!this.config.showDescription) return '';
        
        const workoutData = this.workout.workout_data || this.workout;
        const description = workoutData.description || this.workout.description;
        
        if (!description) return '';
        
        const preview = description.length > 100 
            ? description.substring(0, 100) + '...' 
            : description;
        
        return `
            <p class="card-text text-muted small mb-2" style="min-height: 2.2em; line-height: 1.3;">
                ${this._escapeHtml(preview)}
            </p>
        `;
    }
    
    /**
     * Render tags - truncated text, max 2 lines
     */
    _renderTags() {
        if (!this.config.showTags) return '';

        const workoutData = this.workout.workout_data || this.workout;
        const tags = workoutData.tags || this.workout.tags || [];

        // Don't show anything if no tags (cleaner look)
        if (tags.length === 0) return '';

        // Truncate tag text to 10 chars
        const truncateTag = (tag) => {
            return tag.length > 10 ? tag.substring(0, 10) + '…' : tag;
        };

        // Show up to 6 tags (typically fits 2 lines), then +N for rest
        const maxVisible = 6;
        const visibleTags = tags.slice(0, maxVisible);
        const remainingCount = tags.length - maxVisible;

        return `
            <div class="workout-card-tags d-flex gap-1 flex-wrap mb-2">
                ${visibleTags.map(tag =>
                    `<span class="badge bg-label-secondary badge-sm" title="${this._escapeHtml(tag)}">${this._escapeHtml(truncateTag(tag))}</span>`
                ).join('')}
                ${remainingCount > 0 ? `<span class="badge bg-label-secondary badge-sm">+${remainingCount}</span>` : ''}
            </div>
        `;
    }
    
    /**
     * Render exercise preview - compact hint showing top 2 exercises (no bullets)
     */
    _renderExercisePreview() {
        if (!this.config.showExercisePreview) return '';

        const workoutData = this.workout.workout_data || this.workout;
        const exercises = window.ExerciseDataUtils
            ? ExerciseDataUtils.getExerciseNames(workoutData)
            : (() => {
                const names = [];
                (workoutData.exercise_groups || []).forEach(group => {
                    if (group.exercises) Object.values(group.exercises).forEach(n => { if (n) names.push(n); });
                });
                return names;
            })();

        if (exercises.length === 0) {
            return `
                <div class="exercise-preview mb-2">
                    <small class="text-muted"><i class="bx bx-dumbbell me-1"></i>No exercises listed</small>
                </div>
            `;
        }

        // Show first 2 exercises only (hint, not full list)
        const maxPreview = 2;
        const displayExercises = exercises.slice(0, maxPreview);
        const remaining = exercises.length - displayExercises.length;

        return `
            <div class="exercise-preview mb-2">
                <div class="exercise-preview-list">
                    ${displayExercises.map(ex =>
                        `<div class="exercise-preview-item text-truncate">${this._escapeHtml(ex)}</div>`
                    ).join('')}
                </div>
                ${remaining > 0 ? `<small class="exercise-preview-more text-muted">+${remaining} more</small>` : ''}
            </div>
        `;
    }
    
    /**
     * Render combined stats bar (muscle groups + view/save stats)
     * Fixed to bottom of card, above action button
     */
    _renderStatsBar() {
        const muscleGroupsHtml = this._getMuscleGroupsHtml();
        const statsHtml = this._getStatsHtml();

        // If nothing to show, return empty
        if (!muscleGroupsHtml && !statsHtml) return '';

        return `
            <div class="workout-card-stats-bar mt-auto pt-2">
                ${muscleGroupsHtml ? `<div class="stats-bar-muscles">${muscleGroupsHtml}</div>` : ''}
                ${statsHtml ? `<div class="stats-bar-counts">${statsHtml}</div>` : ''}
            </div>
        `;
    }

    /**
     * Get muscle groups HTML for stats bar
     */
    _getMuscleGroupsHtml() {
        if (!this.config.showMuscleGroups) return '';
        if (!window.muscleGroupSummaryService) return '';

        const workoutData = this.workout.workout_data || this.workout;
        const exerciseGroups = window.ExerciseDataUtils
            ? ExerciseDataUtils.getExerciseGroups(workoutData)
            : (workoutData.exercise_groups || []);
        const summary = window.muscleGroupSummaryService.forCard(exerciseGroups);

        if (summary.totalExercises === 0 || !summary.displayText) return '';

        return `<small class="text-muted"><span class="stats-bar-label">Targets:</span> ${this._escapeHtml(summary.displayText)}</small>`;
    }

    /**
     * Get view/save stats HTML for stats bar
     */
    _getStatsHtml() {
        if (!this.config.showStats) return '';

        const stats = this.workout.stats || {};
        const viewCount = stats.view_count || 0;
        const saveCount = stats.save_count || 0;

        return `
            <div class="status-item">
                <i class="bx bx-show"></i>
                <span>${viewCount}</span>
            </div>
            <div class="status-item">
                <i class="bx bx-bookmark"></i>
                <span>${saveCount}</span>
            </div>
        `;
    }

    /**
     * Render stats (views, saves) - DEPRECATED, use _renderStatsBar()
     */
    _renderStats() {
        if (!this.config.showStats) return '';

        const stats = this.workout.stats || {};
        const viewCount = stats.view_count || 0;
        const saveCount = stats.save_count || 0;

        return `
            <div class="workout-card-status-row mt-auto pt-2">
                <div class="status-item">
                    <i class="bx bx-show"></i>
                    <span>${viewCount}</span>
                </div>
                <div class="status-item">
                    <i class="bx bx-bookmark"></i>
                    <span>${saveCount}</span>
                </div>
            </div>
        `;
    }
    
    /**
     * Render footer - only renders container if there are actions to show
     */
    _renderFooter() {
        const actionsHtml = this._renderActions();
        if (!actionsHtml) return '';

        return `
            <div class="card-footer-content mt-auto">
                ${actionsHtml}
            </div>
        `;
    }

    /**
     * Render action buttons - simplified to show only primary CTA
     * Secondary actions (edit, view, history) moved to dropdown menu
     * Supports smart button states: never_started, in_progress, completed
     */
    _renderActions() {
        // In delete mode, checkbox is rendered in header area, not footer
        if (this.config.deleteMode) {
            return '';
        }

        if (this.config.actions.length === 0) return '';

        // Filter to get only primary actions (not edit, view, history which go to dropdown)
        const dropdownActionIds = this.config.dropdownActions || ['edit', 'delete'];
        const primaryActions = this.config.actions.filter(action =>
            !dropdownActionIds.includes(action.id) && action.id !== 'edit'
        );

        if (primaryActions.length === 0) return '';

        // Get session state if callback provided
        let sessionState = 'never_started';
        if (this.config.getSessionState) {
            sessionState = this.config.getSessionState(this.workout.id) || 'never_started';
        }

        // Single primary CTA - with smart state labels
        if (primaryActions.length === 1) {
            const action = primaryActions[0];
            const buttonConfig = this._getButtonConfigForState(action, sessionState);

            return `
                <button class="btn btn-${buttonConfig.variant} btn-card-action w-100" data-action="${action.id}">
                    <i class="bx ${buttonConfig.icon} me-1"></i>${buttonConfig.label}
                </button>
            `;
        }

        // Multiple primary actions - show as button group (rare case)
        return `
            <div class="btn-group w-100" role="group">
                ${primaryActions.map(action => `
                    <button class="btn btn-${action.variant} btn-card-action" data-action="${action.id}">
                        ${action.icon ? `<i class="bx ${action.icon} me-1"></i>` : ''}${action.label}
                    </button>
                `).join('')}
            </div>
        `;
    }

    /**
     * Get button configuration based on session state
     * @param {Object} action - The base action config
     * @param {string} sessionState - 'never_started', 'in_progress', or 'completed'
     * @returns {Object} Button config with label, icon, variant
     */
    _getButtonConfigForState(action, sessionState) {
        // Only apply state logic to 'start' action
        if (action.id !== 'start') {
            return {
                label: action.label,
                icon: action.icon || 'bx-play',
                variant: action.variant || 'primary'
            };
        }

        switch (sessionState) {
            case 'in_progress':
                return {
                    label: 'Resume Workout',
                    icon: 'bx-play-circle',
                    variant: 'warning'
                };
            case 'completed':
                return {
                    label: 'Completed',
                    icon: 'bx-check-circle',
                    variant: 'success'
                };
            case 'never_started':
            default:
                return {
                    label: 'Start Workout',
                    icon: 'bx-play',
                    variant: 'primary'
                };
        }
    }
    
    /**
     * Attach event listeners
     */
    _attachEventListeners() {
        if (!this.element) return;

        // Card click handler (tap card to view details)
        if (this.config.onCardClick) {
            this.element.addEventListener('click', (e) => {
                // Don't trigger if in delete mode (checkbox selection takes over)
                if (this.config.deleteMode) {
                    return;
                }
                // Don't trigger if clicking a button, dropdown, link, or form-check
                if (!e.target.closest('button') && !e.target.closest('.dropdown') && !e.target.closest('a') && !e.target.closest('.form-check')) {
                    this.config.onCardClick(this.workout, e);
                }
            });
        }

        // Action button and dropdown handlers
        const actionElements = this.element.querySelectorAll('[data-action]');
        actionElements.forEach(element => {
            element.addEventListener('click', (e) => {
                e.stopPropagation();
                const actionId = element.dataset.action;

                if (actionId === 'delete') {
                    // Enter delete mode with this card pre-selected
                    if (window.enterDeleteModeWithSelection) {
                        window.enterDeleteModeWithSelection(this.workout.id);
                    } else if (this.config.onDelete) {
                        // Fallback to legacy delete behavior
                        const workoutData = this.workout.workout_data || this.workout;
                        const name = workoutData.name || this.workout.name || 'Untitled Workout';
                        this.config.onDelete(this.workout.id, name);
                    }
                } else if (actionId === 'restore') {
                    // Restore archived workout
                    const workoutData = this.workout.workout_data || this.workout;
                    const name = workoutData.name || this.workout.name || 'Untitled Workout';
                    if (window.restoreWorkoutFromArchive) {
                        window.restoreWorkoutFromArchive(this.workout.id, name);
                    }
                } else if (actionId === 'permanent-delete') {
                    // Permanently delete archived workout
                    const workoutData = this.workout.workout_data || this.workout;
                    const name = workoutData.name || this.workout.name || 'Untitled Workout';
                    if (window.permanentDeleteWorkout) {
                        window.permanentDeleteWorkout(this.workout.id, name);
                    }
                } else if (actionId === 'view-details' && this.config.onViewDetails) {
                    // View Details from dropdown menu
                    this.config.onViewDetails(this.workout);
                } else if (actionId === 'edit') {
                    // Edit action from dropdown - look in full actions array
                    const editAction = this.config.actions.find(a => a.id === 'edit');
                    if (editAction && editAction.onClick) {
                        editAction.onClick(this.workout);
                    }
                } else if (actionId === 'history') {
                    // History action from dropdown
                    const historyAction = this.config.actions.find(a => a.id === 'history');
                    if (historyAction && historyAction.onClick) {
                        historyAction.onClick(this.workout);
                    }
                } else if (actionId === 'duplicate') {
                    // Duplicate action from dropdown
                    const duplicateAction = this.config.actions.find(a => a.id === 'duplicate');
                    if (duplicateAction && duplicateAction.onClick) {
                        duplicateAction.onClick(this.workout);
                    }
                } else if (actionId === 'share') {
                    // Share action from dropdown
                    const shareAction = this.config.actions.find(a => a.id === 'share');
                    if (shareAction && shareAction.onClick) {
                        shareAction.onClick(this.workout);
                    }
                } else if (actionId === 'save' && this.config.onSave) {
                    // Save to my workouts (public workouts)
                    this.config.onSave(this.workout);
                } else if (actionId === 'save-and-edit' && this.config.onSaveAndEdit) {
                    // Copy and edit (public workouts)
                    this.config.onSaveAndEdit(this.workout);
                } else {
                    // Other actions (like 'start')
                    const action = this.config.actions.find(a => a.id === actionId);
                    if (action && action.onClick) {
                        action.onClick(this.workout);
                    }
                }
            });
        });

        // Favorite toggle handler
        const favoriteToggle = this.element.querySelector('.favorite-toggle');
        if (favoriteToggle) {
            favoriteToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const workoutId = favoriteToggle.dataset.workoutId;
                const currentState = favoriteToggle.dataset.isFavorite === 'true';
                // Call global handler
                if (window.toggleWorkoutFavorite) {
                    window.toggleWorkoutFavorite(e, workoutId, currentState);
                }
            });
        }

        // Save button handler (for public workouts - copy icon)
        const saveBtn = this.element.querySelector('.save-workout-btn');
        if (saveBtn && this.config.onSave) {
            saveBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.config.onSave(this.workout);
            });
        }

        // Checkbox selection handler (for batch delete mode)
        const checkbox = this.element.querySelector('.workout-select-checkbox');
        if (checkbox) {
            checkbox.addEventListener('change', (e) => {
                e.stopPropagation();
                this.config.isSelected = e.target.checked;
                this.element.classList.toggle('selected', e.target.checked);
                if (this.config.onSelectionChange) {
                    this.config.onSelectionChange(this.workout.id, e.target.checked);
                }
            });
        }

        // Make entire card clickable in delete mode to toggle checkbox
        if (this.config.deleteMode) {
            this.element.addEventListener('click', (e) => {
                // Don't toggle if clicking checkbox itself
                if (!e.target.closest('.delete-mode-checkbox') && !e.target.classList.contains('workout-select-checkbox')) {
                    const cb = this.element.querySelector('.workout-select-checkbox');
                    if (cb) {
                        cb.checked = !cb.checked;
                        cb.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
            });
        }
    }
    
    /**
     * Set delete mode
     * @param {boolean} enabled
     */
    setDeleteMode(enabled) {
        this.config.deleteMode = enabled;

        // Clear selection state when exiting delete mode
        if (!enabled) {
            this.config.isSelected = false;
        }

        if (this.element) {
            // Save reference to OLD element before render() updates this.element
            const oldElement = this.element;
            // Full re-render to properly show/hide dropdown, favorite, checkbox
            const newElement = this.render();
            // Replace OLD element with NEW element in DOM
            oldElement.replaceWith(newElement);
        }
    }
    
    /**
     * Update workout data
     * @param {Object} workout
     */
    update(workout) {
        this.workout = workout;

        if (this.element) {
            const oldElement = this.element;
            const newElement = this.render();
            oldElement.replaceWith(newElement);
        }
    }
    
    /**
     * Destroy the card
     */
    destroy() {
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
    }
    
    /**
     * Get total exercise count
     */
    _getTotalExerciseCount(workoutData) {
        if (window.ExerciseDataUtils) {
            return ExerciseDataUtils.getExerciseCount(workoutData);
        }
        let count = 0;
        (workoutData.exercise_groups || []).forEach(group => {
            count += Object.keys(group.exercises || {}).length;
        });
        return count;
    }
    
    /**
     * Escape HTML to prevent XSS
     */
    _escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Export for global use
window.WorkoutCard = WorkoutCard;

/**
 * Pick the right "start" URL for a workout: tabata workouts run in the
 * Tabata Kettlebell timer page, everything else in the regular workout-mode page.
 *
 * Accepts either a workout object or a workout id (string). When given an id,
 * looks the workout up in window.ffn.workouts so callers that only have an id
 * can still route correctly without being rewritten.
 */
window.getWorkoutStartUrl = function (workoutOrId, extraQuery = '') {
    if (!workoutOrId) return 'workout-mode.html';

    let workout = workoutOrId;
    let id;
    if (typeof workoutOrId === 'string') {
        id = workoutOrId;
        workout = (window.ffn?.workouts || []).find((w) => w.id === id) || null;
    } else {
        const data = workoutOrId.workout_data || workoutOrId;
        id = workoutOrId.id || data.id;
    }

    const data = workout ? (workout.workout_data || workout) : null;
    const isTabata = data && (data.workout_type || workout.workout_type) === 'tabata';
    const sep = extraQuery ? `&${extraQuery}` : '';
    return isTabata
        ? `tabata-kettlebell.html?workout_id=${id}${sep}`
        : `workout-mode.html?id=${id}${sep}`;
};

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WorkoutCard;
}

console.log('📦 WorkoutCard component loaded');