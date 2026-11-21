// @ts-check
const { test, expect } = require('playwright/test');
const { BASE } = require('./fixtures');

/**
 * Garmin: the Garmin page (list, filters, review, upload, sync), the Settings
 * card, and History (badge, undo, "to review" banner). The Garmin API is mocked
 * (the real endpoints need Firebase auth); backend logic is covered by
 * tests/test_garmin_import.py and tests/test_garmin_sync.py.
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

const CONNECTED = {
    allowed: true, connected: true, status: 'connected', key_hint: '1234',
    connected_at: '2026-11-21T12:00:00Z', key_expires_at: '2027-02-19T12:00:00Z', days_until_expiry: 90,
    auto_import: false, last_sync_at: null, last_error: null, last_summary: null, pending_count: 2,
};

const ITEMS = [
    { id: '25137407059', source: 'sync', status: 'review', name: 'Strength', kind: 'strength',
      activity_type: 'strength_training', started_at: '2026-11-18T22:27:26Z', duration_minutes: 18.2,
      calories: 216, avg_heart_rate: 127, summary: 'Squat 4 sets, Barbell Deadlift 2 sets', detail: '' },
    { id: '25137406707', source: 'sync', status: 'review', name: 'HIIT', kind: 'cardio', activity_type: 'hiit',
      started_at: '2026-11-17T22:52:30Z', duration_minutes: 21, calories: 180, avg_heart_rate: 108, summary: '' },
    { id: '25137406926', source: 'sync', status: 'imported', name: 'Treadmill Running', kind: 'cardio',
      activity_type: 'treadmill_running', started_at: '2026-11-18T21:52:44Z', duration_minutes: 30.5,
      distance_m: 3169, detail: 'Saved as a new session', action: 'new', session_id: 'cardio-1',
      session_type: 'cardio' },
    { id: '25134371518', source: 'sync', status: 'skipped', name: 'Strength Training', kind: 'strength',
      activity_type: 'strength_training', started_at: '2026-11-19T19:28:00Z',
      detail: 'Entered by hand in Garmin Connect, so there are no sets or heart rate to import' },
    { id: '25079645887', source: 'sync', status: 'dismissed', name: 'HIIT', kind: 'cardio', activity_type: 'hiit',
      started_at: '2026-11-14T18:20:11Z', detail: 'Dismissed' },
];

function json(route, body, status = 200) {
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

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

/**
 * Open the Garmin page with mocked API and start it as if signed in.
 * Returns a log of mutating requests.
 */
async function openGarminPage(page, { items = ITEMS, connection = CONNECTED, preview = strengthPreview() } = {}) {
    const calls = [];
    let current = items.map(i => ({ ...i }));
    await page.route('**/api/v3/garmin/connection', route => json(route, connection));
    await page.route('**/api/v3/garmin/activities', route => json(route, current));
    await page.route('**/api/v3/garmin/activities/dismiss-all', route => {
        calls.push(['dismiss-all']);
        current = current.map(i => (i.status === 'review' ? { ...i, status: 'dismissed' } : i));
        return json(route, { success: true, dismissed: 2 });
    });
    await page.route(/\/api\/v3\/garmin\/activities\/[^/]+\/preview$/, route => json(route, preview));
    await page.route(/\/api\/v3\/garmin\/activities\/[^/]+$/, route => {
        if (route.request().method() !== 'PATCH') return route.fallback();
        const id = route.request().url().split('/activities/')[1];
        const body = route.request().postDataJSON();
        calls.push(['status', id, body.status]);
        current = current.map(i => (i.id === id ? { ...i, status: body.status } : i));
        return json(route, current.find(i => i.id === id));
    });
    await page.route('**/api/v3/garmin/import/confirm', route => {
        const body = route.request().postDataJSON();
        calls.push(['confirm', body]);
        current = current.map(i => (i.id === body.pending_id ? { ...i, status: 'imported', session_id: 's-new',
                                                                   session_type: 'workout' } : i));
        return json(route, { success: true, action: body.action, session_id: 's-new', session_type: 'workout',
                             message: 'Saved to Lower Body' });
    });
    await gotoAfterAuthCheck(page, 'garmin.html');
    // Signed out in tests: start the page directly.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('authStateChanged',
        { detail: { isAuthenticated: true } })));
    await expect(page.locator('#garminCountReview')).toHaveText(String(items.filter(i => i.status === 'review').length));
    return calls;
}

