/**
 * Exercise Database - Rendering Module
 * Handles exercise card rendering, badges, and modals
 *
 * @module exercise-rendering
 * @version 1.0.0
 */

/**
 * Get difficulty badge with popover
 * @param {string} difficulty - Difficulty level
 * @returns {string} HTML for badge
 */
function getDifficultyBadgeWithPopover(difficulty) {
    if (!difficulty) return '';

    const difficultyInfo = {
        'Beginner': {
            color: 'success',
            icon: 'bx-trending-up',
            description: 'Perfect for those new to training. Focuses on learning proper form and building foundational strength.'
        },
        'Intermediate': {
            color: 'warning',
            icon: 'bx-bar-chart',
            description: 'For those with training experience. Requires good form and moderate strength levels.'
        },
        'Advanced': {
            color: 'danger',
            icon: 'bx-trophy',
            description: 'For experienced lifters. Demands excellent technique, strength, and body control.'
        }
    };

    const info = difficultyInfo[difficulty] || { color: 'secondary', icon: 'bx-info-circle', description: 'Difficulty level' };

    return `
        <span class="badge badge-outline-${info.color} difficulty-badge"
              style="font-size: 0.75rem; padding: 0.3rem 0.6rem; cursor: help; background: transparent;"
              data-bs-toggle="popover"
              data-bs-trigger="click hover focus"
              data-bs-placement="top"
              data-bs-custom-class="difficulty-popover"
              data-bs-html="true"
              data-bs-content="<div class='d-flex align-items-start gap-2'><i class='bx ${info.icon} mt-1'></i><div>${info.description}</div></div>"
              title="${difficulty}">
            ${difficulty}
        </span>
    `;
}


/**
 * Initialize popovers for difficulty badges
 */
function initializePopovers() {
    const popoverTriggerList = document.querySelectorAll('[data-bs-toggle="popover"]');
    popoverTriggerList.forEach(popoverTriggerEl => {
        // Dispose existing popover if any
        const existingPopover = bootstrap.Popover.getInstance(popoverTriggerEl);
        if (existingPopover) {
            existingPopover.dispose();
        }

        // Create new popover
        new bootstrap.Popover(popoverTriggerEl, {
            container: 'body',
            html: true
        });
    });
}

/**
 * Build "Pairs Well With" recommendation HTML
 * @param {Object} exercise - Source exercise
 * @param {Function} escapeHtml - HTML escaper function
 * @returns {string} HTML string (empty if no recommendations)
 */
function _buildPairsWellWithHTML(exercise, escapeHtml) {
    if (!window.ExercisePairingService || !window.ffn?.exercises?.all?.length) return '';

    const result = window.ExercisePairingService.getPairings(exercise, window.ffn.exercises.all);
    const validCategories = result.categories.filter(c => c.exercises.length > 0);
    if (validCategories.length === 0) return '';

    let html = `
        <div class="mb-3 pairs-well-with-section">
            <h6 class="mb-2"><i class="bx bx-group me-1"></i>Pairs Well With</h6>
    `;

    for (const category of validCategories) {
        html += `
            <div class="mb-2">
                <small class="text-muted d-flex align-items-center gap-1 mb-1 pairing-category-label">
                    <i class="bx ${category.icon}" style="font-size: 0.85rem;"></i>
                    ${category.label}
                </small>
        `;

        for (const ex of category.exercises) {
            html += `
                <div class="pairing-exercise-chip"
                     data-pairing-exercise-id="${ex.id}"
                     title="${escapeHtml(category.description)}">
                    <span class="pairing-exercise-name">${escapeHtml(ex.name)}</span>
                    <span class="badge bg-label-secondary pairing-exercise-meta">${escapeHtml(ex.targetMuscleGroup || '')}</span>
                    <button type="button" class="pairing-info-btn"
                            data-exercise-id="${ex.id}"
                            title="See exercise details"
                            aria-label="See ${escapeHtml(ex.name)} details">
                        <i class="bx bx-info-circle"></i>
                    </button>
                    <button type="button" class="pairing-add-btn"
                            data-exercise-id="${ex.id}"
                            data-exercise-name="${escapeHtml(ex.name)}"
                            title="Add to workout"
                            aria-label="Add ${escapeHtml(ex.name)}">
                        <i class="bx bx-plus"></i>
                    </button>
                </div>
            `;
        }

        html += `</div>`;
    }

    html += `</div><hr>`;
    return html;
}

