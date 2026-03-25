/**
 * Ghost Gym - Exercise Editor Offcanvas Components
 * Contains exercise group editor (for Workout Builder) and exercise details editor (for Workout Mode)
 *
 * @module offcanvas-exercise-editor
 * @version 1.0.0
 */

import { createOffcanvas, escapeHtml } from './offcanvas-helpers.js';

/* ============================================
   PROTOCOL PARSER (shared by both editors)
   ============================================ */

/**
 * Parse protocol string into sets and reps for backward compatibility
 * @param {string} protocol - e.g., "3x10", "AMRAP", "3 sets to failure"
 * @returns {{sets: string, reps: string}}
 */
function parseProtocol(protocol) {
    const xPattern = /(\d+)\s*[x×]\s*(.+)/i;
    const setsPattern = /(\d+)\s*set/i;
    const xMatch = protocol.match(xPattern);
    if (xMatch) return { sets: xMatch[1], reps: xMatch[2] };
    const setsMatch = protocol.match(setsPattern);
    if (setsMatch) return { sets: setsMatch[1], reps: 'varies' };
    return { sets: '1', reps: protocol };
}

/* ============================================
   ALTERNATE SLOT RENDERER
   ============================================ */

/**
 * Render alternate exercise slot HTML
 * @param {string} slotKey - 'b' or 'c'
 * @param {string} exerciseName - Current exercise name (empty for new slot)
 * @returns {string} HTML string
 */
export function renderAlternateSlot(slotKey, exerciseName) {
    const keyUpper = slotKey.toUpperCase();

    return `
        <div class="eg-alt-chip" data-alt-key="${slotKey}">
            <div class="eg-chip-input-wrap" data-slot="${slotKey}">
                <input type="text" class="eg-chip-input"
                       id="alternateExercise${keyUpper}Input"
                       value="${escapeHtml(exerciseName || '')}"
                       placeholder="Alternate"
                       autocomplete="off">
                <button type="button" class="eg-chip-search" id="searchAlternate${keyUpper}Btn" title="Search">
                    <i class="bx bx-search"></i>
                </button>
                <button type="button" class="eg-chip-remove" id="clearAlternate${keyUpper}Btn" title="Remove">
                    <i class="bx bx-x"></i>
                </button>
            </div>
        </div>
    `;
}

/* ============================================
   EXERCISE GROUP EDITOR (for Workout Builder)
   Button-based exercise selection with search integration
   ============================================ */

/**
 * Create exercise group editor offcanvas with button-based exercise selection
 * Uses search offcanvas for exercise selection instead of autocomplete inputs
 * @param {Object} config - Configuration options
 * @param {string} config.groupId - Unique group identifier
 * @param {string} config.title - Offcanvas title (default: 'Edit Exercise Group')
 * @param {Object} config.exercises - Exercise data {a: 'name', b: 'name', c: 'name'}
 * @param {string} config.sets - Default sets value
 * @param {string} config.reps - Default reps value
 * @param {string} config.rest - Default rest value
 * @param {string} config.weight - Default weight value
 * @param {string} config.weightUnit - Weight unit (lbs/kg/other)
 * @param {boolean} config.isNew - Whether this is a new group
 * @param {string} config.mode - 'single' or 'group' - controls alternate exercises visibility
 * @param {Function} onSave - Callback when group is saved: (groupData) => void
 * @param {Function} onDelete - Callback when group is deleted: () => void
 * @param {Function} onSearchClick - Callback when search is requested: (slotKey, populateCallback) => void
 * @returns {Object} Offcanvas instance
 */