// ── Garmin page ───────────────────────────────────────────────────────────

test.describe('Garmin page', () => {

    test('is in the menu and lists activities by status', async ({ page }) => {
        await openGarminPage(page);
        await expect(page.locator('#layout-menu a[href="/garmin.html"]')).toHaveCount(1);

        // To review is the default view.
        const rows = page.locator('[data-garmin-item]');
        await expect(rows).toHaveCount(2);
        await expect(rows.first()).toContainText('Squat 4 sets, Barbell Deadlift 2 sets');
        await expect(rows.first().locator('[data-act="review"]')).toBeVisible();
        await expect(page.locator('#garminCountImported')).toHaveText('1');
        await expect(page.locator('#garminCountDismissed')).toHaveText('1');

        await page.locator('#garminFilters [data-filter="imported"]').click();
        await expect(rows).toHaveCount(1);
        await expect(rows.first()).toContainText('Treadmill Running');
        await expect(rows.first()).toContainText('Saved as a new session');
        await expect(rows.first().locator('[data-act="undo"]')).toBeVisible();

        await page.locator('#garminFilters [data-filter="all"]').click();
        await expect(rows).toHaveCount(5);
        await expect(page.locator('[data-garmin-item="25134371518"]')).toContainText('Entered by hand');
        await expect(page.locator('[data-garmin-item="25134371518"]')).toContainText('Skipped');
    });

    test('dismiss, restore and dismiss all', async ({ page }) => {
        const calls = await openGarminPage(page);
        await page.locator('[data-garmin-item="25137406707"] [data-act="dismiss"]').click();
        await expect(page.locator('#garminCountReview')).toHaveText('1');
        await expect(page.locator('#garminCountDismissed')).toHaveText('2');

        await page.locator('#garminFilters [data-filter="dismissed"]').click();
        await page.locator('[data-garmin-item="25079645887"] [data-act="restore"]').click();
        await expect(page.locator('#garminCountReview')).toHaveText('2');
        expect(calls).toEqual([['status', '25137406707', 'dismissed'], ['status', '25079645887', 'review']]);

        await page.locator('#garminFilters [data-filter="review"]').click();
        await page.locator('#garminDismissAll').click();
        await page.locator('.modal.show .btn', { hasText: 'Dismiss all' }).click();
        await expect(page.locator('#garminCountReview')).toHaveText('0');
        await expect(page.locator('#garminEmpty')).toContainText('Nothing to review');
    });

    test('review on the page: suggested match, names and weights, then import', async ({ page }) => {
        const calls = await openGarminPage(page);
        await page.locator('[data-garmin-item="25137407059"] [data-act="review"]').click();

        await expect(page.locator('#garminListView')).toBeHidden();
        await expect(page.locator('#garminActivityName')).toHaveText('Strength');
        const suggested = page.locator('.garmin-option', { hasText: 'Suggested' });
        await expect(suggested).toContainText('Merge into “Leg Day”');
        await expect(page.locator('#garminMergeNotes')).toContainText('per-set reps and weights');

        const rows = page.locator('.garmin-ex-row');
        await expect(rows).toHaveCount(3);
        await expect(rows.nth(0).locator('.garmin-ex-sets')).toHaveText('8×165, 9×165, 7×215, 7×215 lbs');
        await expect(rows.nth(1)).toContainText('Saved');
        await page.selectOption('#garminWeightUnit', 'kg');
        await expect(rows.nth(0).locator('.garmin-ex-sets')).toHaveText('8×75, 9×75, 7×97.5, 7×97.5 kg');
        await page.selectOption('#garminWeightUnit', 'lbs');

        await page.locator('#garminConfirm').click();
        await expect(page.locator('#garminImportError')).toContainText('Give every exercise a name');

        await rows.nth(0).locator('.garmin-ex-name').fill('Back Squat');
        await rows.nth(2).locator('.garmin-ex-name').fill('Leg Press');
        // Merging stays on this page; logging against a workout opens the session screen.
        await expect(page.locator('#garminConfirm')).toHaveText('Merge');
        await page.locator('.garmin-option', { hasText: 'Log as “Lower Body”' }).click();
        await expect(page.locator('#garminConfirm')).toContainText('Open in session');
        await expect(page.locator('#garminSessionHint')).toBeVisible();

        // "Save without editing" imports directly, as before.
        await page.locator('#garminSaveDirect').click();
        await expect(page.locator('#garminImportDone')).toBeVisible();
        const confirm = calls.find(c => c[0] === 'confirm')[1];
        expect(confirm.action).toBe('attach');
        expect(confirm.target_id).toBe('workout-9');
        expect(confirm.pending_id).toBe('25137407059');
        expect(confirm.exercise_mappings).toEqual({
            'squat': 'Back Squat', 'deadlift/barbell_deadlift': 'Barbell Deadlift', 'unknown': 'Leg Press' });

        await page.locator('#garminDone').click();
        await expect(page.locator('#garminListView')).toBeVisible();
        await expect(page.locator('#garminCountReview')).toHaveText('1');
        await expect(page.locator('#garminCountImported')).toHaveText('2');
    });

    test('Open in session prepares the workout and opens the session screen pre-filled', async ({ page }) => {
        await openGarminPage(page);
        const prepared = [];
        await page.route('**/api/v3/garmin/import/prepare-session', route => {
            prepared.push(route.request().postDataJSON());
            return json(route, { ...PREFILL, pending_id: '25137407059' });
        });
        await page.route('**/workout-mode.html*', route =>
            route.fulfill({ contentType: 'text/html', body: '<html><body>session screen</body></html>' }));
        await page.locator('[data-garmin-item="25137407059"] [data-act="review"]').click();
        await page.locator('.garmin-ex-row').nth(2).locator('.garmin-ex-name').fill('Leg Press');
        await page.locator('.garmin-option', { hasText: 'Log as “Lower Body”' }).click();
        await page.locator('#garminConfirm').click();

        await page.waitForURL(/workout-mode\.html\?id=workout-9&garmin=1/);
        expect(prepared[0].action).toBe('attach');
        expect(prepared[0].target_id).toBe('workout-9');
        expect(prepared[0].pending_id).toBe('25137407059');
        const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem('ffn_garmin_session_prefill')));
        expect(stored.workout_id).toBe('workout-9');
        expect(stored.session_id).toBeNull();
    });

    test('dismiss from the review screen', async ({ page }) => {
        const calls = await openGarminPage(page);
        await page.locator('[data-garmin-item="25137407059"] [data-act="review"]').click();
        await page.locator('.garmin-option', { hasText: 'Dismiss' }).click();
        await expect(page.locator('#garminConfirm')).toHaveText('Dismiss');
        await page.locator('#garminConfirm').click();
        await expect(page.locator('#garminListView')).toBeVisible();
        expect(calls).toEqual([['status', '25137407059', 'dismissed']]);
        await expect(page.locator('#garminCountReview')).toHaveText('1');
    });

    test('upload a file and import it', async ({ page }) => {
        const calls = await openGarminPage(page);
        await page.route('**/api/v3/garmin/import/parse-file', route => json(route, strengthPreview()));
        await page.locator('#garminUploadBtn').click();
        await page.locator('#garminFileInput').setInputFiles({
            name: 'activity.fit', mimeType: 'application/octet-stream', buffer: Buffer.from('fake fit bytes') });
        await expect(page.locator('#garminActivityName')).toHaveText('Strength');
        await page.locator('.garmin-ex-row').nth(2).locator('.garmin-ex-name').fill('Leg Press');
        await page.locator('#garminConfirm').click();
        await expect(page.locator('#garminImportDone')).toBeVisible();
        const confirm = calls.find(c => c[0] === 'confirm')[1];
        expect(confirm.action).toBe('merge');
        expect(confirm.pending_id).toBeNull();
    });

    test('upload: unreadable file and already-imported file', async ({ page }) => {
        await openGarminPage(page);
        await page.route('**/api/v3/garmin/import/parse-file', route =>
            json(route, { detail: "This isn't a FIT file." }, 400));
        await page.locator('#garminUploadBtn').click();
        await page.locator('#garminFileInput').setInputFiles({
            name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
        await expect(page.locator('#garminImportError')).toHaveText("This isn't a FIT file.");

        await page.unroute('**/api/v3/garmin/import/parse-file');
        await page.route('**/api/v3/garmin/import/parse-file', route => json(route, strengthPreview({
            duplicate_of: 'session-7',
            proposed: { action: 'skip', target_id: 'session-7', confidence: 'high', reason: 'Already imported' } })));
        await page.locator('#garminFileInput').setInputFiles({
            name: 'a.fit', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
        await expect(page.locator('#garminDuplicate')).toContainText('already in your history');
        await expect(page.locator('#garminConfirm')).toHaveCount(0);
        await page.locator('#garminBack').click();
        await expect(page.locator('#garminListView')).toBeVisible();
    });

    test('Sync checks Garmin and refreshes the list', async ({ page }) => {
        let syncs = 0;
        await page.route('**/api/v3/garmin/sync', route => {
            syncs += 1;
            return json(route, { imported: [], pending: 3, pending_total: 5, skipped: 1, errors: [], more: false,
                                 details: [{}, {}, {}, {}] });
        });
        await openGarminPage(page);
        await expect(page.locator('#garminSyncBtn')).toBeVisible();
        await page.locator('#garminSyncBtn').click();
        await expect(page.locator('#garminSyncMessage')).toContainText('3 new to review');
        expect(syncs).toBe(1);
    });

    test('not connected: no Sync, a hint to connect, uploads still work', async ({ page }) => {
        await openGarminPage(page, { connection: { allowed: true, connected: false }, items: [] });
        await expect(page.locator('#garminSyncBtn')).toBeHidden();
        await expect(page.locator('#garminConnectHint')).toBeVisible();
        await expect(page.locator('#garminUploadBtn')).toBeVisible();
        await expect(page.locator('#garminEmpty')).toBeVisible();
    });
});

// ── Session screen pre-filled from Garmin ─────────────────────────────────

const SESSION_WORKOUT = {
    id: 'workout-9', name: 'Lower Body', description: '',
    exercise_groups: [
        { group_id: 'group-squat', exercises: { a: 'Back Squat' }, sets: '3', reps: '8', rest: '90s',
          default_weight: '185', default_weight_unit: 'lbs', group_type: 'standard' },
        { group_id: 'group-dl', exercises: { a: 'Barbell Deadlift' }, sets: '3', reps: '5', rest: '120s',
          default_weight: '225', default_weight_unit: 'lbs', group_type: 'standard' },
    ],
    sections: [], tags: [], created_date: '2026-03-01T10:00:00Z', modified_date: '2026-03-01T10:00:00Z',
    is_archived: false,
};

const PREFILL = {
    workout_id: 'workout-9', workout_name: 'Lower Body',
    exercises: [
        { exercise_name: 'Back Squat', group_id: 'group-squat', sets_completed: 4, target_sets: '4',
          target_reps: '7-9', weight: '215', weight_unit: 'lbs', avg_heart_rate: 128, max_heart_rate: 145,
          set_details: [
              { set_number: 1, reps_completed: 8, weight: 165, avg_heart_rate: 120 },
              { set_number: 2, reps_completed: 9, weight: 165 },
              { set_number: 3, reps_completed: 7, weight: 215 },
              { set_number: 4, reps_completed: 7, weight: 215 }] },
        { exercise_name: 'Barbell Deadlift', group_id: 'group-dl', sets_completed: 2, target_sets: '2',
          target_reps: '9', weight: '215', weight_unit: 'lbs',
          set_details: [{ set_number: 1, reps_completed: 9, weight: 215 }, { set_number: 2, reps_completed: 9, weight: 215 }] },
        { exercise_name: 'Leg Press', group_id: 'garmin-2', sets_completed: 1, target_sets: '1', target_reps: '12',
          weight: '45', weight_unit: 'lbs', set_details: [{ set_number: 1, reps_completed: 12, weight: 44 }] },
    ],
    started_at: '2026-11-18T22:27:26Z', completed_at: '2026-11-18T22:45:35Z', duration_minutes: 18,
    calories: 216, avg_heart_rate: 127, max_heart_rate: 149, source: 'garmin', external_id: 'garmin:123:1795040846',
    import_meta: { type: 'created', garmin_started_at: '2026-11-18T22:27:26Z' }, pending_id: null,
    activity_name: 'Strength', kind: 'strength',
};

/** Same offline setup as build-log-session-persistence.spec.js: Firebase stubbed, anonymous, localStorage. */
async function stubFirebaseReady(page) {
    await page.addInitScript(() => {
        window.firebaseAuth = { currentUser: null, authStateReady: () => Promise.resolve(), onAuthStateChanged: () => () => {} };
        window.firebaseReady = true;
        setTimeout(() => { try { window.dispatchEvent(new Event('firebaseReady')); } catch (_) {} }, 0);
    });
}

test.describe('Garmin in the session screen', () => {

    test('opens pre-filled with the watch values and saves as a Garmin import', async ({ page }) => {
        await stubFirebaseReady(page);
        await page.goto(`${BASE}/settings.html`);
        await page.evaluate(({ workout, prefill }) => {
            localStorage.setItem('gym_workouts', JSON.stringify([workout]));
            // A stale in-progress session for the same workout must not take over.
            localStorage.setItem('ffn_active_workout_session', JSON.stringify({
                sessionId: 'stale', workoutId: workout.id, workoutName: workout.name,
                startedAt: new Date().toISOString(), status: 'in_progress', sessionMode: 'timed', exercises: {},
                sessionNotes: [], exerciseOrder: [], lastPageActive: new Date().toISOString(), schemaVersion: 2 }));
            sessionStorage.setItem('ffn_garmin_session_prefill', JSON.stringify({ ...prefill, session_id: null }));
        }, { workout: SESSION_WORKOUT, prefill: PREFILL });

        // source=public lets an anonymous test browser start a session.
        await page.goto(`${BASE}/workout-mode.html?id=workout-9&garmin=1&source=public`);
        await page.waitForFunction(() => {
            const s = window.workoutSessionService && window.workoutSessionService.currentSession;
            return s && s.exercises && s.exercises['Back Squat'];
        }, null, { timeout: 20000 });

        const state = await page.evaluate(() => {
            const s = window.workoutSessionService.currentSession;
            return {
                id: s.id,
                squat: s.exercises['Back Squat'],
                deadlift: s.exercises['Barbell Deadlift'],
                url: window.location.search,
                fields: window.garminSessionBridge.completionFields(s),
                finish: window.garminSessionBridge.finishDefaults(s),
            };
        });
        expect(state.id).not.toBe('stale');
        expect(state.squat.weight).toBe('215');
        expect([state.squat.target_sets, state.squat.target_reps]).toEqual(['4', '7-9']);
        expect(state.squat.set_details).toHaveLength(4);
        expect(state.squat.notes).toBe('From Garmin: 8×165, 9×165, 7×215, 7×215 lbs · avg HR 128 (max 145)');
        expect(state.deadlift.target_sets).toBe('2');
        expect(state.url).not.toContain('garmin=1');              // a reload resumes instead of re-applying

        // Saving carries the Garmin link, times and heart rate; Leg Press isn't in the workout -> session note.
        expect(state.fields).toMatchObject({ source: 'garmin', external_id: 'garmin:123:1795040846',
            started_at: '2026-11-18T22:27:26Z', completed_at: '2026-11-18T22:45:35Z', avg_heart_rate: 127 });
        expect(state.fields.notes).toContain('Also recorded by Garmin: Leg Press');
        expect(state.finish).toEqual({ minutes: 18, calories: 216 });

        // The exercise card shows the watch's weight in place of the template's 185.
        const card = page.locator('.workout-card', { hasText: 'Back Squat' }).first();
        await expect(card).toContainText('215');
        await expect(card).not.toContainText('185');
    });

    test('a normal session of the same workout is not treated as a Garmin import', async ({ page }) => {
        await stubFirebaseReady(page);
        await page.goto(`${BASE}/settings.html`);
        await page.evaluate(({ workout, prefill }) => {
            localStorage.setItem('gym_workouts', JSON.stringify([workout]));
            localStorage.removeItem('ffn_active_workout_session');
            // Leftover prefill already bound to some earlier session.
            sessionStorage.setItem('ffn_garmin_session_prefill', JSON.stringify({ ...prefill, session_id: 'old' }));
        }, { workout: SESSION_WORKOUT, prefill: PREFILL });
        await page.goto(`${BASE}/workout-mode.html?id=workout-9&source=public`);
        await page.waitForFunction(() => {
            const s = window.workoutSessionService && window.workoutSessionService.currentSession;
            return s && s.exercises && s.exercises['Back Squat'];
        }, null, { timeout: 20000 });
        const state = await page.evaluate(() => {
            const s = window.workoutSessionService.currentSession;
            return { weight: s.exercises['Back Squat'].weight, fields: window.garminSessionBridge.completionFields(s) };
        });
        expect(state.weight).toBe('185');
        expect(state.fields).toEqual({});
    });
});

// ── Settings card ─────────────────────────────────────────────────────────

test.describe('Garmin settings', () => {

    test('non-owner sees that sync is owner-only', async ({ page }) => {
        await gotoAfterAuthCheck(page, 'settings.html');
        await page.waitForFunction(() => !!window.garminSettings);
        await page.evaluate(() => window.garminSettings._setStatus({ allowed: false, connected: false }));
        await expect(page.locator('#garminSettingsBody')).toContainText('limited to the site owner');
        await expect(page.locator('#garminApiKey')).toHaveCount(0);
    });

    test('connect sends the key and expiry, then shows the connection', async ({ page }) => {
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
        await expect(page.locator('#garminSyncFrom')).toHaveCount(0);   // no start date any more

        await page.locator('#garminConnectBtn').click();
        await expect(page.locator('#garminSettingsMessage')).toContainText('Paste the full key');
        expect(sent).toHaveLength(0);

        await page.fill('#garminApiKey', 'my-personal-api-key-1234');
        await page.selectOption('#garminKeyExpiry', '180');
        await page.locator('#garminConnectBtn').click();

        await expect(page.locator('#garminStatusBadge')).toHaveText('Connected');
        await expect(page.locator('#garminSettingsMessage')).toContainText('Garmin connected');
        expect(sent).toEqual([{ api_key: 'my-personal-api-key-1234', expires_in_days: 180 }]);
        expect(await page.content()).not.toContain('my-personal-api-key-1234');
        await expect(page.locator('#garminPageLink')).toHaveText('Review 2 activities on the Garmin page');
    });

    test('auto-import toggle, sync now and expiry warning', async ({ page }) => {
        const patches = [];
        await page.route('**/api/v3/garmin/sync', route => json(route, {
            imported: [], pending: 4, pending_total: 4, skipped: 0, errors: [], more: false, details: [] }));
        await page.route('**/api/v3/garmin/connection', async route => {
            if (route.request().method() === 'PATCH') {
                patches.push(route.request().postDataJSON());
                return json(route, { ...CONNECTED, auto_import: true });
            }
            return json(route, { ...CONNECTED, last_sync_at: '2026-11-21T13:00:00Z', pending_count: 4,
                                 last_summary: { imported: 0, pending: 4, skipped: 0, errors: 0 } });
        });
        await gotoAfterAuthCheck(page, 'settings.html');
        await page.waitForFunction(() => !!window.garminSettings);
        await page.evaluate(c => window.garminSettings._setStatus({ ...c, days_until_expiry: 3 }), CONNECTED);
        await expect(page.locator('#garminSettingsBody')).toContainText('expires in 3 days');
        await expect(page.locator('#garminAutoImport')).not.toBeChecked();

        await page.locator('#garminSyncNow').click();
        await expect(page.locator('#garminSettingsMessage')).toContainText('4 new to review');
        await expect(page.locator('#garminSettingsMessage a')).toHaveAttribute('href', '/garmin.html');

        await page.locator('#garminAutoImport').check();
        await expect(page.locator('#garminSettingsMessage')).toContainText('imported automatically');
        expect(patches).toEqual([{ auto_import: true }]);
    });
});

// ── History ───────────────────────────────────────────────────────────────

test.describe('Garmin on History', () => {

    test('links to the Garmin page and shows a "to review" banner', async ({ page }) => {
        await page.route('**/api/v3/garmin/connection', route => json(route, { ...CONNECTED, pending_count: 3 }));
        await gotoAfterAuthCheck(page, 'workout-history.html');
        await page.waitForFunction(() => !!window.garminImportReview);
        expect(await page.locator('a.garmin-page-btn[href="/garmin.html"]').count()).toBeGreaterThan(0);
        await page.evaluate(() => window.garminImportReview.refreshHistoryBanner());
        await expect(page.locator('[data-garmin-pending-count]').first()).toHaveText('3 Garmin activities to review');
        await expect(page.locator('[data-garmin-review]').first()).toHaveAttribute('href', '/garmin.html');
    });

    test('no banner when nothing is waiting', async ({ page }) => {
        await page.route('**/api/v3/garmin/connection', route => json(route, { allowed: true, connected: false }));
        await gotoAfterAuthCheck(page, 'workout-history.html');
        await page.waitForFunction(() => !!window.garminImportReview);
        await page.evaluate(() => window.garminImportReview.refreshHistoryBanner());
        await expect(page.locator('[data-garmin-pending-banner]').first()).toHaveClass(/d-none/);
    });

    test('history entries show a Garmin badge and an undo action', async ({ page }) => {
        await gotoAfterAuthCheck(page, 'workout-history.html');
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