/**
 * Build exercise detail HTML (shared by modal and panel)
 * @param {Object} exercise - Exercise object
 * @returns {string} HTML string for exercise details
 */
function _buildExerciseDetailHTML(exercise) {
    // Helper to escape HTML
    const escapeHtml = (text) => {
        if (!text) return '';
        return text.replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    };

    // Find linked exercise if this is a custom exercise with a link
    let linked = null;
    if (!exercise.isGlobal && exercise.linkedExerciseId) {
        linked = window.ffn.exercises.all.find(e => e.id === exercise.linkedExerciseId);
    }

    // Helper: get value from exercise, falling back to linked exercise
    const getValue = (field) => exercise[field] || (linked && linked[field]) || null;
    const isInherited = (field) => !exercise[field] && linked && linked[field];

    // Helper to render field if value exists, with inherited indicator
    const field = (label, fieldName) => {
        const value = getValue(fieldName);
        if (!value) return '';
        const inherited = isInherited(fieldName);
        return `
        <div class="col-md-6 mb-2">
            <small class="text-muted">${label}</small><br>
            <span>${escapeHtml(String(value))}${inherited ? ' <i class="bx bx-link text-primary" style="font-size: 0.75rem;" title="From linked exercise"></i>' : ''}</span>
        </div>`;
    };

    // Build equipment display with count
    const equipmentDisplay = (equipField, countField) => {
        const equip = getValue(equipField);
        const count = getValue(countField);
        if (!equip) return null;
        return equip + (count ? ` (${count})` : '');
    };

    // GIF URL: use linked if custom has none, rewrite external CDN to local proxy
    const rawGifUrl = exercise.gifUrl || (linked && linked.gifUrl);
    const gifUrl = rawGifUrl ? rawGifUrl.replace('https://static.exercisedb.dev/media/', '/api/v3/exercise-image/') : null;

    // Instructions: use linked if custom has none
    const instructions = exercise.instructions?.length > 0
        ? exercise.instructions
        : (linked && linked.instructions?.length > 0 ? linked.instructions : []);

    // Video URLs: use linked if custom has none
    const shortVideoUrl = exercise.shortVideoUrl || (linked && linked.shortVideoUrl);
    const detailedVideoUrl = exercise.detailedVideoUrl || (linked && linked.detailedVideoUrl);
    const hasVideos = shortVideoUrl || detailedVideoUrl;
    const videosInherited = !exercise.shortVideoUrl && !exercise.detailedVideoUrl && linked && (linked.shortVideoUrl || linked.detailedVideoUrl);

    return `
        <!-- Linked Exercise Badge -->
        ${linked ? `
        <div class="mb-3">
            <span class="badge bg-label-primary d-inline-flex align-items-center gap-1 py-2 px-3">
                <i class="bx bx-link"></i>
                Linked to: ${escapeHtml(linked.name)}
            </span>
            <small class="text-muted d-block mt-1">Fields marked with <i class="bx bx-link text-primary" style="font-size: 0.75rem;"></i> are inherited from the linked exercise</small>
        </div>
        <hr>
        ` : ''}

        <!-- Exercise GIF Demonstration -->
        ${gifUrl ? `
        <div class="mb-3 text-center">
            <img src="${escapeHtml(gifUrl)}" alt="${escapeHtml(exercise.name)} demonstration"
                onerror="this.style.display='none'">
        </div>
        ` : ''}

        <!-- Instructions -->
        ${instructions.length > 0 ? `
        <div class="mb-3">
            <h6 class="mb-2"><i class="bx bx-list-ol me-1"></i>Instructions</h6>
            <ol class="ps-3 mb-0" style="font-size: 0.9rem; line-height: 1.6;">
                ${instructions.map(step => `<li class="mb-1">${escapeHtml(step)}</li>`).join('')}
            </ol>
        </div>
        <hr>
        ` : ''}

        <!-- Video Links Section -->
        ${hasVideos ? `
        <div class="mb-3">
            <h6 class="mb-2"><i class="bx bx-video me-1"></i>Video Tutorials${videosInherited ? ' <i class="bx bx-link text-primary" style="font-size: 0.75rem;" title="From linked exercise"></i>' : ''}</h6>
            <div class="d-flex gap-2 flex-wrap">
                ${shortVideoUrl ? `
                <a href="${escapeHtml(shortVideoUrl)}" target="_blank" class="btn btn-outline-primary btn-sm">
                    <i class="bx bx-play-circle me-1"></i>Quick Demo
                </a>` : ''}
                ${detailedVideoUrl ? `
                <a href="${escapeHtml(detailedVideoUrl)}" target="_blank" class="btn btn-outline-secondary btn-sm">
                    <i class="bx bx-video me-1"></i>In-Depth Tutorial
                </a>` : ''}
            </div>
        </div>
        <hr>
        ` : ''}

        <!-- Basic Info Section -->
        <div class="row mb-3">
            ${field('Difficulty', 'difficultyLevel')}
            ${field('Mechanics', 'mechanics')}
            ${field('Body Region', 'bodyRegion')}
            ${field('Force Type', 'forceType')}
            ${field('Classification', 'classification')}
            ${field('Laterality', 'laterality')}
        </div>

        <!-- Muscles Section -->
        <div class="mb-3">
            <h6 class="mb-2"><i class="bx bx-body me-1"></i>Muscles Worked</h6>
            <div class="row">
                ${field('Target Muscle Group', 'targetMuscleGroup')}
                ${field('Prime Mover', 'primeMoverMuscle')}
                ${field('Secondary Muscle', 'secondaryMuscle')}
                ${field('Tertiary Muscle', 'tertiaryMuscle')}
            </div>
        </div>

        <!-- Equipment Section -->
        <div class="mb-3">
            <h6 class="mb-2"><i class="bx bx-dumbbell me-1"></i>Equipment</h6>
            <div class="row">
                ${(() => {
                    const primary = equipmentDisplay('primaryEquipment', 'primaryEquipmentCount');
                    const secondary = equipmentDisplay('secondaryEquipment', 'secondaryEquipmentCount');
                    let html = '';
                    if (primary) {
                        const inh = isInherited('primaryEquipment');
                        html += `<div class="col-md-6 mb-2"><small class="text-muted">Primary Equipment</small><br><span>${escapeHtml(primary)}${inh ? ' <i class="bx bx-link text-primary" style="font-size: 0.75rem;" title="From linked exercise"></i>' : ''}</span></div>`;
                    }
                    if (secondary) {
                        const inh = isInherited('secondaryEquipment');
                        html += `<div class="col-md-6 mb-2"><small class="text-muted">Secondary Equipment</small><br><span>${escapeHtml(secondary)}${inh ? ' <i class="bx bx-link text-primary" style="font-size: 0.75rem;" title="From linked exercise"></i>' : ''}</span></div>`;
                    }
                    return html;
                })()}
            </div>
        </div>

        <!-- Movement Details (Collapsible) -->
        ${(getValue('posture') || getValue('armType') || getValue('grip') || getValue('loadPosition')) ? `
        <div class="mb-3">
            <h6 class="mb-2" data-bs-toggle="collapse" data-bs-target="#movementDetails"
                style="cursor: pointer;">
                <i class="bx bx-move me-1"></i>Movement Details
                <i class="bx bx-chevron-down float-end"></i>
            </h6>
            <div class="collapse show" id="movementDetails">
                <div class="row">
                    ${field('Posture', 'posture')}
                    ${field('Arm Type', 'armType')}
                    ${field('Arm Pattern', 'armPattern')}
                    ${field('Grip', 'grip')}
                    ${field('Load Position', 'loadPosition')}
                    ${field('Foot Elevation', 'footElevation')}
                </div>
            </div>
        </div>
        ` : ''}

        <!-- Movement Patterns (Collapsible) -->
        ${(getValue('movementPattern1') || getValue('planeOfMotion1')) ? `
        <div class="mb-3">
            <h6 class="mb-2" data-bs-toggle="collapse" data-bs-target="#movementPatterns"
                style="cursor: pointer;">
                <i class="bx bx-rotate-right me-1"></i>Movement Patterns
                <i class="bx bx-chevron-down float-end"></i>
            </h6>
            <div class="collapse" id="movementPatterns">
                <div class="row">
                    ${field('Pattern 1', 'movementPattern1')}
                    ${field('Pattern 2', 'movementPattern2')}
                    ${field('Pattern 3', 'movementPattern3')}
                    ${field('Plane 1', 'planeOfMotion1')}
                    ${field('Plane 2', 'planeOfMotion2')}
                    ${field('Plane 3', 'planeOfMotion3')}
                    ${field('Combination', 'combinationExercise')}
                </div>
            </div>
        </div>
        ` : ''}

        <!-- Pairs Well With -->
        ${_buildPairsWellWithHTML(exercise, escapeHtml)}

        <!-- Custom Exercise Badge -->
        ${!exercise.isGlobal ? `
        <div class="mt-3">
            <span class="badge bg-label-primary">
                <i class="bx bx-user me-1"></i>Custom Exercise
            </span>
        </div>
        ` : ''}
    `;
}

