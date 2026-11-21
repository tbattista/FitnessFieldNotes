// @ts-check
const { test, expect } = require('playwright/test');
const { BASE } = require('./fixtures');

/**
 * Garmin import review flow on the History page. The Garmin API is mocked
 * (the real endpoints need Firebase auth); backend logic is covered by
 * tests/test_garmin_import.py.
 */

const START = '2026-11-18T22:27:26Z';

function strengthPreview(overrides = {}) {
    return {
        activity: {
            external_id: 'garmin:123:1795040846',
            kind: 'strength', sport: 'training', sub_sport: 'strength_training', activity_type: null,
            name: 'Strength', device: 'venu3',
            started_at: START, completed_at: '2026-11-18T22:45:35Z', duration_minutes: 18.15,
            calories: 216, avg_heart_rate: 127, max_heart_rate: 149,
            distance_m: null, total_ascent_m: null, laps: null, dropped_sets: 1,
            exercises: [
                { garmin_key: 'squat', garmin_label: 'Squat', category: 'squat',
                  mapped_name: 'Barbell Full Squat', mapping_source: 'suggested',
                  sets: [{ reps: 8, weight_kg: 74.8125 }, { reps: 9, weight_kg: 74.8125 },
                         { reps: 7, weight_kg: 97.5 }, { reps: 7, weight_kg: 97.5 }] },
                { garmin_key: 'deadlift/barbell_deadlift', garmin_label: 'Barbell Deadlift', category: 'deadlift',
                  mapped_name: 'Barbell Deadlift', mapping_source: 'saved',
                  sets: [{ reps: 9, weight_kg: 97.5 }, { reps: 9, weight_kg: 97.5 }] },
                { garmin_key: 'unknown', garmin_label: 'Unknown', category: 'unknown',
                  mapped_name: null, mapping_source: 'garmin', sets: [{ reps: 12, weight_kg: 20 }] },
            ],
        },
        proposed: { action: 'merge', target_id: 'session-1', target_name: 'Leg Day', confidence: 'high',
                    reason: 'Logged at the same time' },
        session_candidates: [{ kind: 'workout_session', id: 'session-1', name: 'Leg Day', started_at: START,
                               score: 1, reason: 'Logged at the same time' }],
        workout_candidates: [{ kind: 'workout', id: 'workout-9', name: 'Lower Body', score: 0.67,
                               reason: '2 of 3 exercises match' }],
        duplicate_of: null,
        auto_importable: false,
        known_exercises: ['Barbell Deadlift', 'Barbell Full Squat', 'Leg Press'],
        weight_unit: 'lbs',
        merge_notes: ['Squat: add per-set reps and weights from Garmin', 'Add average heart rate from Garmin'],
        ...overrides,
    };
}

async function openReview(page, preview, confirmBodies = []) {
    await page.route('**/api/v3/garmin/import/parse-file', route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(preview) }));
    await page.route('**/api/v3/garmin/import/confirm', async route => {
        confirmBodies.push(route.request().postDataJSON());
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
            success: true, action: 'merge', session_id: 'session-1', session_type: 'workout',
            message: 'Squat: add per-set reps and weights from Garmin' }) });
    });
    await page.goto(`${BASE}/workout-history.html`);
    await page.waitForFunction(() => !!window.garminImportReview);
    await page.evaluate(() => window.garminImportReview.open());
    await page.locator('#garminFileInput').setInputFiles({
        name: 'activity.fit', mimeType: 'application/octet-stream', buffer: Buffer.from('fake fit bytes') });
    await expect(page.locator('#garminActivityName')).toHaveText('Strength');
}

