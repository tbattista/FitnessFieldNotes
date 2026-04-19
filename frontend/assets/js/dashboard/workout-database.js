/**
 * Ghost Gym Dashboard - Workout Database Orchestrator
 * Handles data loading, component initialization, navigation actions, and session state
 * @version 4.0.0 - Refactored: favorites, delete, and filter/search extracted to sub-modules
 *
 * Sub-modules (load before this file):
 *   workout-database-favorites.js      - Favorite toggling, section rendering
 *   workout-database-delete-manager.js  - Batch selection and delete operations
 *   workout-database-filter-manager.js  - Filtering, sorting, tags, search, toolbar
 *
 * NOTE: Core utility functions (escapeHtml, formatDate, truncateText, showLoading)
 * are now loaded from common-utils.js
 */

/**
 * ============================================
 * STATE
 * ============================================
 */

let workoutGrid = null;
let workoutDetailOffcanvas = null;
let isLoadingWorkouts = false;
let componentsInitialized = false;

// Session state cache for smart button labels
let activeSessionWorkoutId = null;
let completedWorkoutIds = new Set();

// Desktop split-view selection state
let _selectedWorkoutId = null;

/**
 * ============================================
 * SESSION STATE MANAGEMENT
 * ============================================
 */

/**
 * Get session state for a workout (for smart button labels)
 * @param {string} workoutId - The workout ID to check
 * @returns {string} 'in_progress', 'completed', or 'never_started'
 */
function getWorkoutSessionState(workoutId) {
    if (activeSessionWorkoutId === workoutId) {
        return 'in_progress';
    }
    if (completedWorkoutIds.has(workoutId)) {
        return 'completed';
    }
    return 'never_started';
}

/**
 * Load session state from localStorage and recent sessions
 */
async function loadSessionStates() {
    try {
        const persistedSession = localStorage.getItem('ffn_active_workout_session');
        if (persistedSession) {
            const session = JSON.parse(persistedSession);
            if (session.workoutId && session.status === 'in_progress') {
                activeSessionWorkoutId = session.workoutId;
                console.log('📍 Found active session for workout:', activeSessionWorkoutId);
            }
        }
    } catch (error) {
        console.warn('⚠️ Could not load session states:', error);
    }
}

/**
 * ============================================
 * DATA LOADING
 * ============================================
 */

/**
 * Load all workouts from API
 */
async function loadWorkouts() {
    // Prevent multiple simultaneous loads
    if (isLoadingWorkouts) {
        console.log('⏳ Already loading workouts, skipping...');
        return;
    }

    isLoadingWorkouts = true;

    try {
        console.log('📡 Loading workouts from data manager...');

        // Initialize components first if not already done
        if (!componentsInitialized) {
            initializeComponents();
        }

        // Show loading state via grid component
        if (workoutGrid) {
            workoutGrid.showLoading();
        }

        // Load session states for smart button labels
        await loadSessionStates();

        // Always load fresh data from data manager to ensure we have the latest
        if (!window.dataManager || !window.dataManager.getWorkouts) {
            throw new Error('Data manager not available');
        }

        // Load workouts directly from data manager
        const workouts = await window.dataManager.getWorkouts();
        console.log(`✅ Loaded ${workouts.length} workouts from data manager`);

        // Update both global state and local state
        window.ffn = window.ffn || {};
        window.ffn.workouts = workouts;
        window.ffn.workoutDatabase.all = workouts;
        window.ffn.workoutDatabase.stats.total = workouts.length;

        // Update total count display
        const totalCountEl = document.getElementById('totalWorkoutsCount');
        if (totalCountEl) {
            totalCountEl.textContent = window.ffn.workoutDatabase.stats.total;
        }

        // Load tag options (in filter manager)
        window.loadTagOptions();

        // Apply filters and render (in filter manager)
        window.filterWorkouts();

    } catch (error) {
        console.error('❌ Failed to load workouts:', error);

        // Use grid's empty state instead of destroying HTML
        if (workoutGrid) {
            workoutGrid.setData([]); // Shows empty state
        }

        // Show alert for user feedback
        if (window.showAlert) {
            window.showAlert('Failed to load workouts: ' + error.message, 'danger');
        }
    } finally {
        isLoadingWorkouts = false;
    }
}