/**
 * Show exercise details in modal (mobile / fallback)
 * @param {string} exerciseId - Exercise ID
 */
function showExerciseDetails(exerciseId) {
    const exercise = [...window.ffn.exercises.all, ...window.ffn.exercises.custom]
        .find(e => e.id === exerciseId);

    if (!exercise) return;

    const modalEl = document.getElementById('exerciseDetailModal');
    const modal = new bootstrap.Modal(modalEl);
    document.getElementById('exerciseDetailTitle').textContent = exercise.name;
    document.getElementById('exerciseDetailBody').innerHTML = _buildExerciseDetailHTML(exercise);

    // Wire "Add to Workout" button if on workout builder page
    const addBtn = modalEl.querySelector('#addToWorkoutFromDetailBtn');
    if (addBtn) {
        const handler = () => {
            if (window.desktopSidebar && window.desktopSidebar.addExerciseToWorkout) {
                window.desktopSidebar.addExerciseToWorkout(exercise.name);
            }
            modal.hide();
        };
        addBtn.replaceWith(addBtn.cloneNode(true));
        modalEl.querySelector('#addToWorkoutFromDetailBtn').addEventListener('click', handler);
    }

    modal.show();
}

/**
 * Show exercise details in desktop side panel (with cross-fade transition)
 * @param {string} exerciseId - Exercise ID
 */
