/**
 * Garmin settings card: connect a Garmin Personal API key, sync, review
 * setting, disconnect. Requires window.garminImportService.
 * @version 1.0.0
 */
(function () {
    'use strict';

    const KEY_PAGE = 'https://connect.garmin.com/app/settings/personalApiToken';
    let status = null;
    let replacing = false;

    function esc(text) {
        const div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    }

    function fmtDate(iso, withTime) {
        if (!iso) return '';
        const opts = withTime
            ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
            : { month: 'short', day: 'numeric', year: 'numeric' };
        return new Date(iso).toLocaleString([], opts);
    }

    function todayInput() {
        const d = new Date();
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    function root() {
        return document.getElementById('garminSettingsBody');
    }

    function message(html, type) {
        const box = document.getElementById('garminSettingsMessage');
        if (!box) return;
        box.className = `alert alert-${type || 'info'} small py-2 mt-3`;
        box.innerHTML = html;
    }

    // ── views ──────────────────────────────────────────────────────────────

    function renderSignedOut() {
        root().innerHTML = '<p class="text-muted mb-0">Sign in to connect Garmin.</p>';
    }

    function renderNotAllowed() {
        root().innerHTML = `
          <p class="mb-2">Automatic sync uses Garmin's Personal API, which only lets a key be used by its owner,
            so it's limited to the site owner for now.</p>
          <p class="text-muted small mb-0">You can still import activities one at a time:
            <a href="/workout-history.html">History</a> → <strong>Import from Garmin</strong>.</p>`;
    }

    function connectFormHtml(isReplace) {
        return `
          <ol class="small ps-3 mb-3">
            <li>Open <a href="${KEY_PAGE}" target="_blank" rel="noopener noreferrer">Garmin Connect → Personal API Key</a>
              and create a key. Garmin shows it only once.</li>
            <li>Paste it here. It's encrypted on our server and never shown again.</li>
          </ol>
          <div class="mb-3">
            <label class="form-label" for="garminApiKey">Personal API key</label>
            <input type="password" class="form-control" id="garminApiKey" autocomplete="off" spellcheck="false"
                   placeholder="Paste your key">
          </div>
          <div class="row g-2 mb-3">
            <div class="col-sm-6">
              <label class="form-label" for="garminKeyExpiry">Key expires in</label>
              <select class="form-select" id="garminKeyExpiry">
                <option value="30">30 days</option>
                <option value="90" selected>90 days</option>
                <option value="180">180 days</option>
                <option value="365">1 year</option>
                <option value="">Not sure</option>
              </select>
            </div>
            ${isReplace ? '' : `
            <div class="col-sm-6">
              <label class="form-label" for="garminSyncFrom">Import activities from</label>
              <input type="date" class="form-control" id="garminSyncFrom" value="${todayInput()}" max="${todayInput()}">
            </div>`}
          </div>
          <div class="d-flex gap-2">
            <button type="button" class="btn btn-primary" id="garminConnectBtn">${isReplace ? 'Save new key' : 'Connect Garmin'}</button>
            ${isReplace ? '<button type="button" class="btn btn-outline-secondary" id="garminCancelReplace">Cancel</button>' : ''}
          </div>
          <div id="garminSettingsMessage" class="d-none"></div>`;
    }

    function renderNotConnected() {
        root().innerHTML = `
          <p class="mb-3">Connect your Garmin account to pull in watch workouts with <strong>Sync</strong> on the
            History page, instead of uploading files.</p>
          ${connectFormHtml(false)}`;
        bindConnect(false);
    }

    function expiryHtml(s) {
        if (s.days_until_expiry == null) return '';
        if (s.days_until_expiry < 0) {
            return `<div class="alert alert-danger small py-2 mb-2">Your key expired on ${esc(fmtDate(s.key_expires_at))}.
                    Create a new one and choose <strong>Replace key</strong>.</div>`;
        }
        if (s.days_until_expiry <= 7) {
            return `<div class="alert alert-warning small py-2 mb-2">Your key expires in ${s.days_until_expiry}
                    day${s.days_until_expiry === 1 ? '' : 's'} (${esc(fmtDate(s.key_expires_at))}).</div>`;
        }
        return `<div class="small text-muted">Key expires ${esc(fmtDate(s.key_expires_at))}</div>`;
    }

    function summaryText(sum) {
        if (!sum) return '';
        const parts = [];
        if (sum.imported) parts.push(`${sum.imported} imported`);
        if (sum.pending) parts.push(`${sum.pending} to review`);
        if (sum.skipped) parts.push(`${sum.skipped} skipped`);
        if (sum.errors) parts.push(`${sum.errors} failed`);
        return parts.length ? ` · ${parts.join(', ')}` : ' · nothing new';
    }

    function renderConnected() {
        const s = status;
        if (replacing) {
            root().innerHTML = `<p class="mb-3">Replace the key ending ${esc(s.key_hint)}. Sync carries on from where it
                                left off.</p>${connectFormHtml(true)}`;
            bindConnect(true);
            return;
        }
        root().innerHTML = `
          ${s.status === 'needs_attention' ? `<div class="alert alert-danger small py-2">
              Sync stopped: ${esc(s.last_error || 'Garmin rejected the key.')} Create a new key and choose <strong>Replace key</strong>.
            </div>` : ''}
          <div class="d-flex align-items-center gap-2 mb-1">
            <span class="badge ${s.status === 'needs_attention' ? 'bg-label-danger' : 'bg-label-success'}" id="garminStatusBadge">
              ${s.status === 'needs_attention' ? 'Needs attention' : 'Connected'}</span>
            <span class="small text-muted">Key ending ${esc(s.key_hint)}</span>
          </div>
          <div class="small text-muted">Importing activities from ${esc(fmtDate(s.sync_from))}</div>
          <div class="small text-muted" id="garminLastSync">${s.last_sync_at
              ? `Last sync ${esc(fmtDate(s.last_sync_at, true))}${esc(summaryText(s.last_summary))}`
              : 'Not synced yet'}</div>
          ${expiryHtml(s)}
          ${s.pending_count ? `<div class="small mt-1"><a href="/workout-history.html">${s.pending_count}
              ${s.pending_count === 1 ? 'activity' : 'activities'} waiting for review in History</a></div>` : ''}

          <div class="d-flex justify-content-between align-items-center my-3">
            <div class="me-3">
              <label class="form-check-label fw-medium" for="garminReviewAll">Review every import</label>
              <div class="form-text mt-0">Off: activities that clearly match are saved automatically and you can
                undo them. On: everything waits for you to check it.</div>
            </div>
            <div class="form-check form-switch mb-0 flex-shrink-0">
              <input class="form-check-input" type="checkbox" id="garminReviewAll" ${s.review_all ? 'checked' : ''}>
            </div>
          </div>

          <div class="d-flex flex-wrap gap-2">
            <button type="button" class="btn btn-primary" id="garminSyncNow"><i class="bx bx-refresh me-1"></i>Sync now</button>
            <button type="button" class="btn btn-outline-secondary" id="garminReplaceKey">Replace key</button>
            <button type="button" class="btn btn-outline-danger" id="garminDisconnect">Disconnect</button>
          </div>
          <div id="garminSettingsMessage" class="d-none"></div>`;

        document.getElementById('garminReviewAll').onchange = async e => {
            try {
                status = await window.garminImportService.updateConnection({ review_all: e.target.checked });
                message(e.target.checked ? 'Every synced activity will wait for review.'
                    : 'Clear matches will be saved automatically.', 'success');
            } catch (err) {
                e.target.checked = !e.target.checked;
                message(esc(err.message), 'danger');
            }
        };
        document.getElementById('garminSyncNow').onclick = syncNow;
        document.getElementById('garminReplaceKey').onclick = () => { replacing = true; renderConnected(); };
        document.getElementById('garminDisconnect').onclick = disconnect;
    }

    function render() {
        if (!status) return renderSignedOut();
        if (!status.allowed) return renderNotAllowed();
        if (!status.connected) return renderNotConnected();
        return renderConnected();
    }

    // ── actions ────────────────────────────────────────────────────────────

    function bindConnect(isReplace) {
        if (isReplace) document.getElementById('garminCancelReplace').onclick = () => { replacing = false; render(); };
        document.getElementById('garminConnectBtn').onclick = async () => {
            const keyInput = document.getElementById('garminApiKey');
            const key = keyInput.value.trim();
            if (key.length < 10) {
                keyInput.classList.add('is-invalid');
                message('Paste the full key from Garmin Connect.', 'danger');
                return;
            }
            const expiry = document.getElementById('garminKeyExpiry').value;
            const fromInput = document.getElementById('garminSyncFrom');
            const syncFrom = fromInput && fromInput.value ? new Date(`${fromInput.value}T00:00:00`).toISOString() : null;
            const btn = document.getElementById('garminConnectBtn');
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Checking key…';
            try {
                status = await window.garminImportService.connect(key, expiry ? Number(expiry) : null, syncFrom);
                keyInput.value = '';
                replacing = false;
                render();
                message(isReplace ? 'Key replaced.' : 'Garmin connected. Use Sync now, or Sync on the History page.',
                    'success');
            } catch (e) {
                btn.disabled = false;
                btn.textContent = isReplace ? 'Save new key' : 'Connect Garmin';
                message(esc(e.message), 'danger');
            }
        };
    }

    async function syncNow() {
        const btn = document.getElementById('garminSyncNow');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Syncing…';
        let result = null;
        let error = null;
        try {
            result = await window.garminImportService.sync();
        } catch (e) {
            error = e;
        }
        await load();
        if (error) {
            message(esc(error.message), 'danger');
            return;
        }
        const extra = result.pending_total
            ? ` <a href="/workout-history.html">Review in History</a>` : '';
        const errors = (result.errors || []).map(e => `<li>${esc(e)}</li>`).join('');
        message(`${esc(window.garminImportService.describeSync(result))}.${extra}${errors ? `<ul class="mb-0 mt-1">${errors}</ul>` : ''}`,
            result.errors && result.errors.length ? 'warning' : 'success');
    }

    async function disconnect() {
        const run = async () => {
            try {
                await window.garminImportService.disconnect();
                await load();
                message('Disconnected. Your key was deleted. Already-imported sessions stay in your history.', 'info');
            } catch (e) {
                message(esc(e.message), 'danger');
            }
        };
        const text = 'Your saved key is deleted and sync stops. Sessions already imported stay in your history.';
        if (window.ffnModalManager && window.ffnModalManager.confirm) {
            window.ffnModalManager.confirm('Disconnect Garmin?', text, run,
                { confirmText: 'Disconnect', confirmClass: 'btn-danger', size: 'sm' });
        } else if (window.confirm(`Disconnect Garmin?\n\n${text}`)) {
            run();
        }
    }

    async function load() {
        try {
            status = await window.garminImportService.getConnection();
        } catch (e) {
            status = null;
            root().innerHTML = `<div class="alert alert-danger small mb-0">${esc(e.message)}</div>`;
            return;
        }
        render();
    }

    function init() {
        if (!root()) return;
        window.addEventListener('authStateChanged', e => {
            if (e.detail && e.detail.isAuthenticated) { load(); } else { status = null; renderSignedOut(); }
        });
        if (window.authService && window.authService.isAuthenticated) load();
    }

    window.garminSettings = { load, render: () => render(), _setStatus: s => { status = s; render(); } };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