/**
 * ============================================
 * COMPONENT INITIALIZATION
 * ============================================
 */

/**
 * Initialize shared components
 */
function initializeComponents() {
    if (componentsInitialized) {
        console.log('⏭️ Components already initialized, skipping...');
        return;
    }

    console.log('🔧 Initializing shared components...');
    componentsInitialized = true;

    // Initialize WorkoutDetailOffcanvas
    workoutDetailOffcanvas = new WorkoutDetailOffcanvas({
        showCreator: false,
        showStats: false,
        showDates: true,
        actions: [
            // Secondary actions (top row)
            {
                id: 'edit',
                label: 'Edit',
                icon: 'bx-edit',
                variant: 'outline-primary',
                onClick: (workout) => editWorkout(workout.id)
            },
            {
                id: 'history',
                label: 'History',
                icon: 'bx-history',
                variant: 'outline-secondary',
                onClick: (workout) => viewWorkoutHistory(workout.id)
            },
            {
                id: 'share',
                label: 'Share',
                icon: 'bx-share-alt',
                variant: 'outline-secondary',
                onClick: (workout) => shareWorkout(workout.id)
            },
            // Primary action (bottom row, full width)
            {
                id: 'start',
                label: 'Start',
                icon: 'bx-play',
                variant: 'primary',
                primary: true,
                onClick: (workout) => doWorkout(workout.id)
            }
        ]
    });

    // Initialize WorkoutGrid with simplified card configuration
    workoutGrid = new WorkoutGrid('workoutTableContainer', {
        emptyMessage: 'No workouts found',
        emptySubtext: 'Try adjusting your filters or create a new workout',
        emptyAction: {
            label: 'Create Your First Workout',
            icon: 'bx-plus',
            onClick: createNewWorkout
        },
        cardConfig: {
            showCreator: false,
            showStats: false,
            showDates: false,
            showTags: true,
            showExercisePreview: true,
            // Session state callback for smart button labels
            getSessionState: getWorkoutSessionState,
            // Primary action - shown as button
            actions: [
                {
                    id: 'start',
                    label: 'Start Workout',
                    icon: 'bx-play',
                    variant: 'primary',
                    onClick: (workout) => doWorkout(workout.id)
                },
                // These go to dropdown menu
                {
                    id: 'history',
                    label: 'History',
                    icon: 'bx-history',
                    variant: 'outline-info',
                    onClick: (workout) => viewWorkoutHistory(workout.id)
                },
                {
                    id: 'edit',
                    label: 'Edit',
                    icon: 'bx-edit',
                    variant: 'outline-secondary',
                    onClick: (workout) => editWorkout(workout.id)
                },
                {
                    id: 'duplicate',
                    label: 'Duplicate',
                    icon: 'bx-copy',
                    variant: 'outline-secondary',
                    onClick: (workout) => duplicateWorkout(workout.id)
                },
                {
                    id: 'share',
                    label: 'Share',
                    icon: 'bx-share-alt',
                    variant: 'outline-secondary',
                    onClick: (workout) => shareWorkout(workout.id)
                }
            ],
            // Configure which actions appear in dropdown menu
            dropdownActions: ['start', 'history', 'edit', 'duplicate', 'share', 'delete'],
            // View details callback for dropdown
            onViewDetails: (workout) => viewWorkoutDetails(workout.id),
            // Card tap also opens detail view
            onCardClick: (workout) => viewWorkoutDetails(workout.id),
            // Delete callbacks
            onDelete: (workoutId, workoutName) => deleteWorkoutFromDatabase(workoutId, workoutName),
            // Selection change callback for batch delete
            onSelectionChange: handleSelectionChange
        },
        onPageChange: (page) => {
            window.ffn.workoutDatabase.currentPage = page;
            // Scroll to top of container
            document.getElementById('workoutTableContainer')?.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });

    // Expose workoutGrid on window so sub-modules can access it at runtime
    window.workoutGrid = workoutGrid;

    console.log('✅ Shared components initialized');
}

/**
 * ============================================
 * DESKTOP SPLIT-VIEW PANEL
 * ============================================
 */

/**
 * Check if we're in desktop split-view mode
 */
function isDesktopView() {
    return document.documentElement.classList.contains('desktop-view');
}

/**
 * Show workout details in the desktop side panel (with cross-fade transition)
 */
let _transitionTimer = null;

function showWorkoutDetailInPanel(workoutId) {
    const workout = window.ffn.workoutDatabase.all.find(w => w.id === workoutId);
    if (!workout) return;

    const content = document.getElementById('workoutDetailContent');
    const empty = document.getElementById('workoutDetailEmpty');
    const panelInner = document.getElementById('workoutDetailPanelInner');
    if (!content || !empty) return;

    // Cancel any pending transition
    if (_transitionTimer) clearTimeout(_transitionTimer);

    // Update highlight immediately (no delay)
    _selectedWorkoutId = workoutId;
    _updateSelectedWorkoutHighlight(workoutId);

    // Build the new HTML
    const newHtml = _buildDetailPanelHtml(workout);

    if (content.style.display !== 'none') {
        // Cross-fade: content already showing
        content.classList.add('transitioning-out');
        _transitionTimer = setTimeout(() => {
            content.innerHTML = newHtml;
            _attachPanelActionListeners(content, workout);
            content.classList.remove('transitioning-out');
            if (panelInner) panelInner.scrollTop = 0;
        }, 150);
    } else {
        // First selection: fade out empty state, then show content
        empty.classList.add('transitioning-out');
        _transitionTimer = setTimeout(() => {
            empty.style.display = 'none';
            empty.classList.remove('transitioning-out');
            content.innerHTML = newHtml;
            _attachPanelActionListeners(content, workout);
            content.style.display = 'block';
            if (panelInner) panelInner.scrollTop = 0;
        }, 150);
    }
}

/**
 * Cardio activity icon map — lightweight alternative to loading ActivityTypeRegistry.
 * Add new entries here for future activity types.
 */
const _cardioIconMap = {
    running: 'bx-run', walking: 'bx-walk', cycling: 'bx-cycling',
    swimming: 'bx-water', hiking: 'bx-map-alt', rowing: 'bx-transfer',
    elliptical: 'bx-loader-circle', stair_climber: 'bx-trending-up',
    jump_rope: 'bx-up-arrow-circle', yoga: 'bx-body',
    stair_master: 'bx-trending-up'
};

/**
 * Renderer map — dispatch by item type. Extensible: add a new type = 1 function + 1 map entry.
 */
const _detailItemRenderers = {
    note:    _renderNoteItem,
    cardio:  _renderCardioItem,
    default: _renderExerciseItem
};

function _renderDetailItem(item) {
    const renderer = _detailItemRenderers[item._itemType] || _detailItemRenderers.default;
    return renderer(item);
}

/**
 * Merge exercise groups with template_notes, interleaved by order_index.
 */
function _buildMergedItems(workoutData) {
    const groups = window.ExerciseDataUtils
        ? ExerciseDataUtils.getExerciseGroups(workoutData)
        : (workoutData.exercise_groups || []);

    const items = groups.map(g => ({ ...g, _itemType: g.group_type || 'standard' }));

    const notes = workoutData.template_notes || [];
    [...notes].sort((a, b) => a.order_index - b.order_index).forEach(note => {
        const idx = Math.min(note.order_index, items.length);
        items.splice(idx, 0, { _itemType: 'note', content: note.content });
    });

    return items;
}

/**
 * Render items with block grouping — consecutive items sharing a block_id
 * are wrapped in a visual block container with a header.
 */
function _renderItemsWithBlocks(items) {
    let html = '';
    let i = 0;

    while (i < items.length) {
        const item = items[i];

        // If this item belongs to a block, collect all consecutive items with the same block_id
        if (item.block_id) {
            const blockId = item.block_id;
            const blockItems = [];
            while (i < items.length && items[i].block_id === blockId) {
                blockItems.push(items[i]);
                i++;
            }
            html += _renderBlockGroup(blockItems);
        } else {
            html += _renderDetailItem(item);
            i++;
        }
    }

    return html;
}

/**
 * Render a group of block exercises with header and teal chain styling.
 */
function _renderBlockGroup(blockItems) {
    if (blockItems.length === 0) return '';

    const blockName = blockItems[0].group_name || 'Superset';

    // Block header
    let html = `
        <div class="detail-block-group mb-2">
            <div style="display:flex;align-items:center;padding:5px 10px;background:rgba(45,212,191,0.04);border:1px solid var(--bs-border-color,#e0e0e0);border-left:3px solid #2dd4bf;border-bottom:none;border-radius:0.375rem 0.375rem 0 0;">
                <i class="bx bx-layer me-1" style="color:#2dd4bf;"></i>
                <span style="font-size:0.85rem;font-weight:600;color:#2dd4bf;">${escapeHtml(blockName)}</span>
            </div>
    `;

    // Render each exercise in the block with teal left border
    blockItems.forEach((item, idx) => {
        const isLast = idx === blockItems.length - 1;
        const borderRadius = isLast ? '0 0 0.375rem 0.375rem' : '0';
        const borderBottom = isLast ? '' : 'border-bottom:none;';

        const exercises = [];
        if (item.exercises) {
            if (item.exercises.a) exercises.push({ label: '', name: item.exercises.a });
            if (item.exercises.b) exercises.push({ label: 'Alt: ', name: item.exercises.b });
            if (item.exercises.c) exercises.push({ label: 'Alt2: ', name: item.exercises.c });
        }

        const exercisesHtml = exercises.length > 0
            ? exercises.map(ex =>
                `<div class="exercise-line">${ex.label ? `<span class="text-muted">${ex.label}</span>` : ''}${escapeHtml(ex.name)}</div>`
            ).join('')
            : '<div class="exercise-line text-muted">No exercises</div>';

        const parts = [`${item.sets || '3'} sets`, `${item.reps || '8-12'} reps`, `${item.rest || '60s'} rest`];
        if (item.default_weight) {
            parts.push(`${item.default_weight} ${item.default_weight_unit || 'lbs'}`);
        }

        html += `
            <div class="card" style="border-left:3px solid #2dd4bf !important;border-radius:${borderRadius};${borderBottom}margin-bottom:0;">
                <div class="card-body py-2 px-3">
                    <div class="exercise-list mb-1">${exercisesHtml}</div>
                    <div class="exercise-meta-text text-muted small">${parts.join(' • ')}</div>
                </div>
            </div>
        `;
    });

    html += '</div>';
    return html;
}

/** Render an exercise group card */
function _renderExerciseItem(group) {
    const exercises = [];
    if (group.exercises) {
        if (group.exercises.a) exercises.push({ label: '', name: group.exercises.a });
        if (group.exercises.b) exercises.push({ label: 'Alt: ', name: group.exercises.b });
        if (group.exercises.c) exercises.push({ label: 'Alt2: ', name: group.exercises.c });
    }

    const exercisesHtml = exercises.length > 0
        ? exercises.map(ex =>
            `<div class="exercise-line">${ex.label ? `<span class="text-muted">${ex.label}</span>` : ''}${escapeHtml(ex.name)}</div>`
        ).join('')
        : '<div class="exercise-line text-muted">No exercises</div>';

    const parts = [`${group.sets || '3'} sets`, `${group.reps || '8-12'} reps`, `${group.rest || '60s'} rest`];
    if (group.default_weight) {
        parts.push(`${group.default_weight} ${group.default_weight_unit || 'lbs'}`);
    }

    return `
        <div class="card mb-2">
            <div class="card-body py-2 px-3">
                <div class="exercise-list mb-1">${exercisesHtml}</div>
                <div class="exercise-meta-text text-muted small">${parts.join(' • ')}</div>
                ${group.notes ? `<div class="mt-1 small text-muted"><i class="bx bx-note me-1"></i>${escapeHtml(group.notes)}</div>` : ''}
            </div>
        </div>
    `;
}

/** Render a template note card */
function _renderNoteItem(item) {
    return `
        <div class="card mb-2 detail-note-card">
            <div class="card-body py-2 px-3 d-flex align-items-start gap-2">
                <i class="bx bx-comment text-muted" style="font-size: 1.2rem; margin-top: 2px;"></i>
                <div class="small" style="white-space: pre-line;">${escapeHtml(item.content || '')}</div>
            </div>
        </div>
    `;
}

/** Render a cardio/activity card */
function _renderCardioItem(group) {
    const config = group.cardio_config || {};
    const activityType = config.activity_type || '';
    const iconClass = _cardioIconMap[activityType] || 'bx-heart-circle';

    // Build display name (capitalize + replace underscores)
    const activityName = activityType
        ? activityType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        : 'Activity';

    // Build meta parts from cardio_config
    const metaParts = [];
    if (config.duration_minutes) metaParts.push(`${config.duration_minutes} min`);
    if (config.distance) {
        const unit = config.distance_unit || 'mi';
        metaParts.push(`${config.distance} ${unit}`);
    }
    if (config.target_pace) metaParts.push(config.target_pace);

    return `
        <div class="card mb-2 detail-cardio-card">
            <div class="card-body py-2 px-3">
                <div class="exercise-line">
                    <i class="bx ${iconClass} me-1"></i><span class="activity-name">${escapeHtml(activityName)}</span>
                </div>
                ${metaParts.length > 0 ? `<div class="exercise-meta-text text-muted small">${metaParts.join(' • ')}</div>` : ''}
            </div>
        </div>
    `;
}

/**
 * Build the detail panel HTML for a workout
 */
function _buildDetailPanelHtml(workout) {
    const workoutData = workout.workout_data || workout;
    let html = '';

    // Header
    html += `
        <div class="detail-header mb-3">
            <h5 class="mb-1">${escapeHtml(workoutData.name || 'Untitled Workout')}</h5>
            <div class="text-muted small">
                ${workoutData.exercise_groups?.length || 0} exercises
            </div>
        </div>
    `;

    // Description
    if (workoutData.description) {
        html += `<p class="text-muted small">${escapeHtml(workoutData.description)}</p>`;
    }

    // Dates
    const createdDate = workoutData.created_date || workout.created_date;
    const modifiedDate = workoutData.modified_date || workout.modified_date;
    if (createdDate || modifiedDate) {
        html += '<div class="d-flex gap-3 mb-2 flex-wrap">';
        if (createdDate) html += `<span class="text-muted small"><i class="bx bx-calendar me-1"></i>${formatDate(createdDate)}</span>`;
        if (modifiedDate) html += `<span class="text-muted small"><i class="bx bx-time me-1"></i>${formatDate(modifiedDate)}</span>`;
        html += '</div>';
    }

    // Tags
    const tags = workoutData.tags || workout.tags || [];
    if (tags.length > 0) {
        html += `<div class="mt-2 mb-3">${tags.map(tag =>
            `<span class="badge bg-label-secondary me-1">${escapeHtml(tag)}</span>`
        ).join('')}</div>`;
    }

    // Workout items (exercises, notes, cardio — merged and interleaved)
    const items = _buildMergedItems(workoutData);
    if (items.length > 0) {
        html += '<h6 class="mb-3">Exercises</h6>';
        html += _renderItemsWithBlocks(items);
    }

    // Action buttons
    html += `
        <div class="workout-panel-actions mt-3 pt-3 border-top">
            <div class="d-flex gap-2 mb-2">
                <button class="btn btn-outline-primary flex-fill btn-sm" data-panel-action="edit">
                    <i class="bx bx-edit me-1"></i>Edit
                </button>
                <button class="btn btn-outline-secondary flex-fill btn-sm" data-panel-action="history">
                    <i class="bx bx-history me-1"></i>History
                </button>
                <button class="btn btn-outline-secondary flex-fill btn-sm" data-panel-action="share">
                    <i class="bx bx-share-alt me-1"></i>Share
                </button>
            </div>
            <button class="btn btn-primary w-100" data-panel-action="start">
                <i class="bx bx-play me-1"></i>Start Workout
            </button>
        </div>
    `;

    return html;
}

/**
 * Attach action button listeners inside the detail panel
 */
function _attachPanelActionListeners(container, workout) {
    container.querySelectorAll('[data-panel-action]').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.panelAction;
            if (action === 'edit') editWorkout(workout.id);
            else if (action === 'history') viewWorkoutHistory(workout.id);
            else if (action === 'share') shareWorkout(workout.id);
            else if (action === 'start') doWorkout(workout.id);
        });
    });
}

