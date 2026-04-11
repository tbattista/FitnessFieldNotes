/**
 * Cardio Editor Offcanvas
 * Full-edit offcanvas for cardio activity cards in the workout builder.
 * Mirrors the activity log page form with activity type grid, conditional fields,
 * and all cardio_config properties.
 *
 * @module offcanvas-cardio-editor
 * @version 1.0.0
 */

import { createOffcanvas, escapeHtml } from './offcanvas-helpers.js';

/**
 * Create cardio editor offcanvas
 * @param {Object} config
 * @param {string} config.groupId - Exercise group ID
 * @param {Object} config.cardioConfig - Current cardio_config data
 * @param {Function} config.onSave - Callback(updatedCardioConfig)
 * @param {Function} [config.onDelete] - Callback when delete clicked
 * @returns {Object} Offcanvas instance
 */
export function createCardioEditor(config) {
    const { groupId, cardioConfig = {}, onSave, onDelete } = config;
    const id = `cardioEditorOffcanvas-${Date.now()}`;

    const Registry = window.ActivityTypeRegistry;
    const favorites = Registry ? Registry.getFavorites() : [];
    const allTypes = Registry ? Registry.getAll() : [];

    // Current values
    const activityType = cardioConfig.activity_type || '';
    const activityName = cardioConfig.activity_name || '';
    const durationMinutes = cardioConfig.duration_minutes || null;
    const distance = cardioConfig.distance || null;
    const distanceUnit = cardioConfig.distance_unit || 'mi';
    const targetPace = cardioConfig.target_pace || '';
    const targetHeartRate = cardioConfig.target_heart_rate || null;
    const targetCalories = cardioConfig.target_calories || null;
    const targetRpe = cardioConfig.target_rpe || null;
    const elevationGain = cardioConfig.elevation_gain || null;
    const elevationUnit = cardioConfig.elevation_unit || 'ft';
    const activityDetails = cardioConfig.activity_details || {};
    const notes = cardioConfig.notes || '';

    // Split duration into hours/minutes
    const durationHours = durationMinutes ? Math.floor(durationMinutes / 60) : 0;
    const durationMins = durationMinutes ? durationMinutes % 60 : '';

    // Build favorite activity buttons
    const favoritesHtml = favorites.map(typeId => {
        const type = Registry.getById(typeId);
        const activeClass = typeId === activityType ? 'active' : '';
        return `<button type="button" class="activity-type-btn ${activeClass}" data-activity-type="${escapeHtml(typeId)}">
            <i class="bx ${escapeHtml(type.icon)}"></i>
            <span>${escapeHtml(type.shortName)}</span>
        </button>`;
    }).join('');

    // "More" button for full picker
    const moreBtn = `<button type="button" class="activity-type-btn activity-type-more-btn" id="cardioMoreTypesBtn-${id}">
        <i class="bx bx-dots-horizontal-rounded"></i>
        <span>More</span>
    </button>`;

    // Distance unit options
    const distUnits = ['mi', 'km', 'm', 'yd'];
    const distUnitOptions = distUnits.map(u =>
        `<option value="${u}" ${u === distanceUnit ? 'selected' : ''}>${u}</option>`
    ).join('');

    // Elevation unit options
    const elevUnits = ['ft', 'm'];
    const elevUnitOptions = elevUnits.map(u =>
        `<option value="${u}" ${u === elevationUnit ? 'selected' : ''}>${u}</option>`
    ).join('');

    // RPE buttons
    const rpeBtns = Array.from({ length: 10 }, (_, i) => {
        const val = i + 1;
        const activeClass = val === targetRpe ? 'active' : '';
        return `<button type="button" class="rpe-btn ${activeClass}" data-rpe="${val}">${val}</button>`;
    }).join('');

    const offcanvasHtml = `
        <div class="offcanvas offcanvas-bottom offcanvas-bottom-base"
             tabindex="-1" id="${id}" aria-labelledby="${id}Label"
             data-bs-scroll="false" style="height: auto; max-height: 85vh;">
            <div class="offcanvas-header border-bottom">
                <h5 class="offcanvas-title" id="${id}Label">
                    <i class="bx bx-heart-circle me-2"></i>Edit Activity
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
            </div>
            <div class="offcanvas-body py-3" style="overflow-y: auto;">

                <!-- Activity Type Selector -->
                <label class="form-label fw-semibold mb-2">Activity Type</label>
                <div class="activity-type-grid mb-3" id="cardioTypeGrid-${id}">
                    ${favoritesHtml}
                    ${moreBtn}
                </div>

                <!-- Custom Session Name -->
                <div class="mb-3">
                    <label for="cardioName-${id}" class="form-label">Session Name <small class="text-muted">(optional)</small></label>
                    <input type="text" class="form-control" id="cardioName-${id}"
                           maxlength="100" value="${escapeHtml(activityName)}" placeholder="e.g., Kettlebell Leg HIIT">
                </div>

                <!-- Duration -->
                <div class="row mb-3">
                    <div class="col-6">
                        <label for="cardioHours-${id}" class="form-label">Hours</label>
                        <input type="number" class="form-control" id="cardioHours-${id}"
                               min="0" max="23" value="${durationHours}" placeholder="0">
                    </div>
                    <div class="col-6">
                        <label for="cardioMinutes-${id}" class="form-label">Minutes</label>
                        <input type="number" class="form-control" id="cardioMinutes-${id}"
                               min="0" max="59" value="${durationMins}" placeholder="30">
                    </div>
                </div>

                <!-- Distance (conditional) -->
                <div class="row mb-3" id="cardioDistanceRow-${id}" style="display: none;">
                    <div class="col-8">
                        <label for="cardioDistance-${id}" class="form-label">Target Distance</label>
                        <input type="number" class="form-control" id="cardioDistance-${id}"
                               step="0.01" min="0" value="${distance || ''}" placeholder="0.00">
                    </div>
                    <div class="col-4">
                        <label for="cardioDistUnit-${id}" class="form-label">Unit</label>
                        <select class="form-select" id="cardioDistUnit-${id}">
                            ${distUnitOptions}
                        </select>
                    </div>
                </div>

                <!-- Pace (conditional, auto-calculated) -->
                <div class="mb-3" id="cardioPaceRow-${id}" style="display: none;">
                    <label for="cardioPace-${id}" class="form-label">Target Pace <small class="text-muted">(auto-calculated)</small></label>
                    <input type="text" class="form-control" id="cardioPace-${id}"
                           value="${escapeHtml(targetPace)}" placeholder="--:--/mi" readonly>
                </div>

                <!-- Heart Rate -->
                <div class="mb-3">
                    <label for="cardioHR-${id}" class="form-label">Target Heart Rate</label>
                    <div class="input-group">
                        <input type="number" class="form-control" id="cardioHR-${id}"
                               min="30" max="250" value="${targetHeartRate || ''}" placeholder="--">
                        <span class="input-group-text">bpm</span>
                    </div>
                </div>

                <!-- Calories -->
                <div class="mb-3">
                    <label for="cardioCalories-${id}" class="form-label">Target Calories</label>
                    <div class="input-group">
                        <input type="number" class="form-control" id="cardioCalories-${id}"
                               min="0" max="10000" value="${targetCalories || ''}" placeholder="--">
                        <span class="input-group-text">kcal</span>
                    </div>
                </div>

                <!-- RPE -->
                <div class="mb-3">
                    <label class="form-label">Target RPE (Perceived Effort)</label>
                    <div class="rpe-selector" id="cardioRPE-${id}">
                        ${rpeBtns}
                    </div>
                    <div class="d-flex justify-content-between mt-1">
                        <small class="text-muted">Easy</small>
                        <small class="text-muted">Max Effort</small>
                    </div>
                </div>

                <!-- Elevation (conditional) -->
                <div class="mb-3" id="cardioElevationRow-${id}" style="display: none;">
                    <label for="cardioElevation-${id}" class="form-label">Target Elevation Gain</label>
                    <div class="input-group">
                        <input type="number" class="form-control" id="cardioElevation-${id}"
                               min="0" value="${elevationGain || ''}" placeholder="--">
                        <select class="form-select" id="cardioElevUnit-${id}" style="max-width: 80px;">
                            ${elevUnitOptions}
                        </select>
                    </div>
                </div>

                <!-- Cadence (cycling) -->
                <div class="mb-3" id="cardioCadenceRow-${id}" style="display: none;">
                    <label for="cardioCadence-${id}" class="form-label">Target Cadence</label>
                    <div class="input-group">
                        <input type="number" class="form-control" id="cardioCadence-${id}"
                               min="0" value="${activityDetails.cadence || ''}" placeholder="--">
                        <span class="input-group-text">rpm</span>
                    </div>
                </div>

                <!-- Stroke Rate (rowing) -->
                <div class="mb-3" id="cardioStrokeRateRow-${id}" style="display: none;">
                    <label for="cardioStrokeRate-${id}" class="form-label">Target Stroke Rate</label>
                    <div class="input-group">
                        <input type="number" class="form-control" id="cardioStrokeRate-${id}"
                               min="0" value="${activityDetails.stroke_rate || ''}" placeholder="--">
                        <span class="input-group-text">spm</span>
                    </div>
                </div>

                <!-- Laps + Pool Length (swimming) -->
                <div class="row mb-3" id="cardioLapsRow-${id}" style="display: none;">
                    <div class="col-6">
                        <label for="cardioLaps-${id}" class="form-label">Target Laps</label>
                        <input type="number" class="form-control" id="cardioLaps-${id}"
                               min="0" value="${activityDetails.laps || ''}" placeholder="--">
                    </div>
                    <div class="col-6">
                        <label for="cardioPoolLength-${id}" class="form-label">Pool Length</label>
                        <div class="input-group">
                            <input type="number" class="form-control" id="cardioPoolLength-${id}"
                                   min="0" value="${activityDetails.pool_length || ''}" placeholder="25">
                            <span class="input-group-text">m</span>
                        </div>
                    </div>
                </div>

                <!-- Incline (elliptical/stair climber) -->
                <div class="mb-3" id="cardioInclineRow-${id}" style="display: none;">
                    <label for="cardioIncline-${id}" class="form-label">Target Incline</label>
                    <div class="input-group">
                        <input type="number" class="form-control" id="cardioIncline-${id}"
                               min="0" max="100" value="${activityDetails.incline || ''}" placeholder="--">
                        <span class="input-group-text">%</span>
                    </div>
                </div>

                <!-- Notes -->
                <div class="mb-3">
                    <label for="cardioNotes-${id}" class="form-label">Notes</label>
                    <textarea class="form-control" id="cardioNotes-${id}" rows="2"
                              maxlength="500" placeholder="Workout targets or notes...">${escapeHtml(notes)}</textarea>
                </div>

            </div>
            <div class="offcanvas-footer border-top p-3">
                <div class="d-flex gap-2 workout-builder-buttons">
                    <button type="button" class="btn btn-primary flex-fill" id="cardioSaveBtn-${id}">
                        <i class="bx bx-save me-1"></i>Save
                    </button>
                    <button type="button" class="btn btn-label-secondary flex-fill" data-bs-dismiss="offcanvas">
                        Cancel
                    </button>
                    ${onDelete ? `<button type="button" class="btn btn-outline-danger flex-fill" id="cardioDeleteBtn-${id}">
                        <i class="bx bx-trash me-1"></i>Delete
                    </button>` : ''}
                </div>
            </div>
        </div>
    `;

    return createOffcanvas(id, offcanvasHtml, (offcanvas, el) => {
        let selectedType = activityType;
        let selectedRpe = targetRpe;

        // --- Activity type grid ---
        const typeGrid = el.querySelector(`#cardioTypeGrid-${id}`);
        typeGrid.addEventListener('click', (e) => {
            const btn = e.target.closest('.activity-type-btn');
            if (!btn) return;

            // "More" button — open category picker
            if (btn.id === `cardioMoreTypesBtn-${id}`) {
                openActivityPicker(el, id, selectedType, (typeId) => {
                    selectedType = typeId;
                    // Update grid selection
                    typeGrid.querySelectorAll('.activity-type-btn').forEach(b => b.classList.remove('active'));
                    const existing = typeGrid.querySelector(`[data-activity-type="${typeId}"]`);
                    if (existing) existing.classList.add('active');
                    updateConditionalFields(el, id, typeId);
                    calculatePace(el, id);
                });
                return;
            }

            const typeId = btn.dataset.activityType;
            if (!typeId) return;

            selectedType = typeId;
            typeGrid.querySelectorAll('.activity-type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updateConditionalFields(el, id, typeId);
            calculatePace(el, id);
        });

        // --- RPE selector ---
        const rpeContainer = el.querySelector(`#cardioRPE-${id}`);
        rpeContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.rpe-btn');
            if (!btn) return;
            const val = parseInt(btn.dataset.rpe, 10);
            // Toggle — click same to deselect
            if (val === selectedRpe) {
                selectedRpe = null;
                btn.classList.remove('active');
            } else {
                selectedRpe = val;
                rpeContainer.querySelectorAll('.rpe-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            }
        });

        // --- Auto-calculate pace ---
        const hoursInput = el.querySelector(`#cardioHours-${id}`);
        const minsInput = el.querySelector(`#cardioMinutes-${id}`);
        const distInput = el.querySelector(`#cardioDistance-${id}`);
        const distUnitSelect = el.querySelector(`#cardioDistUnit-${id}`);

        [hoursInput, minsInput, distInput].forEach(input => {
            if (input) input.addEventListener('input', () => calculatePace(el, id));
        });
        if (distUnitSelect) {
            distUnitSelect.addEventListener('change', () => calculatePace(el, id));
        }

        // --- Initial conditional field visibility ---
        if (selectedType) {
            updateConditionalFields(el, id, selectedType);
            calculatePace(el, id);
        }

        // --- Save ---
        const saveBtn = el.querySelector(`#cardioSaveBtn-${id}`);
        if (saveBtn && onSave) {
            saveBtn.addEventListener('click', () => {
                const hours = parseInt(hoursInput?.value, 10) || 0;
                const mins = parseInt(minsInput?.value, 10) || 0;
                const totalMinutes = hours * 60 + mins;

                const updatedConfig = {
                    activity_type: selectedType,
                    activity_name: el.querySelector(`#cardioName-${id}`)?.value?.trim() || '',
                    duration_minutes: totalMinutes || null,
                    distance: parseFloat(distInput?.value) || null,
                    distance_unit: distUnitSelect?.value || 'mi',
                    target_pace: el.querySelector(`#cardioPace-${id}`)?.value || '',
                    target_heart_rate: parseInt(el.querySelector(`#cardioHR-${id}`)?.value, 10) || null,
                    target_calories: parseInt(el.querySelector(`#cardioCalories-${id}`)?.value, 10) || null,
                    target_rpe: selectedRpe,
                    elevation_gain: parseInt(el.querySelector(`#cardioElevation-${id}`)?.value, 10) || null,
                    elevation_unit: el.querySelector(`#cardioElevUnit-${id}`)?.value || 'ft',
                    activity_details: collectActivityDetails(el, id),
                    notes: el.querySelector(`#cardioNotes-${id}`)?.value?.trim() || ''
                };

                onSave(updatedConfig);
                offcanvas.hide();
            });
        }

        // --- Delete ---
        const deleteBtn = el.querySelector(`#cardioDeleteBtn-${id}`);
        if (deleteBtn && onDelete) {
            deleteBtn.addEventListener('click', () => {
                offcanvas.hide();
                setTimeout(() => onDelete(), 300);
            });
        }
    });
}

/**
 * Update conditional fields based on activity type
 */
function updateConditionalFields(el, id, typeId) {
    const Registry = window.ActivityTypeRegistry;
    if (!Registry) return;

    const config = Registry.getFieldConfig(typeId);

    const fieldMap = {
        distance: `cardioDistanceRow-${id}`,
        pace: `cardioPaceRow-${id}`,
        elevation: `cardioElevationRow-${id}`,
        cadence: `cardioCadenceRow-${id}`,
        strokeRate: `cardioStrokeRateRow-${id}`,
        laps: `cardioLapsRow-${id}`,
        incline: `cardioInclineRow-${id}`
    };

    Object.entries(fieldMap).forEach(([key, rowId]) => {
        const row = el.querySelector(`#${rowId}`);
        if (row) {
            row.style.display = config[key] ? '' : 'none';
        }
    });
}

/**
 * Auto-calculate pace from duration and distance
 */
function calculatePace(el, id) {
    const hours = parseInt(el.querySelector(`#cardioHours-${id}`)?.value, 10) || 0;
    const mins = parseInt(el.querySelector(`#cardioMinutes-${id}`)?.value, 10) || 0;
    const dist = parseFloat(el.querySelector(`#cardioDistance-${id}`)?.value) || 0;
    const unit = el.querySelector(`#cardioDistUnit-${id}`)?.value || 'mi';
    const paceInput = el.querySelector(`#cardioPace-${id}`);
    if (!paceInput) return;

    if (dist <= 0 || (hours === 0 && mins === 0)) {
        paceInput.value = '';
        paceInput.placeholder = `--:--/${unit}`;
        return;
    }

    const totalMins = hours * 60 + mins;
    const pacePerUnit = totalMins / dist;
    const paceMins = Math.floor(pacePerUnit);
    const paceSecs = Math.round((pacePerUnit - paceMins) * 60);
    paceInput.value = `${paceMins}:${String(paceSecs).padStart(2, '0')}/${unit}`;
}

/**
 * Collect activity-specific detail fields
 */
function collectActivityDetails(el, id) {
    const details = {};

    const cadence = parseInt(el.querySelector(`#cardioCadence-${id}`)?.value, 10);
    if (cadence) details.cadence = cadence;

    const strokeRate = parseInt(el.querySelector(`#cardioStrokeRate-${id}`)?.value, 10);
    if (strokeRate) details.stroke_rate = strokeRate;

    const laps = parseInt(el.querySelector(`#cardioLaps-${id}`)?.value, 10);
    if (laps) details.laps = laps;

    const poolLength = parseInt(el.querySelector(`#cardioPoolLength-${id}`)?.value, 10);
    if (poolLength) details.pool_length = poolLength;

    const incline = parseInt(el.querySelector(`#cardioIncline-${id}`)?.value, 10);
    if (incline) details.incline = incline;

    return details;
}

/**
 * Open full activity type picker as a nested offcanvas/popover.
 * Shows all 31 types grouped by category.
 */
function openActivityPicker(parentEl, parentId, currentType, onSelect) {
    const Registry = window.ActivityTypeRegistry;
    if (!Registry) return;

    const pickerId = `activityPicker-${Date.now()}`;
    const categories = Registry.getCategories();

    let categoriesHtml = '';
    categories.forEach(cat => {
        const types = Registry.getByCategory(cat.id);
        const items = types.map(t => {
            const activeClass = t.id === currentType ? 'fw-semibold text-primary' : '';
            return `<div class="activity-picker-item ${activeClass}" data-type-id="${escapeHtml(t.id)}" role="button">
                <i class="bx ${escapeHtml(t.icon)} me-2"></i>
                <span class="flex-grow-1">${escapeHtml(t.name)}</span>
                ${t.id === currentType ? '<i class="bx bx-check text-primary"></i>' : ''}
            </div>`;
        }).join('');

        categoriesHtml += `
            <div class="mb-3">
                <h6 class="text-uppercase text-muted small fw-semibold mb-2">
                    <i class="bx ${escapeHtml(cat.icon)} me-1"></i>${escapeHtml(cat.name)}
                </h6>
                ${items}
            </div>
        `;
    });

    const pickerHtml = `
        <div class="offcanvas offcanvas-bottom offcanvas-bottom-base"
             tabindex="-1" id="${pickerId}" aria-labelledby="${pickerId}Label"
             data-bs-scroll="false" style="height: auto; max-height: 80vh;">
            <div class="offcanvas-header border-bottom">
                <h5 class="offcanvas-title" id="${pickerId}Label">
                    <i class="bx bx-category me-2"></i>Choose Activity Type
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
            </div>
            <div class="offcanvas-body py-3" style="overflow-y: auto;">
                ${categoriesHtml}
            </div>
        </div>
    `;

    createOffcanvas(pickerId, pickerHtml, (pickerOffcanvas, pickerEl) => {
        pickerEl.addEventListener('click', (e) => {
            const item = e.target.closest('.activity-picker-item');
            if (!item) return;
            const typeId = item.dataset.typeId;
            if (!typeId) return;
            pickerOffcanvas.hide();
            setTimeout(() => onSelect(typeId), 200);
        });
    });
}

console.log('📦 Offcanvas Cardio Editor module loaded');
