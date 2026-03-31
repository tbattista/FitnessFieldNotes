/**
 * Ghost Gym - Program Detail Offcanvas Component
 * Unified offcanvas for displaying program details with workout list
 * @version 1.0.0
 */

class ProgramDetailOffcanvas {
    constructor(config = {}) {
        this.config = {
            // Display options
            showStats: true,
            showDates: true,
            showDescription: true,

            // Footer actions
            actions: [],

            // Callbacks
            onAddWorkouts: null,
            onEditProgram: null,
            onRemoveWorkout: null,
            onReorderWorkouts: null,
            onGenerateDocument: null,

            // Workouts reference for displaying workout details
            workouts: [],

            ...config
        };

        this.currentProgram = null;
        this.offcanvasId = 'programDetailOffcanvas';
        this.offcanvasElement = null;
        this.bsOffcanvas = null;
        this.sortableInstance = null;

        this.initialize();
    }

    /**
     * Initialize the offcanvas
     */
    initialize() {
        this.createOffcanvasHTML();
        this.attachEventListeners();
        console.log('✅ ProgramDetailOffcanvas component initialized');
    }

    /**
     * Create offcanvas HTML
     */
    createOffcanvasHTML() {
        // Remove existing offcanvas if present
        const existing = document.getElementById(this.offcanvasId);
        if (existing) {
            existing.remove();
        }

        const offcanvasHTML = `
            <div class="offcanvas offcanvas-bottom offcanvas-bottom-base offcanvas-desktop-wide" tabindex="-1" id="${this.offcanvasId}" aria-labelledby="${this.offcanvasId}Label" data-bs-scroll="false">
                <div class="offcanvas-header flex-column">
                    <div class="offcanvas-grab-bar"></div>
                    <div class="d-flex align-items-center justify-content-between w-100">
                    <h5 class="offcanvas-title mb-0" id="${this.offcanvasId}Label">
                        <i class="bx bx-folder me-2"></i>
                        <span id="programDetailName">Program Details</span>
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
                    </div>
                </div>
                <div class="offcanvas-body" id="programDetailBody">
                    <!-- Loading state -->
                    <div id="programDetailLoading" class="text-center py-5">
                        <div class="spinner-border text-primary mb-3" role="status">
                            <span class="visually-hidden">Loading...</span>
                        </div>
                        <p class="text-muted">Loading program details...</p>
                    </div>

                    <!-- Content (hidden initially) -->
                    <div id="programDetailContent" style="display: none;">
                        <!-- Content will be rendered here -->
                    </div>
                </div>
                <div class="offcanvas-footer" id="programDetailFooter">
                    <!-- Action buttons will be rendered here -->
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', offcanvasHTML);
        this.offcanvasElement = document.getElementById(this.offcanvasId);
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // Listen for offcanvas hidden event to cleanup
        if (this.offcanvasElement) {
            this.offcanvasElement.addEventListener('hidden.bs.offcanvas', () => {
                this.destroySortable();
            });
        }
    }

    /**
     * Show offcanvas with program details
     * @param {Object} program
     */
    async show(program) {
        console.log('📋 Opening program detail offcanvas:', program.id);

        this.currentProgram = program;
        this.showLoadingState();

        // Initialize and show offcanvas
        if (!this.bsOffcanvas) {
            this.bsOffcanvas = new bootstrap.Offcanvas(this.offcanvasElement, { scroll: false });
        }
        this.bsOffcanvas.show();

        // Render program details
        this.renderProgramDetails(program);
    }

    /**
     * Hide offcanvas
     */
    hide() {
        if (this.bsOffcanvas) {
            this.bsOffcanvas.hide();
        }
    }

    /**
     * Render program details
     * @param {Object} program
     */
    renderProgramDetails(program) {
        // Update title
        document.getElementById('programDetailName').textContent = program.name || 'Untitled Program';

        // Render content
        const contentHTML = this._generateContentHTML(program);
        document.getElementById('programDetailContent').innerHTML = contentHTML;

        // Render footer actions
        this._renderFooterActions(program);

        // Initialize sortable for workout list
        this.initSortable();

        // Attach workout action listeners
        this._attachWorkoutListeners();

        // Show content
        this.showContent();

        // Load progress data asynchronously
        this._loadProgressSection(program);
    }

    /**
     * Generate content HTML
     */
    _generateContentHTML(program) {
        let html = '';

        // Metadata section
        html += '<div class="program-detail-meta mb-4">';

        // Difficulty and Duration badges
        const badges = [];
        if (program.difficulty_level) {
            const difficultyColors = {
                beginner: 'success',
                intermediate: 'warning',
                advanced: 'danger'
            };
            const color = difficultyColors[program.difficulty_level] || 'secondary';
            badges.push(`<span class="badge bg-label-${color}">${this._capitalize(program.difficulty_level)}</span>`);
        }
        if (program.duration_weeks) {
            badges.push(`<span class="badge bg-label-info">${program.duration_weeks} weeks</span>`);
        }

        if (badges.length > 0) {
            html += `<div class="mb-2">${badges.join(' ')}</div>`;
        }

        // Description
        if (this.config.showDescription && program.description) {
            html += `<p class="text-muted mb-2">${this._escapeHtml(program.description)}</p>`;
        }

        // Dates
        if (this.config.showDates) {
            html += `
                <div class="d-flex gap-3 mb-2 flex-wrap">
                    <span class="text-muted small">
                        <i class="bx bx-calendar me-1"></i>
                        Created: ${this._formatDate(program.created_date)}
                    </span>
                    <span class="text-muted small">
                        <i class="bx bx-time me-1"></i>
                        Modified: ${this._formatDate(program.modified_date)}
                    </span>
                </div>
            `;
        }

        // Stats
        if (this.config.showStats) {
            const workoutCount = program.workouts?.length || 0;
            const exerciseCount = this._calculateTotalExercises(program);
            html += `
                <div class="d-flex gap-3 mb-2">
                    <span class="text-muted small">
                        <i class="bx bx-dumbbell me-1"></i>
                        ${workoutCount} workout${workoutCount !== 1 ? 's' : ''}
                    </span>
                    <span class="text-muted small">
                        <i class="bx bx-list-ul me-1"></i>
                        ${exerciseCount} exercise${exerciseCount !== 1 ? 's' : ''}
                    </span>
                </div>
            `;
        }

        // Tags
        const tags = program.tags || [];
        if (tags.length > 0) {
            html += `
                <div class="mt-2">
                    ${tags.map(tag => `<span class="badge bg-label-secondary me-1">${this._escapeHtml(tag)}</span>`).join('')}
                </div>
            `;
        }

        html += '</div>';

        // Progress Section (loaded async after render)
        html += `<div id="programDetailProgress" class="mb-4"></div>`;

        // Workouts Section
        html += this._renderWorkoutsSection(program);

        return html;
    }

    /**
     * Load and render program progress section
     */
    async _loadProgressSection(program) {
        const container = document.getElementById('programDetailProgress');
        if (!container || !window.ProgramProgress) return;

        // Only show progress for authenticated users
        if (!window.authService?.isUserAuthenticated()) return;

        // Build workout name map
        const workoutDetailsMap = {};
        (program.workouts || []).forEach(pw => {
            const fullWorkout = this.config.workouts.find(w => w.id === pw.workout_id);
            if (fullWorkout) {
                workoutDetailsMap[pw.workout_id] = fullWorkout.name;
            }
        });

        const progressComponent = new window.ProgramProgress('programDetailProgress', {
            compact: false,
            showChecklist: true,
            showTracker: true,
            trackerDays: 45
        });

        await progressComponent.loadProgress(program, workoutDetailsMap);
    }

    /**
     * Render workouts section with draggable list
     */
    _renderWorkoutsSection(program) {
        const programWorkouts = program.workouts || [];

        let html = `
            <div class="program-workouts-section">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <h6 class="mb-0">
                        <i class="bx bx-list-ol me-1"></i>
                        Workouts
                    </h6>
                    <button class="btn btn-sm btn-primary" id="addWorkoutsBtn">
                        <i class="bx bx-plus-circle me-1"></i>Add Workouts
                    </button>
                </div>
        `;

        if (programWorkouts.length === 0) {
            html += `
                <div class="text-center py-4 border rounded">
                    <i class="bx bx-folder-open display-4 text-muted mb-2"></i>
                    <p class="text-muted mb-2">No workouts in this program yet</p>
                    <button class="btn btn-primary btn-sm" id="addFirstWorkoutBtn">
                        <i class="bx bx-plus-circle me-1"></i>Add Workouts
                    </button>
                </div>
            `;
        } else {
            html += `
                <small class="text-muted d-flex align-items-center gap-1 mb-2">
                    <i class="bx bx-info-circle"></i>
                    Hold and drag to reorder
                </small>
                <div class="workout-list-sortable" id="programWorkoutList">
                    ${programWorkouts.map((pw, index) => this._renderWorkoutChip(pw, index)).join('')}
                </div>
            `;
        }

        html += '</div>';
        return html;
    }

    /**
     * Render a workout chip (draggable item)
     */
    _renderWorkoutChip(programWorkout, index) {
        // Find full workout details from config.workouts
        const fullWorkout = this.config.workouts.find(w => w.id === programWorkout.workout_id);
        const workoutName = programWorkout.custom_name || fullWorkout?.name || 'Unknown Workout';
        const exerciseCount = window.ExerciseDataUtils ? ExerciseDataUtils.getGroupCount(fullWorkout || {}) : (fullWorkout?.exercise_groups?.length || 0);

        return `
            <div class="workout-chip" data-workout-id="${programWorkout.workout_id}" data-order="${index}">
                <div class="workout-chip-handle">
                    <i class="bx bx-grid-vertical"></i>
                </div>
                <span class="workout-chip-number">${index + 1}</span>
                <div class="workout-chip-content">
                    <span class="workout-chip-name">${this._escapeHtml(workoutName)}</span>
                    <span class="workout-chip-meta text-muted small">
                        ${exerciseCount} exercise${exerciseCount !== 1 ? 's' : ''}
                    </span>
                </div>
                <button class="workout-chip-remove btn btn-sm btn-icon" data-remove-workout="${programWorkout.workout_id}" title="Remove from program">
                    <i class="bx bx-x"></i>
                </button>
            </div>
        `;
    }

    /**
     * Initialize SortableJS for workout reordering
     */
    initSortable() {
        this.destroySortable();

        const listEl = document.getElementById('programWorkoutList');
        if (!listEl || typeof Sortable === 'undefined') return;

        this.sortableInstance = Sortable.create(listEl, {
            handle: '.workout-chip-handle',
            animation: 150,
            ghostClass: 'sortable-ghost',
            dragClass: 'sortable-drag',
            onEnd: (evt) => {
                this._handleReorder();
            }
        });
    }

    /**
     * Destroy SortableJS instance
     */
    destroySortable() {
        if (this.sortableInstance) {
            this.sortableInstance.destroy();
            this.sortableInstance = null;
        }
    }

    /**
     * Handle workout reorder
     */
    _handleReorder() {
        const listEl = document.getElementById('programWorkoutList');
        if (!listEl || !this.currentProgram) return;

        const chips = listEl.querySelectorAll('.workout-chip');
        const newOrder = Array.from(chips).map((chip, index) => ({
            workout_id: chip.dataset.workoutId,
            order_index: index
        }));

        // Update local program data
        this.currentProgram.workouts = this.currentProgram.workouts.map(pw => {
            const orderInfo = newOrder.find(o => o.workout_id === pw.workout_id);
            return {
                ...pw,
                order_index: orderInfo?.order_index ?? pw.order_index
            };
        }).sort((a, b) => a.order_index - b.order_index);

        // Trigger callback
        if (this.config.onReorderWorkouts) {
            this.config.onReorderWorkouts(this.currentProgram.id, newOrder);
        }
    }

    /**
     * Attach workout list event listeners
     */
    _attachWorkoutListeners() {
        // Add workouts button
        const addWorkoutsBtn = document.getElementById('addWorkoutsBtn');
        if (addWorkoutsBtn) {
            addWorkoutsBtn.addEventListener('click', () => {
                if (this.config.onAddWorkouts) {
                    this.config.onAddWorkouts(this.currentProgram);
                }
            });
        }

        // Add first workout button (empty state)
        const addFirstBtn = document.getElementById('addFirstWorkoutBtn');
        if (addFirstBtn) {
            addFirstBtn.addEventListener('click', () => {
                if (this.config.onAddWorkouts) {
                    this.config.onAddWorkouts(this.currentProgram);
                }
            });
        }

        // Remove workout buttons
        document.querySelectorAll('[data-remove-workout]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const workoutId = btn.dataset.removeWorkout;
                this._handleRemoveWorkout(workoutId);
            });
        });
    }

    /**
     * Handle remove workout from program
     */
    _handleRemoveWorkout(workoutId) {
        if (!this.currentProgram) return;

        const workout = this.config.workouts.find(w => w.id === workoutId);
        const workoutName = workout?.name || 'this workout';

        ffnModalManager.confirm('Remove Workout', `Remove "${workoutName}" from this program?`, () => {
            // Remove from local program data
            this.currentProgram.workouts = this.currentProgram.workouts.filter(
                pw => pw.workout_id !== workoutId
            );

            // Re-render the program details
            this.renderProgramDetails(this.currentProgram);

            // Trigger callback
            if (this.config.onRemoveWorkout) {
                this.config.onRemoveWorkout(this.currentProgram.id, workoutId);
            }
        }, { confirmText: 'Remove', confirmClass: 'btn-warning', size: 'sm' });
    }

    /**
     * Render footer actions
     */
    _renderFooterActions(program) {
        const footer = document.getElementById('programDetailFooter');
        if (!footer) return;

        if (this.config.actions.length === 0) {
            footer.style.display = 'none';
            return;
        }

        footer.style.display = 'block';

        // Separate primary and secondary actions
        const primaryActions = this.config.actions.filter(a => a.primary);
        const secondaryActions = this.config.actions.filter(a => !a.primary);

        let actionsHTML = '';

        if (primaryActions.length > 0 && secondaryActions.length > 0) {
            // Two-row layout: secondary on top, primary below
            actionsHTML = `
                <div class="d-flex gap-2 mb-2">
                    ${secondaryActions.map(action => `
                        <button type="button"
                                class="btn btn-${action.variant} flex-fill"
                                data-action="${action.id}">
                            ${action.icon ? `<i class="bx ${action.icon} me-1"></i>` : ''}
                            ${action.label}
                        </button>
                    `).join('')}
                </div>
                <div class="d-flex gap-2">
                    ${primaryActions.map(action => `
                        <button type="button"
                                class="btn btn-${action.variant} flex-fill"
                                data-action="${action.id}">
                            ${action.icon ? `<i class="bx ${action.icon} me-1"></i>` : ''}
                            ${action.label}
                        </button>
                    `).join('')}
                </div>
            `;
        } else {
            // Single row layout
            actionsHTML = `
                <div class="d-flex gap-2">
                    ${this.config.actions.map(action => `
                        <button type="button"
                                class="btn btn-${action.variant} flex-fill"
                                data-action="${action.id}">
                            ${action.icon ? `<i class="bx ${action.icon} me-1"></i>` : ''}
                            ${action.label}
                        </button>
                    `).join('')}
                </div>
            `;
        }

        footer.innerHTML = actionsHTML;

        // Attach action listeners
        footer.querySelectorAll('[data-action]').forEach(button => {
            button.addEventListener('click', () => {
                const actionId = button.dataset.action;
                const action = this.config.actions.find(a => a.id === actionId);

                if (action && action.onClick) {
                    action.onClick(program);
                }
            });
        });
    }

    /**
     * Add workouts to current program
     * @param {Array<string>} workoutIds
     */
    addWorkouts(workoutIds) {
        if (!this.currentProgram) return;

        const currentOrder = this.currentProgram.workouts?.length || 0;

        workoutIds.forEach((workoutId, index) => {
            // Check if already in program
            const exists = this.currentProgram.workouts?.some(pw => pw.workout_id === workoutId);
            if (!exists) {
                this.currentProgram.workouts = this.currentProgram.workouts || [];
                this.currentProgram.workouts.push({
                    workout_id: workoutId,
                    order_index: currentOrder + index
                });
            }
        });

        // Re-render
        this.renderProgramDetails(this.currentProgram);
    }

    /**
     * Update program data
     * @param {Object} program
     */
    update(program) {
        this.currentProgram = program;
        this.renderProgramDetails(program);
    }

    /**
     * Get current program
     * @returns {Object|null}
     */
    getCurrentProgram() {
        return this.currentProgram;
    }

    /**
     * Show loading state
     */
    showLoadingState() {
        document.getElementById('programDetailLoading').style.display = 'block';
        document.getElementById('programDetailContent').style.display = 'none';
    }

    /**
     * Show content
     */
    showContent() {
        document.getElementById('programDetailLoading').style.display = 'none';
        document.getElementById('programDetailContent').style.display = 'block';
    }

    /**
     * Calculate total exercises across all program workouts
     */
    _calculateTotalExercises(program) {
        let total = 0;

        (program.workouts || []).forEach(pw => {
            const workout = this.config.workouts.find(w => w.id === pw.workout_id);
            if (workout) {
                total += window.ExerciseDataUtils ? ExerciseDataUtils.getGroupCount(workout) : (workout.exercise_groups?.length || 0);
            }
        });

        return total;
    }

    /**
     * Destroy the offcanvas
     */
    destroy() {
        this.destroySortable();

        if (this.bsOffcanvas) {
            this.bsOffcanvas.dispose();
            this.bsOffcanvas = null;
        }

        if (this.offcanvasElement) {
            this.offcanvasElement.remove();
            this.offcanvasElement = null;
        }
    }

    /**
     * Format date
     */
    _formatDate(dateString) {
        if (!dateString) return 'N/A';

        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch (e) {
            return 'N/A';
        }
    }

    /**
     * Capitalize first letter
     */
    _capitalize(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
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
window.ProgramDetailOffcanvas = ProgramDetailOffcanvas;

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProgramDetailOffcanvas;
}

console.log('📦 ProgramDetailOffcanvas component loaded');
