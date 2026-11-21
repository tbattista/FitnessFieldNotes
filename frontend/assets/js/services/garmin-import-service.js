/**
 * Garmin Import Service
 * API calls for importing Garmin watch activities (.fit / Garmin Connect .zip).
 * Backend: backend/api/garmin.py
 * @version 1.1.0
 */

window.garminImportService = {

    async _headers(json = true) {
        const headers = json ? { 'Content-Type': 'application/json' } : {};
        try {
            if (window.authService && window.authService.getIdToken) {
                const token = await window.authService.getIdToken();
                if (token) headers['Authorization'] = `Bearer ${token}`;
            }
        } catch (e) {
            console.warn('Garmin import: could not get auth token', e);
        }
        return headers;
    },

    async _handle(response, fallback) {
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            const detail = typeof err.detail === 'string' ? err.detail : fallback;
            throw new Error(response.status === 401 ? 'Sign in to import Garmin activities.' : detail);
        }
        return response.json();
    },

    /** Upload a .fit/.zip file. Returns the import preview (nothing is saved). */
    async parseFile(file) {
        const form = new FormData();
        form.append('file', file);
        const response = await fetch('/api/v3/garmin/import/parse-file', {
            method: 'POST',
            headers: await this._headers(false),
            body: form,
        });
        return this._handle(response, 'Could not read that file.');
    },

    /** Save the activity: action is 'merge' | 'attach' | 'new' | 'skip'. */
    async confirm(payload) {
        const response = await fetch('/api/v3/garmin/import/confirm', {
            method: 'POST',
            headers: await this._headers(),
            body: JSON.stringify(payload),
        });
        return this._handle(response, 'Import failed.');
    },

    /** Undo an import: deletes a created session or restores a merged one. */
    async undo(sessionId, sessionType) {
        const response = await fetch('/api/v3/garmin/import/undo', {
            method: 'POST',
            headers: await this._headers(),
            body: JSON.stringify({ session_id: sessionId, session_type: sessionType }),
        });
        return this._handle(response, 'Undo failed.');
    },

    // ── Personal API key sync ───────────────────────────────────────────

    async _json(method, path, body, fallback) {
        const response = await fetch(path, {
            method,
            headers: await this._headers(),
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        return this._handle(response, fallback);
    },

    /** Connection status: { allowed, connected, status, key_hint, last_sync_at, pending_count, ... } */
    getConnection() {
        return this._json('GET', '/api/v3/garmin/connection', undefined, 'Could not load Garmin status.');
    },

    connect(apiKey, expiresInDays, syncFrom) {
        return this._json('PUT', '/api/v3/garmin/connection',
            { api_key: apiKey, expires_in_days: expiresInDays || null, sync_from: syncFrom || null },
            'Could not connect Garmin.');
    },

    updateConnection(changes) {
        return this._json('PATCH', '/api/v3/garmin/connection', changes, 'Could not save the setting.');
    },

    disconnect() {
        return this._json('DELETE', '/api/v3/garmin/connection', undefined, 'Could not disconnect Garmin.');
    },

    /** Pull new activities. Returns { imported, pending, pending_total, skipped, errors, more }. */
    sync() {
        return this._json('POST', '/api/v3/garmin/sync', undefined, 'Sync failed.');
    },

    /**
     * Sync until caught up. The server handles at most 10 activities per call
     * (to go easy on Garmin) and sets `more` when others are waiting.
     * onProgress(totals) runs after each round. Returns combined totals.
     */
    async syncAll(onProgress, maxRounds = 15) {
        const totals = { imported: [], pending: 0, pending_total: 0, skipped: 0, errors: [], more: false, details: [] };
        for (let round = 1; round <= maxRounds; round++) {
            let r;
            try {
                r = await this.sync();
            } catch (e) {
                if (round === 1) throw e;
                totals.errors.push(e.message);
                break;
            }
            totals.imported.push(...(r.imported || []));
            totals.pending += r.pending || 0;
            totals.pending_total = r.pending_total || 0;
            totals.skipped += r.skipped || 0;
            totals.errors.push(...(r.errors || []));
            totals.details.push(...(r.details || []));
            totals.more = !!r.more;
            if (onProgress) onProgress(totals, round);
            if (!r.more) break;
        }
        return totals;
    },

    listPending() {
        return this._json('GET', '/api/v3/garmin/pending', undefined, 'Could not load activities to review.');
    },

    pendingPreview(id) {
        return this._json('GET', `/api/v3/garmin/pending/${encodeURIComponent(id)}/preview`, undefined,
            'Could not load that activity.');
    },

    dismissPending(id) {
        return this._json('DELETE', `/api/v3/garmin/pending/${encodeURIComponent(id)}`, undefined,
            'Could not dismiss that activity.');
    },

    /** Plain-language summary of a sync result. */
    describeSync(r) {
        const parts = [];
        if (r.imported && r.imported.length) parts.push(`${r.imported.length} imported`);
        if (r.pending_total) parts.push(`${r.pending_total} to review`);
        if (!parts.length) parts.push('No new activities');
        if (r.errors && r.errors.length) parts.push(`${r.errors.length} couldn't be read`);
        if (r.more) parts.push('more waiting: sync again');
        return parts.join(' · ');
    },

    /** True for sessions created by or merged with a Garmin import. */
    isGarminSession(session) {
        return !!(session && typeof session.external_id === 'string' && session.external_id.startsWith('garmin:'));
    },
};