let _panelTransitionTimer = null;

function showExerciseDetailsInPanel(exerciseId) {
    const exercise = [...window.ffn.exercises.all, ...window.ffn.exercises.custom]
        .find(e => e.id === exerciseId);

    if (!exercise) return;

    const content = document.getElementById('exerciseDetailContent');
    const empty = document.getElementById('exerciseDetailEmpty');
    const panelInner = document.getElementById('exerciseDetailPanelInner');
    if (!content || !empty) return;

    // Cancel any pending transition
    if (_panelTransitionTimer) clearTimeout(_panelTransitionTimer);

    // Update highlight immediately (no delay)
    window._selectedExerciseId = exerciseId;
    _updateSelectedCardHighlight(exerciseId);

    const escapeHtml = (text) => {
        if (!text) return '';
        return text.replace(/[&<>"']/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[char]));
    };

    const isFavorited = window.ffn.exercises.favorites.has(exercise.id);

    // Build panel header with name + favorite button
    const newHtml = `
        <div class="detail-header">
            <div class="d-flex justify-content-between align-items-start mb-2">
                <h5 class="mb-0">${escapeHtml(exercise.name)}</h5>
                <div class="d-flex gap-1">
                    <button class="btn btn-sm btn-outline-primary detail-add-to-cart-btn"
                            data-exercise-id="${exercise.id}"
                            data-exercise-name="${escapeHtml(exercise.name)}"
                            title="Add to workout builder">
                        <i class="bx bx-plus me-1"></i>Add
                    </button>
                    <button class="btn btn-sm btn-icon detail-favorite-btn panel-favorite-btn ${isFavorited ? 'text-danger' : ''}"
                            data-exercise-id="${exercise.id}"
                            title="${isFavorited ? 'Remove from favorites' : 'Add to favorites'}">
                        <i class="bx ${isFavorited ? 'bxs-heart' : 'bx-heart'}" style="font-size: 1.25rem;"></i>
                    </button>
                </div>
            </div>
            <div class="detail-meta">
                ${exercise.targetMuscleGroup ? `<span class="badge bg-label-secondary">${escapeHtml(exercise.targetMuscleGroup)}</span>` : ''}
                ${exercise.primaryEquipment ? `<span class="badge bg-label-secondary">${escapeHtml(exercise.primaryEquipment)}</span>` : ''}
                ${!exercise.isGlobal ? '<span class="badge bg-label-primary"><i class="bx bx-user me-1"></i>Custom</span>' : ''}
            </div>
        </div>
        <hr>
    ` + _buildExerciseDetailHTML(exercise);

    if (content.style.display !== 'none') {
        // Cross-fade: content already showing
        content.classList.add('transitioning-out');
        _panelTransitionTimer = setTimeout(() => {
            content.innerHTML = newHtml;
            content.classList.remove('transitioning-out');
            _wirePairingChipClicks(content, showExerciseDetailsInPanel);
            if (panelInner) panelInner.scrollTop = 0;
        }, 150);
    } else {
        // First selection: fade out empty state, then show content
        empty.classList.add('transitioning-out');
        _panelTransitionTimer = setTimeout(() => {
            empty.style.display = 'none';
            empty.classList.remove('transitioning-out');
            content.innerHTML = newHtml;
            content.style.display = 'block';
            _wirePairingChipClicks(content, showExerciseDetailsInPanel);
            if (panelInner) panelInner.scrollTop = 0;
        }, 150);
    }
}

/**
 * Update the selected card highlight in the exercise list
 * @param {string} exerciseId - Currently selected exercise ID
 */
function _updateSelectedCardHighlight(exerciseId) {
    // Remove existing highlight
    document.querySelectorAll('.exercise-list-panel .exercise-card-selected')
        .forEach(el => el.classList.remove('exercise-card-selected'));

    // Add highlight to selected card
    if (exerciseId) {
        const card = document.querySelector(`.exercise-list-panel [data-exercise-id="${exerciseId}"]`);
        if (card) card.classList.add('exercise-card-selected');
    }
}

/**
 * Toggle exercise favorite
 * @param {string} exerciseId - Exercise ID
 */
async function toggleExerciseFavorite(exerciseId) {
    if (!window.firebaseAuth?.currentUser) {
        if (window.showAlert) {
            window.showAlert('Please sign in to favorite exercises. Use the menu to log in.', 'warning');
        }
        return;
    }

    const isFavorited = window.ffn.exercises.favorites.has(exerciseId);

    // Find the button that was clicked
    const button = document.querySelector(`.favorite-btn[data-exercise-id="${exerciseId}"]`);
    const icon = button?.querySelector('i');

    // Optimistic UI update
    if (button && icon) {
        if (isFavorited) {
            icon.className = 'bx bx-heart';
            button.classList.remove('text-danger');
            button.title = 'Add to favorites';
        } else {
            icon.className = 'bx bxs-heart';
            button.classList.add('text-danger');
            button.title = 'Remove from favorites';
        }
    }

    try {
        const token = await window.firebaseAuth.currentUser.getIdToken();

        if (isFavorited) {
            const url = window.config.api.getUrl(`/api/v3/users/me/favorites/${exerciseId}`);
            const response = await fetch(url, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                window.ffn.exercises.favorites.delete(exerciseId);
                console.log('✅ Removed from favorites');

                // If favorites filter is active, refresh the table
                if (window.currentFilters?.favoritesOnly && window.applyFiltersAndRender) {
                    console.log('🔄 Favorites filter active, refreshing table');
                    window.applyFiltersAndRender(window.currentFilters);
                }
            } else {
                console.error('❌ Failed to remove favorite:', response.status);
                revertFavoriteUI(button, icon, true);
            }
        } else {
            const url = window.config.api.getUrl('/api/v3/users/me/favorites');
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ exerciseId })
            });
            if (response.ok) {
                window.ffn.exercises.favorites.add(exerciseId);
                console.log('✅ Added to favorites');
            } else {
                console.error('❌ Failed to add favorite:', response.status);
                revertFavoriteUI(button, icon, false);
            }
        }
    } catch (error) {
        console.error('❌ Error toggling favorite:', error);
        revertFavoriteUI(button, icon, isFavorited);
    }
}

