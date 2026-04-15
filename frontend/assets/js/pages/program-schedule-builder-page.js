/**
 * Program Schedule Builder Page
 *
 * Lets the user build a weekly schedule for a program:
 *   - Week Grid tab: edit (Mon-Sun × N weeks) slots
 *   - Calendar tab: view the projected schedule + adherence
 *
 * Expects ?programId=<id> in the URL. Works with schedule_type='weekly' programs.
 */
(function() {
    'use strict';

    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const DAY_LABELS_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

    // --- State ---
    const state = {
        programId: null,
        program: null,
        workouts: [],
        weekGrid: null,
        pickerTargetSlot: null,     // { week, day } while workout picker modal is open
        dirty: false,
        calendarMonth: null,        // Date — first of the currently-viewed month
        adherence: null,            // cached adherence response
    };

    function escapeHtml(s) {
        if (!s) return '';
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    function showAlert(message, type = 'info') {
        const container = document.getElementById('alertContainer');
        if (!container) return;
        container.innerHTML = `<div class="alert alert-${type} alert-dismissible" role="alert">
            ${escapeHtml(message)}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>`;
    }

    function markDirty() {
        state.dirty = true;
        const btn = document.getElementById('psb-save-btn');
        if (btn) btn.disabled = false;
    }

    function markClean() {
        state.dirty = false;
        const btn = document.getElementById('psb-save-btn');
        if (btn) btn.disabled = true;
    }

    // --- Initialization ---
    async function init() {
        const params = new URLSearchParams(window.location.search);
        state.programId = params.get('programId');
        if (!state.programId) {
            showAlert('No programId in URL. Go back to Programs and pick one.', 'warning');
            return;
        }

        // Wait for Firebase + data manager to be ready
        if (!window.firebaseReady) {
            await new Promise(r => window.addEventListener('firebaseReady', r, { once: true }));
        }
        if (!window.dataManager) {
            showAlert('Data manager not available.', 'danger');
            return;
        }
        if (window.dataManager.waitForAuthReady) {
            await window.dataManager.waitForAuthReady();
        }

        try {
            // Load program + workouts in parallel
            const [programs, workouts] = await Promise.all([
                window.dataManager.getPrograms({ pageSize: 100 }),
                window.dataManager.getWorkouts({ pageSize: 500 })
            ]);
            state.workouts = workouts || [];
            state.program = (programs || []).find(p => p.id === state.programId);
            if (!state.program) {
                showAlert('Program not found.', 'warning');
                return;
            }

            // Default to weekly if not yet scheduled
            if (!state.program.schedule_type) {
                state.program.schedule_type = 'weekly';
            }
            if (!state.program.weeks_in_cycle) {
                state.program.weeks_in_cycle = 1;
            }
            if (!Array.isArray(state.program.schedule)) {
                state.program.schedule = [];
            }
            if (!state.program.start_date) {
                // Default start date: next Monday
                const d = new Date();
                const dow = (d.getDay() + 6) % 7; // Mon=0
                const daysUntilMonday = dow === 0 ? 0 : 7 - dow;
                d.setDate(d.getDate() + daysUntilMonday);
                state.program.start_date = d.toISOString().slice(0, 10);
            }
            if (!state.program.duration_weeks) {
                state.program.duration_weeks = Math.max(4, state.program.weeks_in_cycle * 4);
            }

            renderHeader();
            renderMetaBar();
            initWeekGrid();
            initPickerModal();
            initCalendar();
            attachSaveHandler();
            attachAddWeekHandler();
            attachTabHandler();
        } catch (err) {
            console.error('Failed to initialize program schedule builder:', err);
            showAlert('Failed to load program.', 'danger');
        }
    }

    // --- Header ---
    function renderHeader() {
        const nameEl = document.getElementById('psb-program-name');
        const metaEl = document.getElementById('psb-program-meta');
        if (nameEl) nameEl.textContent = state.program.name || 'Program Schedule';
        if (metaEl) {
            const parts = [];
            if (state.program.description) parts.push(state.program.description);
            metaEl.textContent = parts.join(' · ');
        }
        document.title = `${state.program.name} - Schedule`;
    }

    // --- Meta Bar (start date, weeks in cycle, duration) ---
    function renderMetaBar() {
        const startEl = document.getElementById('psb-start-date');
        const weeksEl = document.getElementById('psb-weeks-in-cycle');
        const durEl = document.getElementById('psb-duration-weeks');

        if (startEl) startEl.value = state.program.start_date || '';
        if (weeksEl) weeksEl.value = state.program.weeks_in_cycle || 1;
        if (durEl) durEl.value = state.program.duration_weeks || 4;

        startEl?.addEventListener('change', () => {
            state.program.start_date = startEl.value;
            markDirty();
            refreshCalendarIfVisible();
        });
        weeksEl?.addEventListener('change', () => {
            const n = Math.max(1, parseInt(weeksEl.value, 10) || 1);
            state.program.weeks_in_cycle = n;
            if (state.weekGrid) {
                state.weekGrid.setWeeksInCycle(n);
                state.weekGrid.render();
            }
            markDirty();
            refreshCalendarIfVisible();
        });
        durEl?.addEventListener('change', () => {
            state.program.duration_weeks = Math.max(1, parseInt(durEl.value, 10) || 1);
            markDirty();
            refreshCalendarIfVisible();
        });
    }

    // --- Week Grid ---
    function initWeekGrid() {
        const host = document.getElementById('psb-week-grid-host');
        if (!host || !window.ProgramWeekGrid) return;

        state.weekGrid = new window.ProgramWeekGrid({
            host,
            workouts: state.workouts,
            weeksInCycle: state.program.weeks_in_cycle,
            schedule: state.program.schedule,
            onSlotClick: (week, day, existing) => {
                state.pickerTargetSlot = { week, day };
                openPickerModal();
            },
            onChange: (newSchedule) => {
                state.program.schedule = newSchedule;
                markDirty();
                refreshCalendarIfVisible();
            }
        });
        state.weekGrid.render();
    }

    function attachAddWeekHandler() {
        const btn = document.getElementById('psb-add-week-btn');
        if (!btn) return;
        btn.addEventListener('click', () => {
            const n = (state.program.weeks_in_cycle || 1) + 1;
            state.program.weeks_in_cycle = n;
            const weeksEl = document.getElementById('psb-weeks-in-cycle');
            if (weeksEl) weeksEl.value = n;
            if (state.weekGrid) {
                state.weekGrid.setWeeksInCycle(n);
                state.weekGrid.render();
            }
            markDirty();
        });
    }

    // --- Workout Picker Modal ---
    let pickerModal = null;
    function initPickerModal() {
        const modalEl = document.getElementById('psb-workout-picker-modal');
        if (!modalEl) return;
        pickerModal = new bootstrap.Modal(modalEl);

        const searchEl = document.getElementById('psb-picker-search');
        if (searchEl) {
            searchEl.addEventListener('input', () => renderPickerList(searchEl.value));
        }
    }

    function openPickerModal() {
        if (!pickerModal) return;
        const searchEl = document.getElementById('psb-picker-search');
        if (searchEl) searchEl.value = '';
        renderPickerList('');
        pickerModal.show();
    }

    function renderPickerList(searchTerm) {
        const list = document.getElementById('psb-picker-list');
        if (!list) return;

        const term = (searchTerm || '').trim().toLowerCase();
        const filtered = state.workouts.filter(w => {
            if (!term) return true;
            return (w.name || '').toLowerCase().includes(term);
        });

        if (filtered.length === 0) {
            list.innerHTML = `<div class="p-4 text-center text-muted small">No workouts match.</div>`;
            return;
        }

        list.innerHTML = filtered.map(w => `
            <button type="button" class="list-group-item list-group-item-action d-flex align-items-center"
                    data-workout-id="${escapeHtml(w.id)}">
                <i class="bx bx-dumbbell me-2 text-muted"></i>
                <span class="flex-grow-1 text-start">${escapeHtml(w.name)}</span>
            </button>
        `).join('');

        list.querySelectorAll('[data-workout-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                const wid = btn.dataset.workoutId;
                if (!state.pickerTargetSlot) return;
                const { week, day } = state.pickerTargetSlot;
                if (state.weekGrid) state.weekGrid.addEntry(week, day, wid);
                state.pickerTargetSlot = null;
                if (pickerModal) pickerModal.hide();
            });
        });
    }

    // --- Save ---
    function attachSaveHandler() {
        const btn = document.getElementById('psb-save-btn');
        if (!btn) return;
        btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.innerHTML = '<i class="bx bx-loader bx-spin me-1"></i>Saving...';
            try {
                const payload = {
                    schedule_type: 'weekly',
                    schedule: state.program.schedule || [],
                    weeks_in_cycle: state.program.weeks_in_cycle || 1,
                    start_date: state.program.start_date || null,
                    duration_weeks: state.program.duration_weeks || null
                };
                const updated = await window.dataManager.updateProgram(state.programId, payload);
                if (updated) state.program = { ...state.program, ...updated };
                markClean();
                showAlert('Schedule saved.', 'success');
                refreshCalendarIfVisible();
            } catch (err) {
                console.error('Save failed:', err);
                showAlert('Failed to save schedule.', 'danger');
            } finally {
                btn.innerHTML = '<i class="bx bx-save me-1"></i>Save';
            }
        });
    }

    // --- Calendar (projected schedule + adherence) ---
    function initCalendar() {
        const start = state.program.start_date
            ? new Date(state.program.start_date)
            : new Date();
        state.calendarMonth = new Date(start.getFullYear(), start.getMonth(), 1);
    }

    function attachTabHandler() {
        const tabBtn = document.querySelector('[data-bs-target="#psb-tab-calendar"]');
        if (!tabBtn) return;
        tabBtn.addEventListener('shown.bs.tab', async () => {
            await refreshCalendar();
        });
    }

    async function refreshCalendarIfVisible() {
        const tab = document.getElementById('psb-tab-calendar');
        if (tab && tab.classList.contains('active')) {
            await refreshCalendar();
        }
    }

    async function refreshCalendar() {
        // Fetch adherence (authenticated users only)
        state.adherence = null;
        try {
            if (window.authService?.isUserAuthenticated()) {
                const token = await window.authService.getIdToken();
                if (token) {
                    const url = window.config.api.getUrl(`/api/v3/firebase/programs/${state.programId}/adherence`);
                    const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
                    if (resp.ok) state.adherence = await resp.json();
                }
            }
        } catch (err) {
            console.warn('Adherence fetch failed:', err);
        }
        renderCalendar();
        renderAdherenceSummary();
    }

    function renderCalendar() {
        const host = document.getElementById('psb-calendar-host');
        if (!host) return;

        const month = state.calendarMonth;
        const monthLabel = `${MONTH_NAMES[month.getMonth()]} ${month.getFullYear()}`;

        // Build a map of YYYY-MM-DD -> { scheduledName, completed }
        const dayMap = buildDayMap();

        // Calculate grid: start Monday
        const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
        const lastOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0);
        const firstDow = (firstOfMonth.getDay() + 6) % 7; // Mon=0

        let html = `
            <div class="psb-cal-header d-flex align-items-center justify-content-between mb-2">
                <button type="button" class="btn btn-sm btn-text-secondary" id="psb-cal-prev" aria-label="Previous month">
                    <i class="bx bx-chevron-left"></i>
                </button>
                <h6 class="mb-0">${escapeHtml(monthLabel)}</h6>
                <button type="button" class="btn btn-sm btn-text-secondary" id="psb-cal-next" aria-label="Next month">
                    <i class="bx bx-chevron-right"></i>
                </button>
            </div>
            <div class="psb-cal-grid">
                ${DAY_LABELS_SHORT.map(l => `<div class="psb-cal-day-label">${l}</div>`).join('')}
        `;

        // Leading blanks
        for (let i = 0; i < firstDow; i++) html += `<div class="psb-cal-cell psb-cal-cell--blank"></div>`;

        for (let dayNum = 1; dayNum <= lastOfMonth.getDate(); dayNum++) {
            const d = new Date(month.getFullYear(), month.getMonth(), dayNum);
            const iso = d.toISOString().slice(0, 10);
            const slot = dayMap[iso];
            const hasSlot = !!slot;
            const completed = slot?.completed;
            const cls = [
                'psb-cal-cell',
                hasSlot ? 'psb-cal-cell--scheduled' : '',
                completed ? 'psb-cal-cell--completed' : ''
            ].filter(Boolean).join(' ');

            html += `
                <div class="${cls}">
                    <div class="psb-cal-date">${dayNum}</div>
                    ${hasSlot
                        ? `<div class="psb-cal-slot" title="${escapeHtml(slot.name || '')}">
                               ${completed ? '<i class="bx bx-check-circle psb-cal-check"></i>' : ''}
                               <span class="psb-cal-slot-name">${escapeHtml(slot.name || '')}</span>
                           </div>`
                        : ''
                    }
                </div>`;
        }

        html += `</div>`;
        host.innerHTML = html;

        document.getElementById('psb-cal-prev')?.addEventListener('click', () => {
            state.calendarMonth = new Date(month.getFullYear(), month.getMonth() - 1, 1);
            renderCalendar();
        });
        document.getElementById('psb-cal-next')?.addEventListener('click', () => {
            state.calendarMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);
            renderCalendar();
        });
    }

    function buildDayMap() {
        const map = {};
        if (!state.program.start_date || !Array.isArray(state.program.schedule) || state.program.schedule.length === 0) {
            return map;
        }

        const start = new Date(state.program.start_date + 'T00:00:00');
        const duration = state.program.duration_weeks || state.program.weeks_in_cycle || 1;
        const weeksInCycle = state.program.weeks_in_cycle || 1;

        // Build workout_id -> name lookup
        const nameById = {};
        state.workouts.forEach(w => { nameById[w.id] = w.name; });

        // Build adherence lookup: { week_index (1-based) -> Set of completed workout_ids }
        const adherenceByWeek = {};
        if (state.adherence?.weeks) {
            state.adherence.weeks.forEach(w => {
                const set = new Set();
                (w.entries || []).forEach(e => {
                    if (e.completed) set.add(`${e.workout_id}|${e.day_of_week}`);
                });
                adherenceByWeek[w.week_index] = set;
            });
        }

        for (let wi = 0; wi < duration; wi++) {
            const weekStart = new Date(start);
            weekStart.setDate(weekStart.getDate() + wi * 7);
            const cycleWeek = (wi % weeksInCycle) + 1;
            const slots = state.program.schedule.filter(e => e.week_number === cycleWeek);

            slots.forEach(slot => {
                const d = new Date(weekStart);
                d.setDate(d.getDate() + slot.day_of_week);
                const iso = d.toISOString().slice(0, 10);
                const completedSet = adherenceByWeek[wi + 1] || new Set();
                map[iso] = {
                    name: slot.custom_name || nameById[slot.workout_id] || slot.workout_id,
                    completed: completedSet.has(`${slot.workout_id}|${slot.day_of_week}`)
                };
            });
        }

        return map;
    }

    function renderAdherenceSummary() {
        const host = document.getElementById('psb-adherence-summary');
        if (!host) return;
        if (!state.adherence || state.adherence.schedule_type !== 'weekly') {
            host.innerHTML = '';
            return;
        }
        const a = state.adherence;
        const pct = a.adherence_percentage || 0;
        host.innerHTML = `
            <div class="card">
                <div class="card-body py-3">
                    <div class="d-flex align-items-center gap-3 mb-2">
                        <div class="flex-grow-1">
                            <div class="small text-muted">Adherence</div>
                            <div class="fw-bold">${a.total_completed} / ${a.total_scheduled} workouts</div>
                        </div>
                        <div class="text-end">
                            <div class="small text-muted">Current week</div>
                            <div class="fw-bold">${a.current_week || 0} / ${a.duration_weeks || 0}</div>
                        </div>
                    </div>
                    <div class="progress" style="height: 6px;">
                        <div class="progress-bar bg-${pct >= 80 ? 'success' : 'primary'}" style="width: ${pct}%"></div>
                    </div>
                </div>
            </div>
        `;
    }

    // --- Unsaved-changes warning ---
    window.addEventListener('beforeunload', (e) => {
        if (state.dirty) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    document.addEventListener('DOMContentLoaded', init);
})();
