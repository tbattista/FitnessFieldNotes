/**
 * Activity Log - Core Controller
 * Handles activity type selection, form management, and session creation.
 * Uses ActivityTypeRegistry for type metadata and favorites.
 * @version 1.1.0
 */

// Global state
window.ffn = window.ffn || {};
window.ffn.activityLog = {
    sessions: [],
    selectedActivity: null,
    formMode: 'quick',
    selectedRpe: null
};

// --- INITIALIZATION ---

/**
 * Initialize the activity log page
 */
async function initActivityLog() {
    console.log('🏃 Initializing Activity Log');

    renderActivityGrid();
    setupActivityTypeSelector();
    setupRpeSelector();
    setupFormListeners();
    setupDetailsToggle();

    // Load recent sessions
    if (window.loadRecentCardioSessions) {
        await window.loadRecentCardioSessions();
    }

    console.log('✅ Activity Log initialized');
}

// --- ACTIVITY GRID RENDERING ---

/**
 * Render the favorites grid + "More" button dynamically from registry
 */
function renderActivityGrid() {
    const grid = document.getElementById('activityTypeGrid');
    if (!grid) return;

    const registry = window.ActivityTypeRegistry;
    const favorites = registry.getFavorites();
    const state = window.ffn.activityLog;

    let html = favorites.map(id => {
        const type = registry.getById(id);
        const isActive = state.selectedActivity === id ? ' active' : '';
        return `<button type="button" class="activity-type-btn${isActive}" data-type="${id}" title="${type.name}">
            <i class="bx ${type.icon}"></i>
            <span>${type.shortName}</span>
        </button>`;
    }).join('');

    // "More" button as last slot
    html += `<button type="button" class="activity-type-btn activity-type-more-btn" id="moreActivitiesBtn" title="More activities">
        <i class="bx bx-plus"></i>
        <span>More</span>
    </button>`;

    grid.innerHTML = html;
}

/**
 * Highlight the selected activity in the grid.
 * If it's not a favorite, temporarily show it in place of the "More" button label.
 */
function highlightSelectedActivity(type) {
    const state = window.ffn.activityLog;
    const registry = window.ActivityTypeRegistry;
    const favorites = registry.getFavorites();

    // Clear all active states
    document.querySelectorAll('.activity-type-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // If it's a favorite, highlight the matching grid button
    const matchingBtn = document.querySelector(`.activity-type-btn[data-type="${type}"]`);
    if (matchingBtn) {
        matchingBtn.classList.add('active');
        return;
    }

    // Not a favorite — show it on the "More" button temporarily
    const moreBtn = document.getElementById('moreActivitiesBtn');
    if (moreBtn) {
        const typeInfo = registry.getById(type);
        moreBtn.classList.add('active');
        moreBtn.innerHTML = `<i class="bx ${typeInfo.icon}"></i><span>${typeInfo.shortName}</span>`;
    }
}

// --- ACTIVITY PICKER OFFCANVAS ---

/**
 * Open the full activity type picker offcanvas
 */
function openActivityPicker() {
    const registry = window.ActivityTypeRegistry;
    const favorites = registry.getFavorites();
    const categories = registry.getCategories();

    let bodyHtml = categories.map(cat => {
        const types = registry.getByCategory(cat.id);
        return `
            <div class="mb-3">
                <h6 class="text-uppercase text-muted small fw-semibold mb-2">
                    <i class="bx ${cat.icon} me-1"></i>${cat.name}
                </h6>
                <div class="activity-picker-list">
                    ${types.map(t => {
                        const isFav = favorites.includes(t.id);
                        return `
                        <div class="activity-picker-item" data-type="${t.id}">
                            <i class="bx ${t.icon} me-2"></i>
                            <span class="flex-grow-1">${t.name}</span>
                            <button class="btn btn-sm btn-icon favorite-toggle ${isFav ? 'active' : ''}"
                                    data-favorite="${t.id}" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
                                <i class="bx ${isFav ? 'bxs-star' : 'bx-star'}"></i>
                            </button>
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
    }).join('');

    const offcanvasHtml = `
        <div class="offcanvas offcanvas-bottom offcanvas-bottom-base" tabindex="-1"
             id="activityPickerOffcanvas" data-bs-scroll="false"
             style="height: 75vh;">
            <div class="offcanvas-header border-bottom">
                <h5 class="offcanvas-title">
                    <i class="bx bx-category me-2"></i>All Activities
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
            </div>
            <div class="offcanvas-body">
                <p class="text-muted small mb-3">Tap an activity to log it. Star your favorites to pin them to the grid.</p>
                ${bodyHtml}
            </div>
        </div>`;

    window.offcanvasManager.create('activityPickerOffcanvas', offcanvasHtml, (offcanvas, el) => {
        // Click on activity item → select it and close
        el.querySelectorAll('.activity-picker-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.favorite-toggle')) return;
                const type = item.dataset.type;
                selectActivity(type);
                highlightSelectedActivity(type);
                offcanvas.hide();
            });
        });

        // Star toggle → add/remove from favorites
        el.querySelectorAll('.favorite-toggle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.favorite;
                const currentFavs = registry.getFavorites();

                if (currentFavs.includes(id)) {
                    registry.removeFavorite(id);
                    btn.classList.remove('active');
                    btn.querySelector('i').className = 'bx bx-star';
                    btn.title = 'Add to favorites';
                } else {
                    if (currentFavs.length >= 8) {
                        window.toastNotifications?.warning('Maximum 8 favorites. Remove one first.');
                        return;
                    }
                    registry.addFavorite(id);
                    btn.classList.add('active');
                    btn.querySelector('i').className = 'bx bxs-star';
                    btn.title = 'Remove from favorites';
                }
                renderActivityGrid();
            });
        });
    });
}

