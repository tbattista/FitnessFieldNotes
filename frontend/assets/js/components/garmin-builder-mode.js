/**
 * Garmin mode for the workout builder.
 * A Garmin activity opens in the builder as a workout: one row per exercise
 * with the watch's sets x reps, rest and heaviest weight, plus a Garmin panel
 * (date, duration, heart rate, what the watch recorded per exercise). Edit the
 * rows as usual; Save becomes "Log session", which saves the session (against
 * an existing workout or a new one) linked to the Garmin activity.
 *
 * Garmin page -> POST /api/v3/garmin/import/builder-draft -> open(draft)
 *   -> workout-builder.html?garmin=1 -> builder boot calls start()
 *   -> Log session -> POST /api/v3/garmin/import/log-from-builder
 * @version 1.0.0
 */
(function () {
    'use strict';

    const KEY = 'ffn_garmin_builder_draft';
    const state = { draft: null, indexByGroupId: {}, saving: false };

    function esc(text) {
        const div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    }

    function readDraft() {
        try {
            return JSON.parse(sessionStorage.getItem(KEY) || 'null');
        } catch (e) {
            return null;
        }
    }

    function clearDraft() {
        try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    }

    function fmtWhen(iso) {
        return new Date(iso).toLocaleString([], {
            weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }

    function weightText(w) {
        if (w == null) return null;
        return Number.isInteger(w) ? String(w) : String(Math.round(w * 2) / 2);
    }

    function recordedText(ge) {
        const sets = (ge.set_details || []).map(d => {
            const reps = d.reps_completed ? d.reps_completed : (d.duration_s ? `${Math.round(d.duration_s)}s` : '?');
            return d.weight != null ? `${reps}×${weightText(d.weight)}` : `${reps}`;
        });
        const hasWeight = (ge.set_details || []).some(d => d.weight != null);
        return sets.join(', ') + (hasWeight && sets.length ? ` ${ge.weight_unit || 'lbs'}` : '');
    }

    function notify(message, type, delay) {
        if (window.showToast) window.showToast({ message, type, delay: delay || 3000 });
    }

    // ── panel ──────────────────────────────────────────────────────────────

    function panelHtml(d) {
        const a = d.activity;
        const stats = [`${Math.round(a.duration_minutes || 0)} min`];
        if (a.avg_heart_rate) stats.push(`${a.avg_heart_rate} bpm avg${a.max_heart_rate ? ` / ${a.max_heart_rate} max` : ''}`);
        if (a.calories) stats.push(`${a.calories} cal`);
        if (a.kind === 'interval' && a.work_seconds) stats.push(`${a.work_seconds}s on / ${a.rest_seconds || 0}s off`);

        const options = (d.workout_options || []).map(o => `
            <option value="${esc(o.id)}" ${o.id === d.target_id ? 'selected' : ''}>${esc(o.name)}${o.reason ? ` (${esc(o.reason)})` : ''}</option>`).join('');
        const rows = (d.garmin_exercises || []).map(ge => `
            <li class="garmin-recorded-row">
              <span class="fw-medium">${esc(ge.exercise_name)}</span>
              <span>${esc(recordedText(ge))}</span>
              <span class="text-muted">${ge.avg_heart_rate ? `${ge.avg_heart_rate} bpm${ge.max_heart_rate ? ` (max ${ge.max_heart_rate})` : ''}` : ''}</span>
            </li>`).join('');

        return `
          <div class="card garmin-builder-panel mb-3" id="garminBuilderPanel">
            <div class="card-body">
              <div class="d-flex flex-wrap align-items-start justify-content-between gap-2">
                <div>
                  <div class="small text-uppercase fw-semibold text-primary"><i class="bx bx-stopwatch me-1"></i>From Garmin</div>
                  <h6 class="mb-0" id="garminBuilderActivity">${esc(a.name)} · ${esc(fmtWhen(a.started_at))}</h6>
                  <div class="small text-muted">${esc(stats.join(' · '))}${a.device ? ` · ${esc(a.device)}` : ''}</div>
                </div>
                <a class="btn btn-sm btn-outline-secondary" href="/garmin.html" id="garminBuilderCancel">Cancel</a>
              </div>

              <details class="mt-3" id="garminRecorded">
                <summary class="small fw-medium">What the watch recorded</summary>
                <ul class="list-unstyled small mt-2 mb-0 garmin-recorded">${rows}</ul>
                <p class="small text-muted mt-2 mb-0">Per-set detail is saved with an exercise as long as you don't change
                  its sets × reps or weight below. Heart rate is always saved.</p>
              </details>

              <div class="row g-2 align-items-end mt-2">
                <div class="col-md-6">
                  <label class="form-label small mb-1" for="garminLogTarget">Log against</label>
                  <select class="form-select form-select-sm" id="garminLogTarget">
                    ${options}
                    <option value="" ${d.target_id ? '' : 'selected'}>New workout (named above)</option>
                  </select>
                </div>
                <div class="col-md-6">
                  <div class="form-check ${d.target_id ? 'd-none' : ''}" id="garminKeepTemplateRow">
                    <input class="form-check-input" type="checkbox" id="garminKeepTemplate">
                    <label class="form-check-label small" for="garminKeepTemplate">Also keep it in my workouts as a template</label>
                  </div>
                </div>
              </div>

              <div class="alert alert-danger small mt-3 mb-0 d-none" id="garminBuilderError" role="alert"></div>
              <div class="d-flex flex-wrap align-items-center gap-2 mt-3">
                <button type="button" class="btn btn-primary" id="garminLogBtn"><i class="bx bx-check me-1"></i>Log session</button>
                <span class="small text-muted">Edit the exercises below first if anything's off.</span>
              </div>
            </div>
          </div>`;
    }

    function bindPanel() {
        const target = document.getElementById('garminLogTarget');
        const keepRow = document.getElementById('garminKeepTemplateRow');
        target.onchange = () => keepRow.classList.toggle('d-none', !!target.value);
        document.getElementById('garminLogBtn').onclick = () => logSession();
    }

    // ── logging ────────────────────────────────────────────────────────────

    async function authHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        try {
            if (window.authService && window.authService.getIdToken) {
                const token = await window.authService.getIdToken();
                if (token) headers.Authorization = `Bearer ${token}`;
            }
        } catch (e) { /* the server will answer 401 */ }
        return headers;
    }

    function collectGroups() {
        const groups = (window.collectExerciseGroups ? window.collectExerciseGroups() : []);
        return groups.map(g => {
            const idx = state.indexByGroupId[g.group_id];
            return idx === undefined ? g : { ...g, garmin_index: idx };
        });
    }

    async function logSession() {
        if (state.saving) return;
        const d = state.draft;
        const errorBox = document.getElementById('garminBuilderError');
        const btn = document.getElementById('garminLogBtn');
        const showError = msg => {
            errorBox.textContent = msg;
            errorBox.classList.remove('d-none');
        };
        errorBox.classList.add('d-none');

        const name = (document.getElementById('workoutName') || {}).value || '';
        const groups = collectGroups();
        if (!name.trim()) return showError('Give the workout a name.');
        if (!groups.length) return showError('Add at least one exercise before logging.');

        const targetId = document.getElementById('garminLogTarget').value || null;
        state.saving = true;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Logging…';
        try {
            const response = await fetch('/api/v3/garmin/import/log-from-builder', {
                method: 'POST',
                headers: await authHeaders(),
                body: JSON.stringify({
                    activity: d.activity,
                    pending_id: d.pending_id || null,
                    workout_name: name.trim(),
                    exercise_groups: groups,
                    garmin_exercises: d.garmin_exercises || [],
                    target_id: targetId,
                    save_as_template: !targetId && document.getElementById('garminKeepTemplate').checked,
                    weight_unit: (d.garmin_exercises[0] || {}).weight_unit || 'lbs',
                }),
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(response.status === 401 ? 'Sign in to log this session.'
                    : (typeof err.detail === 'string' ? err.detail : 'Logging failed.'));
            }
            const result = await response.json();
            clearDraft();
            if (window.ffn && window.ffn.workoutBuilder) window.ffn.workoutBuilder.isDirty = false;
            notify(result.message || 'Session logged', 'success');
            setTimeout(() => { window.location.href = '/garmin.html'; }, 900);
        } catch (e) {
            showError(e.message);
            state.saving = false;
            btn.disabled = false;
            btn.innerHTML = '<i class="bx bx-check me-1"></i>Log session';
        }
    }

    // ── public ─────────────────────────────────────────────────────────────

    const mode = {
        KEY,

        /** From the Garmin page: keep the draft and open the builder. */
        open(draft) {
            try { sessionStorage.setItem(KEY, JSON.stringify(draft)); } catch (e) { /* ignore */ }
            window.location.href = '/workout-builder.html?garmin=1';
        },

        /** True when the builder was opened for a Garmin activity. */
        isRequested() {
            return new URLSearchParams(window.location.search).get('garmin') === '1' && !!readDraft();
        },

        /** Fill the builder and switch it into Garmin mode (called from the builder's boot). */
        start() {
            const draft = readDraft();
            if (!draft || !window.importService) return false;
            state.draft = draft;

            const before = new Set(Object.keys(window.exerciseGroupsData || {}));
            window.importService.populateBuilder(draft.workout);
            // populateBuilder creates one group per draft row, in order.
            const created = Object.keys(window.exerciseGroupsData || {}).filter(id => !before.has(id));
            state.indexByGroupId = {};
            created.forEach((groupId, i) => { state.indexByGroupId[groupId] = i; });

            document.body.classList.add('garmin-builder-mode');
            const form = document.getElementById('workoutEditorForm');
            if (form && !document.getElementById('garminBuilderPanel')) {
                form.insertAdjacentHTML('afterbegin', panelHtml(draft));
                bindPanel();
            }
            // Every Save in the builder (toolbar, mobile button, shortcuts) logs the session instead.
            window.saveWorkoutFromEditor = logSession;
            const saveBtn = document.getElementById('saveWorkoutBtn');
            if (saveBtn && saveBtn.classList.contains('btn')) {
                saveBtn.innerHTML = '<i class="bx bx-check me-1"></i>Log session';
            }
            return true;
        },

        _state: state,
    };

    window.garminBuilderMode = mode;
})();