export function createExerciseGroupEditor(config, onSave, onDelete, onSearchClick) {
    const {
        groupId = `group-${Date.now()}`,
        title = 'Edit Exercise',
        exercises = { a: '', b: '', c: '' },
        sets = '3',
        reps = '8-12',
        rest = '60s',
        weight = '',
        weightUnit = 'lbs',
        isNew = false,
        mode = 'group'  // 'single' or 'group' - controls alternate exercises visibility
    } = config;

    // Example placeholders for "other" weight unit
    const otherWeightExamples = [
        'Body Weight plus 10lbs vest',
        'six 45lbs plates',
        'resistance band - heavy',
        'BW + 25lbs dumbbell',
        'cable stack position 7',
        'kettlebell 35lbs'
    ];

    // Combine sets+reps into protocol for display
    const protocol = sets && reps ? `${sets}×${reps}` : (sets || reps || '3×10');

    // Track selected exercises in state
    const state = {
        exercises: { ...exercises },
        rest,
        weight,
        weightUnit,
        alternateCount: (exercises.b ? 1 : 0) + (exercises.c ? 1 : 0)
    };

    const offcanvasHtml = `
        <div class="offcanvas offcanvas-bottom offcanvas-bottom-base offcanvas-desktop-wide" tabindex="-1"
             id="exerciseGroupEditorOffcanvas"
             aria-labelledby="exerciseGroupEditorLabel"
             data-bs-scroll="false">

            <!-- Header (minimal) -->
            <div class="offcanvas-header eg-editor-header">
                <span class="visually-hidden" id="exerciseGroupEditorLabel">
                    <span id="exerciseGroupEditorTitle">${escapeHtml(title)}</span>
                </span>
                <button type="button" class="btn-close"
                        data-bs-dismiss="offcanvas" aria-label="Close"></button>
            </div>

            <!-- Body -->
            <div class="offcanvas-body" id="exerciseGroupEditorBody">

                <!-- Exercise Name (Hero Input) -->
                <div class="eg-section eg-section-exercise">
                    <div class="exercise-slot ${exercises.a ? 'filled' : ''}" id="primaryExerciseSlot" data-slot="a">
                        <div class="eg-exercise-input-wrap">
                            <input type="text" class="eg-exercise-name-input"
                                   id="primaryExerciseInput"
                                   value="${escapeHtml(exercises.a || '')}"
                                   placeholder="Exercise name"
                                   autocomplete="off">
                            <button type="button" class="eg-match-btn" id="searchPrimaryBtn" title="Search exercise library">
                                <i class="bx bx-search"></i> Match
                            </button>
                            <button type="button" class="eg-clear-btn ${exercises.a ? '' : 'd-none'}" id="clearPrimaryBtn" title="Clear">
                                <i class="bx bx-x"></i>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Alternates (Chip List) -->
                <div class="eg-section eg-section-alternates" id="alternateExercisesContainer"
                     style="${mode === 'single' ? 'display: none;' : ''}">
                    <div class="eg-section-label">Alternates</div>
                    <div class="eg-chip-list">
                        ${exercises.b ? renderAlternateSlot('b', exercises.b) : ''}
                        ${exercises.c ? renderAlternateSlot('c', exercises.c) : ''}
                        <span id="addAltButtonContainer" style="${mode === 'single' || state.alternateCount >= 2 ? 'display: none;' : ''}">
                            <button type="button" class="eg-add-chip-btn" id="addAlternateSlotBtn">
                                <i class="bx bx-plus"></i> Add Alternate
                            </button>
                        </span>
                    </div>
                </div>

                <!-- Protocol (open format) -->
                <div class="eg-section eg-section-protocol">
                    <div class="eg-section-label">Protocol</div>
                    <input type="text" class="eg-field-input"
                           id="editorProtocol" value="${escapeHtml(protocol)}"
                           placeholder="Enter sets and reps (e.g. 3x8-12)">
                    <div class="eg-field-hint">Example: 3x10, 5x5, AMRAP, 5,4,3,2,1</div>
                </div>

                <!-- Default Weight (Input + Dropdown) -->
                <div class="eg-section eg-section-weight">
                    <div class="eg-section-label">Default Weight</div>
                    <div class="eg-weight-row">
                        <input type="text" class="eg-field-input eg-weight-value"
                               id="editorWeight" value="${escapeHtml(weight)}"
                               placeholder="${weightUnit === 'other' ? otherWeightExamples[Math.floor(Math.random() * otherWeightExamples.length)] : (weightUnit === 'kg' ? '60' : '135')}">
                        <select class="eg-weight-unit-select" id="editorWeightUnit">
                            <option value="lbs" ${weightUnit === 'lbs' ? 'selected' : ''}>lbs</option>
                            <option value="kg" ${weightUnit === 'kg' ? 'selected' : ''}>kg</option>
                            <option value="other" ${weightUnit === 'other' ? 'selected' : ''}>DIY</option>
                        </select>
                    </div>
                    <div class="eg-diy-hint" id="diyWeightHint"
                         style="display: ${weightUnit === 'other' ? 'block' : 'none'};">
                        e.g., "Body weight", "20lb Medball", "Cable #7"
                    </div>
                </div>

                <!-- Rest -->
                <div class="eg-section eg-section-rest">
                    <div class="eg-section-label">Rest</div>
                    <input type="text" class="eg-field-input"
                           id="editorRest" value="${escapeHtml(rest)}" placeholder="60s">
                    <div class="eg-field-hint">e.g., 60s, 2min, 90s</div>
                </div>
            </div>

            <!-- Footer -->
            <div class="offcanvas-footer eg-editor-footer">
                <div class="eg-footer-row">
                    <button type="button" class="eg-btn-delete" id="deleteExerciseGroupEditorBtn"
                            ${isNew || mode === 'single' ? 'style="display: none;"' : ''}>
                        Delete
                    </button>
                    <div class="eg-footer-actions">
                        <button type="button" class="eg-btn-cancel"
                                data-bs-dismiss="offcanvas">Cancel</button>
                        <button type="button" class="eg-btn-save" id="saveExerciseGroupEditorBtn">
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    return createOffcanvas('exerciseGroupEditorOffcanvas', offcanvasHtml, (offcanvas, element) => {
        // Get DOM elements
        const primaryExerciseInput = element.querySelector('#primaryExerciseInput');
        const searchPrimaryBtn = element.querySelector('#searchPrimaryBtn');
        const clearPrimaryBtn = element.querySelector('#clearPrimaryBtn');
        const primarySlot = element.querySelector('#primaryExerciseSlot');
        const alternateContainer = element.querySelector('#alternateExercisesContainer');
        const chipList = alternateContainer?.querySelector('.eg-chip-list');
        const addAltBtn = element.querySelector('#addAlternateSlotBtn');
        const addAltContainer = element.querySelector('#addAltButtonContainer');
        const protocolInput = element.querySelector('#editorProtocol');
        const restInput = element.querySelector('#editorRest');
        const weightInput = element.querySelector('#editorWeight');
        const weightUnitSelect = element.querySelector('#editorWeightUnit');
        const saveBtn = element.querySelector('#saveExerciseGroupEditorBtn');
        const deleteBtn = element.querySelector('#deleteExerciseGroupEditorBtn');

        // Populate exercise slot helper
        const populateSlot = (slotKey, exerciseName) => {
            state.exercises[slotKey] = exerciseName;

            if (slotKey === 'a') {
                primaryExerciseInput.value = exerciseName;
                clearPrimaryBtn.classList.remove('d-none');
                primarySlot.classList.add('filled');
            } else {
                const slotInput = element.querySelector(`#alternateExercise${slotKey.toUpperCase()}Input`);
                const slotClearBtn = element.querySelector(`#clearAlternate${slotKey.toUpperCase()}Btn`);
                const slotContainer = element.querySelector(`[data-slot="${slotKey}"]`);

                if (slotInput) slotInput.value = exerciseName;
                if (slotClearBtn) slotClearBtn.classList.remove('d-none');
                if (slotContainer) slotContainer.classList.add('filled');
            }
        };

        // Clear slot helper
        const clearSlot = (slotKey) => {
            state.exercises[slotKey] = '';

            if (slotKey === 'a') {
                primaryExerciseInput.value = '';
                clearPrimaryBtn.classList.add('d-none');
                primarySlot.classList.remove('filled');
            } else {
                // Find the container with data-alt-key attribute
                const containerElement = element.querySelector(`[data-alt-key="${slotKey}"]`);
                if (containerElement) {
                    containerElement.remove();
                    state.alternateCount--;

                    // Show add button if we're below max
                    if (addAltContainer) {
                        addAltContainer.style.display = state.alternateCount >= 2 ? 'none' : '';
                    }
                }
            }
        };

        // Open search with initial query helper
        const openSearchWithQuery = (slotKey, initialQuery = '') => {
            onSearchClick(slotKey, (selectedExercise) => {
                populateSlot(slotKey, selectedExercise.name);
            }, initialQuery);
        };

        // Setup input handlers for a slot
        // NOTE: Auto-search behavior REMOVED - user must click search button to browse library
        // Text field is now for entering custom exercise names directly
        const setupSlotInputHandlers = (slotKey, inputElement, searchBtn, clearBtn) => {
            if (!inputElement) return;

            // On input: just store value, NO auto-search
            inputElement.addEventListener('input', (e) => {
                const value = e.target.value.trim();
                state.exercises[slotKey] = value;

                // Show/hide clear button
                if (clearBtn) {
                    clearBtn.classList.toggle('d-none', !value);
                }
                // NO auto-search - user controls when to search via button
            });

            // Search button: open search with current value as initial query
            searchBtn?.addEventListener('click', () => {
                const value = inputElement.value.trim();
                openSearchWithQuery(slotKey, value);
            });

            // Clear button
            clearBtn?.addEventListener('click', () => {
                clearSlot(slotKey);
                inputElement.focus();
            });
        };

        // Add alternate slot helper
        const addAlternateSlot = () => {
            if (state.alternateCount >= 2) return;

            const slotKey = state.exercises.b === undefined || state.exercises.b === '' ? 'b' : 'c';
            if (slotKey === 'b' && state.exercises.b !== '' && state.exercises.b !== undefined) return;
            if (slotKey === 'c' && state.exercises.c !== '' && state.exercises.c !== undefined) return;

            const nextKey = !state.exercises.b ? 'b' : 'c';
            state.exercises[nextKey] = '';
            state.alternateCount++;

            const slotHtml = renderAlternateSlot(nextKey, '');
            // Insert chip before the "+ Add" button
            if (addAltContainer) {
                addAltContainer.insertAdjacentHTML('beforebegin', slotHtml);
            } else if (chipList) {
                chipList.insertAdjacentHTML('beforeend', slotHtml);
            }

            // Hide add button if at max
            if (state.alternateCount >= 2) {
                addAltContainer.style.display = 'none';
            }

            // Get new slot elements and attach handlers
            const keyUpper = nextKey.toUpperCase();
            const newInput = element.querySelector(`#alternateExercise${keyUpper}Input`);
            const newSearchBtn = element.querySelector(`#searchAlternate${keyUpper}Btn`);
            const newClearBtn = element.querySelector(`#clearAlternate${keyUpper}Btn`);

            setupSlotInputHandlers(nextKey, newInput, newSearchBtn, newClearBtn);

            // Focus the new input
            newInput?.focus();
        };

        // Setup primary exercise slot handlers
        setupSlotInputHandlers('a', primaryExerciseInput, searchPrimaryBtn, clearPrimaryBtn);

        // Add alternate button
        addAltBtn?.addEventListener('click', () => {
            addAlternateSlot();
        });

        // Attach handlers to existing alternate slots
        ['b', 'c'].forEach(key => {
            const keyUpper = key.toUpperCase();
            const slotInput = element.querySelector(`#alternateExercise${keyUpper}Input`);
            const searchBtn = element.querySelector(`#searchAlternate${keyUpper}Btn`);
            const clearBtn = element.querySelector(`#clearAlternate${keyUpper}Btn`);

            setupSlotInputHandlers(key, slotInput, searchBtn, clearBtn);
        });

        // Weight unit dropdown
        weightUnitSelect?.addEventListener('change', () => {
            state.weightUnit = weightUnitSelect.value;

            // Show/hide DIY hint
            const diyHint = element.querySelector('#diyWeightHint');
            if (diyHint) {
                diyHint.style.display = state.weightUnit === 'other' ? 'block' : 'none';
            }

            // Update placeholder based on selected unit
            if (weightInput) {
                if (state.weightUnit === 'other') {
                    weightInput.placeholder = otherWeightExamples[Math.floor(Math.random() * otherWeightExamples.length)];
                } else if (state.weightUnit === 'lbs') {
                    weightInput.placeholder = '135';
                } else if (state.weightUnit === 'kg') {
                    weightInput.placeholder = '60';
                }
            }
        });

        // Save button
        saveBtn?.addEventListener('click', async () => {
            // Validate
            if (!state.exercises.a) {
                alert('Primary exercise is required');
                return;
            }

            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving...';

            try {
                // Clean up exercises - only include non-empty
                const cleanExercises = {};
                if (state.exercises.a) cleanExercises.a = state.exercises.a;
                if (state.exercises.b) cleanExercises.b = state.exercises.b;
                if (state.exercises.c) cleanExercises.c = state.exercises.c;

                // Auto-create custom exercises if needed (checks for existing before creating)
                if (window.exerciseCacheService && window.dataManager?.isUserAuthenticated()) {
                    const currentUser = window.dataManager.getCurrentUser();
                    const userId = currentUser?.uid || null;
                    for (const exerciseName of Object.values(cleanExercises)) {
                        if (exerciseName) {
                            await window.exerciseCacheService.autoCreateIfNeeded(exerciseName, userId);
                        }
                    }
                }

                const protocolValue = protocolInput.value.trim() || '3×10';
                const { sets: parsedSets, reps: parsedReps } = parseProtocol(protocolValue);

                const groupData = {
                    groupId,
                    exercises: cleanExercises,
                    sets: parsedSets,
                    reps: parsedReps,
                    rest: restInput.value || '60s',
                    default_weight: weightInput.value || '',
                    default_weight_unit: state.weightUnit
                };

                await onSave(groupData);
                offcanvas.hide();

            } catch (error) {
                console.error('❌ Error saving exercise group:', error);
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save Changes';
            }
        });

        // Delete button
        deleteBtn?.addEventListener('click', async () => {
            ffnModalManager.confirm('Delete Exercise', 'Are you sure you want to delete this exercise?', async () => {
                deleteBtn.disabled = true;
                deleteBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Deleting...';

                try {
                    await onDelete();
                    offcanvas.hide();
                } catch (error) {
                    console.error('❌ Error deleting exercise group:', error);
                    deleteBtn.disabled = false;
                    deleteBtn.textContent = 'Delete';
                }
            }, { confirmText: 'Delete', confirmClass: 'btn-danger', size: 'sm' });
        });
    });
}