// --- ACTIVITY TYPE SELECTION ---

/**
 * Set up activity type button click handlers (event delegation)
 */
function setupActivityTypeSelector() {
    const grid = document.getElementById('activityTypeGrid');
    if (!grid) return;

    grid.addEventListener('click', (e) => {
        const btn = e.target.closest('.activity-type-btn');
        if (!btn) return;

        // "More" button opens the picker
        if (btn.id === 'moreActivitiesBtn') {
            openActivityPicker();
            return;
        }

        const type = btn.dataset.type;
        if (type) selectActivity(type);
    });
}

/**
 * Select an activity type and update UI accordingly
 */
function selectActivity(type) {
    const state = window.ffn.activityLog;
    state.selectedActivity = type;

    // Update button states
    highlightSelectedActivity(type);

    // Show session name field and update placeholder
    const nameRow = document.getElementById('sessionNameRow');
    const nameInput = document.getElementById('sessionName');
    if (nameRow) nameRow.style.display = '';
    if (nameInput) {
        const registry = window.ActivityTypeRegistry;
        const typeName = registry ? registry.getName(type) : type;
        nameInput.placeholder = `e.g., Morning ${typeName}, Leg Day ${typeName}`;
    }

    // Show/hide conditional fields based on activity
    updateConditionalFields(type);

    // Enable log button if we have an activity selected
    updateLogButtonState();
}

/**
 * Show/hide fields based on selected activity type
 */
function updateConditionalFields(type) {
    const config = window.ActivityTypeRegistry.getFieldConfig(type);

    const fieldMap = {
        distance: 'distanceRow',
        pace: 'paceRow',
        elevation: 'elevationRow',
        cadence: 'cadenceRow',
        strokeRate: 'strokeRateRow',
        laps: 'lapsRow',
        incline: 'inclineRow'
    };

    Object.entries(fieldMap).forEach(([key, rowId]) => {
        const row = document.getElementById(rowId);
        if (row) {
            row.style.display = config[key] ? '' : 'none';
        }
    });
}

// --- RPE SELECTOR ---