/**
 * Update selection highlight on workout cards
 */
function _updateSelectedWorkoutHighlight(workoutId) {
    document.querySelectorAll('#workoutCardsGrid .workout-card-selected')
        .forEach(el => el.classList.remove('workout-card-selected'));

    if (workoutId) {
        const card = document.querySelector(`#workoutCardsGrid [data-workout-id="${workoutId}"]`);
        if (card) card.classList.add('workout-card-selected');
    }
}

/**
 * Clear the detail panel back to empty state
 */
function _clearDetailPanel() {
    const content = document.getElementById('workoutDetailContent');
    const empty = document.getElementById('workoutDetailEmpty');
    if (content) {
        content.style.display = 'none';
        content.innerHTML = '';
        content.classList.remove('transitioning-out');
    }
    if (empty) {
        empty.style.display = 'flex';
        empty.classList.remove('transitioning-out');
    }
    _selectedWorkoutId = null;
}

/**
 * Auto-select the first workout after initial render (desktop only)
 */
function autoSelectFirstWorkout() {
    const firstCard = document.querySelector('#workoutCardsGrid [data-workout-id]');
    if (firstCard) {
        const workoutId = firstCard.getAttribute('data-workout-id');
        showWorkoutDetailInPanel(workoutId);
    }
}

/**
 * Re-apply selection highlight after grid re-render (filter/sort/pagination)
 * If selected workout is no longer visible, clear the detail panel
 */