/* ============================================
   EXERCISE DETAILS EDITOR (for Workout Mode)
   ============================================ */

/**
 * Create exercise details editor offcanvas
 * For editing sets, reps, rest, and weight during a workout
 * @param {Object} data - Current exercise data
 * @param {string} data.exerciseName - Exercise name
 * @param {string} data.sets - Current sets
 * @param {string} data.reps - Current reps
 * @param {string} data.rest - Current rest
 * @param {string} data.weight - Current weight
 * @param {string} data.weightUnit - Current weight unit
 * @param {Function} onSave - Callback when user saves changes
 * @returns {Object} Offcanvas instance
 */
export function createExerciseDetailsEditor(data, onSave) {
    const { exerciseName, sets, reps, rest, weight, weightUnit, updateTemplateDefault = false } = data;

    // Combine sets and reps into protocol format
    const protocol = sets && reps ? `${sets}×${reps}` : (sets || reps || '3×10');

    // Example placeholders for DIY mode
    const diyPlaceholders = [
        'body weight + 10lbs',
        'six 45lbs plates',
        'resistance band - heavy',
        'BW + 25lbs dumbbell',
        'cable stack position 7',
        'kettlebell 35lbs'
    ];
    const randomDiyPlaceholder = diyPlaceholders[Math.floor(Math.random() * diyPlaceholders.length)];

    const offcanvasHtml = `
        <div class="offcanvas offcanvas-bottom offcanvas-bottom-base" tabindex="-1"
             id="exerciseDetailsEditorOffcanvas" aria-labelledby="exerciseDetailsEditorLabel" data-bs-scroll="false">
            <div class="offcanvas-header border-bottom">
                <h5 class="offcanvas-title" id="exerciseDetailsEditorLabel">
                    <i class="bx bx-edit me-2"></i>Edit Exercise
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
            </div>
            <div class="offcanvas-body">
                <h6 class="mb-4">${escapeHtml(exerciseName)}</h6>

                <!-- Protocol Section (Sets x Reps) -->
                <div class="mb-3">
                    <label class="form-label"><i class="bx bx-list-ol me-1"></i>Protocol</label>
                    <input type="text" class="form-control" id="editProtocolInput"
                           value="${escapeHtml(protocol)}"
                           placeholder="e.g., 3×10, AMRAP, 3 sets to failure">
                    <small class="text-muted">Enter sets and reps in any format</small>
                </div>

                <!-- Weight Section -->
                <div class="mb-3">
                    <label class="form-label"><i class="bx bx-dumbbell me-1"></i>Weight</label>
                    <div class="weight-input-container ${weightUnit === 'other' ? 'diy-mode' : ''}" style="display: flex; flex-direction: column; gap: 0.5rem;">
                        <input type="text" class="form-control weight-input text-center"
                               id="editWeightInput" value="${escapeHtml(weight)}"
                               placeholder="${weightUnit === 'other' ? randomDiyPlaceholder : (weightUnit === 'kg' ? '60' : '135')}"
                               style="width: 100%;">
                        <div class="btn-group w-100" role="group">
                            <button type="button" class="btn btn-outline-secondary weight-unit-btn ${weightUnit === 'lbs' ? 'active' : ''}"
                                    data-unit="lbs">lbs</button>
                            <button type="button" class="btn btn-outline-secondary weight-unit-btn ${weightUnit === 'kg' ? 'active' : ''}"
                                    data-unit="kg">kg</button>
                            <button type="button" class="btn btn-outline-secondary weight-unit-btn ${weightUnit === 'other' ? 'active' : ''}"
                                    data-unit="other">DIY</button>
                        </div>
                        <div class="diy-hint text-muted small mt-2" style="display: ${weightUnit === 'other' ? 'block' : 'none'};">
                            <i class="bx bx-info-circle me-1"></i>
                            e.g., "Body weight", "20lb Medball", "Cable #7"
                        </div>
                    </div>
                </div>

                <!-- Rest Time Section -->
                <div class="mb-3">
                    <label class="form-label"><i class="bx bx-timer me-1"></i>Rest Time</label>
                    <input type="text" class="form-control" id="editRestInput"
                           value="${escapeHtml(rest)}" placeholder="60s">
                    <small class="text-muted">e.g., 60s, 2min, 90s</small>
                </div>

                <!-- Update Template Toggle -->
                <div class="more-menu-item toggle-item" id="updateTemplateItem">
                    <i class="bx bx-sync"></i>
                    <div class="more-menu-item-content">
                        <div class="more-menu-item-title">Update Workout Template</div>
                        <small class="more-menu-item-description">Save as new defaults for future workouts</small>
                    </div>
                    <div class="form-check form-switch mb-0">
                        <input class="form-check-input" type="checkbox" id="updateTemplateToggle"
                               ${updateTemplateDefault ? 'checked' : ''}
                               style="cursor: pointer;">
                    </div>
                </div>

                <div class="alert alert-info mb-4" id="updateInfoAlert">
                    <i class="bx bx-info-circle me-2"></i>
                    <small id="updateInfoText">${updateTemplateDefault
                        ? 'Changes will update your workout template AND session history.'
                        : 'Changes will be saved to your workout session history.'}</small>
                </div>

                <div class="d-flex gap-2">
                    <button type="button" class="btn btn-outline-secondary flex-fill" data-bs-dismiss="offcanvas">
                        Cancel
                    </button>
                    <button type="button" class="btn btn-primary flex-fill" id="saveExerciseDetailsBtn">
                        <i class="bx bx-save me-1"></i>Save Changes
                    </button>
                </div>
            </div>
        </div>
    `;

    return createOffcanvas('exerciseDetailsEditorOffcanvas', offcanvasHtml, (offcanvas, offcanvasElement) => {
        const saveBtn = offcanvasElement.querySelector('#saveExerciseDetailsBtn');
        const protocolInput = offcanvasElement.querySelector('#editProtocolInput');
        const restInput = offcanvasElement.querySelector('#editRestInput');
        const weightInput = offcanvasElement.querySelector('#editWeightInput');
        const weightUnitBtns = offcanvasElement.querySelectorAll('.weight-unit-btn');
        const updateTemplateToggle = offcanvasElement.querySelector('#updateTemplateToggle');
        const updateInfoText = offcanvasElement.querySelector('#updateInfoText');
        const updateInfoAlert = offcanvasElement.querySelector('#updateInfoAlert');
        const weightContainer = offcanvasElement.querySelector('.weight-input-container');

        // Track current weight unit
        let currentWeightUnit = weightUnit;

        // Weight unit button handlers
        weightUnitBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // Update button states
                weightUnitBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentWeightUnit = btn.dataset.unit;

                // Toggle DIY mode layout
                if (weightContainer) {
                    if (currentWeightUnit === 'other') {
                        weightContainer.classList.add('diy-mode');
                        weightInput.placeholder = randomDiyPlaceholder;
                    } else {
                        weightContainer.classList.remove('diy-mode');
                        weightInput.placeholder = currentWeightUnit === 'kg' ? '60' : '135';
                    }

                    // Show/hide DIY hint
                    const diyHint = weightContainer.querySelector('.diy-hint');
                    if (diyHint) {
                        diyHint.style.display = currentWeightUnit === 'other' ? 'block' : 'none';
                    }
                }
            });
        });

        // Dynamic info text based on toggle state
        const updateInfoMessage = () => {
            if (updateInfoText && updateInfoAlert) {
                if (updateTemplateToggle?.checked) {
                    updateInfoText.textContent = 'Changes will update your workout template AND session history.';
                    updateInfoAlert.classList.remove('alert-info');
                    updateInfoAlert.classList.add('alert-success');
                } else {
                    updateInfoText.textContent = 'Changes will be saved to your workout session history.';
                    updateInfoAlert.classList.remove('alert-success');
                    updateInfoAlert.classList.add('alert-info');
                }
            }
        };

        // Listen for toggle changes
        if (updateTemplateToggle) {
            updateTemplateToggle.addEventListener('change', updateInfoMessage);
        }

        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                // Validate rest time input
                const restValue = restInput.value.trim();
                if (restValue) {
                    const restValidation = window.WorkoutUtils?.validateRestTime(restValue);
                    if (restValidation && !restValidation.valid) {
                        // Show validation error
                        restInput.classList.add('is-invalid');

                        // Add error message if not already present
                        let errorDiv = restInput.parentElement.querySelector('.invalid-feedback');
                        if (!errorDiv) {
                            errorDiv = document.createElement('div');
                            errorDiv.className = 'invalid-feedback';
                            restInput.parentElement.appendChild(errorDiv);
                        }
                        errorDiv.textContent = restValidation.error;

                        // Show alert with the error
                        if (window.showAlert) {
                            window.showAlert(restValidation.error, 'warning');
                        }
                        return;
                    }

                    // Remove invalid state if validation passes
                    restInput.classList.remove('is-invalid');
                }

                saveBtn.disabled = true;
                saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving...';

                try {
                    // Parse protocol input
                    const protocolValue = protocolInput.value.trim() || '3×10';
                    const { sets, reps } = parseProtocol(protocolValue);

                    // Use validated rest time if available, otherwise use input or default
                    const restValidation = window.WorkoutUtils?.validateRestTime(restInput.value.trim());
                    const validatedRest = restValidation?.valid ? restValidation.value : (restInput.value.trim() || '60s');

                    const updatedData = {
                        protocol: protocolValue,  // NEW: Store raw protocol string
                        sets: sets,               // Extracted for backward compatibility
                        reps: reps,               // Extracted for backward compatibility
                        rest: validatedRest,
                        weight: weightInput.value.trim(),
                        weightUnit: currentWeightUnit,
                        updateTemplate: updateTemplateToggle?.checked || false
                    };

                    await onSave(updatedData);
                    offcanvas.hide();
                } catch (error) {
                    console.error('❌ Error saving exercise details:', error);
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<i class="bx bx-save me-1"></i>Save Changes';
                    alert('Failed to save changes. Please try again.');
                }
            });
        }

        // Add real-time validation feedback for rest input
        if (restInput) {
            restInput.addEventListener('blur', () => {
                const value = restInput.value.trim();
                if (value) {
                    const validation = window.WorkoutUtils?.validateRestTime(value);
                    if (validation && !validation.valid) {
                        restInput.classList.add('is-invalid');

                        let errorDiv = restInput.parentElement.querySelector('.invalid-feedback');
                        if (!errorDiv) {
                            errorDiv = document.createElement('div');
                            errorDiv.className = 'invalid-feedback';
                            restInput.parentElement.appendChild(errorDiv);
                        }
                        errorDiv.textContent = validation.error;
                    } else {
                        restInput.classList.remove('is-invalid');
                        // Optionally update the input to show the normalized value
                        if (validation?.valid && validation.value !== value) {
                            restInput.value = validation.value;
                        }
                    }
                } else {
                    restInput.classList.remove('is-invalid');
                }
            });
        }
    });
}
