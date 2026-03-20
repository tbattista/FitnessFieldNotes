/**
 * Ghost Gym - Program Card Component
 * Clean, modern program card following WorkoutCard patterns
 * @version 2.0.0
 */

class ProgramCard {
    constructor(program, config = {}) {
        this.program = program;
        this.config = {
            // Display options
            showStats: true,
            showTags: true,
            showDescription: true,
            showDifficulty: true,
            showDuration: true,

            // Active program state
            isActiveProgram: false,
            onSetActive: null,

            // Dropdown menu actions
            dropdownActions: ['edit', 'delete'],

            // Delete mode
            deleteMode: false,
            onDelete: null,

            // Selection mode (for batch operations)
            isSelected: false,
            onSelectionChange: null,

            // Callbacks
            onCardClick: null,
            onEdit: null,

            // Workouts reference for calculating stats
            workouts: [],

            ...config
        };

        this.element = null;
    }

    /**
     * Render the program card
     * @returns {HTMLElement} The card element
     */
    render() {
        const card = document.createElement('div');

        // Build card classes
        let cardClass = 'card program-card h-100';
        if (this.config.isActiveProgram) {
            cardClass += ' active-program';
        }
        if (this.config.deleteMode) {
            cardClass += ' delete-mode';
            if (this.config.isSelected) {
                cardClass += ' selected';
            }
        }

        card.className = cardClass;
        card.setAttribute('data-program-id', this.program.id);

        card.innerHTML = `
            <div class="card-body d-flex flex-column position-relative">
                ${this._renderDropdownMenu()}
                ${this._renderSelectionCheckbox()}
                ${this._renderHeader()}
                ${this._renderStats()}
                ${this._renderDescription()}
                ${this._renderTags()}
            </div>
        `;

        this.element = card;
        this._attachEventListeners();

        return card;
    }