function reapplyWorkoutSelection() {
    if (_selectedWorkoutId && isDesktopView()) {
        setTimeout(() => {
            const card = document.querySelector(`#workoutCardsGrid [data-workout-id="${_selectedWorkoutId}"]`);
            if (card) {
                _updateSelectedWorkoutHighlight(_selectedWorkoutId);
            } else {
                _clearDetailPanel();
            }
        }, 50);
    }
}

/**
 * ============================================
 * ACTIONS / NAVIGATION
 * ============================================
 */

/**
 * Edit workout - Navigate to workout editor
 */
function editWorkout(workoutId) {
    console.log('📝 Editing workout:', workoutId);
    window.location.href = `workout-builder.html?id=${workoutId}`;
}

/**
 * Do workout - Navigate to workout mode
 */
function doWorkout(workoutId) {
    console.log('🏋️ Starting workout:', workoutId);
    window.location.href = window.getWorkoutStartUrl
        ? window.getWorkoutStartUrl(workoutId)
        : `workout-mode.html?id=${workoutId}`;
}

/**
 * View workout details - Routes to desktop panel or mobile offcanvas
 */
async function viewWorkoutDetails(workoutId) {
    try {
        console.log('👁️ Viewing workout details:', workoutId);

        // Find workout in local data first
        let workout = window.ffn.workoutDatabase.all.find(w => w.id === workoutId);

        // If not found locally, fetch from API
        if (!workout) {
            const response = await fetch(`/api/v3/firebase/workouts/${workoutId}`, {
                headers: {
                    'Authorization': window.dataManager?.getAuthToken ?
                        `Bearer ${window.dataManager.getAuthToken()}` : ''
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load workout details');
            }

            workout = await response.json();
        }

        // Route: desktop panel vs mobile offcanvas
        if (isDesktopView()) {
            showWorkoutDetailInPanel(workoutId);
        } else {
            if (workoutDetailOffcanvas) {
                workoutDetailOffcanvas.show(workout);
            }
        }

    } catch (error) {
        console.error('❌ Failed to load workout details:', error);
        if (window.showAlert) {
            window.showAlert('Failed to load workout details: ' + error.message, 'danger');
        } else {
            alert('Failed to load workout details');
        }
    }
}

/**
 * Create new workout - Navigate to editor
 */
function createNewWorkout() {
    console.log('➕ Creating new workout');
    window.location.href = 'workout-builder.html?new=true';
}

/**
 * Duplicate workout - Create a copy with "(Copy)" suffix
 */
async function duplicateWorkout(workoutId) {
    console.log('📋 Duplicating workout:', workoutId);

    try {
        const originalWorkout = window.ffn.workoutDatabase.all.find(w => w.id === workoutId);
        if (!originalWorkout) {
            throw new Error('Workout not found');
        }

        const duplicatedWorkout = {
            ...originalWorkout,
            id: undefined, // Will be generated by backend
            name: `${originalWorkout.name} (Copy)`,
            created_date: new Date().toISOString(),
            modified_date: new Date().toISOString()
        };

        const savedWorkout = await window.dataManager.saveWorkout(duplicatedWorkout);

        console.log('✅ Workout duplicated successfully:', savedWorkout.id);

        if (window.showAlert) {
            window.showAlert(`Workout "${duplicatedWorkout.name}" created`, 'success');
        }

        // Reload workouts to show the new copy
        await loadWorkouts();

    } catch (error) {
        console.error('❌ Failed to duplicate workout:', error);
        if (window.showAlert) {
            window.showAlert('Failed to duplicate workout: ' + error.message, 'danger');
        }
    }
}

/**
 * Share workout - Opens share offcanvas
 */
function shareWorkout(workoutId) {
    console.log('🔗 Sharing workout:', workoutId);

    // Close the workout detail offcanvas first to prevent backdrop stacking
    if (workoutDetailOffcanvas) {
        workoutDetailOffcanvas.hide();
    }

    if (window.openShareModal) {
        window.openShareModal(workoutId);
    } else {
        console.error('❌ Share modal not available');
        if (window.showAlert) {
            window.showAlert('Share functionality not available', 'danger');
        }
    }
}

/**
 * View workout history - Navigate to history page
 */
function viewWorkoutHistory(workoutId) {
    console.log('📊 Viewing workout history:', workoutId);
    window.location.href = `workout-history.html?id=${workoutId}`;
}

/**
 * ============================================
 * UTILITY FUNCTIONS
 * ============================================
 */

/**
 * Get total exercise count for a workout
 */
function getTotalExerciseCount(workout) {
    let count = 0;

    // Count exercises in groups
    if (workout.exercise_groups) {
        workout.exercise_groups.forEach(group => {
            count += Object.keys(group.exercises || {}).length;
        });
    }

    return count;
}

// formatDate, escapeHtml, truncateText are now in common-utils.js

/**
 * ============================================
 * GLOBAL EXPORTS
 * ============================================
 */

// Orchestrator functions
window.loadWorkouts = loadWorkouts;
window.editWorkout = editWorkout;
window.doWorkout = doWorkout;
window.viewWorkoutDetails = viewWorkoutDetails;
window.viewWorkoutHistory = viewWorkoutHistory;
window.createNewWorkout = createNewWorkout;
window.duplicateWorkout = duplicateWorkout;
window.shareWorkout = shareWorkout;
window.getTotalExerciseCount = getTotalExerciseCount;

// Desktop split-view functions
window.isDesktopView = isDesktopView;
window.showWorkoutDetailInPanel = showWorkoutDetailInPanel;
window.autoSelectFirstWorkout = autoSelectFirstWorkout;
window.reapplyWorkoutSelection = reapplyWorkoutSelection;

console.log('📦 Workout Database orchestrator loaded (v4.0 - modular)');
