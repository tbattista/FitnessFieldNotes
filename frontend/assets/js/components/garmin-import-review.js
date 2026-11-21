/**
 * Garmin Import Review
 * Reviews one Garmin activity inside a container on the page: an uploaded
 * .fit/.zip file, or an activity from the Garmin page's list. Shows the
 * proposed match and the exercise names, then imports, merges or dismisses.
 *
 *   window.garminImportReview.mount(container, {
 *       mode: 'upload' | 'activity', activityId, onClose(changed) })
 *
 * Also used on History: undoFromHistory() and the "to review" banner.
 * Requires window.garminImportService.
 * @version 2.0.0
 */
(function () {
    'use strict';

    const KG_TO_LB = 2.20462;

    const state = { host: null, opts: {}, preview: null, unit: 'lbs', result: null, changed: false };

    // ── helpers ────────────────────────────────────────────────────────────

    function esc(text) {
        const div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    }

    function fmtDateTime(iso) {
        if (!iso) return '';
        return new Date(iso).toLocaleString([], {
            weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
        });
    }

    function fmtMinutes(mins) {
        const m = Math.round(mins || 0);
        return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
    }

    function weightIn(kg, unit) {
        if (kg == null) return null;
        const v = unit === 'kg' ? kg : kg * KG_TO_LB;
        const rounded = Math.round(v * 2) / 2;
        return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    }

    function setsSummary(sets, unit) {
        return sets.map(s => {
            const w = weightIn(s.weight_kg, unit);
            const reps = s.reps != null ? s.reps : (s.duration_s ? `${Math.round(s.duration_s)}s` : '?');
            return w ? `${reps}×${w}` : `${reps}`;
        }).join(', ') + (sets.some(s => s.weight_kg != null) ? ` ${unit}` : '');
    }

    function body() {
        return state.host;
    }

    function close() {
        const cb = state.opts.onClose;
        if (cb) cb(state.changed);
    }

    function notify(message, type) {
        if (window.showToast) window.showToast({ message, type });
    }

    function loading(text) {
        body().innerHTML = `
          <div class="text-center py-5" id="garminImportLoading">
            <div class="spinner-border text-primary" role="status"></div>
            <p class="mt-3 text-muted">${esc(text)}</p>
          </div>`;
    }

    // ── upload a file ──────────────────────────────────────────────────────

    function renderPick(error) {
        state.preview = null;
        state.result = null;
        body().innerHTML = `
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h6 class="mb-0">Upload a Garmin file</h6>
            <button type="button" class="btn btn-sm btn-outline-secondary" id="garminBack">Cancel</button>
          </div>
          ${error ? `<div class="alert alert-danger small" role="alert" id="garminImportError">${esc(error)}</div>` : ''}
          <p class="small text-muted">
            In Garmin Connect on the web, open the activity, click the gear icon, and choose
            <strong>Export Original</strong>. Upload the <code>.zip</code> as it is, or the <code>.fit</code> inside it.
          </p>
          <label class="garmin-dropzone w-100" for="garminFileInput">
            <i class="bx bx-upload fs-2 d-block mb-1"></i>
            <span class="fw-semibold">Choose a .fit or .zip file</span>
          </label>
          <input type="file" class="visually-hidden" id="garminFileInput" accept=".fit,.zip,application/zip">
          <p class="small text-muted mt-3 mb-0">Nothing is saved until you review it.</p>`;
        document.getElementById('garminBack').onclick = close;
        document.getElementById('garminFileInput').addEventListener('change', e => {
            const file = e.target.files && e.target.files[0];
            if (file) upload(file);
        });
    }

    async function upload(file) {
        loading(`Reading ${file.name}…`);
        try {
            state.preview = await window.garminImportService.parseFile(file);
            state.unit = state.preview.weight_unit || 'lbs';
            renderReview();
        } catch (e) {
            renderPick(e.message);
        }
    }

    // ── review ─────────────────────────────────────────────────────────────

    function buildOptions(p) {
        const a = p.activity;
        const opts = [];
        for (const c of p.session_candidates || []) {
            opts.push({ action: 'merge', target_id: c.id, label: `Merge into “${c.name}”`,
                        detail: `${fmtDateTime(c.started_at)} · ${c.reason}` });
        }
        if (a.kind === 'strength' || a.kind === 'interval') {
            for (const w of p.workout_candidates || []) {
                opts.push({ action: 'attach', target_id: w.id, label: `Log as “${w.name}”`, detail: w.reason });
            }
            opts.push({ action: 'new', target_id: null, label: 'New log-only session',
                        detail: 'Saved to your history without changing any workout' });
        } else {
            opts.push({ action: 'new', target_id: null, label: 'New cardio session', detail: 'Saved to your history' });
        }
        opts.push({ action: 'skip', target_id: null,
                    label: state.opts.mode === 'activity' ? 'Dismiss' : "Don't import",
                    detail: state.opts.mode === 'activity' ? 'Moves it to Dismissed. You can restore it later.' : '' });

        const proposed = p.proposed || {};
        for (const o of opts) {
            o.suggested = o.action === proposed.action && (o.target_id || null) === (proposed.target_id || null);
        }
        if (!opts.some(o => o.suggested)) opts[0].suggested = true;
        return opts;
    }

    function summaryHtml(a) {
        const bits = [fmtMinutes(a.duration_minutes)];
        if (a.distance_m) bits.push(`${(a.distance_m / 1609.344).toFixed(2)} mi`);
        if (a.avg_heart_rate) bits.push(`${a.avg_heart_rate} bpm avg${a.max_heart_rate ? ` / ${a.max_heart_rate} max` : ''}`);
        if (a.calories) bits.push(`${a.calories} cal`);
        const setCount = (a.exercises || []).reduce((n, e) => n + e.sets.length, 0);
        if (a.kind !== 'cardio') bits.push(`${setCount} sets`);
        return `
          <div class="d-flex align-items-start justify-content-between gap-2 mb-3">
            <div>
              <h5 class="mb-0" id="garminActivityName">${esc(a.name)}</h5>
              <div class="small text-muted">${esc(fmtDateTime(a.started_at))}${a.device ? ` · ${esc(a.device)}` : ''}</div>
              <div class="small mt-1">${esc(bits.join(' · '))}</div>
            </div>
            <span class="badge bg-label-info flex-shrink-0">${a.kind === 'strength' ? 'Strength' : (a.kind === 'interval' ? 'HIIT' : 'Cardio')}</span>
          </div>`;
    }

    function exercisesHtml(p) {
        const a = p.activity;
        if (a.kind === 'cardio') return '';
        if (!a.exercises.length) {
            return `<div class="alert alert-warning small">This activity has no sets. If you entered it by hand in
                    Garmin Connect, there's nothing to import beyond the time and calories.</div>`;
        }
        const badge = {
            saved: '<span class="badge bg-label-success">Saved</span>',
            exact: '<span class="badge bg-label-success">Matched</span>',
            suggested: '<span class="badge bg-label-warning">Check</span>',
            garmin: '<span class="badge bg-label-warning">Check</span>',
        };
        const rows = a.exercises.map(ex => `
          <div class="garmin-ex-row mb-2" data-garmin-key="${esc(ex.garmin_key)}">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <span class="small text-muted">Garmin: ${esc(ex.garmin_label)}</span>
              ${ex.category === 'unknown' ? '<span class="badge bg-label-danger">Unknown</span>' : (badge[ex.mapping_source] || '')}
            </div>
            <input class="form-control form-control-sm garmin-ex-name" list="garminKnownExercises"
                   value="${esc(ex.mapped_name || '')}" placeholder="Name this exercise"
                   aria-label="Exercise name for Garmin ${esc(ex.garmin_label)}">
            <div class="small text-muted mt-1 garmin-ex-sets">${esc(setsSummary(ex.sets, state.unit))}</div>
          </div>`).join('');
        const known = (p.known_exercises || []).map(n => `<option value="${esc(n)}"></option>`).join('');
        return `
          <div class="d-flex justify-content-between align-items-center mb-2 mt-3">
            <h6 class="mb-0">Exercises</h6>
            <select class="form-select form-select-sm garmin-unit-select" id="garminWeightUnit" aria-label="Weight unit">
              <option value="lbs" ${state.unit === 'lbs' ? 'selected' : ''}>lbs</option>
              <option value="kg" ${state.unit === 'kg' ? 'selected' : ''}>kg</option>
            </select>
          </div>
          <datalist id="garminKnownExercises">${known}</datalist>
          ${rows}
          ${a.dropped_sets ? `<p class="small text-muted">${a.dropped_sets} accidental set${a.dropped_sets > 1 ? 's' : ''} (no reps, a few seconds) left out.</p>` : ''}
          <div class="form-check mt-2">
            <input class="form-check-input" type="checkbox" id="garminSaveMappings" checked>
            <label class="form-check-label small" for="garminSaveMappings">Remember these names for future imports</label>
          </div>`;
    }

    function renderReview() {
        const p = state.preview;
        const a = p.activity;
        const backLabel = state.opts.mode === 'activity' ? 'Back to list' : 'Cancel';

        if (p.duplicate_of) {
            body().innerHTML = `
              ${summaryHtml(a)}
              <div class="alert alert-info small" id="garminDuplicate">
                This activity is already in your history. To import it again, undo the earlier import first.
              </div>
              <button class="btn btn-outline-secondary" id="garminBack">${backLabel}</button>`;
            document.getElementById('garminBack').onclick = close;
            return;
        }

        const opts = buildOptions(p);
        const optionsHtml = opts.map((o, i) => `
          <label class="garmin-option list-group-item d-flex gap-2 align-items-start">
            <input class="form-check-input mt-1" type="radio" name="garminAction" value="${i}" ${o.suggested ? 'checked' : ''}>
            <span class="flex-grow-1">
              <span class="d-block">${esc(o.label)} ${o.suggested ? `<span class="badge bg-label-primary ms-1">Suggested</span>` : ''}</span>
              ${o.detail ? `<span class="d-block small text-muted">${esc(o.detail)}</span>` : ''}
            </span>
          </label>`).join('');

        const notes = (p.merge_notes || []).length && p.proposed.action === 'merge'
            ? `<ul class="small text-muted mb-0 mt-2 ps-3" id="garminMergeNotes">${p.merge_notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>
               <p class="small text-muted mt-1 mb-0">Anything you already logged in the app is kept as is.</p>`
            : '';

        body().innerHTML = `
          ${summaryHtml(a)}
          <div class="row g-4">
            <div class="col-lg-6">
              <h6 class="mb-2">Where should this go?</h6>
              <div class="list-group mb-1" id="garminOptions">${optionsHtml}</div>
              ${notes}
            </div>
            <div class="col-lg-6">${exercisesHtml(p)}</div>
          </div>
          <div class="alert alert-danger small mt-3 d-none" id="garminImportError" role="alert"></div>
          <div class="d-flex gap-2 mt-3">
            <button class="btn btn-outline-secondary" id="garminBack">${backLabel}</button>
            <button class="btn btn-primary flex-grow-1 flex-sm-grow-0 px-4" id="garminConfirm">Import</button>
          </div>`;

        const unitSel = document.getElementById('garminWeightUnit');
        if (unitSel) {
            unitSel.onchange = () => {
                state.unit = unitSel.value;
                body().querySelectorAll('.garmin-ex-row').forEach((row, i) => {
                    row.querySelector('.garmin-ex-sets').textContent = setsSummary(a.exercises[i].sets, state.unit);
                });
            };
        }
        document.getElementById('garminBack').onclick = close;
        document.getElementById('garminConfirm').onclick = () => submit(opts);
        body().querySelectorAll('input[name="garminAction"]').forEach(r => {
            r.onchange = () => {
                const action = opts[Number(r.value)].action;
                document.getElementById('garminConfirm').textContent =
                    action === 'skip' ? (state.opts.mode === 'activity' ? 'Dismiss' : 'Close') : 'Import';
            };
        });
    }

    async function submit(opts) {
        const p = state.preview;
        const chosen = opts[Number((body().querySelector('input[name="garminAction"]:checked') || {}).value || 0)];
        const errorBox = document.getElementById('garminImportError');
        if (chosen.action === 'skip') {
            if (state.opts.mode === 'activity') {
                try {
                    await window.garminImportService.setActivityStatus(state.opts.activityId, 'dismissed');
                    state.changed = true;
                } catch (e) {
                    errorBox.textContent = e.message;
                    errorBox.classList.remove('d-none');
                    return;
                }
            }
            close();
            return;
        }

        const mappings = {};
        let missing = false;
        body().querySelectorAll('.garmin-ex-row').forEach(row => {
            const input = row.querySelector('.garmin-ex-name');
            const value = input.value.trim();
            input.classList.toggle('is-invalid', !value);
            if (!value) missing = true;
            mappings[row.dataset.garminKey] = value;
        });
        if (missing) {
            errorBox.textContent = 'Give every exercise a name before importing.';
            errorBox.classList.remove('d-none');
            return;
        }

        const btn = document.getElementById('garminConfirm');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Importing…';
        try {
            const saveBox = document.getElementById('garminSaveMappings');
            state.result = await window.garminImportService.confirm({
                activity: p.activity,
                action: chosen.action,
                target_id: chosen.target_id,
                exercise_mappings: mappings,
                save_mappings: saveBox ? saveBox.checked : true,
                weight_unit: state.unit,
                pending_id: state.opts.mode === 'activity' ? state.opts.activityId : null,
            });
            state.changed = true;
            renderDone();
        } catch (e) {
            errorBox.textContent = e.message;
            errorBox.classList.remove('d-none');
            btn.disabled = false;
            btn.textContent = 'Import';
        }
    }

    function renderDone() {
        const r = state.result;
        const verb = r.action === 'merge' ? 'Merged into your session' : 'Imported';
        body().innerHTML = `
          <div class="text-center py-4" id="garminImportDone">
            <i class="bx bx-check-circle text-success display-4"></i>
            <h6 class="mt-2">${esc(verb)}</h6>
            ${r.message ? `<p class="small text-muted">${esc(r.message)}</p>` : ''}
          </div>
          <div class="d-flex gap-2 justify-content-center">
            <button class="btn btn-outline-danger" id="garminUndo"><i class="bx bx-undo me-1"></i>Undo</button>
            <button class="btn btn-primary px-4" id="garminDone">${state.opts.mode === 'activity' ? 'Back to list' : 'Done'}</button>
          </div>`;
        document.getElementById('garminDone').onclick = close;
        document.getElementById('garminUndo').onclick = async () => {
            try {
                await window.garminImportService.undo(r.session_id, r.session_type);
                notify('Import undone', 'info');
                close();
            } catch (e) {
                notify(e.message, 'danger');
            }
        };
    }

    // ── public: mount ──────────────────────────────────────────────────────

    async function mount(container, opts) {
        state.host = container;
        state.opts = opts || {};
        state.preview = null;
        state.result = null;
        state.changed = false;
        if (state.opts.mode === 'activity') {
            loading('Loading the activity from Garmin…');
            try {
                state.preview = await window.garminImportService.activityPreview(state.opts.activityId);
                state.unit = state.preview.weight_unit || 'lbs';
                renderReview();
            } catch (e) {
                body().innerHTML = `
                  <div class="alert alert-danger small" id="garminImportError">${esc(e.message)}</div>
                  <button class="btn btn-outline-secondary" id="garminBack">Back to list</button>`;
                document.getElementById('garminBack').onclick = close;
            }
        } else {
            renderPick();
        }
    }

    // ── History page: undo, and the "to review" banner ─────────────────────

    function undoFromHistory(sessionId, sessionType) {
        const run = async () => {
            try {
                await window.garminImportService.undo(sessionId, sessionType);
                notify('Garmin import undone', 'success');
                setTimeout(() => window.location.reload(), 600);
            } catch (e) {
                notify(e.message, 'danger');
            }
        };
        const message = 'Sessions created by the import are deleted. Merged sessions go back to how they were '
            + 'before. Synced activities go back to To review on the Garmin page.';
        if (window.ffnModalManager && window.ffnModalManager.confirm) {
            window.ffnModalManager.confirm('Undo Garmin import?', message, run,
                { confirmText: 'Undo import', confirmClass: 'btn-danger', size: 'sm' });
        } else if (window.confirm(`Undo Garmin import?\n\n${message}`)) {
            run();
        }
    }

    async function refreshHistoryBanner() {
        const banners = document.querySelectorAll('[data-garmin-pending-banner]');
        if (!banners.length) return;
        let count = 0;
        let attention = false;
        try {
            const c = await window.garminImportService.getConnection();
            count = c.allowed && c.connected ? c.pending_count || 0 : 0;
            attention = c.allowed && c.connected && c.status === 'needs_attention';
        } catch (e) { /* signed out or offline: no banner */ }
        banners.forEach(b => {
            b.classList.toggle('d-none', count === 0);
            const label = b.querySelector('[data-garmin-pending-count]');
            if (label) label.textContent = `${count} Garmin ${count === 1 ? 'activity' : 'activities'} to review`;
        });
        document.querySelectorAll('[data-garmin-attention]').forEach(el => el.classList.toggle('d-none', !attention));
    }

    window.addEventListener('authStateChanged', e => {
        if (e.detail && e.detail.isAuthenticated) refreshHistoryBanner();
    });
    if (window.authService && window.authService.isAuthenticated) refreshHistoryBanner();

    window.garminImportReview = { mount, undoFromHistory, refreshHistoryBanner };
})();