/**
 * Revert favorite button UI on error
 */
function revertFavoriteUI(button, icon, wasFavorited) {
    if (button && icon) {
        if (wasFavorited) {
            icon.className = 'bx bxs-heart';
            button.classList.add('text-danger');
            button.title = 'Remove from favorites';
        } else {
            icon.className = 'bx bx-heart';
            button.classList.remove('text-danger');
            button.title = 'Add to favorites';
        }
    }
}

/**
 * Exercise Cart — collect exercises, then navigate to workout builder.
 * Desktop: renders into the 3rd-column cart panel.
 * Mobile: renders a compact sticky bottom bar.
 * Cart state lives in sessionStorage (clears when tab closes).
 */
const ExerciseCart = {
    _key: 'exerciseCart',

    _read() {
        try {
            return JSON.parse(sessionStorage.getItem(this._key)) || [];
        } catch { return []; }
    },

    _write(items) {
        sessionStorage.setItem(this._key, JSON.stringify(items));
    },

    _isDesktop() {
        return document.documentElement.classList.contains('desktop-view');
    },

    has(name) {
        return this._read().some(e => e.name === name);
    },

    toggle(exercise) {
        const items = this._read();
        const idx = items.findIndex(e => e.name === exercise.name);
        if (idx >= 0) {
            items.splice(idx, 1);
        } else {
            items.push({ id: exercise.id, name: exercise.name });
        }
        this._write(items);
        this._render();
        return idx < 0;
    },

    remove(name) {
        const items = this._read().filter(e => e.name !== name);
        this._write(items);
        this._render();
    },

    clear() {
        sessionStorage.removeItem(this._key);
        this._render();
    },

    _render() {
        if (this._isDesktop()) {
            this._renderPanel();
            this._removeMobileBar();
        } else {
            this._renderMobileBar();
        }
    },

    /** Desktop: render cart content into the static panel column */
    _renderPanel() {
        const content = document.getElementById('exerciseCartContent');
        const empty = document.getElementById('exerciseCartEmpty');
        if (!content || !empty) return;

        const items = this._read();

        if (items.length === 0) {
            content.style.display = 'none';
            content.innerHTML = '';
            empty.style.display = '';
            return;
        }

        empty.style.display = 'none';
        content.style.display = '';

        const chipHtml = items.map(e => `
            <div class="exercise-cart-chip">
                <span class="exercise-cart-chip-name">${this._escapeHtml(e.name)}</span>
                <button type="button" class="exercise-cart-chip-remove" data-name="${this._escapeHtml(e.name)}">&times;</button>
            </div>
        `).join('');

        content.innerHTML = `
            <div class="exercise-cart-header">
                <span class="exercise-cart-count">${items.length} exercise${items.length !== 1 ? 's' : ''}</span>
                <button type="button" class="btn btn-sm btn-link text-muted exercise-cart-clear">Clear</button>
            </div>
            <div class="exercise-cart-chips">${chipHtml}</div>
            <a href="workout-builder.html?fromCart=1" class="btn btn-primary btn-sm w-100">
                <i class="bx bx-dumbbell me-1"></i>Build Workout
            </a>
        `;

        this._wireEvents(content);
    },

    /** Mobile: render compact sticky bottom bar */
    _renderMobileBar() {
        const items = this._read();
        let bar = document.getElementById('exerciseCartBar');

        if (items.length === 0) {
            if (bar) bar.remove();
            return;
        }

        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'exerciseCartBar';
            bar.className = 'exercise-cart-bar';
            document.body.appendChild(bar);
        }

        bar.innerHTML = `
            <div class="exercise-cart-bar-info">
                <i class="bx bx-cart"></i>
                <span>${items.length} exercise${items.length !== 1 ? 's' : ''}</span>
            </div>
            <a href="workout-builder.html?fromCart=1" class="btn btn-primary btn-sm">
                Build Workout <i class="bx bx-right-arrow-alt ms-1"></i>
            </a>
        `;
    },

    _removeMobileBar() {
        const bar = document.getElementById('exerciseCartBar');
        if (bar) bar.remove();
    },

    _wireEvents(container) {
        container.querySelectorAll('.exercise-cart-chip-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.remove(btn.dataset.name);
            });
        });
        const clearBtn = container.querySelector('.exercise-cart-clear');
        if (clearBtn) clearBtn.addEventListener('click', () => this.clear());
    },

    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    init() {
        this._render();
    }
};

