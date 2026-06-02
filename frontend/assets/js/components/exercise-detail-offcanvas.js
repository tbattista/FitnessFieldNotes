/**
 * Exercise Detail Offcanvas Component
 * Bottom-sheet offcanvas for displaying exercise details on mobile
 * Follows WorkoutDetailOffcanvas pattern
 * @version 1.0.0
 */

class ExerciseDetailOffcanvas {
    constructor(options = {}) {
        this.currentExercise = null;
        this.offcanvasId = 'exerciseDetailOffcanvas';
        this.offcanvasElement = null;
        this.bsOffcanvas = null;
        // Context-aware footer:
        //   - 'default' (legacy exercise-database flow): Favorite + Edit/Delete
        //     for custom exercises + Add (via window.addExerciseToWorkout)
        //   - 'studio': slimmer Favorite + Add pair, no Edit/Delete, Add
        //     routes through options.onAdd instead of the cart
        this.context = options.context === 'studio' ? 'studio' : 'default';
        this.onAdd = typeof options.onAdd === 'function' ? options.onAdd : null;

        this.initialize();
    }

    initialize() {
        this.createOffcanvasHTML();
        console.log('ExerciseDetailOffcanvas component initialized');
    }

    createOffcanvasHTML() {
        const existing = document.getElementById(this.offcanvasId);
        if (existing) existing.remove();

        const html = `
            <div class="offcanvas offcanvas-bottom offcanvas-bottom-base offcanvas-bottom-tall offcanvas-desktop-wide"
                 tabindex="-1" id="${this.offcanvasId}"
                 aria-labelledby="${this.offcanvasId}Label"
                 data-bs-scroll="false">
                <div class="offcanvas-header border-bottom">
                    <h5 class="offcanvas-title" id="${this.offcanvasId}Label">
                        <i class="bx bx-info-circle me-2"></i>
                        <span id="exerciseOffcanvasName">Exercise Details</span>
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
                </div>
                <div class="offcanvas-body" id="exerciseOffcanvasBody">
                    <div id="exerciseOffcanvasLoading" class="text-center py-5">
                        <div class="spinner-border text-primary mb-3" role="status">
                            <span class="visually-hidden">Loading...</span>
                        </div>
                        <p class="text-muted">Loading exercise details...</p>
                    </div>
                    <div id="exerciseOffcanvasContent" style="display: none;"></div>
                </div>
                <div class="offcanvas-footer border-top p-3" id="exerciseOffcanvasFooter"></div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', html);
        this.offcanvasElement = document.getElementById(this.offcanvasId);
    }

    show(exerciseId, presentation = {}) {
        const exercise = [...(window.ffn?.exercises?.all || []), ...(window.ffn?.exercises?.custom || [])]
            .find(e => e.id === exerciseId);

        if (!exercise) return;

        // Per-open presentation lets the same offcanvas instance render
        // different footers depending on where it was opened from
        // (e.g. Page 1 selection grid wants 'Add to Workout', Page 2 card
        // already has the exercise in the tray and only wants Favorite).
        // Pairing-add buttons in the body always remain wired — those
        // target *other* exercises and are useful regardless of context.
        this._currentPresentation = {
            showFavorite: presentation.showFavorite !== false,
            showAdd: presentation.showAdd !== false,
        };

        this.currentExercise = exercise;
        this._showLoading();

        if (!this.bsOffcanvas) {
            this.bsOffcanvas = new bootstrap.Offcanvas(this.offcanvasElement, { scroll: false });
        }
        this.bsOffcanvas.show();

        this._renderContent(exercise);
        this._renderFooterActions(exercise);
        this._showContent();
    }

    hide() {
        if (this.bsOffcanvas) this.bsOffcanvas.hide();
    }

    destroy() {
        if (this.bsOffcanvas) {
            this.bsOffcanvas.dispose();
            this.bsOffcanvas = null;
        }
        if (this.offcanvasElement) {
            this.offcanvasElement.remove();
            this.offcanvasElement = null;
        }
    }

    _renderContent(exercise) {
        document.getElementById('exerciseOffcanvasName').textContent = exercise.name || 'Exercise Details';

        const detailHTML = window._buildExerciseDetailHTML
            ? window._buildExerciseDetailHTML(exercise)
            : '<p class="text-muted">Exercise details unavailable.</p>';

        const contentEl = document.getElementById('exerciseOffcanvasContent');
        contentEl.innerHTML = detailHTML;

        // Wire up pairing chip clicks to navigate within offcanvas
        if (window._wirePairingChipClicks) {
            window._wirePairingChipClicks(contentEl, (targetId) => this.show(targetId));
        }

        // In studio context, intercept the pairing-add buttons (which the
        // legacy wiring above routes to window.ExerciseCart, not the studio
        // tray) and route them through this.onAdd instead. Capture-phase
        // + stopImmediatePropagation ensures our handler runs first and
        // suppresses the legacy ExerciseCart listener on the same element.
        if (this.context === 'studio' && this.onAdd) {
            contentEl.querySelectorAll('.pairing-add-btn').forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    const id = btn.dataset.exerciseId;
                    const name = btn.dataset.exerciseName;
                    if (!id || !name) return;
                    // Look up the full exercise for accurate metadata, fall
                    // back to a stub if not found.
                    const pool = [
                        ...((window.ffn && window.ffn.exercises && window.ffn.exercises.all) || []),
                        ...((window.ffn && window.ffn.exercises && window.ffn.exercises.custom) || []),
                    ];
                    const ex = pool.find((e2) => String(e2.id) === String(id)) || { id, name };
                    try { this.onAdd(ex); }
                    catch (err) { console.error('[ExerciseDetailOffcanvas] pairing onAdd threw:', err); }
                }, { capture: true });
            });
        }
    }

    _renderFooterActions(exercise) {
        const footer = document.getElementById('exerciseOffcanvasFooter');
        if (!footer) return;

        const isFavorited = window.ffn?.exercises?.favorites?.has(exercise.id);

        if (this.context === 'studio') {
            // Studio context: pill-styled actions, controlled by the
            // per-open presentation flags. Edit/Delete are always omitted —
            // they'd navigate away or destroy data mid-workout-build.
            const p = this._currentPresentation || { showFavorite: true, showAdd: true };
            const parts = [];
            if (p.showFavorite !== false) {
                parts.push(`
                    <button type="button"
                            class="studio-offcanvas-btn studio-offcanvas-btn-secondary exercise-offcanvas-fav-btn ${isFavorited ? 'is-favorited' : ''}"
                            data-exercise-id="${exercise.id}">
                        <i class="bx ${isFavorited ? 'bxs-heart' : 'bx-heart'}"></i>
                        <span>${isFavorited ? 'Unfavorite' : 'Favorite'}</span>
                    </button>
                `);
            }
            if (p.showAdd !== false) {
                parts.push(`
                    <button type="button"
                            class="studio-offcanvas-btn studio-offcanvas-btn-primary exercise-offcanvas-add-btn"
                            data-exercise-id="${exercise.id}"
                            data-exercise-name="${this._escapeHtml(exercise.name)}">
                        <i class="bx bx-plus"></i>
                        <span>Add to Workout</span>
                    </button>
                `);
            }
            // No visible actions → hide the footer divider too
            if (parts.length === 0) {
                footer.innerHTML = '';
                footer.style.display = 'none';
            } else {
                footer.style.display = '';
                footer.innerHTML = `<div class="studio-offcanvas-actions">${parts.join('')}</div>`;
            }
            this._attachFooterListeners(footer, exercise);
            return;
        }

        // Default / legacy context
        const isCustom = !exercise.isGlobal;
        let actionsHTML = `
            <div class="d-flex gap-2 mb-2">
                <button type="button" class="btn btn-outline-${isFavorited ? 'danger' : 'secondary'} flex-fill exercise-offcanvas-fav-btn"
                        data-exercise-id="${exercise.id}">
                    <i class="bx ${isFavorited ? 'bxs-heart' : 'bx-heart'} me-1"></i>
                    ${isFavorited ? 'Unfavorite' : 'Favorite'}
                </button>
                ${isCustom ? `
                <button type="button" class="btn btn-outline-primary flex-fill exercise-offcanvas-edit-btn"
                        data-exercise-id="${exercise.id}">
                    <i class="bx bx-edit me-1"></i>Edit
                </button>
                <button type="button" class="btn btn-outline-danger flex-fill exercise-offcanvas-delete-btn"
                        data-exercise-id="${exercise.id}">
                    <i class="bx bx-trash me-1"></i>Delete
                </button>
                ` : ''}
            </div>
            <div class="d-flex gap-2">
                <button type="button" class="btn btn-primary flex-fill exercise-offcanvas-add-btn"
                        data-exercise-id="${exercise.id}"
                        data-exercise-name="${this._escapeHtml(exercise.name)}">
                    <i class="bx bx-plus me-1"></i>Add to Workout
                </button>
            </div>
        `;

        footer.innerHTML = actionsHTML;
        this._attachFooterListeners(footer, exercise);
    }

    _attachFooterListeners(footer, exercise) {
        const favBtn = footer.querySelector('.exercise-offcanvas-fav-btn');
        if (favBtn) {
            favBtn.addEventListener('click', async () => {
                if (window.toggleExerciseFavorite) {
                    await window.toggleExerciseFavorite(exercise.id);
                    // Re-render footer to update fav state
                    this._renderFooterActions(exercise);
                }
            });
        }

        const addBtn = footer.querySelector('.exercise-offcanvas-add-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                if (this.context === 'studio' && this.onAdd) {
                    try { this.onAdd(exercise); }
                    catch (err) { console.error('[ExerciseDetailOffcanvas] onAdd threw:', err); }
                } else if (window.addExerciseToWorkout) {
                    window.addExerciseToWorkout({ id: exercise.id, name: exercise.name });
                }
                this.hide();
            });
        }

        const editBtn = footer.querySelector('.exercise-offcanvas-edit-btn');
        if (editBtn) {
            editBtn.addEventListener('click', () => {
                this.hide();
                window.location.href = `exercise-edit.html?id=${exercise.id}`;
            });
        }

        const deleteBtn = footer.querySelector('.exercise-offcanvas-delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                this.hide();
                if (window.deleteExercise) window.deleteExercise(exercise.id);
            });
        }
    }

    _showLoading() {
        const loading = document.getElementById('exerciseOffcanvasLoading');
        const content = document.getElementById('exerciseOffcanvasContent');
        if (loading) loading.style.display = 'block';
        if (content) content.style.display = 'none';
    }

    _showContent() {
        const loading = document.getElementById('exerciseOffcanvasLoading');
        const content = document.getElementById('exerciseOffcanvasContent');
        if (loading) loading.style.display = 'none';
        if (content) content.style.display = 'block';
    }

    _escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

window.ExerciseDetailOffcanvas = ExerciseDetailOffcanvas;

console.log('ExerciseDetailOffcanvas component loaded');
