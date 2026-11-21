/**
 * Garmin Import Service
 * API calls for importing Garmin watch activities (.fit / Garmin Connect .zip).
 * Backend: backend/api/garmin.py
 * @version 1.0.0
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

    /** True for sessions created by or merged with a Garmin import. */
    isGarminSession(session) {
        return !!(session && typeof session.external_id === 'string' && session.external_id.startsWith('garmin:'));
    },
};