window.ExerciseCart = ExerciseCart;

/**
 * Add/remove exercise from the cart (toggle)
 * @param {Object} exercise - Exercise object with id and name
 */
function addExerciseToWorkout(exercise) {
    ExerciseCart.toggle(exercise);
}

/**
 * Delete a custom exercise with confirmation
 * @param {string} exerciseId - Exercise ID to delete
 */
async function deleteExercise(exerciseId) {
    const exercise = window.ffn.exercises.custom.find(e => e.id === exerciseId);
    if (!exercise) return;

    ffnModalManager.confirm('Delete Exercise', `Are you sure you want to delete "${exercise.name}"? This cannot be undone.`, async () => {
        const user = window.firebaseAuth?.currentUser;
        if (!user) {
            if (window.showAlert) window.showAlert('Please sign in to delete exercises.', 'warning');
            return;
        }

        try {
            const token = await user.getIdToken();
            const url = window.exercisePage.getApiUrl(`/api/v3/users/me/exercises/${exerciseId}`);

            const response = await fetch(url, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                throw new Error('Failed to delete exercise');
            }

            // Remove from local state
            window.ffn.exercises.custom = window.ffn.exercises.custom.filter(e => e.id !== exerciseId);

            // Refresh table
            if (window.applyFiltersAndRender && window.currentFilters) {
                window.applyFiltersAndRender(window.currentFilters);
            }

            if (window.showAlert) {
                window.showAlert(`Exercise "${exercise.name}" deleted.`, 'success');
            }

        } catch (error) {
            console.error('Error deleting exercise:', error);
            if (window.showAlert) window.showAlert('Failed to delete exercise. Please try again.', 'danger');
        }
    }, { confirmText: 'Delete', confirmClass: 'btn-danger', size: 'sm' });
}