    /**
     * Render dropdown menu (3 dots)
     */
    _renderDropdownMenu() {
        if (this.config.deleteMode) return '';

        const dropdownActions = this.config.dropdownActions || ['edit', 'delete'];
        let menuItems = '';

        // Active program toggle (always shown if callback exists)
        if (this.config.onSetActive) {
            const isActive = this.config.isActiveProgram;
            menuItems += `
                <li>
                    <a class="dropdown-item" href="javascript:void(0);" data-action="toggle-active">
                        <i class="bx ${isActive ? 'bxs-pin' : 'bx-pin'} me-2"></i>${isActive ? 'Remove as Active' : 'Set as Active Program'}
                    </a>
                </li>`;
        }

        if (dropdownActions.includes('edit')) {
            menuItems += `
                <li>
                    <a class="dropdown-item" href="javascript:void(0);" data-action="edit">
                        <i class="bx bx-edit me-2"></i>Edit Details
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

        if (dropdownActions.includes('generate')) {
            menuItems += `
                <li>
                    <a class="dropdown-item" href="javascript:void(0);" data-action="generate">
                        <i class="bx bx-download me-2"></i>Generate PDF
                    </a>
                </li>`;
        }

        if (dropdownActions.includes('delete')) {
            if (menuItems) {
                menuItems += `<li><hr class="dropdown-divider"></li>`;
            }
            menuItems += `
                <li>
                    <a class="dropdown-item text-danger" href="javascript:void(0);" data-action="delete">
                        <i class="bx bx-trash me-2"></i>Delete
                    </a>
                </li>`;
        }

        return `
            <div class="dropdown position-absolute" style="top: 8px; right: 8px; z-index: 10;">
                <button class="btn btn-icon btn-sm btn-text-secondary rounded-circle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                    <i class="bx bx-dots-vertical-rounded"></i>
                </button>
                <ul class="dropdown-menu dropdown-menu-end">${menuItems}</ul>
            </div>
        `;
    }

    /**
     * Render selection checkbox (shown in delete mode for batch operations)
     */
    _renderSelectionCheckbox() {
        if (!this.config.deleteMode) {
            return '';
        }

        return `
            <div class="form-check position-absolute" style="top: 10px; left: 10px; z-index: 10;">
                <input class="form-check-input program-select-checkbox"
                       type="checkbox"
                       id="select-${this.program.id}"
                       style="width: 1.25rem; height: 1.25rem; cursor: pointer;"
                       ${this.config.isSelected ? 'checked' : ''}>
            </div>
        `;
    }

    /**
     * Render card header (title with difficulty badge)
     */
    _renderHeader() {
        const name = this.program.name || 'Untitled Program';

        let difficultyBadge = '';
        if (this.config.showDifficulty && this.program.difficulty_level) {
            const difficultyConfig = {
                'beginner': { color: 'success', label: 'Beginner' },
                'intermediate': { color: 'warning', label: 'Intermediate' },
                'advanced': { color: 'danger', label: 'Advanced' }
            };
            const cfg = difficultyConfig[this.program.difficulty_level] || { color: 'secondary', label: this.program.difficulty_level };
            difficultyBadge = `<span class="badge bg-${cfg.color} badge-sm">${cfg.label}</span>`;
        }

        // Duration badge
        let durationBadge = '';
        if (this.config.showDuration && this.program.duration_weeks) {
            durationBadge = `<span class="badge bg-label-secondary badge-sm">${this.program.duration_weeks}w</span>`;
        }

        const activeBadge = this.config.isActiveProgram
            ? '<span class="badge bg-primary badge-sm ms-1"><i class="bx bxs-pin me-1" style="font-size:0.65rem"></i>Active</span>'
            : '';

        return `
            <div class="mb-2" style="padding-right: 2rem; ${this.config.deleteMode ? 'padding-left: 2rem;' : ''}">
                <h6 class="card-title mb-1 text-truncate" title="${this._escapeHtml(name)}">
                    ${this._escapeHtml(name)}${activeBadge}
                </h6>
                <div class="d-flex gap-1 flex-wrap">
                    ${difficultyBadge}
                    ${durationBadge}
                </div>
            </div>
        `;
    }

    /**
     * Render stats (workouts and exercises count)
     */
    _renderStats() {
        if (!this.config.showStats) return '';

        const workoutCount = this.program.workouts?.length || 0;
        const totalExercises = this._getTotalExerciseCount();

        return `
            <div class="d-flex gap-3 mb-2 text-muted small">
                <span>
                    <i class="bx bx-dumbbell me-1"></i>${workoutCount} ${workoutCount === 1 ? 'workout' : 'workouts'}
                </span>
                <span>
                    <i class="bx bx-list-ul me-1"></i>${totalExercises} exercises
                </span>
            </div>
        `;
    }

    /**
     * Render description preview
     */
    _renderDescription() {
        if (!this.config.showDescription) return '';

        const description = this.program.description;
        if (!description) return '';

        const preview = description.length > 80
            ? description.substring(0, 80) + '...'
            : description;

        return `
            <p class="card-text text-muted small mb-2 line-clamp-2">
                ${this._escapeHtml(preview)}
            </p>
        `;
    }

    /**
     * Render tags
     */
    _renderTags() {
        if (!this.config.showTags) return '';

        const tags = this.program.tags || [];
        if (tags.length === 0) return '';

        // Show max 2 tags to keep it clean
        return `
            <div class="d-flex gap-1 flex-wrap mb-2">
                ${tags.slice(0, 2).map(tag =>
                    `<span class="badge bg-label-primary badge-sm">${this._escapeHtml(tag)}</span>`
                ).join('')}
                ${tags.length > 2 ? `<span class="badge bg-label-secondary badge-sm">+${tags.length - 2}</span>` : ''}
            </div>
        `;
    }

    /**
     * Attach event listeners
     */
    _attachEventListeners() {
        if (!this.element) return;

        // Checkbox selection handler (for batch delete mode)
        const checkbox = this.element.querySelector('.program-select-checkbox');
        if (checkbox) {
            checkbox.addEventListener('change', (e) => {
                e.stopPropagation();
                this.config.isSelected = e.target.checked;

                if (this.config.isSelected) {
                    this.element.classList.add('selected');
                } else {
                    this.element.classList.remove('selected');
                }

                // Notify grid of selection change if callback exists
                if (this.config.onSelectionChange) {
                    this.config.onSelectionChange(this.program.id, this.config.isSelected);
                }
            });
        }

        // Card click handler
        if (this.config.deleteMode && checkbox) {
            // In delete mode, clicking card toggles checkbox
            this.element.addEventListener('click', (e) => {
                if (!e.target.closest('button') && !e.target.closest('.form-check') && !e.target.closest('.dropdown')) {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change'));
                }
            });
        } else if (this.config.onCardClick) {
            this.element.addEventListener('click', (e) => {
                // Don't trigger if clicking a button, checkbox, or dropdown
                if (!e.target.closest('button') && !e.target.closest('.form-check') && !e.target.closest('.dropdown')) {
                    this.config.onCardClick(this.program, e);
                }
            });
        }

        // Dropdown action handlers
        const dropdownItems = this.element.querySelectorAll('.dropdown-item[data-action]');
        dropdownItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = item.dataset.action;

                switch (action) {
                    case 'edit':
                        if (this.config.onEdit) {
                            this.config.onEdit(this.program);
                        }
                        break;
                    case 'delete':
                        if (this.config.onDelete) {
                            const name = this.program.name || 'Untitled Program';
                            this.config.onDelete(this.program.id, name);
                        }
                        break;
                    case 'duplicate':
                        if (this.config.onDuplicate) {
                            this.config.onDuplicate(this.program);
                        }
                        break;
                    case 'generate':
                        if (this.config.onGenerate) {
                            this.config.onGenerate(this.program);
                        }
                        break;
                    case 'toggle-active':
                        if (this.config.onSetActive) {
                            this.config.onSetActive(this.program, !this.config.isActiveProgram);
                        }
                        break;
                }
            });
        });
    }

    /**
     * Set delete mode
     * @param {boolean} enabled
     */
    setDeleteMode(enabled) {
        console.log('🗑️ ProgramCard.setDeleteMode:', enabled, 'element exists:', !!this.element);
        this.config.deleteMode = enabled;

        // Clear selection when exiting delete mode
        if (!enabled) {
            this.config.isSelected = false;
        }

        if (this.element) {
            const oldElement = this.element;
            console.log('🗑️ Old element in DOM:', document.body.contains(oldElement));
            const newElement = this.render();
            console.log('🗑️ New element has checkbox:', !!newElement.querySelector('.program-select-checkbox'));
            oldElement.replaceWith(newElement);
            console.log('🗑️ Replacement done, new element in DOM:', document.body.contains(this.element));
        }
    }

    /**
     * Update program data
     * @param {Object} program
     */
    update(program) {
        this.program = program;

        if (this.element) {
            // Save old element reference before render() overwrites this.element
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
     * Get total exercise count from all workouts in program
     */
    _getTotalExerciseCount() {
        let count = 0;

        if (this.program.workouts && this.config.workouts) {
            this.program.workouts.forEach(programWorkout => {
                const workout = this.config.workouts.find(w => w.id === programWorkout.workout_id);
                if (workout) {
                    if (window.ExerciseDataUtils) {
                        count += ExerciseDataUtils.getExerciseCount(workout);
                    } else {
                        (workout.exercise_groups || []).forEach(group => {
                            count += Object.keys(group.exercises || {}).length;
                        });
                    }
                }
            });
        }

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
window.ProgramCard = ProgramCard;

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProgramCard;
}

console.log('📦 ProgramCard component loaded (v2.0)');