test.describe('Garmin import', () => {

    test('History page has an Import from Garmin entry point', async ({ page }) => {
        await page.goto(`${BASE}/workout-history.html`);
        expect(await page.locator('[data-garmin-import]').count()).toBeGreaterThan(0);
    });

    test('review shows the suggested merge, exercise names and per-set weights', async ({ page }) => {
        await openReview(page, strengthPreview());
        const suggested = page.locator('.garmin-option', { hasText: 'Suggested' });
        await expect(suggested).toHaveCount(1);
        await expect(suggested).toContainText('Merge into “Leg Day”');
        await expect(suggested.locator('input')).toBeChecked();
        await expect(page.locator('.garmin-option', { hasText: 'Log as “Lower Body”' })).toHaveCount(1);
        await expect(page.locator('#garminMergeNotes')).toContainText('per-set reps and weights');

        const rows = page.locator('.garmin-ex-row');
        await expect(rows).toHaveCount(3);
        await expect(rows.nth(0).locator('.garmin-ex-name')).toHaveValue('Barbell Full Squat');
        await expect(rows.nth(0)).toContainText('Check');
        await expect(rows.nth(1)).toContainText('Saved');
        await expect(rows.nth(0).locator('.garmin-ex-sets')).toHaveText('8×165, 9×165, 7×215, 7×215 lbs');

        await page.selectOption('#garminWeightUnit', 'kg');
        await expect(rows.nth(0).locator('.garmin-ex-sets')).toHaveText('8×75, 9×75, 7×97.5, 7×97.5 kg');
    });

    test('import requires names, then sends the chosen action and overrides', async ({ page }) => {
        const bodies = [];
        await openReview(page, strengthPreview(), bodies);

        await page.locator('#garminConfirm').click();
        await expect(page.locator('#garminImportError')).toContainText('Give every exercise a name');
        expect(bodies).toHaveLength(0);

        await page.locator('.garmin-ex-row').nth(0).locator('.garmin-ex-name').fill('Back Squat');
        await page.locator('.garmin-ex-row').nth(2).locator('.garmin-ex-name').fill('Leg Press');
        await page.locator('.garmin-option', { hasText: 'Log as “Lower Body”' }).click();
        await page.locator('#garminConfirm').click();

        await expect(page.locator('#garminImportDone')).toBeVisible();
        expect(bodies).toHaveLength(1);
        expect(bodies[0].action).toBe('attach');
        expect(bodies[0].target_id).toBe('workout-9');
        expect(bodies[0].exercise_mappings).toEqual({
            'squat': 'Back Squat', 'deadlift/barbell_deadlift': 'Barbell Deadlift', 'unknown': 'Leg Press' });
        expect(bodies[0].weight_unit).toBe('lbs');
        expect(bodies[0].activity.external_id).toBe('garmin:123:1795040846');
        await expect(page.locator('#garminUndo')).toBeVisible();
    });

    test('already-imported file is flagged instead of offering import', async ({ page }) => {
        await openReview(page, strengthPreview({ duplicate_of: 'session-7',
            proposed: { action: 'skip', target_id: 'session-7', confidence: 'high', reason: 'Already imported' } }));
        await expect(page.locator('#garminDuplicate')).toContainText('already in your history');
        await expect(page.locator('#garminConfirm')).toHaveCount(0);
    });

    test('unreadable file shows the server message', async ({ page }) => {
        await page.route('**/api/v3/garmin/import/parse-file', route =>
            route.fulfill({ status: 400, contentType: 'application/json',
                            body: JSON.stringify({ detail: "This isn't a FIT file." }) }));
        await page.goto(`${BASE}/workout-history.html`);
        await page.waitForFunction(() => !!window.garminImportReview);
        await page.evaluate(() => window.garminImportReview.open());
        await page.locator('#garminFileInput').setInputFiles({
            name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
        await expect(page.locator('#garminImportError')).toHaveText("This isn't a FIT file.");
    });

    test('history entries show a Garmin badge and an undo action', async ({ page }) => {
        await page.goto(`${BASE}/workout-history.html`);
        await page.waitForFunction(() => !!window.createSessionEntry && !!window.ffn && !!window.ffn.workoutHistory);
        const html = await page.evaluate(() => {
            const base = { id: 's1', workout_name: 'Strength', completed_at: '2026-11-18T22:45:00Z',
                           started_at: '2026-11-18T22:27:00Z', duration_minutes: 18, exercises_performed: [] };
            return {
                garmin: window.createSessionEntry({ ...base, external_id: 'garmin:1:2', import_meta: { type: 'created' } }),
                manual: window.createSessionEntry(base),
                cardio: window.renderCardioHistoryEntry({ id: 'c1', activity_type: 'running', started_at: base.started_at,
                    duration_minutes: 30, external_id: 'garmin:1:3', import_meta: { type: 'created' } }),
            };
        });
        expect(html.garmin).toContain('garmin-badge');
        expect(html.garmin).toContain('Undo Garmin import');
        expect(html.manual).not.toContain('garmin-badge');
        expect(html.cardio).toContain('garmin-badge');
        expect(html.cardio).toContain("undoFromHistory('c1', 'cardio')");
    });
});

// ── Phase 2: Personal API key sync ────────────────────────────────────────

const CONNECTED = {
    allowed: true, connected: true, status: 'connected', key_hint: '1234',
    connected_at: '2026-11-21T12:00:00Z', sync_from: '2026-11-21T05:00:00Z',
    key_expires_at: '2027-02-19T12:00:00Z', days_until_expiry: 90, review_all: false,
    last_sync_at: null, last_error: null, last_summary: null, pending_count: 0,
};

/**
 * Open a page and wait for the Firebase sign-in check to report (signed out in
 * tests), so it can't reset the Garmin UI after the test has set it up.
 */
async function gotoAfterAuthCheck(page, path) {
    await page.addInitScript(() => {
        window.__authEvents = 0;
        window.addEventListener('authStateChanged', () => { window.__authEvents += 1; });
    });
    await page.goto(`${BASE}/${path}`);
    await page.waitForFunction(() => window.__authEvents > 0, null, { timeout: 15000 });
}

function json(route, body, status = 200) {
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

test.describe('Garmin sync settings', () => {

    test('non-owner sees that sync is owner-only', async ({ page }) => {
        await gotoAfterAuthCheck(page, 'settings.html');
        await page.waitForFunction(() => !!window.garminSettings);
        await page.evaluate(() => window.garminSettings._setStatus({ allowed: false, connected: false }));
        await expect(page.locator('#garminSettingsBody')).toContainText('limited to the site owner');
        await expect(page.locator('#garminApiKey')).toHaveCount(0);
    });

    test('connect sends the key, expiry and start date, then shows the connection', async ({ page }) => {
        const sent = [];
        await page.route('**/api/v3/garmin/connection', async route => {
            if (route.request().method() === 'PUT') {
                sent.push(route.request().postDataJSON());
                return json(route, CONNECTED);
            }
            return json(route, { allowed: true, connected: false });
        });
        await gotoAfterAuthCheck(page, 'settings.html');
        await page.waitForFunction(() => !!window.garminSettings);
        await page.evaluate(() => window.garminSettings._setStatus({ allowed: true, connected: false }));

        await page.locator('#garminConnectBtn').click();
        await expect(page.locator('#garminSettingsMessage')).toContainText('Paste the full key');
        expect(sent).toHaveLength(0);

        await page.fill('#garminApiKey', 'my-personal-api-key-1234');
        await page.selectOption('#garminKeyExpiry', '180');
        await page.locator('#garminConnectBtn').click();

        await expect(page.locator('#garminStatusBadge')).toHaveText('Connected');
        await expect(page.locator('#garminSettingsBody')).toContainText('Key ending 1234');
        await expect(page.locator('#garminSettingsMessage')).toContainText('Garmin connected');
        expect(sent).toHaveLength(1);
        expect(sent[0].api_key).toBe('my-personal-api-key-1234');
        expect(sent[0].expires_in_days).toBe(180);
        expect(new Date(sent[0].sync_from).getTime()).not.toBeNaN();
        // The key never stays on the page after connecting.
        expect(await page.content()).not.toContain('my-personal-api-key-1234');
    });

    test('sync now, review toggle and expiry warning', async ({ page }) => {
        const patches = [];
        await page.route('**/api/v3/garmin/sync', route => json(route, {
            imported: [{ garmin_activity_id: '3', name: 'Treadmill Run', action: 'new' }],
            pending: 1, pending_total: 1, skipped: 0, errors: [], more: false }));
        await page.route('**/api/v3/garmin/connection', async route => {
            if (route.request().method() === 'PATCH') {
                patches.push(route.request().postDataJSON());
                return json(route, { ...CONNECTED, review_all: true });
            }
            return json(route, { ...CONNECTED, last_sync_at: '2026-11-21T13:00:00Z', pending_count: 1,
                                 last_summary: { imported: 1, pending: 1, skipped: 0, errors: 0 } });
        });
        await gotoAfterAuthCheck(page, 'settings.html');
        await page.waitForFunction(() => !!window.garminSettings);
        await page.evaluate(c => window.garminSettings._setStatus({ ...c, days_until_expiry: 3 }), CONNECTED);
        await expect(page.locator('#garminSettingsBody')).toContainText('expires in 3 days');

        await page.locator('#garminSyncNow').click();
        await expect(page.locator('#garminSettingsMessage')).toContainText('1 imported · 1 to review');
        await expect(page.locator('#garminLastSync')).toContainText('1 imported, 1 to review');
        await expect(page.locator('#garminSettingsBody')).toContainText('1 activity waiting for review');

        await page.locator('#garminReviewAll').check();
        await expect(page.locator('#garminSettingsMessage')).toContainText('wait for review');
        expect(patches).toEqual([{ review_all: true }]);
    });
});

test.describe('Garmin sync on History', () => {

    test('connected account shows Sync and a review banner; review queue walks pending items', async ({ page }) => {
        const dismissed = [];
        await page.route('**/api/v3/garmin/connection', route =>
            json(route, { ...CONNECTED, pending_count: 2 }));
        await page.route('**/api/v3/garmin/pending', route => json(route, [
            { id: '4', name: 'Strength', kind: 'strength', started_at: START, reason: 'New exercise names to confirm' },
            { id: '5', name: 'HIIT', kind: 'cardio', started_at: START, reason: 'Check the match' },
        ]));
        await page.route('**/api/v3/garmin/pending/*/preview', route => {
            const id = route.request().url().split('/pending/')[1].split('/')[0];
            const preview = strengthPreview();
            preview.activity.name = id === '4' ? 'Strength' : 'HIIT';
            return json(route, preview);
        });
        await page.route('**/api/v3/garmin/pending/*', route => {
            if (route.request().method() === 'DELETE') {
                dismissed.push(route.request().url().split('/pending/')[1]);
                return json(route, { success: true });
            }
            return route.fallback();
        });

        await gotoAfterAuthCheck(page, 'workout-history.html');
        await page.waitForFunction(() => !!window.garminImportReview);
        await page.evaluate(() => window.garminImportReview.refreshSyncControls());

        // Header buttons live inside history content that may be hidden for a
        // signed-out test browser, so check state rather than visibility.
        await expect(page.locator('[data-garmin-sync]').first()).not.toHaveClass(/d-none/);
        await expect(page.locator('[data-garmin-pending-count]').first()).toHaveText('2 Garmin activities need review');

        await page.evaluate(() => window.garminImportReview.openPendingQueue());
        await expect(page.locator('#garminActivityName')).toHaveText('Strength');
        await expect(page.locator('#garminQueueHeader')).toContainText('2 waiting');
        await expect(page.locator('#garminQueueHeader')).toContainText('New exercise names to confirm');
        await expect(page.locator('#garminBack')).toHaveText('Later');

        await page.locator('.garmin-option', { hasText: "Don't import" }).click();
        await page.locator('#garminConfirm').click();
        await expect(page.locator('#garminActivityName')).toHaveText('HIIT');
        expect(dismissed).toEqual(['4']);
    });

    test('signed-out or unconnected users do not see Sync', async ({ page }) => {
        await page.route('**/api/v3/garmin/connection', route => json(route, { allowed: true, connected: false }));
        await gotoAfterAuthCheck(page, 'workout-history.html');
        await page.waitForFunction(() => !!window.garminImportReview);
        await page.evaluate(() => window.garminImportReview.refreshSyncControls());
        await expect(page.locator('[data-garmin-sync]').first()).toHaveClass(/d-none/);
        await expect(page.locator('[data-garmin-pending-banner]').first()).toHaveClass(/d-none/);
    });
});