/**
 * Wire up click handlers for pairing exercise chips
 * @param {HTMLElement} container - Container element with chips
 * @param {Function} navigateFn - Function to call with exercise ID
 */
function _wirePairingChipClicks(container, navigateFn) {
    if (!container) return;

    // The chip body itself is no longer interactive — the two explicit
    // action buttons (info / add) carry the affordances. The body just
    // displays the exercise name and meta.

    // Wire "Info" buttons → navigate to that exercise's detail view
    container.querySelectorAll('.pairing-info-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const targetId = btn.dataset.exerciseId;
            if (targetId && navigateFn) navigateFn(targetId);
        });
    });

    // Wire "Add" buttons on pairing chips
    container.querySelectorAll('.pairing-add-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.dataset.exerciseId;
            const name = btn.dataset.exerciseName;
            if (window.ExerciseCart && id && name) {
                window.ExerciseCart.toggle({ id, name });
            }
        });
    });

    // Wire "Add" button in detail header
    const headerAddBtn = container.querySelector('.detail-add-to-cart-btn');
    if (headerAddBtn) {
        headerAddBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = headerAddBtn.dataset.exerciseId;
            const name = headerAddBtn.dataset.exerciseName;
            if (window.ExerciseCart && id && name) {
                window.ExerciseCart.toggle({ id, name });
            }
        });
    }
}

// Export for global access
window.getDifficultyBadgeWithPopover = getDifficultyBadgeWithPopover;
window.initializePopovers = initializePopovers;
window.showExerciseDetails = showExerciseDetails;
window.showExerciseDetailsInPanel = showExerciseDetailsInPanel;
window.toggleExerciseFavorite = toggleExerciseFavorite;
window.addExerciseToWorkout = addExerciseToWorkout;
window.deleteExercise = deleteExercise;
window._buildExerciseDetailHTML = _buildExerciseDetailHTML;
window._wirePairingChipClicks = _wirePairingChipClicks;

console.log('📦 Exercise Rendering module loaded');
