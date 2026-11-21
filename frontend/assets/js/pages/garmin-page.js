/**
 * Garmin page: every Garmin activity (synced or uploaded) with its status.
 * Filters: To review | Imported | Dismissed | All. Review opens full width on
 * the page via window.garminImportReview.mount().
 * @version 1.0.0
 */
(function () {
    'use strict';

    const svc = () => window.garminImportService;
    const state = { connection: null, items: [], filter: 'review', loaded: false };

    const TYPE_ICON = {
        strength_training: 'bx-dumbbell', indoor_strength_training: 'bx-dumbbell', hiit: 'bx-bolt-circle',
        running: 'bx-run', treadmill_running: 'bx-run', trail_running: 'bx-run', walking: 'bx-walk',
        cycling: 'bx-cycling', indoor_cycling: 'bx-cycling', stair_climbing: 'bx-trending-up',
        lap_swimming: 'bx-swim', open_water_swimming: 'bx-swim', indoor_rowing: 'bx-water', yoga: 'bx-body',
    };
    const STATUS = {
        review: ['bg-label-warning', 'To review'],
        imported: ['bg-label-success', 'Imported'],
        dismissed: ['bg-label-secondary', 'Dismissed'],
        skipped: ['bg-label-secondary', 'Skipped'],
    };

    const $ = id => document.getElementById(id);

    function esc(text) {
        const div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    }

    function fmtWhen(iso) {
        if (!iso) return '';
        return new Date(iso).toLocaleString([], {
            weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }

    function metrics(i) {
        const bits = [];
        if (i.duration_minutes) bits.push(`${Math.round(i.duration_minutes)} min`);
        if (i.distance_m) bits.push(`${(i.distance_m / 1609.344).toFixed(2)} mi`);
        if (i.avg_heart_rate) bits.push(`${i.avg_heart_rate} bpm`);
        if (i.calories) bits.push(`${i.calories} cal`);
        return bits.join(' · ');
    }

    function notify(message, type) {
        if (window.showToast) window.showToast({ message, type });
    }

    function showMessage(html, type) {
        const box = $('garminSyncMessage');
        box.className = `alert alert-${type} small py-2`;
        box.innerHTML = html;
    }

    // ── list ───────────────────────────────────────────────────────────────

    function rowActions(i) {
        if (i.status === 'review' && i.source === 'sync') {
            return `<button class="btn btn-sm btn-primary" data-act="review" data-id="${esc(i.id)}">Review</button>
                    <button class="btn btn-sm btn-outline-secondary" data-act="dismiss" data-id="${esc(i.id)}">Dismiss</button>`;
        }
        if (i.status === 'dismissed') {
            return `<button class="btn btn-sm btn-outline-secondary" data-act="restore" data-id="${esc(i.id)}">Restore</button>`;
        }
        if (i.status === 'imported' && i.session_id) {
            return `<a class="btn btn-sm btn-outline-primary" href="/workout-history.html?all=true">View in History</a>
                    <button class="btn btn-sm btn-outline-danger" data-act="undo" data-session="${esc(i.session_id)}"
                            data-type="${esc(i.session_type)}">Undo</button>`;
        }
        return '';
    }

    function rowHtml(i) {
        const [cls, label] = STATUS[i.status] || STATUS.skipped;
        const icon = TYPE_ICON[i.activity_type] || (i.kind === 'strength' ? 'bx-dumbbell' : 'bx-pulse');
        return `
          <div class="garmin-row list-group-item" data-garmin-item="${esc(i.id)}" data-status="${esc(i.status)}">
            <div class="d-flex gap-3 align-items-start">
              <span class="garmin-row-icon"><i class="bx ${icon}"></i></span>
              <div class="flex-grow-1 min-w-0">
                <div class="d-flex flex-wrap align-items-center gap-2">
                  <span class="fw-semibold garmin-row-name">${esc(i.name)}</span>
                  <span class="badge ${cls}">${esc(label)}</span>
                  ${i.source === 'upload' ? '<span class="badge bg-label-info">File</span>' : ''}
                </div>
                <div class="small text-muted">${esc(fmtWhen(i.started_at))}${metrics(i) ? ` · ${esc(metrics(i))}` : ''}</div>
                ${i.summary ? `<div class="small mt-1">${esc(i.summary)}</div>` : ''}
                ${i.detail ? `<div class="small text-muted mt-1 garmin-row-detail">${esc(i.detail)}</div>` : ''}
              </div>
            </div>
            ${rowActions(i) ? `<div class="garmin-row-actions d-flex flex-wrap gap-2 mt-2">${rowActions(i)}</div>` : ''}
          </div>`;
    }

    const EMPTY = {
        review: 'Nothing to review. Press Sync to check Garmin for new activities.',
        imported: 'Nothing imported from Garmin yet.',
        dismissed: 'Nothing dismissed.',
        all: 'No Garmin activities yet. Press Sync, or upload a file.',
    };

    function renderList() {
        const counts = { review: 0, imported: 0, dismissed: 0 };
        state.items.forEach(i => { if (counts[i.status] != null) counts[i.status] += 1; });
        $('garminCountReview').textContent = counts.review;
        $('garminCountImported').textContent = counts.imported;
        $('garminCountDismissed').textContent = counts.dismissed;
        document.querySelectorAll('#garminFilters [data-filter]').forEach(b =>
            b.classList.toggle('active', b.dataset.filter === state.filter));
        $('garminDismissAll').classList.toggle('d-none', !(state.filter === 'review' && counts.review > 1));

        const shown = state.filter === 'all' ? state.items : state.items.filter(i => i.status === state.filter);
        $('garminList').innerHTML = shown.length
            ? `<div class="list-group">${shown.map(rowHtml).join('')}</div>`
            : `<p class="text-muted text-center py-5 mb-0" id="garminEmpty">${esc(EMPTY[state.filter])}</p>`;
    }

    async function loadList() {
        try {
            state.items = await svc().listActivities();
            state.loaded = true;
            renderList();
        } catch (e) {
            $('garminList').innerHTML = `<div class="alert alert-danger small">${esc(e.message)}</div>`;
        }
    }

    async function loadConnection() {
        try {
            state.connection = await svc().getConnection();
        } catch (e) {
            state.connection = null;
        }
        const c = state.connection || {};
        const connected = !!(c.allowed && c.connected);
        $('garminSyncBtn').classList.toggle('d-none', !connected);
        $('garminConnectHint').classList.toggle('d-none', connected || !c.allowed);
        $('garminAttention').classList.toggle('d-none', !(connected && c.status === 'needs_attention'));
    }

    // ── views ──────────────────────────────────────────────────────────────

    function showList(changed) {
        $('garminReviewView').classList.add('d-none');
        $('garminListView').classList.remove('d-none');
        if (changed) loadList();
        window.scrollTo({ top: 0 });
    }

    function showReview(opts) {
        $('garminListView').classList.add('d-none');
        $('garminReviewView').classList.remove('d-none');
        $('garminSyncMessage').classList.add('d-none');
        window.scrollTo({ top: 0 });
        window.garminImportReview.mount($('garminReviewBody'), { ...opts, onClose: showList });
    }

    // ── actions ────────────────────────────────────────────────────────────

    async function sync() {
        const btn = $('garminSyncBtn');
        const original = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Syncing…';
        try {
            const r = await svc().syncAll(t => {
                btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>${t.details.length} checked…`;
            });
            const errors = (r.errors || []).map(e => `<li>${esc(e)}</li>`).join('');
            showMessage(`${esc(svc().describeSync(r))}.${errors ? `<ul class="mb-0 mt-1">${errors}</ul>` : ''}`,
                errors ? 'warning' : 'success');
            state.filter = 'review';
        } catch (e) {
            showMessage(esc(e.message), 'danger');
        } finally {
            btn.disabled = false;
            btn.innerHTML = original;
        }
        await Promise.all([loadList(), loadConnection()]);
    }

    async function onListClick(e) {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const id = btn.dataset.id;
        try {
            if (btn.dataset.act === 'review') {
                showReview({ mode: 'activity', activityId: id });
            } else if (btn.dataset.act === 'dismiss') {
                await svc().setActivityStatus(id, 'dismissed');
                await loadList();
            } else if (btn.dataset.act === 'restore') {
                await svc().setActivityStatus(id, 'review');
                await loadList();
                notify('Moved back to To review', 'info');
            } else if (btn.dataset.act === 'undo') {
                const run = async () => {
                    try {
                        await svc().undo(btn.dataset.session, btn.dataset.type);
                        notify('Import undone', 'success');
                        await loadList();
                    } catch (err) {
                        notify(err.message, 'danger');
                    }
                };
                const text = 'Sessions created by the import are deleted. Merged sessions go back to how they were. '
                    + 'Synced activities go back to To review.';
                if (window.ffnModalManager && window.ffnModalManager.confirm) {
                    window.ffnModalManager.confirm('Undo Garmin import?', text, run,
                        { confirmText: 'Undo import', confirmClass: 'btn-danger', size: 'sm' });
                } else if (window.confirm(`Undo Garmin import?\n\n${text}`)) {
                    run();
                }
            }
        } catch (err) {
            notify(err.message, 'danger');
        }
    }

    async function dismissAll() {
        const count = state.items.filter(i => i.status === 'review').length;
        const run = async () => {
            try {
                await svc().dismissAll();
                await loadList();
            } catch (e) {
                notify(e.message, 'danger');
            }
        };
        const text = `All ${count} activities waiting for review move to Dismissed. You can restore any of them later.`;
        if (window.ffnModalManager && window.ffnModalManager.confirm) {
            window.ffnModalManager.confirm('Dismiss all?', text, run, { confirmText: 'Dismiss all', size: 'sm' });
        } else if (window.confirm(text)) {
            run();
        }
    }

    // ── start ──────────────────────────────────────────────────────────────

    async function start() {
        $('garminSignedOut').classList.add('d-none');
        await Promise.all([loadConnection(), loadList()]);
        const id = new URLSearchParams(window.location.search).get('review');
        if (id && state.items.some(i => i.id === id && i.status === 'review')) {
            showReview({ mode: 'activity', activityId: id });
        }
    }

    function signedOut() {
        $('garminSignedOut').classList.remove('d-none');
        $('garminList').innerHTML = '';
        $('garminSyncBtn').classList.add('d-none');
    }

    function init() {
        $('garminFilters').addEventListener('click', e => {
            const b = e.target.closest('[data-filter]');
            if (!b) return;
            state.filter = b.dataset.filter;
            renderList();
        });
        $('garminList').addEventListener('click', onListClick);
        $('garminSyncBtn').addEventListener('click', sync);
        $('garminUploadBtn').addEventListener('click', () => showReview({ mode: 'upload' }));
        $('garminDismissAll').addEventListener('click', dismissAll);

        window.addEventListener('authStateChanged', e => {
            if (e.detail && e.detail.isAuthenticated) { start(); } else { signedOut(); }
        });
        if (window.authService && window.authService.isAuthenticated) start();
    }

    // Test hook: render a given list without the API.
    window.garminPage = {
        _setItems(items, connection) {
            state.items = items;
            state.connection = connection || null;
            renderList();
        },
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