function setupRpeSelector() {
    const selector = document.getElementById('rpeSelector');
    if (!selector) return;

    selector.addEventListener('click', (e) => {
        const btn = e.target.closest('.rpe-btn');
        if (!btn) return;

        const rpe = parseInt(btn.dataset.rpe);
        const state = window.ffn.activityLog;

        if (state.selectedRpe === rpe) {
            state.selectedRpe = null;
            btn.classList.remove('active');
        } else {
            state.selectedRpe = rpe;
            document.querySelectorAll('.rpe-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        }
    });
}

// --- FORM LISTENERS & PACE CALCULATION ---

function setupFormListeners() {
    const distanceInput = document.getElementById('distance');
    const hoursInput = document.getElementById('durationHours');
    const minutesInput = document.getElementById('durationMinutes');

    [distanceInput, hoursInput, minutesInput].forEach(input => {
        if (input) input.addEventListener('input', calculateAndDisplayPace);
    });

    const logBtn = document.getElementById('logSessionBtn');
    if (logBtn) logBtn.addEventListener('click', saveCardioSession);

    [hoursInput, minutesInput].forEach(input => {
        if (input) input.addEventListener('input', updateLogButtonState);
    });
}

function setupDetailsToggle() {
    const collapseEl = document.getElementById('detailedFields');
    if (!collapseEl) return;

    collapseEl.addEventListener('show.bs.collapse', () => {
        const icon = document.getElementById('detailsToggleIcon');
        const text = document.getElementById('detailsToggleText');
        if (icon) icon.className = 'bx bx-minus-circle me-1';
        if (text) text.textContent = 'Hide Details';
    });

    collapseEl.addEventListener('hide.bs.collapse', () => {
        const icon = document.getElementById('detailsToggleIcon');
        const text = document.getElementById('detailsToggleText');
        if (icon) icon.className = 'bx bx-plus-circle me-1';
        if (text) text.textContent = 'Add Details';
    });
}

function calculateAndDisplayPace() {
    const distance = parseFloat(document.getElementById('distance')?.value) || 0;
    const hours = parseInt(document.getElementById('durationHours')?.value) || 0;
    const minutes = parseInt(document.getElementById('durationMinutes')?.value) || 0;
    const totalMinutes = (hours * 60) + minutes;
    const paceInput = document.getElementById('pace');

    if (!paceInput) return;

    if (distance > 0 && totalMinutes > 0) {
        const paceMinutes = totalMinutes / distance;
        const paceMins = Math.floor(paceMinutes);
        const paceSecs = Math.round((paceMinutes - paceMins) * 60);
        const unit = document.getElementById('distanceUnit')?.value || 'mi';
        paceInput.value = `${paceMins}:${String(paceSecs).padStart(2, '0')} /${unit}`;
    } else {
        paceInput.value = '';
    }
}

function updateLogButtonState() {
    const btn = document.getElementById('logSessionBtn');
    if (!btn) return;

    const state = window.ffn.activityLog;
    const hours = parseInt(document.getElementById('durationHours')?.value) || 0;
    const minutes = parseInt(document.getElementById('durationMinutes')?.value) || 0;
    const totalMinutes = (hours * 60) + minutes;

    btn.disabled = !state.selectedActivity || totalMinutes < 1;
}

// --- SAVE SESSION ---

async function saveCardioSession() {
    const state = window.ffn.activityLog;
    const btn = document.getElementById('logSessionBtn');

    if (!state.selectedActivity) return;

    const hours = parseInt(document.getElementById('durationHours')?.value) || 0;
    const minutes = parseInt(document.getElementById('durationMinutes')?.value) || 0;
    const totalMinutes = (hours * 60) + minutes;

    if (totalMinutes < 1) return;

    const dateTimeValue = document.getElementById('sessionDateTime')?.value;
    const startedAt = dateTimeValue ? new Date(dateTimeValue).toISOString() : new Date().toISOString();

    const data = {
        activity_type: state.selectedActivity,
        duration_minutes: totalMinutes,
        started_at: startedAt
    };

    // Custom session name
    const sessionName = document.getElementById('sessionName')?.value?.trim();
    if (sessionName) data.activity_name = sessionName;

    // Optional fields
    const distance = parseFloat(document.getElementById('distance')?.value);
    if (distance > 0) {
        data.distance = distance;
        data.distance_unit = document.getElementById('distanceUnit')?.value || 'mi';
    }

    const paceValue = document.getElementById('pace')?.value;
    if (paceValue && paceValue !== '--:--') data.pace_per_unit = paceValue;

    const avgHr = parseInt(document.getElementById('avgHeartRate')?.value);
    if (avgHr > 0) data.avg_heart_rate = avgHr;
    const maxHr = parseInt(document.getElementById('maxHeartRate')?.value);
    if (maxHr > 0) data.max_heart_rate = maxHr;

    const calories = parseInt(document.getElementById('calories')?.value);
    if (calories > 0) data.calories = calories;

    if (state.selectedRpe) data.rpe = state.selectedRpe;

    const elevation = parseInt(document.getElementById('elevationGain')?.value);
    if (elevation > 0) {
        data.elevation_gain = elevation;
        data.elevation_unit = document.getElementById('elevationUnit')?.value || 'ft';
    }

    // Activity-specific details
    const detailFields = [
        ['cadence', 'cadence_rpm'], ['strokeRate', 'stroke_rate'], ['laps', 'laps'],
        ['poolLength', 'pool_length_m'], ['incline', 'incline_percent']
    ];
    const activityDetails = {};
    detailFields.forEach(([elId, key]) => {
        const val = parseInt(document.getElementById(elId)?.value);
        if (val > 0) activityDetails[key] = val;
    });
    if (Object.keys(activityDetails).length > 0) data.activity_details = activityDetails;

    const notes = document.getElementById('sessionNotes')?.value?.trim();
    if (notes) data.notes = notes;

    // Submit
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span>Saving...';

    try {
        const token = await window.dataManager.getAuthToken();
        const response = await fetch('/api/v3/cardio-sessions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to save session');
        }

        const session = await response.json();
        console.log('✅ Cardio session saved:', session.id);

        if (window.toastNotifications) window.toastNotifications.success('Session logged!');
        resetForm();

        if (window.loadRecentCardioSessions) await window.loadRecentCardioSessions();

    } catch (error) {
        console.error('Failed to save cardio session:', error);
        if (window.toastNotifications) window.toastNotifications.error('Failed to save session');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bx bx-check me-1"></i>Log Session';
        updateLogButtonState();
    }
}

// --- FORM RESET ---

function resetForm() {
    const state = window.ffn.activityLog;

    document.getElementById('durationHours').value = '0';
    document.getElementById('durationMinutes').value = '30';

    const now = new Date();
    const localIso = now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0') + 'T' +
        String(now.getHours()).padStart(2, '0') + ':' +
        String(now.getMinutes()).padStart(2, '0');
    document.getElementById('sessionDateTime').value = localIso;

    // Reset session name
    const nameInput = document.getElementById('sessionName');
    if (nameInput) nameInput.value = '';
    const nameRow = document.getElementById('sessionNameRow');
    if (nameRow) nameRow.style.display = 'none';

    ['distance', 'pace', 'avgHeartRate', 'maxHeartRate', 'calories',
     'elevationGain', 'cadence', 'strokeRate', 'laps', 'poolLength', 'incline',
     'sessionNotes'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    state.selectedRpe = null;
    document.querySelectorAll('.rpe-btn').forEach(b => b.classList.remove('active'));

    const detailedFields = document.getElementById('detailedFields');
    if (detailedFields?.classList.contains('show')) {
        const collapse = bootstrap.Collapse.getInstance(detailedFields);
        if (collapse) collapse.hide();
    }

    updateLogButtonState();
}

// --- EXPORTS ---
window.initActivityLog = initActivityLog;
