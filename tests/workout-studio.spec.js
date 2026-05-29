// @ts-check
const { test, expect } = require('playwright/test');

const BASE = 'http://localhost:8001';

test.describe('Workout Studio — Foundation + Live Exercise List', () => {

    test('page loads with slim header, sticky tray, and search', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);

        // Slim header: workout name input (no back button, no picker dropdown) + mode toggle
        await expect(page.locator('#studioBackBtn')).toHaveCount(0);
        await expect(page.locator('#studioWorkoutPicker')).toHaveCount(0);
        await expect(page.locator('#studioWorkoutNameInput')).toBeVisible();
        await expect(page.locator('#studioModePlan')).toHaveClass(/is-active/);
        await expect(page.locator('#studioModeLog')).not.toHaveClass(/is-active/);

        // Tray starts empty
        await expect(page.locator('#studioTray')).toHaveAttribute('data-empty', 'true');
        await expect(page.locator('#studioTrayEmpty')).toBeVisible();

        // Search input
        await expect(page.locator('#studioSearchInput')).toBeVisible();

        // Single Filter button instead of the old quick-action tiles, and
        // the filter panel itself is collapsed on first load.
        await expect(page.locator('#studioFilterBtn')).toBeVisible();
        await expect(page.locator('#studioFilterPanel')).toBeHidden();

        // Section title is the static "Exercises" label
        await expect(page.locator('#studioSectionTitle')).toHaveText('Exercises');

        // Continue CTA hidden when tray is empty
        await expect(page.locator('#studioContinueCta')).toBeHidden();
    });

    test('exercise list renders immediately on load (no tab/filter click required)', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        const firstRow = page.locator('.studio-row').first();
        await expect(firstRow).toBeVisible({ timeout: 15000 });
        await expect(firstRow.locator('.studio-row-title')).not.toBeEmpty();
    });

    test('clicking "+" on a row adds the exercise to the tray as a chip', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);

        const firstRow = page.locator('.studio-row').first();
        await expect(firstRow).toBeVisible({ timeout: 15000 });

        const exerciseName = (await firstRow.locator('.studio-row-title span').last().textContent() || '').trim();
        expect(exerciseName.length).toBeGreaterThan(0);

        await firstRow.locator('.studio-row-add').click();

        await expect(page.locator('#studioTray')).toHaveAttribute('data-empty', 'false');
        const chips = page.locator('.studio-tray-chip');
        await expect(chips).toHaveCount(1);
        await expect(chips.first()).toContainText(exerciseName);

        await expect(firstRow.locator('.studio-row-add-badge')).toHaveText('1');
        await expect(firstRow.locator('.studio-row-add')).toHaveClass(/has-count/);

        await expect(page.locator('#studioContinueCta')).toBeVisible();
        await expect(page.locator('#studioContinueCount')).toHaveText('1');
    });

    test('tapping "+" twice adds two instances (multi-add)', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);

        const firstRow = page.locator('.studio-row').first();
        await expect(firstRow).toBeVisible({ timeout: 15000 });

        await firstRow.locator('.studio-row-add').click();
        await firstRow.locator('.studio-row-add').click();

        await expect(page.locator('.studio-tray-chip')).toHaveCount(2);
        await expect(firstRow.locator('.studio-row-add-badge')).toHaveText('2');
        await expect(page.locator('#studioContinueCount')).toHaveText('2');
    });

    test('removing a chip decrements the row badge and updates the CTA', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);

        const firstRow = page.locator('.studio-row').first();
        await expect(firstRow).toBeVisible({ timeout: 15000 });

        await firstRow.locator('.studio-row-add').click();
        await firstRow.locator('.studio-row-add').click();
        await expect(page.locator('.studio-tray-chip')).toHaveCount(2);

        await page.locator('.studio-tray-chip-remove').first().click();
        await expect(page.locator('.studio-tray-chip')).toHaveCount(1);
        await expect(firstRow.locator('.studio-row-add-badge')).toHaveText('1');
        await expect(page.locator('#studioContinueCount')).toHaveText('1');

        await page.locator('.studio-tray-chip-remove').first().click();
        await expect(page.locator('#studioTray')).toHaveAttribute('data-empty', 'true');
        await expect(page.locator('#studioContinueCta')).toBeHidden();
    });

    test('Plan / Log Now mode toggle switches active state', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);

        await expect(page.locator('#studioModePlan')).toHaveClass(/is-active/);
        await page.locator('#studioModeLog').click();
        await expect(page.locator('#studioModeLog')).toHaveClass(/is-active/);
        await expect(page.locator('#studioModePlan')).not.toHaveClass(/is-active/);

        await page.locator('#studioModePlan').click();
        await expect(page.locator('#studioModePlan')).toHaveClass(/is-active/);
    });

    test('search filters the list down to matching exercises', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);

        const firstRow = page.locator('.studio-row').first();
        await expect(firstRow).toBeVisible({ timeout: 15000 });

        await page.locator('#studioSearchInput').fill('bench press');
        await page.waitForTimeout(300);

        const titles = await page.locator('.studio-row-title').allTextContents();
        expect(titles.length).toBeGreaterThan(0);
        const bench = titles.filter((t) => /bench/i.test(t));
        expect(bench.length).toBeGreaterThan(0);

        await page.locator('#studioSearchClear').click();
        await expect(page.locator('#studioSearchInput')).toHaveValue('');
    });

    test('exercise row titles wrap to multiple lines rather than truncating', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        const firstRow = page.locator('.studio-row').first();
        await expect(firstRow).toBeVisible({ timeout: 15000 });

        // Computed style should NOT be nowrap (the bug we just fixed).
        const whiteSpace = await firstRow.locator('.studio-row-title').evaluate((el) =>
            window.getComputedStyle(el).whiteSpace
        );
        expect(whiteSpace).not.toBe('nowrap');
    });

    test('tray chips wrap to a new line instead of scrolling horizontally', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await expect(page.locator('.studio-row').first()).toBeVisible({ timeout: 15000 });

        // Container should declare flex-wrap: wrap so chips reflow vertically.
        const flexWrap = await page.locator('#studioTrayChips').evaluate((el) =>
            window.getComputedStyle(el).flexWrap
        );
        expect(flexWrap).toBe('wrap');
    });

    test('quick-action tiles are gone — single Filter button in section header instead', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await expect(page.locator('.studio-quick-tile')).toHaveCount(0);
        await expect(page.locator('#studioFilterBtn')).toBeVisible();
        await expect(page.locator('#studioFilterPanel')).toBeHidden();
    });

    test('Filter button toggles the inline filter panel', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await expect(page.locator('.studio-row').first()).toBeVisible({ timeout: 15000 });

        await page.locator('#studioFilterBtn').click();
        await expect(page.locator('#studioFilterPanel')).toBeVisible();
        await expect(page.locator('#studioFilterBtn')).toHaveAttribute('aria-expanded', 'true');

        await page.locator('#studioFilterBtn').click();
        await expect(page.locator('#studioFilterPanel')).toBeHidden();
        await expect(page.locator('#studioFilterBtn')).toHaveAttribute('aria-expanded', 'false');
    });

    test('Selecting a muscle-group chip narrows the list and updates the badge', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await expect(page.locator('.studio-row').first()).toBeVisible({ timeout: 15000 });

        const beforeCount = await page.locator('.studio-row').count();
        expect(beforeCount).toBeGreaterThan(0);

        await page.locator('#studioFilterBtn').click();
        await page.locator('.studio-filter-chip[data-value="Chest"]').click();

        await expect(page.locator('#studioFilterBadge')).toHaveText('1');
        await expect(page.locator('#studioFilterBtn')).toHaveClass(/has-active/);

        // The visible rows after applying a single-group filter should be a subset
        const afterCount = await page.locator('.studio-row').count();
        expect(afterCount).toBeGreaterThan(0);
        expect(afterCount).toBeLessThanOrEqual(beforeCount);
    });

    test('global "Log Session" FAB is suppressed on the studio page', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        // Wait for menu-injection-service to run
        await expect(page.locator('#layout-menu .menu-item').first()).toBeVisible({ timeout: 10000 });
        await expect(page.locator('#globalLogFab')).toHaveCount(0);
    });

    test('fullDataLoaded event from the cache service refreshes the studio list', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await expect(page.locator('.studio-row').first()).toBeVisible({ timeout: 15000 });

        const totalBefore = parseInt(await page.locator('#studioList').getAttribute('data-total-count') || '0', 10);
        expect(totalBefore).toBeGreaterThan(0);

        // Simulate the full DB landing in the background by stuffing a fake
        // exercise into the cache and emitting fullDataLoaded.
        await page.evaluate(() => {
            const svc = window.exerciseCacheService;
            if (!svc) return;
            const sentinel = {
                id: 'fulldata-sentinel-x',
                name: 'Cache Full Data Sentinel',
                targetMuscleGroup: 'Chest',
                primaryEquipment: 'Bodyweight',
                isGlobal: true,
            };
            svc.exercises = (svc.exercises || []).concat([sentinel]);
            // emit the event (the studio is listening)
            if (typeof svc.emit === 'function') svc.emit('fullDataLoaded', { count: svc.exercises.length });
        });

        // Total grows by exactly one (or close to it if the live full DB is also racing)
        const totalAfter = parseInt(await page.locator('#studioList').getAttribute('data-total-count') || '0', 10);
        expect(totalAfter).toBeGreaterThan(totalBefore);
    });

    test('floating count pill appears once the inline count scrolls out of view', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await expect(page.locator('.studio-row').first()).toBeVisible({ timeout: 15000 });

        const pill = page.locator('#studioFloatingCount');
        // Initially the inline count is visible at the top, so the floating
        // pill should NOT be in is-visible state. (It may not even exist yet
        // if rendered>=total, which is true on seed-only data.)
        await page.evaluate(() => {
            // Force a "more available" state so the pill is allowed to show
            const ws = window.workoutStudio;
            if (!ws) return;
            ws.totalAvailable = (ws.totalAvailable || 0) + 500;
            ws._updateListCount(ws.renderedCount || 60, ws.totalAvailable);
        });

        // Scroll to the bottom so the inline count goes off-screen.
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        // Give IntersectionObserver a tick to fire
        await page.waitForTimeout(300);

        await expect(pill).toHaveClass(/is-visible/, { timeout: 3000 });

        // Scroll back to top and the pill loses the is-visible class.
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(300);
        await expect(pill).not.toHaveClass(/is-visible/, { timeout: 3000 });
    });

    test('section header shows "X of Y" count that grows as more load', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await expect(page.locator('.studio-row').first()).toBeVisible({ timeout: 15000 });

        const countEl = page.locator('#studioListCount');
        const before = (await countEl.textContent() || '').trim();
        // Expect "60 of 139" or "60 of 2,400" — number, "of", number
        expect(before).toMatch(/^[\d,]+ of [\d,]+$/);

        await page.evaluate(() => window.workoutStudio && window.workoutStudio._loadMore && window.workoutStudio._loadMore());

        const after = (await countEl.textContent() || '').trim();
        const firstBefore = parseInt(before.split(' ')[0].replace(/,/g, ''), 10);
        const firstAfter = parseInt(after.split(' ')[0].replace(/,/g, ''), 10);
        expect(firstAfter).toBeGreaterThan(firstBefore);
    });

    test('exercise list paginates — initial render is one page, more load on scroll', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await expect(page.locator('.studio-row').first()).toBeVisible({ timeout: 15000 });

        const initialRendered = await page.locator('#studioList').getAttribute('data-rendered-count');
        const totalAvailable = await page.locator('#studioList').getAttribute('data-total-count');
        const initialCount = parseInt(initialRendered || '0', 10);
        const totalCount = parseInt(totalAvailable || '0', 10);

        // The catalog is big — make sure we actually have more to load
        expect(initialCount).toBeGreaterThan(0);
        expect(initialCount).toBeLessThanOrEqual(60);
        expect(totalCount).toBeGreaterThan(initialCount);

        // Trigger the sentinel by manually loading more (deterministic; doesn't rely on viewport-based scroll)
        await page.evaluate(() => window.workoutStudio && window.workoutStudio._loadMore && window.workoutStudio._loadMore());
        const after = parseInt(await page.locator('#studioList').getAttribute('data-rendered-count') || '0', 10);
        expect(after).toBeGreaterThan(initialCount);
    });

    test('changing a filter resets pagination back to the first page', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await expect(page.locator('.studio-row').first()).toBeVisible({ timeout: 15000 });

        // Load more so renderedCount > one page
        await page.evaluate(() => window.workoutStudio && window.workoutStudio._loadMore && window.workoutStudio._loadMore());
        const grown = parseInt(await page.locator('#studioList').getAttribute('data-rendered-count') || '0', 10);
        expect(grown).toBeGreaterThan(60);

        // Apply a filter — pagination should reset
        await page.locator('#studioFilterBtn').click();
        await page.locator('.studio-filter-chip[data-value="Chest"]').click();

        const afterFilter = parseInt(await page.locator('#studioList').getAttribute('data-rendered-count') || '0', 10);
        expect(afterFilter).toBeLessThanOrEqual(60);
    });

    test('Activities filter swaps the list to activity items from the registry', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await expect(page.locator('.studio-row').first()).toBeVisible({ timeout: 15000 });

        await page.locator('#studioFilterBtn').click();
        await page.locator('.studio-filter-chip[data-value="activities"]').click();
        // Without Strength chip on, the pool becomes activities only
        await page.locator('.studio-filter-chip[data-value="strength"]').click(); // toggle ON to also include strength
        await page.locator('.studio-filter-chip[data-value="strength"]').click(); // toggle OFF again

        // Expect at least one well-known activity to appear
        const running = page.locator('.studio-row', { hasText: 'Running' }).first();
        await expect(running).toBeVisible({ timeout: 5000 });
    });

    test('Personal: Custom only filters to user-created exercises', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await expect(page.locator('.studio-row').first()).toBeVisible({ timeout: 15000 });

        // Seed a fake custom exercise into the cache to make the filter assertable
        // for anonymous test users (who otherwise have no custom exercises).
        await page.evaluate(() => {
            const svc = window.exerciseCacheService;
            if (!svc) return;
            svc.customExercises = (svc.customExercises || []).concat([{
                id: 'test-custom-1',
                name: 'Test Custom Exercise',
                targetMuscleGroup: 'Chest',
                primaryEquipment: 'Bodyweight',
                isGlobal: false,
            }]);
            // The studio reads from exerciseCacheService.customExercises and merges
            // them into the pool when Custom is filtered. Push the new one into the
            // shared pool too so it shows up alongside the global catalog.
            if (window.workoutStudio && window.workoutStudio.allExercises) {
                window.workoutStudio.allExercises.push(svc.customExercises[svc.customExercises.length - 1]);
            }
        });

        await page.locator('#studioFilterBtn').click();
        await page.locator('.studio-filter-chip[data-value="custom"]').click();

        const custom = page.locator('.studio-row', { hasText: 'Test Custom Exercise' });
        await expect(custom).toBeVisible({ timeout: 5000 });

        // No global exercises slipped through
        const titles = await page.locator('.studio-row-title').allTextContents();
        const onlyCustom = titles.every((t) => /Test Custom Exercise/i.test(t));
        expect(onlyCustom).toBe(true);
    });

    test('Personal + Type filters compose correctly with badge count', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await expect(page.locator('.studio-row').first()).toBeVisible({ timeout: 15000 });

        await page.locator('#studioFilterBtn').click();
        await page.locator('.studio-filter-chip[data-value="favorites"]').click();
        await page.locator('.studio-filter-chip[data-value="activities"]').click();
        await page.locator('.studio-filter-chip[data-value="Chest"]').click();

        await expect(page.locator('#studioFilterBadge')).toHaveText('3');
    });

    test('Clear all resets every filter chip and the badge', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await expect(page.locator('.studio-row').first()).toBeVisible({ timeout: 15000 });

        await page.locator('#studioFilterBtn').click();
        await page.locator('.studio-filter-chip[data-value="Chest"]').click();
        await page.locator('.studio-filter-chip[data-value="Barbell"]').click();
        await expect(page.locator('#studioFilterBadge')).toHaveText('2');

        await page.locator('#studioFilterClear').click();
        await expect(page.locator('#studioFilterBadge')).toBeHidden();
        await expect(page.locator('.studio-filter-chip.is-active')).toHaveCount(0);
    });
});

