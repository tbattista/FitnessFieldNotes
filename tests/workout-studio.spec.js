// @ts-check
const { test, expect } = require('playwright/test');

const BASE = 'http://localhost:8001';

test.describe('Workout Studio — Foundation + Live Exercise List', () => {

    test('page loads with collapsed workout meta card, sticky tray, and search', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);

        // Meta card: name + chevron visible, tags + description hidden until expanded.
        // Plan/Log toggle no longer exists.
        await expect(page.locator('#studioBackBtn')).toHaveCount(0);
        await expect(page.locator('#studioWorkoutPicker')).toHaveCount(0);
        await expect(page.locator('#studioWorkoutNameInput')).toBeVisible();
        await expect(page.locator('#studioMetaToggle')).toBeVisible();
        await expect(page.locator('#studioMetaToggle')).toHaveAttribute('aria-expanded', 'false');
        await expect(page.locator('#studioTagsInput')).toBeHidden();
        await expect(page.locator('#studioDescriptionInput')).toBeHidden();
        await expect(page.locator('#studioModePlan')).toHaveCount(0);
        await expect(page.locator('#studioModeLog')).toHaveCount(0);

        // Workout name is pre-populated with a default like "New Workout - ..."
        await expect(page.locator('#studioWorkoutNameInput')).toHaveValue(/^New Workout - /);

        // Tapping the chevron reveals the metadata row
        await page.locator('#studioMetaToggle').click();
        await expect(page.locator('#studioMetaToggle')).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('#studioTagsInput')).toBeVisible();
        await expect(page.locator('#studioDescriptionInput')).toBeVisible();

        // Tapping again collapses
        await page.locator('#studioMetaToggle').click();
        await expect(page.locator('#studioTagsInput')).toBeHidden();

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

    test('tapping the row body (not the + button) also adds the exercise', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        const firstRow = page.locator('.studio-row').first();
        await expect(firstRow).toBeVisible({ timeout: 15000 });

        // Click somewhere inside the row body, NOT on the + or info buttons
        await firstRow.locator('.studio-row-body').click();
        await expect(page.locator('.studio-tray-chip')).toHaveCount(1);
        await expect(firstRow.locator('.studio-row-add-badge')).toHaveText('1');
    });

    test('info button opens the exercise detail offcanvas and does NOT add', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        const firstRow = page.locator('.studio-row').first();
        await expect(firstRow).toBeVisible({ timeout: 15000 });

        await firstRow.locator('.studio-row-info').click();

        // Detail offcanvas opens (the shared mobile bottom-sheet) — its id
        // is reused from the exercise-database page.
        const offcanvas = page.locator('#exerciseDetailOffcanvas');
        await expect(offcanvas).toBeVisible({ timeout: 5000 });

        // Tray stays empty — the info click did not also add
        await expect(page.locator('.studio-tray-chip')).toHaveCount(0);
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

    test('tags + description inputs persist into the save payload', async ({ page }) => {
        let postedBody = null;
        await page.route('**/api/v3/workouts*', async (route) => {
            if (route.request().method() === 'POST') {
                try { postedBody = JSON.parse(route.request().postData() || '{}'); } catch (e) { postedBody = null; }
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ id: 'wkt-meta', name: postedBody?.name || '' }),
                });
            } else { await route.continue(); }
        });

        await page.goto(`${BASE}/workout-studio.html`);
        await expect(page.locator('.studio-row').first()).toBeVisible({ timeout: 15000 });
        await page.evaluate(() => { delete window.dataManager; });

        // Fill workout name; expand the meta card so we can reach tags + description
        await page.locator('#studioWorkoutNameInput').fill('Push Day Alpha');
        await page.locator('#studioMetaToggle').click();
        await page.locator('#studioTagsInput').fill('push, chest, intermediate');
        await page.locator('#studioDescriptionInput').fill('Bench focus, 4 working sets per primary lift.');

        await page.locator('.studio-row').first().locator('.studio-row-add').click();
        await page.locator('#studioContinueBtn').click();
        await page.locator('#studioSaveBtn').click();
        await expect(page.locator('#studioOrganizeStatus')).toHaveText(/saved/i, { timeout: 5000 });

        expect(postedBody).toBeTruthy();
        expect(postedBody.name).toBe('Push Day Alpha');
        expect(postedBody.description).toBe('Bench focus, 4 working sets per primary lift.');
        expect(postedBody.tags).toEqual(['push', 'chest', 'intermediate']);
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

    test('add-custom button is hidden until search has text, then reveals on the same row', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        const btn = page.locator('#studioAddCustomBtn');
        // Hidden when search is empty — no purpose, no visual weight
        await expect(btn).toBeHidden();

        await page.locator('#studioSearchInput').fill('Hex Bar Deadlift');
        await expect(btn).toBeVisible();
        await expect(btn).toContainText('Hex Bar Deadlift');

        // Verify it shares a row with the search input (same parent)
        const sharedParent = await page.evaluate(() => {
            const a = document.getElementById('studioSearchInput');
            const b = document.getElementById('studioAddCustomBtn');
            return a && b && a.closest('.studio-search-row') === b.parentElement;
        });
        expect(sharedParent).toBe(true);

        await page.locator('#studioSearchClear').click();
        await expect(btn).toBeHidden();
    });

    test('tapping add-custom adds the typed name to the tray and clears the search', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await expect(page.locator('.studio-row').first()).toBeVisible({ timeout: 15000 });

        await page.locator('#studioSearchInput').fill('My One-Off Lift');
        await page.locator('#studioAddCustomBtn').click();

        const chips = page.locator('.studio-tray-chip');
        await expect(chips).toHaveCount(1);
        await expect(chips.first()).toContainText('My One-Off Lift');

        // Search cleared so a second add starts fresh — button hides again
        await expect(page.locator('#studioSearchInput')).toHaveValue('');
        await expect(page.locator('#studioAddCustomBtn')).toBeHidden();
    });

    test('custom-added exercise persists in the save payload with its typed name', async ({ page }) => {
        let postedBody = null;
        await page.route('**/api/v3/workouts*', async (route) => {
            if (route.request().method() === 'POST') {
                try { postedBody = JSON.parse(route.request().postData() || '{}'); } catch (e) { postedBody = null; }
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ id: 'wkt-1', name: postedBody?.name || '' }),
                });
            } else { await route.continue(); }
        });

        await page.goto(`${BASE}/workout-studio.html`);
        await expect(page.locator('.studio-row').first()).toBeVisible({ timeout: 15000 });

        await page.locator('#studioSearchInput').fill('Hex Bar Deadlift');
        await page.locator('#studioAddCustomBtn').click();

        await page.locator('#studioContinueBtn').click();
        await page.evaluate(() => { delete window.dataManager; });
        await page.locator('#studioWorkoutNameInput').fill('Custom Test');
        await page.locator('#studioSaveBtn').click();

        await expect(page.locator('#studioOrganizeStatus')).toHaveText(/saved/i, { timeout: 5000 });
        expect(postedBody).toBeTruthy();
        expect(postedBody.sections[0].exercises[0].name).toBe('Hex Bar Deadlift');
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

    test('on first render, editors are hidden — only the display side of each field is visible', async ({ page }) => {
        await addNFromGrid(page, 1);
        await page.locator('#studioContinueBtn').click();

        const firstCard = page.locator('.studio-card').first();

        // Display rows visible
        await expect(firstCard.locator('.repssets-display')).toBeVisible();
        await expect(firstCard.locator('.weight-display')).toBeVisible();
        await expect(firstCard.locator('.studio-rest-display')).toBeVisible();

        // Editor rows should NOT be visible (regression guard for the
        // duplicate-fields bug caused by display: flex !important).
        await expect(firstCard.locator('.repssets-editor')).toBeHidden();
        await expect(firstCard.locator('.weight-editor')).toBeHidden();
        await expect(firstCard.locator('.studio-rest-editor')).toBeHidden();
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

    test('DIY pill morphs the single weight input to a text field; lbs/kg restores number type', async ({ page }) => {
        await addNFromGrid(page, 1);
        await page.locator('#studioContinueBtn').click();

        const firstCard = page.locator('.studio-card').first();
        await firstCard.locator('.weight-display').click();

        // Exactly one input element exists, regardless of unit
        const inputs = firstCard.locator('.weight-input');
        await expect(inputs).toHaveCount(1);

        const input = inputs.first();
        // lbs mode: numeric input
        await expect(input).toHaveAttribute('type', 'number');

        // Tap DIY → same input morphs to text + placeholder updates
        await firstCard.locator('.weight-unit-selector .unit-btn[data-unit="diy"]').click();
        await expect(input).toHaveAttribute('type', 'text');
        await expect(input).toHaveAttribute('placeholder', /bodyweight/);

        // Type arbitrary text and Enter to save
        await input.fill('bodyweight + 25');
        await input.press('Enter');
        await expect(firstCard.locator('.weight-value')).toHaveText('bodyweight + 25');

        // Re-open and flip back to kg → input returns to number type
        await firstCard.locator('.weight-display').click();
        await firstCard.locator('.weight-unit-selector .unit-btn[data-unit="kg"]').click();
        await expect(input).toHaveAttribute('type', 'number');
        await expect(input).toHaveAttribute('placeholder', '0');
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

        // The name field is pre-populated with a "New Workout - <date>" default,
        // so explicitly clear it to recreate the no-name path.
        await page.locator('#studioWorkoutNameInput').fill('');
        await page.locator('#studioContinueBtn').click();

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

test.describe('Workout Studio — Page 2 Blocks', () => {

    async function addNFromGrid(page, n) {
        await page.goto(`${BASE}/workout-studio.html`);
        const firstRow = page.locator('.studio-row').first();
        await expect(firstRow).toBeVisible({ timeout: 15000 });
        const rows = page.locator('.studio-row');
        for (let i = 0; i < n; i++) {
            await rows.nth(i).locator('.studio-row-add').click();
        }
    }

    test('+ Block button is visible on Page 2 and creates an empty block', async ({ page }) => {
        await addNFromGrid(page, 2);
        await page.locator('#studioContinueBtn').click();

        const addBlockBtn = page.locator('#studioAddBlockBtn');
        await expect(addBlockBtn).toBeVisible();

        await addBlockBtn.click();
        const block = page.locator('.studio-block').first();
        await expect(block).toBeVisible();
        await expect(block).toHaveClass(/is-empty/);
        await expect(block.locator('.studio-block-placeholder')).toBeVisible();
        // Name input should auto-focus after creation
        await expect(block.locator('.studio-block-name-input')).toBeFocused();
    });

    test('renaming a block commits on blur and on Enter', async ({ page }) => {
        await addNFromGrid(page, 2);
        await page.locator('#studioContinueBtn').click();
        await page.locator('#studioAddBlockBtn').click();

        const input = page.locator('.studio-block .studio-block-name-input').first();
        await input.fill('Warmup');
        await input.press('Enter');

        // Name persists in the DOM and is exposed through the input value
        await expect(input).toHaveValue('Warmup');
    });

    test('"Move to: <block>" menu item moves a top-level card into the block', async ({ page }) => {
        await addNFromGrid(page, 3);
        await page.locator('#studioContinueBtn').click();
        await page.locator('#studioAddBlockBtn').click();
        await page.locator('.studio-block-name-input').first().fill('Main Lifts');
        await page.locator('.studio-block-name-input').first().press('Enter');

        // Find the first top-level card (not inside any block) and open its menu
        const looseCard = page.locator('#studioOrganizeList > .studio-card').first();
        await looseCard.locator('[data-action="menu"]').click();

        // Click the "Move to: Main Lifts" menu item on that card
        await looseCard.locator('[data-action="move-to-block"]').click();

        // The card now lives inside the block's children slot
        const blockChild = page.locator('.studio-block .studio-block-children .studio-card');
        await expect(blockChild).toHaveCount(1);
        await expect(blockChild.first()).toHaveClass(/studio-card-in-block/);

        // Block is no longer empty
        await expect(page.locator('.studio-block')).not.toHaveClass(/is-empty/);
    });

    test('"Move out of block" returns a card to top level', async ({ page }) => {
        await addNFromGrid(page, 2);
        await page.locator('#studioContinueBtn').click();
        await page.locator('#studioAddBlockBtn').click();

        // Move card #1 into the block
        const looseCard = page.locator('#studioOrganizeList > .studio-card').first();
        await looseCard.locator('[data-action="menu"]').click();
        await looseCard.locator('[data-action="move-to-block"]').click();

        await expect(page.locator('.studio-block .studio-block-children .studio-card')).toHaveCount(1);

        // Now move it back out via the card's menu
        const inBlockCard = page.locator('.studio-block .studio-block-children .studio-card').first();
        await inBlockCard.locator('[data-action="menu"]').click();
        await inBlockCard.locator('[data-action="move-out-of-block"]').click();

        await expect(page.locator('.studio-block .studio-block-children .studio-card')).toHaveCount(0);
        // Block is empty again; the placeholder is shown
        await expect(page.locator('.studio-block.is-empty')).toBeVisible();
    });

    test('Remove block returns all of its children to top level', async ({ page }) => {
        await addNFromGrid(page, 2);
        await page.locator('#studioContinueBtn').click();
        await page.locator('#studioAddBlockBtn').click();

        // Move both cards into the block
        for (let i = 0; i < 2; i++) {
            const card = page.locator('#studioOrganizeList > .studio-card').first();
            await card.locator('[data-action="menu"]').click();
            await card.locator('[data-action="move-to-block"]').click();
        }
        await expect(page.locator('.studio-block .studio-card')).toHaveCount(2);

        // Open block menu and delete (use the block-specific button class so
        // we don't match the card menus inside the block)
        await page.locator('.studio-block .studio-block-icon-btn[data-action="menu"]').click();
        await page.locator('.studio-block .studio-block-menu [data-action="delete"]').click();

        // Block is gone, both cards are back at top level
        await expect(page.locator('.studio-block')).toHaveCount(0);
        await expect(page.locator('#studioOrganizeList > .studio-card')).toHaveCount(2);
    });

    test('Save payload groups block exercises into a single section with name', async ({ page }) => {
        let postedBody = null;
        await page.route('**/api/v3/workouts*', async (route) => {
            if (route.request().method() === 'POST') {
                try { postedBody = JSON.parse(route.request().postData() || '{}'); } catch (e) { postedBody = null; }
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ id: 'wkt-test-blocks', name: postedBody?.name || 'Unnamed' }),
                });
            } else {
                await route.continue();
            }
        });

        await addNFromGrid(page, 3);
        await page.locator('#studioContinueBtn').click();
        await page.evaluate(() => { delete window.dataManager; });

        // Create a named block and move 2 of the 3 cards in
        await page.locator('#studioAddBlockBtn').click();
        await page.locator('.studio-block-name-input').first().fill('Push Block');
        await page.locator('.studio-block-name-input').first().press('Enter');

        for (let i = 0; i < 2; i++) {
            const card = page.locator('#studioOrganizeList > .studio-card').first();
            await card.locator('[data-action="menu"]').click();
            await card.locator('[data-action="move-to-block"]').click();
        }

        await page.locator('#studioWorkoutNameInput').fill('Studio Blocks Test');
        await page.locator('#studioSaveBtn').click();
        await expect(page.locator('#studioOrganizeStatus')).toHaveText(/saved/i, { timeout: 5000 });

        expect(postedBody).toBeTruthy();
        expect(postedBody.name).toBe('Studio Blocks Test');
        const sections = postedBody.sections || [];
        // Expected shape: 1 multi-exercise block section + 1 loose single-exercise section
        const block = sections.find((s) => s.name === 'Push Block');
        expect(block).toBeTruthy();
        expect(Array.isArray(block.exercises)).toBe(true);
        expect(block.exercises.length).toBe(2);
        const loose = sections.find((s) => s !== block);
        expect(loose).toBeTruthy();
        expect(loose.exercises.length).toBe(1);
        expect(loose.name == null || loose.name === '').toBe(true);
    });

    test('Reorder button is hidden until there are at least 2 items in the organize order', async ({ page }) => {
        await addNFromGrid(page, 1);
        await page.locator('#studioContinueBtn').click();
        // 1 item → reorder is useless, button stays hidden
        await expect(page.locator('#studioReorderBtn')).toBeHidden();

        // Go back, add another exercise → 2 items
        await page.locator('#studioOrganizeBack').click();
        const rows = page.locator('.studio-row');
        await rows.nth(1).locator('.studio-row-add').click();
        await page.locator('#studioContinueBtn').click();

        await expect(page.locator('#studioReorderBtn')).toBeVisible();
    });

    test('Reorder button opens the sheet populated with the current order', async ({ page }) => {
        await addNFromGrid(page, 3);
        await page.locator('#studioContinueBtn').click();
        // Add a block holding the first card
        await page.locator('#studioAddBlockBtn').click();
        await page.locator('.studio-block-name-input').first().fill('Push');
        await page.locator('.studio-block-name-input').first().press('Enter');
        const looseCard = page.locator('#studioOrganizeList > .studio-card').first();
        await looseCard.locator('[data-action="menu"]').click();
        await looseCard.locator('[data-action="move-to-block"]').click();

        // Open Reorder sheet
        await page.locator('#studioReorderBtn').click();
        const sheet = page.locator('.studio-reorder-sheet');
        await expect(sheet).toBeVisible();

        // Top-level: one block row + two card rows (in some order)
        const topRows = sheet.locator('#studioReorderList > .studio-reorder-row');
        await expect(topRows).toHaveCount(3);

        // Block has exactly one child card
        const blockChildren = sheet.locator('.studio-reorder-block-children > .studio-reorder-card-row');
        await expect(blockChildren).toHaveCount(1);

        // Cancel closes without changes
        await sheet.locator('[data-action="cancel"]').first().click();
        await expect(sheet).toBeHidden({ timeout: 2000 });
    });

    test('Save in the reorder sheet applies the new top-level order to Page 2', async ({ page }) => {
        await addNFromGrid(page, 3);
        await page.locator('#studioContinueBtn').click();

        // Capture original names in their initial top-level order
        const namesBefore = await page.locator('#studioOrganizeList > .studio-card .studio-card-name')
          .allTextContents();
        expect(namesBefore.length).toBe(3);

        await page.locator('#studioReorderBtn').click();
        const sheet = page.locator('.studio-reorder-sheet');
        await expect(sheet).toBeVisible();

        // Move the first top-level row to the end of the list (simulating what
        // a drag-and-drop would do). SortableJS in Playwright is too flaky to
        // exercise; we drive the same end-state directly.
        await page.evaluate(() => {
            const list = document.getElementById('studioReorderList');
            if (!list || list.children.length < 2) return;
            const first = list.children[0];
            list.appendChild(first);
        });

        await sheet.locator('[data-action="save"]').click();
        await expect(sheet).toBeHidden({ timeout: 2000 });

        const namesAfter = await page.locator('#studioOrganizeList > .studio-card .studio-card-name')
          .allTextContents();
        expect(namesAfter.length).toBe(3);
        // The first name should now be at the end
        expect(namesAfter[2]).toBe(namesBefore[0]);
        expect(namesAfter[0]).toBe(namesBefore[1]);
    });

    test('Save in the reorder sheet moves a card between top level and a block', async ({ page }) => {
        await addNFromGrid(page, 2);
        await page.locator('#studioContinueBtn').click();
        await page.locator('#studioAddBlockBtn').click();
        await page.locator('.studio-block-name-input').first().fill('Block A');
        await page.locator('.studio-block-name-input').first().press('Enter');
        // Initially: 2 top-level cards + 1 empty block. Nothing is in the block.

        await page.locator('#studioReorderBtn').click();
        const sheet = page.locator('.studio-reorder-sheet');
        await expect(sheet).toBeVisible();

        // Move the first top-level card row into the block's children container
        await page.evaluate(() => {
            const list = document.getElementById('studioReorderList');
            const blockChildren = list.querySelector('.studio-reorder-block-children');
            // Pick a card row from the top level (one whose parent is the list itself)
            const cardRow = Array.from(list.children).find(
                (n) => n.dataset && n.dataset.type === 'card'
            );
            if (cardRow && blockChildren) blockChildren.appendChild(cardRow);
        });

        await sheet.locator('[data-action="save"]').click();
        await expect(sheet).toBeHidden({ timeout: 2000 });

        // Block now has 1 child; top level has 1 loose card + the block
        await expect(page.locator('.studio-block .studio-block-children .studio-card')).toHaveCount(1);
        await expect(page.locator('.studio-block')).not.toHaveClass(/is-empty/);
    });

    test('+ Note button creates a note card with auto-focused textarea', async ({ page }) => {
        await addNFromGrid(page, 2);
        await page.locator('#studioContinueBtn').click();

        const addNoteBtn = page.locator('#studioAddNoteBtn');
        await expect(addNoteBtn).toBeVisible();
        await addNoteBtn.click();

        const note = page.locator('.studio-note-card').first();
        await expect(note).toBeVisible();
        await expect(note.locator('.studio-note-textarea')).toBeFocused();
    });

    test('typing in a note persists and shows in save payload with order_index', async ({ page }) => {
        let postedBody = null;
        await page.route('**/api/v3/workouts*', async (route) => {
            if (route.request().method() === 'POST') {
                try { postedBody = JSON.parse(route.request().postData() || '{}'); } catch (e) { postedBody = null; }
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ id: 'wkt-test-notes', name: postedBody?.name || 'Unnamed' }),
                });
            } else {
                await route.continue();
            }
        });

        await addNFromGrid(page, 3);
        await page.locator('#studioContinueBtn').click();
        await page.evaluate(() => { delete window.dataManager; });

        // Add a note AFTER the first exercise: append, then move up twice so it
        // sits between exercise 0 and exercise 1 (order_index = 1)
        await page.locator('#studioAddNoteBtn').click();
        const note = page.locator('.studio-note-card').first();
        await note.locator('.studio-note-textarea').fill('Focus on bracing the core');
        // Move it up to position between exercise 0 and exercise 1
        await note.locator('[data-action="menu"]').click();
        await note.locator('[data-action="move-up"]').click();
        await note.locator('[data-action="menu"]').click();
        await note.locator('[data-action="move-up"]').click();

        await page.locator('#studioWorkoutNameInput').fill('Studio Notes Test');
        await page.locator('#studioSaveBtn').click();
        await expect(page.locator('#studioOrganizeStatus')).toHaveText(/saved/i, { timeout: 5000 });

        expect(postedBody).toBeTruthy();
        expect(Array.isArray(postedBody.template_notes)).toBe(true);
        expect(postedBody.template_notes.length).toBe(1);
        expect(postedBody.template_notes[0].content).toBe('Focus on bracing the core');
        expect(postedBody.template_notes[0].order_index).toBe(1);
        // Notes should NOT have consumed a section slot
        expect(postedBody.sections.length).toBe(3);
    });

    test('note at the start of the workout has order_index 0', async ({ page }) => {
        let postedBody = null;
        await page.route('**/api/v3/workouts*', async (route) => {
            if (route.request().method() === 'POST') {
                try { postedBody = JSON.parse(route.request().postData() || '{}'); } catch (e) { postedBody = null; }
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ id: 'wkt-test-notes-2', name: postedBody?.name || 'Unnamed' }),
                });
            } else {
                await route.continue();
            }
        });

        await addNFromGrid(page, 2);
        await page.locator('#studioContinueBtn').click();
        await page.evaluate(() => { delete window.dataManager; });

        await page.locator('#studioAddNoteBtn').click();
        const note = page.locator('.studio-note-card').first();
        await note.locator('.studio-note-textarea').fill('Warmup five minutes');
        // Move all the way to the top
        await note.locator('[data-action="menu"]').click();
        await note.locator('[data-action="move-up"]').click();
        await note.locator('[data-action="menu"]').click();
        await note.locator('[data-action="move-up"]').click();

        await page.locator('#studioWorkoutNameInput').fill('Studio Notes At Top');
        await page.locator('#studioSaveBtn').click();
        await expect(page.locator('#studioOrganizeStatus')).toHaveText(/saved/i, { timeout: 5000 });

        expect(postedBody.template_notes.length).toBe(1);
        expect(postedBody.template_notes[0].order_index).toBe(0);
    });

    test('Delete note removes it from the list and from the save payload', async ({ page }) => {
        let postedBody = null;
        await page.route('**/api/v3/workouts*', async (route) => {
            if (route.request().method() === 'POST') {
                try { postedBody = JSON.parse(route.request().postData() || '{}'); } catch (e) { postedBody = null; }
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ id: 'wkt-test-notes-3', name: postedBody?.name || 'Unnamed' }),
                });
            } else {
                await route.continue();
            }
        });

        await addNFromGrid(page, 2);
        await page.locator('#studioContinueBtn').click();
        await page.evaluate(() => { delete window.dataManager; });

        await page.locator('#studioAddNoteBtn').click();
        await page.locator('.studio-note-textarea').first().fill('Will be deleted');
        const note = page.locator('.studio-note-card').first();
        await note.locator('[data-action="menu"]').click();
        await note.locator('[data-action="delete"]').click();

        await expect(page.locator('.studio-note-card')).toHaveCount(0);

        await page.locator('#studioWorkoutNameInput').fill('Studio Notes Deleted');
        await page.locator('#studioSaveBtn').click();
        await expect(page.locator('#studioOrganizeStatus')).toHaveText(/saved/i, { timeout: 5000 });

        expect(postedBody.template_notes).toEqual([]);
    });

    test('Reorder sheet includes note rows and preserves notes on save', async ({ page }) => {
        await addNFromGrid(page, 2);
        await page.locator('#studioContinueBtn').click();
        await page.locator('#studioAddNoteBtn').click();
        await page.locator('.studio-note-textarea').first().fill('Hello note');

        await page.locator('#studioReorderBtn').click();
        const sheet = page.locator('.studio-reorder-sheet');
        await expect(sheet).toBeVisible();
        await expect(sheet.locator('.studio-reorder-note-row')).toHaveCount(1);
        await expect(sheet.locator('.studio-reorder-note-row')).toContainText('Hello note');

        // Save (no reorder) and verify the note survives
        await sheet.locator('[data-action="save"]').click();
        await expect(sheet).toBeHidden({ timeout: 2000 });
        await expect(page.locator('.studio-note-card')).toHaveCount(1);
        await expect(page.locator('.studio-note-textarea').first()).toHaveValue('Hello note');
    });

    test('Removing a tray chip on Page 2 also removes the card whether loose or in a block', async ({ page }) => {
        await addNFromGrid(page, 2);
        await page.locator('#studioContinueBtn').click();
        await page.locator('#studioAddBlockBtn').click();

        // Move card 1 into the block
        const card = page.locator('#studioOrganizeList > .studio-card').first();
        await card.locator('[data-action="menu"]').click();
        await card.locator('[data-action="move-to-block"]').click();
        await expect(page.locator('.studio-block .studio-card')).toHaveCount(1);

        // Remove via the chip in the sticky tray
        await page.locator('#studioTrayChips .studio-tray-chip-remove').first().click();

        // One card remains, in whichever container it was in. Total card count = 1.
        await expect(page.locator('.studio-card')).toHaveCount(1);
    });
});
