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

function setItem(n, key, label, name, source, reps, weightKg, extra = {}) {
    return { id: `set-${n}`, type: 'set', started_at: new Date(Date.parse(START) + n * 150000).toISOString(),
             garmin_key: key, garmin_label: label, exercise_name: name, name_source: source, reps,
             weight: weightKg ? Math.round(weightKg * 2.20462 * 2) / 2 : null, weight_kg: weightKg, bodyweight: !weightKg,
             duration_s: 40, rest_s: 90, avg_heart_rate: 120 + n, max_heart_rate: 130 + n, accidental: false,
             included: true, ...extra };
}

const BENCH = 'Barbell Bench Press - Medium Grip';

/** Bench, an unnamed set, bench, a misfire, push-ups, bench again; a stair-climber warm-up before. */
function setLog(overrides = {}) {
    return {
        activity: { external_id: 'garmin:123:1795040846', kind: 'strength', name: 'Strength', device: 'venu3',
                    started_at: START, completed_at: '2026-11-18T22:45:35Z', duration_minutes: 18.15, calories: 216,
                    avg_heart_rate: 127, max_heart_rate: 149, exercises: [], timeline: [] },
        pending_id: '25137407059', session_id: null, weight_unit: 'lbs',
        items: [
            { id: 'act-777', type: 'cardio', started_at: '2026-11-18T22:00:00Z', garmin_activity_id: '777',
              name: 'Stair Stepper', activity_type: 'stair_climber', duration_minutes: 20, avg_heart_rate: 140,
              calories: 285, included: true },
            setItem(0, 'bench_press', 'Bench Press', BENCH, 'suggested', 8, 84),
            setItem(1, 'unknown', 'Unknown', BENCH, 'neighbor', 8, 84),
            setItem(2, 'bench_press', 'Bench Press', BENCH, 'suggested', 7, 84),
            setItem(3, 'bench_press', 'Bench Press', BENCH, 'suggested', null, 84,
                    { duration_s: 4, rest_s: null, accidental: true, included: false }),
            setItem(4, 'push_up', 'Push Up', 'Push Up', 'garmin', 12, null),
            setItem(5, 'bench_press', 'Bench Press', BENCH, 'suggested', 6, 84),
        ],
        workout_options: [
            { id: 'w-chest', name: 'Chest Day', score: 0.5, exercises: [
                { name: 'Dumbbell Bench Press', sets: '4', reps: '8', weight: '185', weight_unit: 'lbs', group_id: 'g1' },
                { name: 'Machine Seated Dips', sets: '4', reps: '12', weight: 'Body', weight_unit: 'lbs', group_id: 'g2' },
                { name: 'Incline Press', sets: '3', reps: '10', weight: null, weight_unit: 'lbs', group_id: 'g3' }] },
            { id: 'w-legs', name: 'Leg Day', score: 0, exercises: [
                { name: 'Back Squat', sets: '4', reps: '8', weight: '215', weight_unit: 'lbs', group_id: 'g9' }] },
        ],
        target_id: 'w-chest', workout_name: 'Garmin Strength Nov 18',
        known_exercises: ['Chest Dip', 'Incline Press', 'Leg Press'],
        ...overrides,
    };
}

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
    await page.route('**/api/v3/garmin/import/set-log', route => {
        calls.push(['set-log', route.request().postDataJSON()]);
        return json(route, setLog());
    });
    await page.route('**/api/v3/garmin/import/set-log/session/*', route =>
        json(route, setLog({ session_id: 's-9', pending_id: null, workout_options: [], target_id: null,
                             workout_name: 'Chest Day' })));
    await page.route('**/api/v3/garmin/import/log-sets', route => {
        const body = route.request().postDataJSON();
        calls.push(['log-sets', body]);
        current = current.map(i => (i.id === body.pending_id ? { ...i, status: 'imported', session_id: 's-new',
                                                                   session_type: 'workout', editable: true } : i));
        return json(route, { success: true, action: 'attach', session_id: 's-new', session_type: 'workout',
                             message: 'Logged to Chest Day', linked_activity_ids: [] });
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

    test('cardio review on the page: suggested match, then import', async ({ page }) => {
        const calls = await openGarminPage(page);
        // HIIT without sets and other cardio use the simple review; strength opens the set log.
        await page.locator('[data-garmin-item="25137406707"] [data-act="review"]').click();
        await expect(page.locator('#garminListView')).toBeHidden();
        await expect(page.locator('#garminActivityName')).toHaveText('Strength');
        await expect(page.locator('.garmin-option', { hasText: 'Suggested' })).toContainText('Merge into “Leg Day”');
        await expect(page.locator('#garminMergeNotes')).toContainText('per-set reps and weights');
        const rows = page.locator('.garmin-ex-row');
        await expect(rows.nth(0).locator('.garmin-ex-sets')).toHaveText('8×165, 9×165, 7×215, 7×215 lbs');
        await page.locator('#garminConfirm').click();
        await expect(page.locator('#garminImportError')).toContainText('Give every exercise a name');
        await rows.nth(2).locator('.garmin-ex-name').fill('Leg Press');
        await page.locator('#garminConfirm').click();
        await expect(page.locator('#garminImportDone')).toBeVisible();
        const confirm = calls.find(c => c[0] === 'confirm')[1];
        expect(confirm.action).toBe('merge');
        expect(confirm.pending_id).toBe('25137406707');
        await page.locator('#garminDone').click();
        await expect(page.locator('#garminCountImported')).toHaveText('2');
    });

    test('dismiss from the review screen', async ({ page }) => {
        const calls = await openGarminPage(page);
        await page.locator('[data-garmin-item="25137406707"] [data-act="review"]').click();
        await page.locator('.garmin-option', { hasText: 'Dismiss' }).click();
        await expect(page.locator('#garminConfirm')).toHaveText('Dismiss');
        await page.locator('#garminConfirm').click();
        await expect(page.locator('#garminListView')).toBeVisible();
        expect(calls).toEqual([['status', '25137406707', 'dismissed']]);
        await expect(page.locator('#garminCountReview')).toHaveText('1');
    });

    test('uploading a strength file opens the set log; a cardio file uses the simple review', async ({ page }) => {
        const calls = await openGarminPage(page);
        await page.route('**/api/v3/garmin/import/parse-file', route => json(route, strengthPreview()));
        await page.locator('#garminUploadBtn').click();
        await page.locator('#garminFileInput').setInputFiles({
            name: 'activity.fit', mimeType: 'application/octet-stream', buffer: Buffer.from('fake fit bytes') });
        await expect(page.locator('#garminSetLog')).toBeVisible();
        const opened = calls.find(c => c[0] === 'set-log')[1];
        expect(opened.activity.external_id).toBe('garmin:123:1795040846');
        expect(opened.pending_id).toBeNull();
        await page.locator('#gslBack').click();

        await page.unroute('**/api/v3/garmin/import/parse-file');
        const cardio = strengthPreview();
        cardio.activity.kind = 'cardio';
        cardio.activity.exercises = [];
        cardio.proposed = { action: 'new', confidence: 'high', reason: 'Nothing logged around this time' };
        await page.route('**/api/v3/garmin/import/parse-file', route => json(route, cardio));
        await page.locator('#garminUploadBtn').click();
        await page.locator('#garminFileInput').setInputFiles({
            name: 'run.fit', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
        await expect(page.locator('#garminActivityName')).toBeVisible();
        await page.locator('#garminConfirm').click();
        await expect(page.locator('#garminImportDone')).toBeVisible();
        expect(calls.find(c => c[0] === 'confirm')[1].pending_id).toBeNull();
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

// ── Set log: every set from the watch, editable ───────────────────────────

async function openSetLog(page, opts = {}) {
    const calls = await openGarminPage(page, opts);
    await page.locator('[data-garmin-item="25137407059"] [data-act="review"]').click();
    await expect(page.locator('#garminSetLog')).toBeVisible();
    return calls;
}

const cardNames = page => page.locator('.gsl-card .gsl-name').evaluateAll(els => els.map(e => e.value));

test.describe('Garmin set log', () => {

    test('shows every set in time order, matched to the suggested workout', async ({ page }) => {
        const calls = await openSetLog(page);
        expect(calls.find(c => c[0] === 'set-log')[1]).toEqual({ activity: null, pending_id: '25137407059' });
        await expect(page.locator('#gslStats')).toContainText('5 of 6 sets included');

        // Cards follow the workout's time order; the same exercise later is its own card.
        await expect(page.locator('.gsl-card')).toHaveCount(4);
        await expect(page.locator('.gsl-card').first()).toContainText('Stair Stepper');
        expect(await cardNames(page)).toEqual(['Dumbbell Bench Press', 'Push Up', 'Dumbbell Bench Press']);

        // Nothing merged or hidden: the unnamed set and the accidental one are both there.
        const bench = page.locator('.gsl-card').nth(1);
        await expect(bench.locator('.gsl-set')).toHaveCount(4);
        await expect(bench.locator('.gsl-plan')).toHaveText('Planned 4×8 @ 185 lbs');
        await expect(page.locator('[data-set="set-1"]')).toContainText('Garmin: Unknown');
        await expect(page.locator('[data-set="set-0"] .gsl-reps')).toHaveValue('8');
        await expect(page.locator('[data-set="set-0"] .gsl-weight')).toHaveValue('185');
        await expect(page.locator('[data-set="set-0"]')).toContainText('rest 1:30');
        await expect(page.locator('[data-set="set-0"]')).toContainText('120 bpm');
        await expect(page.locator('[data-set="set-3"]')).toContainText('Looks accidental');
        await expect(page.locator('[data-set="set-3"] [data-act="set-include"]')).toBeVisible();
        await expect(page.locator('[data-set="set-4"] .gsl-weight')).toHaveAttribute('placeholder', 'Body');
        await expect(page.locator('.gsl-card').nth(2).locator('.gsl-plan')).toHaveText('Not in Chest Day');

        // Planned vs actual.
        await expect(page.locator('[data-planned="Dumbbell Bench Press"]')).toContainText(
            'planned 4×8 @ 185 lbs → 8×185, 8×185, 7×185, 6×185 lbs');
        await expect(page.locator('[data-planned="Incline Press"]')).toContainText('not done');
    });

    test('correct sets, regroup, and log against the workout', async ({ page }) => {
        const calls = await openSetLog(page);

        // The push-ups were dips: rename the card and it lines up with the plan.
        const pushUps = page.locator('.gsl-card').nth(2).locator('.gsl-name');
        await pushUps.fill('Machine Seated Dips');
        await pushUps.dispatchEvent('change');
        await expect(page.locator('[data-planned="Machine Seated Dips"]')).toContainText('→ 12');

        // Fix a rep count, include the "accidental" set with its real reps, add a missed set of dips.
        await page.locator('[data-set="set-2"] .gsl-reps').fill('8');
        await page.locator('[data-set="set-3"] [data-act="set-include"]').click();
        await page.locator('[data-set="set-3"] .gsl-reps').fill('5');
        await page.locator('.gsl-card').nth(2).locator('[data-act="add-set"]').click();
        await expect(page.locator('.gsl-card').nth(2).locator('.gsl-set')).toHaveCount(2);
        await expect(page.locator('#gslStats')).toContainText('7 of 7 sets included');

        // Leave the warm-up out; move the last bench card up so it joins the first.
        await page.locator('.gsl-card').first().locator('[data-act="set-exclude"]').click();
        await page.locator('.gsl-card').nth(3).locator('[data-act="card-up"]').click();
        expect(await cardNames(page)).toEqual(['Dumbbell Bench Press', 'Machine Seated Dips']);
        await expect(page.locator('.gsl-card').nth(1).locator('.gsl-set')).toHaveCount(5);
        await expect(page.locator('[data-planned="Dumbbell Bench Press"]')).toContainText(
            '8×185, 8×185, 8×185, 5×185, 6×185 lbs');

        await page.locator('#gslSave').click();
        await expect(page.locator('#garminListView')).toBeVisible();
        const body = calls.find(c => c[0] === 'log-sets')[1];
        expect(body.target_id).toBe('w-chest');
        expect(body.pending_id).toBe('25137407059');
        expect(body.session_id).toBeNull();
        expect(body.weight_unit).toBe('lbs');
        expect(body.items.map(i => [i.id.replace(/added-.*/, 'added'), i.exercise_name || i.name, i.reps ?? null, i.included]))
            .toEqual([
                ['act-777', 'Stair Stepper', null, false],
                ['set-0', 'Dumbbell Bench Press', 8, true],
                ['set-1', 'Dumbbell Bench Press', 8, true],
                ['set-2', 'Dumbbell Bench Press', 8, true],
                ['set-3', 'Dumbbell Bench Press', 5, true],
                ['set-5', 'Dumbbell Bench Press', 6, true],
                ['set-4', 'Machine Seated Dips', 12, true],
                ['added', 'Machine Seated Dips', 12, true],
            ]);
        await expect(page.locator('#garminCountImported')).toHaveText('2');
        await expect(page.locator('[data-garmin-item="25137407059"] [data-act="edit"]')).toHaveCount(0);  // filtered view
    });

    test('one set was a different exercise; rename the rest; save as a new workout', async ({ page }) => {
        const calls = await openSetLog(page);
        await page.selectOption('#gslTarget', '');
        expect(await cardNames(page)).toEqual([BENCH, 'Push Up', BENCH]);
        await expect(page.locator('#gslWorkoutName')).toHaveValue('Garmin Strength Nov 18');

        // Rename the first bench card: the other bench sets are offered the same name.
        const first = page.locator('.gsl-card').nth(1).locator('.gsl-name');
        await first.fill('Bench');
        await first.dispatchEvent('change');
        await expect(page.locator('#gslRenameOffer')).toContainText('1 more set is still named');
        await page.locator('[data-act="rename-all"]').click();
        expect(await cardNames(page)).toEqual(['Bench', 'Push Up', 'Bench']);

        // The second set was actually incline press: it splits into its own card, in place.
        await page.locator('[data-set="set-1"] [data-act="set-rename"]').click();
        await page.locator('[data-set="set-1"] .gsl-set-name').fill('Incline Press');
        await page.locator('[data-set="set-1"] [data-act="set-rename-ok"]').click();
        expect(await cardNames(page)).toEqual(['Bench', 'Incline Press', 'Bench', 'Push Up', 'Bench']);

        // Moving a set keeps its exercise.
        await page.locator('[data-set="set-1"] [data-act="set-up"]').click();
        expect(await cardNames(page)).toEqual(['Incline Press', 'Bench', 'Push Up', 'Bench']);

        await page.locator('#gslWorkoutName').fill('');
        await page.locator('#gslSave').click();
        await expect(page.locator('#gslError')).toContainText('Give the new workout a name');
        await page.locator('#gslWorkoutName').fill('Chest (watch)');
        await page.locator('#gslKeepTemplate').check();
        await page.locator('#gslSave').click();
        await expect(page.locator('#garminListView')).toBeVisible();
        const body = calls.find(c => c[0] === 'log-sets')[1];
        expect(body.target_id).toBeNull();
        expect(body.save_as_template).toBe(true);
        expect(body.workout_name).toBe('Chest (watch)');
        expect(body.items.filter(i => i.type === 'set').map(i => i.exercise_name)).toEqual(
            ['Incline Press', 'Bench', 'Bench', 'Bench', 'Push Up', 'Bench']);
    });

    test('unsaved edits survive leaving and coming back; reset returns to the watch data', async ({ page }) => {
        await openSetLog(page);
        await page.locator('[data-set="set-0"] .gsl-reps').fill('10');
        await page.selectOption('#gslUnit', 'kg');
        await expect(page.locator('[data-set="set-1"] .gsl-weight')).toHaveValue('84');
        await page.locator('#gslBack').click();
        await page.locator('[data-garmin-item="25137407059"] [data-act="review"]').click();
        await expect(page.locator('#gslRestored')).toBeVisible();
        await expect(page.locator('[data-set="set-0"] .gsl-reps')).toHaveValue('10');
        await expect(page.locator('#gslUnit')).toHaveValue('kg');

        await page.locator('#garminSetLog [data-act="reset"]').last().click();
        await expect(page.locator('#gslRestored')).toHaveCount(0);
        await expect(page.locator('[data-set="set-0"] .gsl-reps')).toHaveValue('8');
        await expect(page.locator('[data-set="set-0"] .gsl-weight')).toHaveValue('185');
    });

    test('an imported session can be reopened and corrected', async ({ page }) => {
        const items = [...ITEMS, { id: '25000000001', source: 'sync', status: 'imported', name: 'Strength',
            kind: 'strength', activity_type: 'strength_training', started_at: '2026-11-16T18:04:36Z',
            detail: 'Logged as “Chest Day”', action: 'attach', session_id: 's-9', session_type: 'workout', editable: true }];
        const calls = await openGarminPage(page, { items });
        await page.locator('#garminFilters [data-filter="imported"]').click();
        await expect(page.locator('[data-garmin-item="25137406926"] [data-act="edit"]')).toHaveCount(0);
        await page.locator('[data-garmin-item="25000000001"] [data-act="edit"]').click();
        await expect(page.locator('#garminSetLog')).toContainText('Logged to Chest Day');
        await expect(page.locator('#gslTarget')).toHaveCount(0);
        await expect(page.locator('#gslSave')).toContainText('Save changes');
        await page.locator('[data-set="set-5"] .gsl-reps').fill('7');
        await page.locator('#gslSave').click();
        await expect(page.locator('#garminListView')).toBeVisible();
        const body = calls.find(c => c[0] === 'log-sets')[1];
        expect(body.session_id).toBe('s-9');
        expect(body.items.find(i => i.id === 'set-5').reps).toBe(7);
    });

    test('merging into a session logged in the app still uses the simple review', async ({ page }) => {
        await openSetLog(page);
        await page.locator('#gslMerge').click();
        await expect(page.locator('#garminActivityName')).toBeVisible();
        await expect(page.locator('.garmin-option', { hasText: 'Merge into “Leg Day”' })).toHaveCount(1);
    });

    test('a load error is shown with a way back', async ({ page }) => {
        await openGarminPage(page);
        await page.unroute('**/api/v3/garmin/import/set-log');
        await page.route('**/api/v3/garmin/import/set-log', route =>
            json(route, { detail: 'The watch recorded no sets for this activity.' }, 400));
        await page.locator('[data-garmin-item="25137407059"] [data-act="review"]').click();
        await expect(page.locator('#gslError')).toHaveText('The watch recorded no sets for this activity.');
        await page.locator('#gslBack').click();
        await expect(page.locator('#garminListView')).toBeVisible();
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

    test('a session with per-set detail shows every set, like a notebook page', async ({ page }) => {
        await gotoAfterAuthCheck(page, 'workout-history.html');
        await page.waitForFunction(() => !!window.renderExerciseTableRow && !!window.perSetLine);
        const out = await page.evaluate(() => {
            const ex = { exercise_name: 'Bench Press', weight: '185', weight_unit: 'lbs', target_sets: '4',
                         target_reps: '6-8', avg_heart_rate: 121, set_details: [
                             { set_number: 1, reps_completed: 8, weight: 185 }, { set_number: 2, reps_completed: 8, weight: 185 },
                             { set_number: 3, reps_completed: 7, weight: 187.5 }, { set_number: 4, duration_s: 40 }] };
            return { line: window.perSetLine(ex), row: window.renderExerciseTableRow(ex, null),
                     plain: window.renderExerciseTableRow({ ...ex, set_details: [] }, null) };
        });
        expect(out.line).toBe('8×185, 8×185, 7×187.5, 40s lbs · 121 bpm avg');
        expect(out.row).toContain('session-set-line');
        expect(out.plain).not.toContain('session-set-line');
    });

    test('the session screen recalls last time\'s sets for an exercise', async ({ page }) => {
        await gotoAfterAuthCheck(page, 'garmin.html');
        await page.addScriptTag({ url: '/static/assets/js/components/exercise-card-renderer.js' });
        const html = await page.evaluate(() => {
            const fake = { _escapeHtml: t => String(t).replace(/</g, '&lt;') };
            const recent = [{ weight: '185', weight_unit: 'lbs', date: new Date().toISOString(),
                              set_summary: '8×185, 8×185, 7×185, 6×185' }];
            const proto = window.ExerciseCardRenderer.prototype;
            return [proto._renderWeightHistory.call(fake, 'Bench', '185', 'lbs', new Date().toISOString(), recent),
                    proto._renderWeightHistory.call(fake, 'Bench', '185', 'lbs', new Date().toISOString(), [{ weight: '185' }])];
        });
        expect(html[0]).toContain('8×185, 8×185, 7×185, 6×185');
        expect(html[1]).not.toContain('workout-history-sets');
    });
});