test.describe('Workout Studio — Page 2 (Organize)', () => {

    async function addNFromGrid(page, n) {
        await page.goto(`${BASE}/workout-studio.html`);
        const firstRow = page.locator('.studio-row').first();
        await expect(firstRow).toBeVisible({ timeout: 15000 });
        const rows = page.locator('.studio-row');
        for (let i = 0; i < n; i++) {
            await rows.nth(i).locator('.studio-row-add').click();
        }
    }

    test('Continue button navigates to Page 2 with one studio card per tray instance', async ({ page }) => {
        await addNFromGrid(page, 3);

        await expect(page.locator('#studioContinueCta')).toBeVisible();
        await page.locator('#studioContinueBtn').click();

        // View flips to organize
        await expect(page.locator('#studio')).toHaveAttribute('data-view', 'organize');
        await expect(page.locator('#studioViewOrganize')).toBeVisible();
        await expect(page.locator('#studioViewSelect')).toBeHidden();

        // Floating CTA hides on Page 2 (Save action is in-flow)
        await expect(page.locator('#studioContinueCta')).toBeHidden();

        // One card per tray instance + default display values
        await expect(page.locator('.studio-card')).toHaveCount(3);
        const firstCard = page.locator('.studio-card').first();
        await expect(firstCard.locator('.repssets-value-text')).toHaveText('3×8-12');
        await expect(firstCard.locator('.studio-rest-value-text')).toHaveText('60s');
        await expect(firstCard.locator('.weight-value')).toHaveText('—');

        // Count chip in section header
        await expect(page.locator('#studioOrganizeCount')).toHaveText('3 exercises');
    });

    test('Back to selection returns to Page 1 with the tray intact', async ({ page }) => {
        await addNFromGrid(page, 2);
        await page.locator('#studioContinueBtn').click();
        await expect(page.locator('#studio')).toHaveAttribute('data-view', 'organize');

        await page.locator('#studioOrganizeBack').click();
        await expect(page.locator('#studio')).toHaveAttribute('data-view', 'select');
        await expect(page.locator('.studio-tray-chip')).toHaveCount(2);
    });

    test('3-dot menu Remove deletes the card and the tray chip', async ({ page }) => {
        await addNFromGrid(page, 2);
        await page.locator('#studioContinueBtn').click();
        await expect(page.locator('.studio-card')).toHaveCount(2);

        const firstCard = page.locator('.studio-card').first();
        await firstCard.locator('[data-action="menu"]').click();
        await firstCard.locator('[data-action="delete"]').click();

        await expect(page.locator('.studio-card')).toHaveCount(1);
        await expect(page.locator('.studio-tray-chip')).toHaveCount(1);
    });

    test('removing the last card bounces back to Page 1', async ({ page }) => {
        await addNFromGrid(page, 1);
        await page.locator('#studioContinueBtn').click();
        await expect(page.locator('.studio-card')).toHaveCount(1);

        const firstCard = page.locator('.studio-card').first();
        await firstCard.locator('[data-action="menu"]').click();
        await firstCard.locator('[data-action="delete"]').click();

        await expect(page.locator('#studio')).toHaveAttribute('data-view', 'select');
        await expect(page.locator('#studioTray')).toHaveAttribute('data-empty', 'true');
    });

    test('tap-to-edit Protocol morphs the field into an input and saves on Enter', async ({ page }) => {
        await addNFromGrid(page, 1);
        await page.locator('#studioContinueBtn').click();

        const firstCard = page.locator('.studio-card').first();
        await expect(firstCard.locator('.repssets-value-text')).toHaveText('3×8-12');

        // Tap display to enter edit mode
        await firstCard.locator('.repssets-display').click();
        const repsInput = firstCard.locator('.repssets-text-input');
        await expect(repsInput).toBeVisible();
        await repsInput.fill('5x5');
        await repsInput.press('Enter');

        // Display should reflect the new value
        await expect(firstCard.locator('.repssets-value-text')).toHaveText('5×5');
    });

    test('tap-to-edit Weight morphs into a numeric input and saves on Enter', async ({ page }) => {
        await addNFromGrid(page, 1);
        await page.locator('#studioContinueBtn').click();

        const firstCard = page.locator('.studio-card').first();
        await firstCard.locator('.weight-display').click();
        const wInput = firstCard.locator('.weight-input');
        await expect(wInput).toBeVisible();
        await wInput.fill('185');
        await wInput.press('Enter');

        await expect(firstCard.locator('.weight-value')).toHaveText('185');
    });

    test('tap-to-edit Rest morphs into an input and saves on Enter', async ({ page }) => {
        await addNFromGrid(page, 1);
        await page.locator('#studioContinueBtn').click();

        const firstCard = page.locator('.studio-card').first();
        await firstCard.locator('.studio-rest-display').click();
        const restInput = firstCard.locator('.studio-rest-input');
        await expect(restInput).toBeVisible();
        await restInput.fill('120s');
        await restInput.press('Enter');

        await expect(firstCard.locator('.studio-rest-value-text')).toHaveText('120s');
    });

    test('edits persist when navigating back to Page 1 and returning', async ({ page }) => {
        await addNFromGrid(page, 1);
        await page.locator('#studioContinueBtn').click();

        const firstCard = page.locator('.studio-card').first();
        await firstCard.locator('.repssets-display').click();
        await firstCard.locator('.repssets-text-input').fill('5x5');
        await firstCard.locator('.repssets-text-input').press('Enter');

        await firstCard.locator('.weight-display').click();
        await firstCard.locator('.weight-input').fill('225');
        await firstCard.locator('.weight-input').press('Enter');

        await firstCard.locator('.studio-rest-display').click();
        await firstCard.locator('.studio-rest-input').fill('90s');
        await firstCard.locator('.studio-rest-input').press('Enter');

        await page.locator('#studioOrganizeBack').click();
        await page.locator('#studioContinueBtn').click();

        const reopened = page.locator('.studio-card').first();
        await expect(reopened.locator('.repssets-value-text')).toHaveText('5×5');
        await expect(reopened.locator('.weight-value')).toHaveText('225');
        await expect(reopened.locator('.studio-rest-value-text')).toHaveText('90s');
    });

    test('Save without a workout name shows a friendly error', async ({ page }) => {
        await addNFromGrid(page, 1);
        await page.locator('#studioContinueBtn').click();

        // Don't fill the name input
        await page.locator('#studioSaveBtn').click();
        await expect(page.locator('#studioOrganizeStatus')).toHaveText(/name/i);
        await expect(page.locator('#studioOrganizeStatus')).toHaveClass(/is-error/);
    });

    test('Save with valid input POSTs to /api/v3/workouts and shows success', async ({ page }) => {
        let postedBody = null;

        await page.route('**/api/v3/workouts*', async (route) => {
            if (route.request().method() === 'POST') {
                try { postedBody = JSON.parse(route.request().postData() || '{}'); } catch (e) { postedBody = null; }
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ id: 'wkt-test-123', name: postedBody?.name || 'Unnamed' }),
                });
            } else {
                await route.continue();
            }
        });

        await addNFromGrid(page, 2);
        await page.locator('#studioContinueBtn').click();

        // Force the controller to take its raw-fetch fallback path so the POST
        // is observable. window.dataManager has its own anonymous fallback
        // (localStorage) that wouldn't hit the network.
        await page.evaluate(() => { delete window.dataManager; });

        await page.locator('#studioWorkoutNameInput').fill('Studio Test Push Day');

        // Tap-edit the first card's weight value to 135
        const firstCard = page.locator('.studio-card').first();
        await firstCard.locator('.weight-display').click();
        await firstCard.locator('.weight-input').fill('135');
        await firstCard.locator('.weight-input').press('Enter');

        await page.locator('#studioSaveBtn').click();

        await expect(page.locator('#studioOrganizeStatus')).toHaveText(/saved/i, { timeout: 5000 });
        await expect(page.locator('#studioOrganizeStatus')).toHaveClass(/is-success/);

        expect(postedBody).toBeTruthy();
        expect(postedBody.name).toBe('Studio Test Push Day');
        expect(Array.isArray(postedBody.sections)).toBe(true);
        expect(postedBody.sections.length).toBe(2);
        expect(postedBody.sections[0].exercises[0].sets).toBe('3');
        expect(postedBody.sections[0].exercises[0].default_weight).toBe('135');
    });
});
