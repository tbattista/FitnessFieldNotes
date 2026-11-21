/**
 * Garmin Import Review
 * Offcanvas flow: pick a .fit/.zip file -> review the proposed match and the
 * exercise names -> import -> undo if needed.
 *
 * Open with any element carrying [data-garmin-import], or
 * window.garminImportReview.open(). Requires window.garminImportService.
 * @version 1.1.0
 */
(function () {
    'use strict';

    const KG_TO_LB = 2.20462;
    const ID = 'garminImportOffcanvas';

    // pendingId / queue: reviewing activities that Garmin sync couldn't import on its own.
    const state = { preview: null, unit: 'lbs', result: null, pendingId: null, queue: [], changed: false };

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

    // ── shell ──────────────────────────────────────────────────────────────

    function ensureShell() {
        let el = document.getElementById(ID);
        if (el) return el;
        el = document.createElement('div');
        el.className = 'offcanvas offcanvas-end garmin-import-offcanvas';
        el.id = ID;
        el.tabIndex = -1;
        el.setAttribute('aria-labelledby', 'garminImportTitle');
        el.innerHTML = `
          <div class="offcanvas-header border-bottom">
            <h5 class="offcanvas-title" id="garminImportTitle"><i class="bx bx-stopwatch me-1"></i>Import from Garmin</h5>
            <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
          </div>
          <div class="offcanvas-body" id="garminImportBody"></div>`;
        document.body.appendChild(el);
        el.addEventListener('hidden.bs.offcanvas', () => {
            if (state.changed && window.location.pathname.includes('workout-history')) window.location.reload();
        });
        return el;
    }

    function body() {
        return document.getElementById('garminImportBody');
    }

    function show() {
        const el = ensureShell();
        if (window.bootstrap && window.bootstrap.Offcanvas) {
            window.bootstrap.Offcanvas.getOrCreateInstance(el).show();
        } else {
            el.classList.add('show');
            el.style.visibility = 'visible';
        }
    }

    function hide() {
        const el = document.getElementById(ID);
        if (!el) return;
        if (window.bootstrap && window.bootstrap.Offcanvas) {
            window.bootstrap.Offcanvas.getOrCreateInstance(el).hide();
        } else {
            el.classList.remove('show');
        }
    }

    // ── step 1: pick a file ────────────────────────────────────────────────

    function renderPick(error) {
        state.preview = null;
        state.result = null;
        state.pendingId = null;
        state.queue = [];
        body().innerHTML = `
          ${error ? `<div class="alert alert-danger small" role="alert" id="garminImportError">${esc(error)}</div>` : ''}
          <p class="small text-muted">
            Upload an activity file from your watch. In Garmin Connect on the web, open the activity,
            click the gear icon, and choose <strong>Export Original</strong>. You can upload the
            <code>.zip</code> as it is, or the <code>.fit</code> inside it.
          </p>
          <label class="garmin-dropzone w-100" for="garminFileInput">
            <i class="bx bx-upload fs-2 d-block mb-1"></i>
            <span class="fw-semibold">Choose a .fit or .zip file</span>
          </label>
          <input type="file" class="visually-hidden" id="garminFileInput" accept=".fit,.zip,application/zip">
          <p class="small text-muted mt-3 mb-0">
            Nothing is saved until you review it. Strength sessions bring their sets, reps and weights;
            cardio brings distance, time, heart rate and calories.
          </p>`;
        document.getElementById('garminFileInput').addEventListener('change', e => {
            const file = e.target.files && e.target.files[0];
            if (file) upload(file);
        });
    }

    async function upload(file) {
        body().innerHTML = `
          <div class="text-center py-5" id="garminImportLoading">
            <div class="spinner-border text-primary" role="status"></div>
            <p class="mt-3 text-muted">Reading ${esc(file.name)}…</p>
          </div>`;
        try {
            state.preview = await window.garminImportService.parseFile(file);
            state.unit = state.preview.weight_unit || 'lbs';
            renderReview();
        } catch (e) {
            renderPick(e.message);
        }
    }

    // ── step 2: review ─────────────────────────────────────────────────────

    function buildOptions(p) {
        const a = p.activity;
        const opts = [];
        for (const c of p.session_candidates || []) {
            opts.push({ action: 'merge', target_id: c.id, label: `Merge into “${c.name}”`,
                        detail: `${fmtDateTime(c.started_at)} · ${c.reason}` });
        }
        if (a.kind === 'strength') {
            for (const w of p.workout_candidates || []) {
                opts.push({ action: 'attach', target_id: w.id, label: `Log as “${w.name}”`, detail: w.reason });
            }
            opts.push({ action: 'new', target_id: null, label: 'New log-only session',
                        detail: 'Saved to your history without changing any workout' });
        } else {
            opts.push({ action: 'new', target_id: null, label: 'New cardio session', detail: 'Saved to your history' });
        }
        opts.push({ action: 'skip', target_id: null, label: "Don't import", detail: '' });

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
        if (a.kind === 'strength') bits.push(`${setCount} sets`);
        return `
          <div class="garmin-summary card mb-3">
            <div class="card-body py-2">
              <div class="d-flex align-items-center justify-content-between">
                <strong id="garminActivityName">${esc(a.name)}</strong>
                <span class="badge bg-label-info">${a.kind === 'strength' ? 'Strength' : 'Cardio'}</span>
              </div>
              <div class="small text-muted">${esc(fmtDateTime(a.started_at))}${a.device ? ` · ${esc(a.device)}` : ''}</div>
              <div class="small mt-1">${esc(bits.join(' · '))}</div>
            </div>
          </div>`;
    }

    function exercisesHtml(p) {
        const a = p.activity;
        if (a.kind !== 'strength') return '';
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

        if (p.duplicate_of) {
            body().innerHTML = `
              ${summaryHtml(a)}
              <div class="alert alert-info small" id="garminDuplicate">
                This activity is already in your history. To import it again, undo the earlier import first.
              </div>
              ${state.pendingId
                ? '<button class="btn btn-outline-secondary w-100" id="garminRemovePending">Remove from review list</button>'
                : '<button class="btn btn-outline-secondary w-100" id="garminPickAnother">Choose another file</button>'}`;
            if (state.pendingId) {
                document.getElementById('garminRemovePending').onclick = () => dismissCurrent();
            } else {
                document.getElementById('garminPickAnother').onclick = () => renderPick();
            }
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

        const queueHeader = state.pendingId
            ? `<div class="small text-muted mb-2" id="garminQueueHeader">From Garmin sync${state.queue.length > 1
                ? ` · ${state.queue.length} waiting` : ''}${state.pendingReason ? ` · ${esc(state.pendingReason)}` : ''}</div>`
            : '';
        body().innerHTML = `
          ${queueHeader}
          ${summaryHtml(a)}
          <h6 class="mb-2">Where should this go?</h6>
          <div class="list-group mb-1" id="garminOptions">${optionsHtml}</div>
          ${notes}
          ${exercisesHtml(p)}
          <div class="alert alert-danger small mt-3 d-none" id="garminImportError" role="alert"></div>
          <div class="d-flex gap-2 mt-3">
            <button class="btn btn-outline-secondary" id="garminBack">${state.pendingId ? 'Later' : 'Back'}</button>
            <button class="btn btn-primary flex-grow-1" id="garminConfirm">Import</button>
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
        document.getElementById('garminBack').onclick = () => (state.pendingId ? hide() : renderPick());
        document.getElementById('garminConfirm').onclick = () => submit(opts);
        body().querySelectorAll('input[name="garminAction"]').forEach(r => {
            r.onchange = () => {
                document.getElementById('garminConfirm').textContent =
                    opts[Number(r.value)].action === 'skip' ? 'Done' : 'Import';
            };
        });
    }

    async function submit(opts) {
        const p = state.preview;
        const chosen = opts[Number((body().querySelector('input[name="garminAction"]:checked') || {}).value || 0)];
        const errorBox = document.getElementById('garminImportError');
        if (chosen.action === 'skip') {
            if (state.pendingId) { dismissCurrent(); } else { hide(); }
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
                pending_id: state.pendingId,
            });
            state.changed = true;
            state.queue = state.queue.filter(item => item.id !== state.pendingId);
            renderDone();
        } catch (e) {
            errorBox.textContent = e.message;
            errorBox.classList.remove('d-none');
            btn.disabled = false;
            btn.textContent = 'Import';
        }
    }

    // ── step 3: done ───────────────────────────────────────────────────────

    function renderDone() {
        const r = state.result;
        const verb = r.action === 'merge' ? 'Merged into your session' : 'Imported';
        body().innerHTML = `
          <div class="text-center py-4" id="garminImportDone">
            <i class="bx bx-check-circle text-success display-4"></i>
            <h6 class="mt-2">${esc(verb)}</h6>
            ${r.message ? `<p class="small text-muted">${esc(r.message)}</p>` : ''}
          </div>
          <div class="d-flex gap-2">
            <button class="btn btn-outline-danger" id="garminUndo"><i class="bx bx-undo me-1"></i>Undo</button>
            <button class="btn btn-primary flex-grow-1" id="garminDone">${state.queue.length
                ? `Next activity (${state.queue.length} left)` : 'Done'}</button>
          </div>`;
        document.getElementById('garminDone').onclick = () => (state.queue.length ? reviewNext() : hide());
        document.getElementById('garminUndo').onclick = async () => {
            try {
                await window.garminImportService.undo(r.session_id, r.session_type);
                state.result = null;
                notify('Import undone', 'info');
                if (state.queue.length) { reviewNext(); } else { renderPick(); }
            } catch (e) {
                notify(e.message, 'danger');
            }
        };
    }

    function notify(message, type) {
        if (window.showToast) window.showToast({ message, type });
    }

    // ── review queue from Garmin sync ──────────────────────────────────────

    function loading(text) {
        body().innerHTML = `
          <div class="text-center py-5" id="garminImportLoading">
            <div class="spinner-border text-primary" role="status"></div>
            <p class="mt-3 text-muted">${esc(text)}</p>
          </div>`;
    }

    async function reviewNext() {
        const item = state.queue[0];
        if (!item) { hide(); return; }
        state.pendingId = item.id;
        state.pendingReason = item.reason;
        state.result = null;
        loading(`Loading ${item.name}…`);
        try {
            state.preview = await window.garminImportService.pendingPreview(item.id);
            state.unit = state.preview.weight_unit || 'lbs';
            renderReview();
        } catch (e) {
            body().innerHTML = `<div class="alert alert-danger small">${esc(e.message)}</div>`;
        }
    }

    async function dismissCurrent() {
        try {
            await window.garminImportService.dismissPending(state.pendingId);
            state.changed = true;
            state.queue = state.queue.filter(item => item.id !== state.pendingId);
            refreshSyncControls();
            if (state.queue.length) { reviewNext(); } else { hide(); }
        } catch (e) {
            notify(e.message, 'danger');
        }
    }

    async function openPendingQueue() {
        ensureShell();
        show();
        loading('Loading activities to review…');
        try {
            state.queue = await window.garminImportService.listPending();
        } catch (e) {
            body().innerHTML = `<div class="alert alert-danger small">${esc(e.message)}</div>`;
            return;
        }
        if (!state.queue.length) {
            body().innerHTML = '<p class="text-muted text-center py-4">Nothing waiting for review.</p>';
            return;
        }
        reviewNext();
    }

    // ── History page: Sync button and "needs review" banner ────────────────

    let connection = null;

    function renderSyncControls() {
        const connected = !!(connection && connection.allowed && connection.connected);
        document.querySelectorAll('[data-garmin-sync]').forEach(btn => btn.classList.toggle('d-none', !connected));
        const count = connected ? connection.pending_count || 0 : 0;
        document.querySelectorAll('[data-garmin-pending-banner]').forEach(banner => {
            banner.classList.toggle('d-none', count === 0);
            const label = banner.querySelector('[data-garmin-pending-count]');
            if (label) label.textContent = `${count} Garmin ${count === 1 ? 'activity needs' : 'activities need'} review`;
        });
        const attention = connected && connection.status === 'needs_attention';
        document.querySelectorAll('[data-garmin-attention]').forEach(el => el.classList.toggle('d-none', !attention));
    }

    async function refreshSyncControls() {
        if (!document.querySelector('[data-garmin-sync], [data-garmin-pending-banner]')) return;
        try {
            connection = await window.garminImportService.getConnection();
        } catch (e) {
            connection = null;
        }
        renderSyncControls();
    }

    async function runSync(button) {
        const original = button ? button.innerHTML : '';
        if (button) {
            button.disabled = true;
            button.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Syncing…';
        }
        try {
            const result = await window.garminImportService.sync();
            notify(`Garmin: ${window.garminImportService.describeSync(result)}`,
                result.errors && result.errors.length ? 'warning' : 'success');
            if (result.imported && result.imported.length) {
                setTimeout(() => window.location.reload(), 900);
                return;
            }
            await refreshSyncControls();
            if (result.pending) openPendingQueue();
        } catch (e) {
            notify(e.message, 'danger');
            await refreshSyncControls();
        } finally {
            if (button) {
                button.disabled = false;
                button.innerHTML = original;
            }
        }
    }

    // ── undo from the history list ─────────────────────────────────────────

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
        const message = 'Sessions created by the import are deleted. Merged sessions go back to how they were before.';
        if (window.ffnModalManager && window.ffnModalManager.confirm) {
            window.ffnModalManager.confirm('Undo Garmin import?', message, run,
                { confirmText: 'Undo import', confirmClass: 'btn-danger', size: 'sm' });
        } else if (window.confirm(`Undo Garmin import?\n\n${message}`)) {
            run();
        }
    }

    // ── public ─────────────────────────────────────────────────────────────

    function open() {
        ensureShell();
        renderPick();
        show();
    }

    document.addEventListener('click', e => {
        const trigger = e.target.closest('[data-garmin-import]');
        if (trigger) {
            e.preventDefault();
            open();
            return;
        }
        const sync = e.target.closest('[data-garmin-sync]');
        if (sync) {
            e.preventDefault();
            runSync(sync);
            return;
        }
        if (e.target.closest('[data-garmin-review]')) {
            e.preventDefault();
            openPendingQueue();
        }
    });

    window.addEventListener('authStateChanged', e => {
        if (e.detail && e.detail.isAuthenticated) {
            refreshSyncControls();
        } else {
            connection = null;
            renderSyncControls();
        }
    });
    if (window.authService && window.authService.isAuthenticated) refreshSyncControls();

    window.garminImportReview = { open, undoFromHistory, openPendingQueue, runSync, refreshSyncControls };
})();
