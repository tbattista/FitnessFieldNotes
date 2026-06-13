// @ts-check
const { test, expect } = require('playwright/test');

const BASE = 'http://localhost:8001';

/**
 * Helper: tap the Log tab AND the Start Workout button on the landing
 * so the session card list materializes. The Log view now opens to a
 * landing with a Start/Resume Workout button — the session only begins
 * once the user taps it. Tests that exercise session behavior call
 * this; tests that only check tab visibility tap the tab directly.
 */
async function enterLogSession(page) {
    await page.locator('#studioViewLogBtn').click();
    const startBtn = page.locator('#studioLogStartBtn');
    // Wait briefly for the landing to materialize; if it's not visible
    // we assume a session is already active and skip the Start tap.
    if (await startBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await startBtn.click();
    }
}

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

    test('detail offcanvas shows only Favorite + Add in studio context (no Edit/Delete)', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        const firstRow = page.locator('.studio-row').first();
        await expect(firstRow).toBeVisible({ timeout: 15000 });

        await firstRow.locator('.studio-row-info').click();
        const offcanvas = page.locator('#exerciseDetailOffcanvas');
        await expect(offcanvas).toBeVisible({ timeout: 5000 });

        // Studio-styled footer present
        await expect(offcanvas.locator('.studio-offcanvas-actions')).toBeVisible();
        await expect(offcanvas.locator('.exercise-offcanvas-fav-btn')).toBeVisible();
        await expect(offcanvas.locator('.exercise-offcanvas-add-btn')).toBeVisible();

        // Edit + Delete are NOT rendered in studio context
        await expect(offcanvas.locator('.exercise-offcanvas-edit-btn')).toHaveCount(0);
        await expect(offcanvas.locator('.exercise-offcanvas-delete-btn')).toHaveCount(0);
    });

    test('Add to Workout in the detail offcanvas pushes the exercise into the tray and closes', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        const firstRow = page.locator('.studio-row').first();
        await expect(firstRow).toBeVisible({ timeout: 15000 });

        await firstRow.locator('.studio-row-info').click();
        const offcanvas = page.locator('#exerciseDetailOffcanvas');
        await expect(offcanvas).toBeVisible({ timeout: 5000 });

        await offcanvas.locator('.exercise-offcanvas-add-btn').click();

        // Offcanvas closes
        await expect(offcanvas).toBeHidden({ timeout: 3000 });
        // Exercise lands in the tray
        await expect(page.locator('.studio-tray-chip')).toHaveCount(1);
    });

    test('pairing rows expose explicit info + add buttons; the chip body is no longer interactive', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        const firstRow = page.locator('.studio-row').first();
        await expect(firstRow).toBeVisible({ timeout: 15000 });

        await firstRow.locator('.studio-row-info').click();
        const offcanvas = page.locator('#exerciseDetailOffcanvas');
        await expect(offcanvas).toBeVisible({ timeout: 5000 });

        const chip = offcanvas.locator('.pairing-exercise-chip').first();
        const hasPairings = (await chip.count()) > 0;
        test.skip(!hasPairings, 'No pairing recommendations for first exercise');

        // Chip body no longer carries role=button or tabindex — it is just a label.
        await expect(chip).not.toHaveAttribute('role', /button/);
        await expect(chip).not.toHaveAttribute('tabindex', /\d+/);

        // Both explicit action buttons are present
        await expect(chip.locator('.pairing-info-btn')).toBeVisible();
        await expect(chip.locator('.pairing-add-btn')).toBeVisible();

        // Tapping the chip's name body does NOT navigate or add — the
        // exercise title displayed in the offcanvas header should be unchanged
        // and the tray must remain empty.
        const headerNameBefore = (await offcanvas.locator('#exerciseOffcanvasName').textContent()) || '';
        await chip.locator('.pairing-exercise-name').click();
        await expect(offcanvas.locator('#exerciseOffcanvasName')).toHaveText(headerNameBefore);
        await expect(page.locator('.studio-tray-chip')).toHaveCount(0);

        // Tapping the info button navigates: the offcanvas header swaps
        // to the pairing exercise's name.
        const pairingName = (await chip.locator('.pairing-exercise-name').textContent() || '').trim();
        await chip.locator('.pairing-info-btn').click();
        await expect(offcanvas.locator('#exerciseOffcanvasName')).toHaveText(pairingName);
    });

    test('pairing recommendation + buttons route to the studio tray (not the legacy cart)', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        const firstRow = page.locator('.studio-row').first();
        await expect(firstRow).toBeVisible({ timeout: 15000 });

        await firstRow.locator('.studio-row-info').click();
        const offcanvas = page.locator('#exerciseDetailOffcanvas');
        await expect(offcanvas).toBeVisible({ timeout: 5000 });

        // Some exercises have no pairings; pick the first chip that does exist.
        const pairingAddBtn = offcanvas.locator('.pairing-add-btn').first();
        const pairingChip = offcanvas.locator('.pairing-exercise-chip').first();
        const hasPairings = (await pairingAddBtn.count()) > 0;
        test.skip(!hasPairings, 'No pairing recommendations for first exercise');

        // Sanity: studio-flavored chip styling kicks in (light bg, rounded corners)
        await expect(pairingChip).toHaveCSS('border-radius', '10px');

        await pairingAddBtn.click();

        // Tray now has an entry pushed by the pairing click (the original
        // exercise wasn't added — only this pairing was tapped).
        await expect(page.locator('.studio-tray-chip')).toHaveCount(1);
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
        await page.locator('#studioFabSave').click();
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

    test('add-custom button is hidden until search has text, then reveals at the top of the results list', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        const btn = page.locator('#studioAddCustomBtn');
        // Hidden when search is empty — no purpose, no visual weight
        await expect(btn).toBeHidden();

        await page.locator('#studioSearchInput').fill('Hex Bar Deadlift');
        await expect(btn).toBeVisible();
        await expect(btn).toContainText('Hex Bar Deadlift');

        // Lives at the top of the results list, immediately before the list —
        // no longer bolted onto the search row.
        const placement = await page.evaluate(() => {
            const b = document.getElementById('studioAddCustomBtn');
            const list = document.getElementById('studioList');
            return {
                notInSearchRow: !b.closest('.studio-search-row'),
                precedesList: !!(b && list && b.nextElementSibling === list),
            };
        });
        expect(placement.notInSearchRow).toBe(true);
        expect(placement.precedesList).toBe(true);

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
        await page.locator('#studioFabSave').click();

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
        await expect(page.locator('#studio')).toHaveAttribute('data-view', 'plan');
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
        // Header now shows just the number; parentheses come from CSS pseudo-elements
        await expect(page.locator('#studioOrganizeCount')).toHaveText('3');
    });

    test('tray chip row is hidden on Page 2 (redundant with the card list)', async ({ page }) => {
        await addNFromGrid(page, 2);
        await expect(page.locator('#studioTray')).toBeVisible();
        await page.locator('#studioContinueBtn').click();
        await expect(page.locator('#studio')).toHaveAttribute('data-view', 'plan');
        await expect(page.locator('#studioTray')).toBeHidden();

        // Back on Build the tray returns
        await page.evaluate(() => window.workoutStudio && window.workoutStudio._showView('build'));
        await expect(page.locator('#studioTray')).toBeVisible();
    });

    test('bottom add-row buttons (Activity / Note / Block) share a uniform style', async ({ page }) => {
        await addNFromGrid(page, 2);
        await page.locator('#studioContinueBtn').click();

        const activity = page.locator('#studioAddActivityBtn');
        const note = page.locator('#studioAddNoteBtn');
        const block = page.locator('#studioAddBlockBtn');
        await expect(activity).toBeVisible();
        await expect(note).toBeVisible();
        await expect(block).toBeVisible();

        // All three buttons collapse to the same height + pill radius so the
        // row reads as a uniform trio (matches the legacy builder's layout).
        const h1 = await activity.evaluate((el) => el.offsetHeight);
        const h2 = await note.evaluate((el) => el.offsetHeight);
        const h3 = await block.evaluate((el) => el.offsetHeight);
        expect(h1).toBe(h2);
        expect(h2).toBe(h3);

        // Buttons squared off (rectangular with rounded corners) to match
        // the Import and FAB visual language — no more fully-pill shapes.
        await expect(activity).toHaveCSS('border-radius', '10px');
        await expect(note).toHaveCSS('border-radius', '10px');
        await expect(block).toHaveCSS('border-radius', '10px');
    });

    test('Back to selection returns to Page 1 with the tray intact', async ({ page }) => {
        await addNFromGrid(page, 2);
        await page.locator('#studioContinueBtn').click();
        await expect(page.locator('#studio')).toHaveAttribute('data-view', 'plan');

        await page.evaluate(() => window.workoutStudio && window.workoutStudio._showView('build'));
        await expect(page.locator('#studio')).toHaveAttribute('data-view', 'build');
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

        await expect(page.locator('#studio')).toHaveAttribute('data-view', 'build');
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

        // Tap display to enter unified edit mode
        await firstCard.locator('.repssets-display').click();
        const repsInput = firstCard.locator('.repssets-input');
        await expect(repsInput).toBeVisible();
        await repsInput.fill('5x5');
        await repsInput.press('Enter');

        // Display should reflect the typed value verbatim — no autoformat
        // to '5×5'. (Free-text protocol is the new contract.)
        await expect(firstCard.locator('.repssets-value-text')).toHaveText('5x5');
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

    test('weight input accepts free text (e.g. "bodyweight + 25") regardless of unit', async ({ page }) => {
        await addNFromGrid(page, 1);
        await page.locator('#studioContinueBtn').click();

        const firstCard = page.locator('.studio-card').first();
        await firstCard.locator('.weight-display').click();

        const input = firstCard.locator('.weight-input');
        await expect(input).toHaveCount(1);
        // Weight is now ALWAYS free text — the user asked for "open text
        // fields" so we no longer morph between number/text based on unit.
        // The DIY/lbs/kg pills still toggle the active unit + placeholder
        // hint, but the input itself accepts any string.
        await expect(input).toHaveAttribute('type', 'text');

        await firstCard.locator('.weight-unit-selector .unit-btn[data-unit="diy"]').click();
        await expect(input).toHaveAttribute('type', 'text');
        await expect(input).toHaveAttribute('placeholder', /bodyweight/);

        await input.fill('bodyweight + 25');
        await input.press('Enter');
        await expect(firstCard.locator('.weight-value')).toHaveText('bodyweight + 25');
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

    test('studio card has an info button (not a pencil) that opens the detail offcanvas', async ({ page }) => {
        await addNFromGrid(page, 1);
        await page.locator('#studioContinueBtn').click();

        const firstCard = page.locator('.studio-card').first();
        // Pencil is gone
        await expect(firstCard.locator('[data-action="pencil"]')).toHaveCount(0);
        // Info button replaces it
        const infoBtn = firstCard.locator('[data-action="info"]');
        await expect(infoBtn).toBeVisible();
        await expect(infoBtn.locator('.bx-info-circle')).toBeVisible();

        await infoBtn.click();
        const offcanvas = page.locator('#exerciseDetailOffcanvas');
        await expect(offcanvas).toBeVisible({ timeout: 5000 });

        // Edit/Delete are always omitted in the studio context
        await expect(offcanvas.locator('.exercise-offcanvas-edit-btn')).toHaveCount(0);
        await expect(offcanvas.locator('.exercise-offcanvas-delete-btn')).toHaveCount(0);

        // Page 2 surface: Favorite is shown but 'Add to Workout' is NOT —
        // the exercise is already in this workout, so adding is redundant.
        await expect(offcanvas.locator('.exercise-offcanvas-fav-btn')).toBeVisible();
        await expect(offcanvas.locator('.exercise-offcanvas-add-btn')).toHaveCount(0);
    });

    test('tap-to-edit exercise name morphs into an input and saves on Enter', async ({ page }) => {
        await addNFromGrid(page, 1);
        await page.locator('#studioContinueBtn').click();

        const firstCard = page.locator('.studio-card').first();
        const nameDisplay = firstCard.locator('.studio-card-name');
        await expect(nameDisplay).toBeVisible();

        await nameDisplay.click();
        const nameInput = firstCard.locator('.studio-card-name-input');
        await expect(nameInput).toBeVisible();

        await nameInput.fill('Heavy Bench Press');
        await nameInput.press('Enter');

        await expect(nameInput).toBeHidden();
        await expect(nameDisplay).toHaveText('Heavy Bench Press');
    });

    test('Escape on the name editor cancels and reverts the value', async ({ page }) => {
        await addNFromGrid(page, 1);
        await page.locator('#studioContinueBtn').click();

        const firstCard = page.locator('.studio-card').first();
        const original = (await firstCard.locator('.studio-card-name').textContent()) || '';

        await firstCard.locator('.studio-card-name').click();
        await firstCard.locator('.studio-card-name-input').fill('should-not-stick');
        await firstCard.locator('.studio-card-name-input').press('Escape');

        await expect(firstCard.locator('.studio-card-name')).toHaveText(original.trim());
    });

    test('renamed exercise persists into the save payload', async ({ page }) => {
        let postedBody = null;
        await page.route('**/api/v3/workouts*', async (route) => {
            if (route.request().method() === 'POST') {
                try { postedBody = JSON.parse(route.request().postData() || '{}'); } catch (e) { postedBody = null; }
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ id: 'wkt-rename', name: postedBody?.name || '' }),
                });
            } else { await route.continue(); }
        });

        await addNFromGrid(page, 1);
        await page.locator('#studioContinueBtn').click();
        await page.evaluate(() => { delete window.dataManager; });

        const firstCard = page.locator('.studio-card').first();
        await firstCard.locator('.studio-card-name').click();
        await firstCard.locator('.studio-card-name-input').fill('My Custom Bench Variant');
        await firstCard.locator('.studio-card-name-input').press('Enter');

        await page.locator('#studioWorkoutNameInput').fill('Rename Roundtrip');
        await page.locator('#studioFabSave').click();
        await expect(page.locator('#studioOrganizeStatus')).toHaveText(/saved/i, { timeout: 5000 });

        expect(postedBody).toBeTruthy();
        expect(postedBody.sections[0].exercises[0].name).toBe('My Custom Bench Variant');
    });

    test('edits persist when navigating back to Page 1 and returning', async ({ page }) => {
        await addNFromGrid(page, 1);
        await page.locator('#studioContinueBtn').click();

        // Unified edit mode: tapping any field opens all three editors at
        // once, and a single ✓ commits all of them. Fill all three then
        // commit once.
        const firstCard = page.locator('.studio-card').first();
        await firstCard.locator('.repssets-display').click();
        await firstCard.locator('.repssets-input').fill('5x5');
        await firstCard.locator('.weight-input').fill('225');
        await firstCard.locator('.studio-rest-input').fill('90s');
        await firstCard.locator('.studio-card-edit-save').click();

        await page.evaluate(() => window.workoutStudio && window.workoutStudio._showView('build'));
        await page.locator('#studioContinueBtn').click();

        const reopened = page.locator('.studio-card').first();
        // Protocol persists verbatim — "5x5" stays "5x5" (no autoformat)
        await expect(reopened.locator('.repssets-value-text')).toHaveText('5x5');
        await expect(reopened.locator('.weight-value')).toHaveText('225');
        await expect(reopened.locator('.studio-rest-value-text')).toHaveText('90s');
    });

    test('Save without a workout name shows a friendly error', async ({ page }) => {
        await addNFromGrid(page, 1);

        // The name field is pre-populated with a "New Workout - <date>" default,
        // so explicitly clear it to recreate the no-name path.
        await page.locator('#studioWorkoutNameInput').fill('');
        await page.locator('#studioContinueBtn').click();

        await page.locator('#studioFabSave').click();
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

        await page.locator('#studioFabSave').click();

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
        await page.locator('#studioFabSave').click();
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
        await page.evaluate(() => window.workoutStudio && window.workoutStudio._showView('build'));
        const rows = page.locator('.studio-row');
        await rows.nth(1).locator('.studio-row-add').click();
        await page.locator('#studioContinueBtn').click();

        await expect(page.locator('#studioReorderBtn')).toBeVisible();
    });

    test('Reorder sheet expands to accommodate many items, not pinned to ~30vh', async ({ page }) => {
        // Build a workout with enough items that the sheet would clip
        // visibly if it inherited Bootstrap's default offcanvas-bottom height
        await page.goto(`${BASE}/workout-studio.html`);
        const firstRow = page.locator('.studio-row').first();
        await expect(firstRow).toBeVisible({ timeout: 15000 });
        const rows = page.locator('.studio-row');
        for (let i = 0; i < 10; i++) {
            await rows.nth(i).locator('.studio-row-add').click();
        }
        await page.locator('#studioContinueBtn').click();
        await page.locator('#studioReorderBtn').click();
        const sheet = page.locator('.studio-reorder-sheet');
        await expect(sheet).toBeVisible();

        // Sheet height should comfortably exceed 30% of viewport — its
        // content (10 rows) needs more than that. We measure via the
        // bounding box and compare against the viewport height.
        const { height: sheetH, viewportH } = await page.evaluate(() => ({
            height: document.querySelector('.studio-reorder-sheet').getBoundingClientRect().height,
            viewportH: window.innerHeight,
        }));
        // 10 rows + header + footer should easily clear half the viewport
        expect(sheetH).toBeGreaterThan(viewportH * 0.5);
        // ...and never exceed the 90vh cap from .offcanvas-bottom-tall
        expect(sheetH).toBeLessThanOrEqual(viewportH * 0.91);

        // All 10 rows are in the DOM (the body scrolls if needed)
        await expect(sheet.locator('.studio-reorder-row.studio-reorder-card-row')).toHaveCount(10);
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
        await page.locator('#studioFabSave').click();
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
        await page.locator('#studioFabSave').click();
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
        await page.locator('#studioFabSave').click();
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

    test('Removing a card via its 3-dot menu works whether the card is loose or in a block', async ({ page }) => {
        await addNFromGrid(page, 2);
        await page.locator('#studioContinueBtn').click();
        await page.locator('#studioAddBlockBtn').click();

        // Move card 1 into the block
        const card = page.locator('#studioOrganizeList > .studio-card').first();
        await card.locator('[data-action="menu"]').click();
        await card.locator('[data-action="move-to-block"]').click();
        await expect(page.locator('.studio-block .studio-card')).toHaveCount(1);

        // Remove the in-block card via its own 3-dot menu
        const inBlockCard = page.locator('.studio-block .studio-block-children .studio-card').first();
        await inBlockCard.locator('[data-action="menu"]').click();
        await inBlockCard.locator('[data-action="delete"]').click();

        // One card remains (the still-loose top-level one)
        await expect(page.locator('.studio-card')).toHaveCount(1);
    });
});

test.describe('Workout Studio — AI Import', () => {

    // Mock the regex parse endpoint with a high-confidence fixture so the
    // wizard short-circuits before reaching the AI follow-up call.
    async function routeParse(page, workoutData) {
        await page.route('**/api/v3/import/parse', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    confidence: 1.0,
                    workout_data: workoutData,
                }),
            });
        });
        // Also stub the AI fallback in case the wizard reaches it
        await page.route('**/api/v3/import/parse-ai', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    confidence: 1.0,
                    workout_data: workoutData,
                }),
            });
        });
    }

    test('Import button is visible on Page 1 next to the search row', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await expect(page.locator('#studioImportBtn')).toBeVisible();
        await expect(page.locator('#studioImportBtn')).toContainText(/Import/i);
    });

    test('Importing pastes a parsed workout into the tray and navigates to Page 2', async ({ page }) => {
        await routeParse(page, {
            name: 'Imported Push Day',
            description: 'Chest + tris focus',
            tags: ['push', 'imported'],
            exercise_groups: [
                { exercises: { a: 'Barbell Bench Press' }, sets: '3', reps: '8' },
                { exercises: { a: 'Cable Fly' }, sets: '3', reps: '12' },
                { exercises: { a: 'Tricep Pushdown' }, sets: '3', reps: '12' },
            ],
            template_notes: [],
        });

        await page.goto(`${BASE}/workout-studio.html`);
        await expect(page.locator('.studio-row').first()).toBeVisible({ timeout: 15000 });

        await page.locator('#studioImportBtn').click();
        const wizard = page.locator('#importWizardOffcanvas');
        await expect(wizard).toBeVisible();

        await wizard.locator('#importTextArea').fill('bench 3x8, cable fly 3x12, pushdown 3x12');
        await wizard.locator('#importParseBtn').click();

        // Auto-navigates to Page 2 with 3 cards populated
        await expect(page.locator('#studio')).toHaveAttribute('data-view', 'plan', { timeout: 5000 });
        await expect(page.locator('#studioOrganizeList .studio-card')).toHaveCount(3);

        // Name + tags + description carried over
        await expect(page.locator('#studioWorkoutNameInput')).toHaveValue('Imported Push Day');
        await expect(page.locator('#studioTagsInput')).toHaveValue('push, imported');
        await expect(page.locator('#studioDescriptionInput')).toHaveValue('Chest + tris focus');
    });

    test('Consecutive exercises sharing a block_id collapse into a studio block on import', async ({ page }) => {
        await routeParse(page, {
            name: 'Imported Superset',
            exercise_groups: [
                { exercises: { a: 'Bench Press' }, sets: '3', reps: '8', block_id: 'b1', group_name: 'Push Pair' },
                { exercises: { a: 'Barbell Row' }, sets: '3', reps: '8', block_id: 'b1', group_name: 'Push Pair' },
                { exercises: { a: 'Plank' }, sets: '3', reps: '60s' },
            ],
        });

        await page.goto(`${BASE}/workout-studio.html`);
        await expect(page.locator('.studio-row').first()).toBeVisible({ timeout: 15000 });

        await page.locator('#studioImportBtn').click();
        await page.locator('#importTextArea').fill('bench 3x8 / row 3x8 superset, plank 3x60s');
        await page.locator('#importParseBtn').click();

        await expect(page.locator('#studio')).toHaveAttribute('data-view', 'plan', { timeout: 5000 });

        // One block holds two cards; one loose card sits outside
        await expect(page.locator('.studio-block')).toHaveCount(1);
        await expect(page.locator('.studio-block .studio-block-children .studio-card')).toHaveCount(2);
        await expect(page.locator('#studioOrganizeList > .studio-card')).toHaveCount(1);
        await expect(page.locator('.studio-block-name-input')).toHaveValue('Push Pair');
    });
});

test.describe('Workout Studio — Draft persistence', () => {

    test('default open does not write a draft (clean localStorage)', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await expect(page.locator('.studio-row').first()).toBeVisible({ timeout: 15000 });
        const stored = await page.evaluate(() => localStorage.getItem('ffn:studio:draft:v1'));
        expect(stored).toBeNull();
        await expect(page.locator('#studioDraftBanner')).toBeHidden();
    });

    test('adding an exercise persists a draft to localStorage', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await expect(page.locator('.studio-row').first()).toBeVisible({ timeout: 15000 });
        await page.locator('.studio-row').first().locator('.studio-row-add').click();

        // _scheduleDraftSave is debounced ~400ms
        await page.waitForFunction(() => !!localStorage.getItem('ffn:studio:draft:v1'), null, { timeout: 3000 });
        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ffn:studio:draft:v1')));
        expect(stored).toBeTruthy();
        expect(stored.version).toBe(1);
        expect(Array.isArray(stored.items)).toBe(true);
        expect(stored.items.length).toBe(1);
        expect(typeof stored.savedAt).toBe('number');
    });

    test('reloading after building a draft silently restores state and shows the banner', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await expect(page.locator('.studio-row').first()).toBeVisible({ timeout: 15000 });

        // Build: pick 2 exercises, set tags + description, set name
        await page.locator('.studio-row').nth(0).locator('.studio-row-add').click();
        await page.locator('.studio-row').nth(1).locator('.studio-row-add').click();
        await page.locator('#studioWorkoutNameInput').fill('Persisted Push Day');
        await page.locator('#studioMetaToggle').click();
        await page.locator('#studioTagsInput').fill('push, draft');
        await page.locator('#studioDescriptionInput').fill('Bench focus.');
        await page.waitForFunction(() => !!localStorage.getItem('ffn:studio:draft:v1'), null, { timeout: 3000 });

        await page.reload();
        await expect(page.locator('.studio-row').first()).toBeVisible({ timeout: 15000 });

        // Silent restore — banner present, modal NOT present
        await expect(page.locator('#studioDraftBanner')).toBeVisible();
        await expect(page.locator('#studioDraftBannerTime')).toContainText(/(just now|minute|hour)/i);

        // State carried over
        await expect(page.locator('#studioWorkoutNameInput')).toHaveValue('Persisted Push Day');
        await expect(page.locator('#studioTagsInput')).toHaveValue('push, draft');
        await expect(page.locator('#studioDescriptionInput')).toHaveValue('Bench focus.');
        await expect(page.locator('.studio-tray-chip')).toHaveCount(2);

        // Continue → Page 2 shows the same two cards
        await page.locator('#studioContinueBtn').click();
        await expect(page.locator('#studioOrganizeList .studio-card')).toHaveCount(2);
    });

    test('dismiss button hides the banner without clearing the draft', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await expect(page.locator('.studio-row').first()).toBeVisible({ timeout: 15000 });
        await page.locator('.studio-row').first().locator('.studio-row-add').click();
        await page.waitForFunction(() => !!localStorage.getItem('ffn:studio:draft:v1'), null, { timeout: 3000 });

        await page.reload();
        await expect(page.locator('#studioDraftBanner')).toBeVisible({ timeout: 15000 });

        await page.locator('#studioDraftBannerDismiss').click();
        await expect(page.locator('#studioDraftBanner')).toBeHidden();
        // Draft still persisted
        const stored = await page.evaluate(() => localStorage.getItem('ffn:studio:draft:v1'));
        expect(stored).toBeTruthy();
        // Tray still has the restored chip
        await expect(page.locator('.studio-tray-chip')).toHaveCount(1);
    });

    test('Start fresh button wipes the draft, resets to defaults', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await expect(page.locator('.studio-row').first()).toBeVisible({ timeout: 15000 });

        await page.locator('.studio-row').first().locator('.studio-row-add').click();
        await page.locator('#studioWorkoutNameInput').fill('To Be Discarded');
        await page.waitForFunction(() => !!localStorage.getItem('ffn:studio:draft:v1'), null, { timeout: 3000 });

        await page.reload();
        await expect(page.locator('#studioDraftBanner')).toBeVisible({ timeout: 15000 });

        await page.locator('#studioDraftBannerStartFresh').click();

        await expect(page.locator('#studioDraftBanner')).toBeHidden();
        await expect(page.locator('.studio-tray-chip')).toHaveCount(0);
        await expect(page.locator('#studioWorkoutNameInput')).toHaveValue(/^New Workout - /);
        const stored = await page.evaluate(() => localStorage.getItem('ffn:studio:draft:v1'));
        expect(stored).toBeNull();
    });

    test('successful save clears the draft so a reload starts clean', async ({ page }) => {
        await page.route('**/api/v3/workouts*', async (route) => {
            if (route.request().method() === 'POST') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ id: 'wkt-cleared', name: 'X' }),
                });
            } else { await route.continue(); }
        });

        await page.goto(`${BASE}/workout-studio.html`);
        await expect(page.locator('.studio-row').first()).toBeVisible({ timeout: 15000 });
        await page.evaluate(() => { delete window.dataManager; });

        await page.locator('.studio-row').first().locator('.studio-row-add').click();
        await page.locator('#studioWorkoutNameInput').fill('Saved Workout');
        await page.waitForFunction(() => !!localStorage.getItem('ffn:studio:draft:v1'), null, { timeout: 3000 });

        await page.locator('#studioContinueBtn').click();
        await page.locator('#studioFabSave').click();
        await expect(page.locator('#studioOrganizeStatus')).toHaveText(/saved/i, { timeout: 5000 });

        // Draft cleared on success
        const stored = await page.evaluate(() => localStorage.getItem('ffn:studio:draft:v1'));
        expect(stored).toBeNull();
    });

    test('block + note + organize state survive a reload', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await expect(page.locator('.studio-row').first()).toBeVisible({ timeout: 15000 });

        // Build: 2 exercises into a named block + 1 note
        await page.locator('.studio-row').nth(0).locator('.studio-row-add').click();
        await page.locator('.studio-row').nth(1).locator('.studio-row-add').click();
        await page.locator('#studioContinueBtn').click();
        await page.locator('#studioAddBlockBtn').click();
        await page.locator('.studio-block-name-input').first().fill('Persisted Block');
        await page.locator('.studio-block-name-input').first().press('Enter');
        for (let i = 0; i < 2; i++) {
            const card = page.locator('#studioOrganizeList > .studio-card').first();
            await card.locator('[data-action="menu"]').click();
            await card.locator('[data-action="move-to-block"]').click();
        }
        await page.locator('#studioAddNoteBtn').click();
        await page.locator('.studio-note-textarea').first().fill('Persisted note');

        // Wait for the debounced save
        await page.waitForFunction(() => {
            const raw = localStorage.getItem('ffn:studio:draft:v1');
            if (!raw) return false;
            try {
                const d = JSON.parse(raw);
                return (d.blocks || []).length === 1 && (d.notes || []).length === 1;
            } catch (_) { return false; }
        }, null, { timeout: 3000 });

        await page.reload();
        await expect(page.locator('.studio-row').first()).toBeVisible({ timeout: 15000 });

        // Banner present, tray populated
        await expect(page.locator('#studioDraftBanner')).toBeVisible();
        await expect(page.locator('.studio-tray-chip')).toHaveCount(2);

        // Page 2 still shows the block with 2 cards + the note card
        await page.locator('#studioContinueBtn').click();
        await expect(page.locator('.studio-block')).toHaveCount(1);
        await expect(page.locator('.studio-block-name-input')).toHaveValue('Persisted Block');
        await expect(page.locator('.studio-block .studio-block-children .studio-card')).toHaveCount(2);
        await expect(page.locator('.studio-note-card')).toHaveCount(1);
        await expect(page.locator('.studio-note-textarea')).toHaveValue('Persisted note');
    });
});

test.describe('Workout Studio — Load existing workout via ?id=', () => {

    // Route both /api/v3/workouts (list, used by dataManager.getWorkouts)
    // AND /api/v3/workouts/{id} (single, used by the raw-fallback loader).
    async function routeWorkoutsList(page, workouts) {
        await page.route(/\/api\/v3\/workouts(\?|$)/, async (route) => {
            if (route.request().method() !== 'GET') return route.continue();
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ workouts }),
            });
        });
        await page.route(/\/api\/v3\/workouts\/[^/?]+(\?|$)/, async (route) => {
            if (route.request().method() !== 'GET') return route.continue();
            const url = new URL(route.request().url());
            const id = url.pathname.split('/').pop();
            const match = workouts.find((w) => String(w.id) === String(id));
            if (!match) return route.fulfill({ status: 404, body: '{}' });
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(match),
            });
        });
    }

    test('opening ?id=<existing> hydrates the meta card + cards from the saved sections', async ({ page }) => {
        const workout = {
            id: 'wkt-loaded-1',
            name: 'Loaded Push Day',
            description: 'Saved-back description',
            tags: ['push', 'loaded'],
            workout_type: 'standard',
            sections: [
                { type: 'standard', name: null, exercises: [
                    { exercise_id: 'ex-1', name: 'Barbell Bench Press', sets: '4', reps: '6', rest: '90s', default_weight: '185', default_weight_unit: 'lbs' },
                ]},
                { type: 'standard', name: 'Push Block', exercises: [
                    { exercise_id: 'ex-2', name: 'Incline DB Press', sets: '3', reps: '10', rest: '60s' },
                    { exercise_id: 'ex-3', name: 'Cable Fly', sets: '3', reps: '12', rest: '45s' },
                ]},
            ],
            exercise_groups: [],
            template_notes: [],
        };
        // We need the route up before navigation so the controller's first
        // dataManager.getWorkouts() call hits our fixture.
        await page.addInitScript(() => { delete window.dataManager; });
        await routeWorkoutsList(page, [workout]);

        await page.goto(`${BASE}/workout-studio.html?id=${workout.id}`);
        await expect(page.locator('#studioWorkoutNameInput')).toHaveValue('Loaded Push Day', { timeout: 10000 });

        // Meta auto-expanded since tags + description were set
        await expect(page.locator('#studioTagsInput')).toHaveValue('push, loaded');
        await expect(page.locator('#studioDescriptionInput')).toHaveValue('Saved-back description');

        // Continue to Page 2 — 1 loose card + 1 block with 2 children
        await page.locator('#studioContinueBtn').click();
        await expect(page.locator('#studioOrganizeList > .studio-card')).toHaveCount(1);
        await expect(page.locator('.studio-block')).toHaveCount(1);
        await expect(page.locator('.studio-block-name-input')).toHaveValue('Push Block');
        await expect(page.locator('.studio-block .studio-block-children .studio-card')).toHaveCount(2);

        // First card carries the saved weight value
        await expect(page.locator('#studioOrganizeList > .studio-card .weight-value').first()).toHaveText('185');

        // workoutId is tracked so subsequent saves UPDATE rather than CREATE
        const wid = await page.evaluate(() => window.workoutStudio && window.workoutStudio.workoutId);
        expect(wid).toBe('wkt-loaded-1');
    });

    test('saving an existing workout PUTs to /api/v3/workouts/{id} (update, not create)', async ({ page }) => {
        const workout = {
            id: 'wkt-loaded-2',
            name: 'Edit Me',
            description: '',
            tags: [],
            workout_type: 'standard',
            sections: [
                { type: 'standard', name: null, exercises: [
                    { exercise_id: 'ex-9', name: 'Squat', sets: '5', reps: '5', rest: '120s' },
                ]},
            ],
            exercise_groups: [],
            template_notes: [],
        };

        await page.addInitScript(() => { delete window.dataManager; });
        await routeWorkoutsList(page, [workout]);

        let putHit = null;
        let postHit = null;
        await page.route('**/api/v3/workouts/wkt-loaded-2', async (route) => {
            if (route.request().method() === 'PUT') {
                try { putHit = JSON.parse(route.request().postData() || '{}'); } catch (e) { putHit = null; }
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ id: workout.id, name: putHit?.name || workout.name }),
                });
            } else { await route.fallback(); }
        });
        await page.route('**/api/v3/workouts', async (route) => {
            if (route.request().method() === 'POST') {
                try { postHit = JSON.parse(route.request().postData() || '{}'); } catch (e) { postHit = null; }
                await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
            } else { await route.fallback(); }
        });

        await page.goto(`${BASE}/workout-studio.html?id=${workout.id}`);
        await expect(page.locator('#studioWorkoutNameInput')).toHaveValue('Edit Me', { timeout: 10000 });

        // Now that load is done, force the save to hit the raw-fetch fallback
        // (dataManager.updateWorkout would otherwise go through localStorage
        // and fail with "not found" since the workout was never seeded there).
        await page.evaluate(() => { delete window.dataManager; });

        // Rename then save
        await page.locator('#studioWorkoutNameInput').fill('Edit Me — Renamed');
        await page.locator('#studioContinueBtn').click();
        await page.locator('#studioFabSave').click();

        await expect(page.locator('#studioOrganizeStatus')).toHaveText(/updated/i, { timeout: 5000 });
        expect(putHit).toBeTruthy();
        expect(putHit.name).toBe('Edit Me — Renamed');
        expect(postHit).toBeNull(); // We did NOT create a new workout
    });

    test('loading an existing workout does NOT write to the new-workout draft slot', async ({ page }) => {
        const workout = {
            id: 'wkt-no-draft',
            name: 'Loaded Workout',
            description: '',
            tags: [],
            sections: [{ type: 'standard', name: null, exercises: [{ exercise_id: 'a', name: 'Curl', sets: '3', reps: '10' }] }],
            exercise_groups: [],
            template_notes: [],
        };
        await page.addInitScript(() => { delete window.dataManager; });
        await routeWorkoutsList(page, [workout]);

        await page.goto(`${BASE}/workout-studio.html?id=${workout.id}`);
        await expect(page.locator('#studioWorkoutNameInput')).toHaveValue('Loaded Workout', { timeout: 10000 });

        // Make an edit — would normally schedule a draft save
        await page.locator('#studioWorkoutNameInput').fill('Loaded Workout edited');
        // Give the debounce a chance to fire
        await page.waitForTimeout(800);

        const stored = await page.evaluate(() => localStorage.getItem('ffn:studio:draft:v1'));
        expect(stored).toBeNull();
    });

    test('legacy exercise_groups with block_id collapses into a studio block on load', async ({ page }) => {
        const workout = {
            id: 'wkt-legacy',
            name: 'Legacy Block Workout',
            description: '',
            tags: [],
            sections: null,
            exercise_groups: [
                { group_id: 'g1', exercises: { a: 'Bench Press' }, sets: '3', reps: '8', block_id: 'b1', group_name: 'Push Pair' },
                { group_id: 'g2', exercises: { a: 'Barbell Row' }, sets: '3', reps: '8', block_id: 'b1', group_name: 'Push Pair' },
                { group_id: 'g3', exercises: { a: 'Plank' }, sets: '3', reps: '60s' },
            ],
            template_notes: [],
        };
        await page.addInitScript(() => { delete window.dataManager; });
        await routeWorkoutsList(page, [workout]);

        await page.goto(`${BASE}/workout-studio.html?id=${workout.id}`);
        await expect(page.locator('#studioWorkoutNameInput')).toHaveValue('Legacy Block Workout', { timeout: 10000 });

        await page.locator('#studioContinueBtn').click();
        await expect(page.locator('.studio-block')).toHaveCount(1);
        await expect(page.locator('.studio-block .studio-block-children .studio-card')).toHaveCount(2);
        await expect(page.locator('#studioOrganizeList > .studio-card')).toHaveCount(1);
        await expect(page.locator('.studio-block-name-input')).toHaveValue('Push Pair');
    });
});

test.describe('Modal manager — type-to-confirm', () => {
    test('confirm button stays disabled until the user types the required phrase', async ({ page }) => {
        // exercise-database.html loads modal-manager.js. We just need
        // ffnModalManager on window; the page content doesn't matter.
        await page.goto(`${BASE}/exercise-database.html`);
        await page.waitForFunction(() => typeof window.ffnModalManager !== 'undefined', null, { timeout: 15000 });

        let confirmed = false;
        await page.exposeFunction('__markConfirmed', () => { confirmed = true; });

        await page.evaluate(() => {
            window.__confirmHappened = false;
            window.ffnModalManager.typeToConfirm(
                'Delete test',
                'This is irreversible.',
                'delete',
                () => {
                    window.__confirmHappened = true;
                    window.__markConfirmed();
                },
                { confirmText: 'Delete permanently', confirmClass: 'btn-danger' }
            );
        });

        // Use evaluate to drive the modal directly — Playwright's locator
        // interaction with dynamically-added Bootstrap modals is flaky here.
        // We're testing the manager's logic, not DOM rendering quirks.
        const readState = async () => page.evaluate(() => {
            const modals = document.querySelectorAll('.modal[id^="type-to-confirm-modal-"]');
            const m = modals[modals.length - 1];
            if (!m) return null;
            const input = m.querySelector('input[type="text"]');
            const btn = m.querySelector('button.btn-danger');
            return {
                hasInput: !!input,
                hasBtn: !!btn,
                btnDisabled: btn ? btn.disabled : null,
                inputValue: input ? input.value : null,
            };
        });

        // Wait for the modal AND for typeToConfirm's shown.bs.modal listener
        // to wire the input → button sync. We detect that by checking that
        // dispatching an input event actually toggles the disabled state.
        await page.waitForFunction(() => {
            const m = document.querySelector('.modal[id^="type-to-confirm-modal-"]');
            if (!m) return false;
            const input = m.querySelector('input[type="text"]');
            const btn = m.querySelector('button.btn-danger');
            if (!input || !btn) return false;
            // Probe: set value, dispatch input event, check btn state, restore
            const prev = input.value;
            input.value = 'delete';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            const wired = btn.disabled === false;
            input.value = prev;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            return wired;
        }, null, { timeout: 5000 });

        // Initial state: disabled
        let state = await readState();
        if (!state.hasInput) {
            const dump = await page.evaluate(() => {
                const modals = document.querySelectorAll('.modal[id^="type-to-confirm-modal-"]');
                const m = modals[modals.length - 1];
                return m ? m.outerHTML : `no modal; matching ids: ${Array.from(modals).map(x => x.id).join(',')}`;
            });
            throw new Error('No input. Modal outerHTML: ' + dump.slice(0, 1500));
        }
        expect(state.hasInput).toBe(true);
        expect(state.btnDisabled).toBe(true);

        // Wrong text → still disabled
        await page.evaluate(() => {
            const modals = document.querySelectorAll('.modal[id^="type-to-confirm-modal-"]');
            const m = modals[modals.length - 1];
            const input = m.querySelector('input[type="text"]');
            input.value = 'something-else';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        state = await readState();
        expect(state.btnDisabled).toBe(true);

        // Correct text → enabled
        await page.evaluate(() => {
            const modals = document.querySelectorAll('.modal[id^="type-to-confirm-modal-"]');
            const m = modals[modals.length - 1];
            const input = m.querySelector('input[type="text"]');
            input.value = 'delete';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        state = await readState();
        expect(state.btnDisabled).toBe(false);

        // Click confirm → callback fires
        await page.evaluate(() => {
            const modals = document.querySelectorAll('.modal[id^="type-to-confirm-modal-"]');
            const m = modals[modals.length - 1];
            m.querySelector('button.btn-danger').click();
        });
        // Bootstrap modal hide → onHidden → callback
        await page.waitForFunction(() => window.__confirmHappened === true, null, { timeout: 5000 });
        expect(confirmed).toBe(true);
    });
});

test.describe('Workout Studio — type cards + floating FABs (builder parity)', () => {

    test('FAB row is hidden on Page 1 and shown on Page 2 with disabled save/go when empty', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await page.waitForFunction(() => !!document.getElementById('studioFloatingFabs'), null, { timeout: 10000 });

        // Page 1 (Select) — FAB row hidden
        await expect(page.locator('#studioFloatingFabs')).toBeHidden();

        // Add an exercise to enable Continue
        const firstRow = page.locator('.studio-row').first();
        await firstRow.waitFor({ state: 'visible', timeout: 10000 });
        await firstRow.locator('.studio-row-add').click();
        await page.locator('#studioContinueBtn').click();

        // Page 2 — FAB row visible
        await expect(page.locator('#studioFloatingFabs')).toBeVisible();

        // Save disabled until a name is set (we added an exercise but the
        // default-name seed only runs on full page boot, so the name input
        // might be filled. Probe both states programmatically.)
        const nameVal = await page.locator('#studioWorkoutNameInput').inputValue();
        if (!nameVal) {
            await expect(page.locator('#studioFabSave')).toBeDisabled();
        }

        // Set a name → save enables
        await page.locator('#studioWorkoutNameInput').fill('FAB test workout');
        await expect(page.locator('#studioFabSave')).toBeEnabled();

        // Go enables once tray + name are set — it saves automatically
        // before switching to the Log tab, so no pre-saved id is needed.
        await expect(page.locator('#studioFabGo')).toBeEnabled();
    });

    test('cardio cards get a data-card-type=cardio accent + a type icon', async ({ page }) => {
        // Load a workout with a single cardio section so we exercise the
        // sections[] hydration path and the type-card rendering together.
        const workout = {
            id: 'wkt-type-card',
            name: 'Cardio Day',
            description: '',
            tags: [],
            workout_type: 'standard',
            sections: [
                { type: 'standard', name: null, exercises: [
                    { exercise_id: 'ex-c1', name: 'Stair Climber', sets: '1', reps: '20 min', group_type: 'cardio' },
                ]},
            ],
            exercise_groups: [],
            template_notes: [],
        };
        await page.addInitScript(() => { delete window.dataManager; });
        await page.route(/\/api\/v3\/workouts(\?|$)/, async (route) => {
            if (route.request().method() !== 'GET') return route.continue();
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ workouts: [workout] }) });
        });
        await page.route(/\/api\/v3\/workouts\/[^/?]+(\?|$)/, async (route) => {
            if (route.request().method() !== 'GET') return route.continue();
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(workout) });
        });

        await page.goto(`${BASE}/workout-studio.html?id=${workout.id}`);
        await expect(page.locator('#studioWorkoutNameInput')).toHaveValue('Cardio Day', { timeout: 10000 });
        await page.locator('#studioContinueBtn').click();

        // The cardio card carries data-card-type="cardio"
        const cardioCard = page.locator('.studio-card[data-card-type="cardio"]');
        await expect(cardioCard).toHaveCount(1);

        // And renders a type icon inline with the name. Either the
        // registry-resolved icon or the bx-pulse fallback — both are
        // .studio-card-type-icon.
        await expect(cardioCard.locator('.studio-card-type-icon')).toHaveCount(1);
    });
});

test.describe('Workout Studio — cardio summary card + offcanvas editing', () => {

    // Stub ActivityDisplayConfig + a route so the summary line formats
    // deterministically regardless of which display columns the test
    // env has saved.
    async function setupActivityStubs(page) {
        await page.addInitScript(() => {
            // Force a known display column set so the summary is predictable.
            const ready = setInterval(() => {
                if (window.ActivityDisplayConfig) {
                    try {
                        // Override getColumns to a known order; keep getFieldDef.
                        const orig = window.ActivityDisplayConfig.getColumns;
                        window.ActivityDisplayConfig.getColumns = () => ['duration', 'distance', 'pace'];
                    } catch (_) {}
                    clearInterval(ready);
                }
            }, 30);
        });
    }

    test('loaded cardio workout renders a summary line (no inline sets/reps/weight)', async ({ page }) => {
        const workout = {
            id: 'wkt-cardio-summary',
            name: 'Cardio Test',
            description: '', tags: [], workout_type: 'standard',
            sections: [
                { type: 'standard', name: null, exercises: [
                    {
                        exercise_id: 'ex-c',
                        name: 'Stair Climber',
                        group_type: 'cardio',
                        cardio_config: {
                            activity_type: 'stair_climber',
                            duration_minutes: 20,
                        },
                    },
                ]},
            ],
            exercise_groups: [],
            template_notes: [],
        };
        await page.addInitScript(() => { delete window.dataManager; });
        await setupActivityStubs(page);
        await page.route(/\/api\/v3\/workouts(\?|$)/, async (route) => {
            if (route.request().method() !== 'GET') return route.continue();
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ workouts: [workout] }) });
        });
        await page.route(/\/api\/v3\/workouts\/[^/?]+(\?|$)/, async (route) => {
            if (route.request().method() !== 'GET') return route.continue();
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(workout) });
        });

        await page.goto(`${BASE}/workout-studio.html?id=${workout.id}`);
        await expect(page.locator('#studioWorkoutNameInput')).toHaveValue('Cardio Test', { timeout: 10000 });
        await page.locator('#studioContinueBtn').click();

        const cardio = page.locator('.studio-card.studio-card-cardio');
        await expect(cardio).toHaveCount(1);

        // Summary surface is present + contains the duration
        const summary = cardio.locator('.studio-card-cardio-summary');
        await expect(summary).toBeVisible();
        await expect(summary).toContainText(/20\s*min/i);

        // The inline strength-style fields are NOT rendered for cardio
        await expect(cardio.locator('.workout-repssets-field')).toHaveCount(0);
        await expect(cardio.locator('.studio-card-weight-field')).toHaveCount(0);
        await expect(cardio.locator('.studio-card-rest-field')).toHaveCount(0);
    });

    test('tapping the cardio summary fires the edit hook (opens the offcanvas factory)', async ({ page }) => {
        const workout = {
            id: 'wkt-cardio-tap',
            name: 'Tap Test',
            description: '', tags: [], workout_type: 'standard',
            sections: [
                { type: 'standard', name: null, exercises: [
                    { exercise_id: 'ex-c2', name: 'Rowing', group_type: 'cardio',
                      cardio_config: { activity_type: 'rowing' } },
                ]},
            ],
            exercise_groups: [],
            template_notes: [],
        };
        await page.addInitScript(() => { delete window.dataManager; });
        // Stub the factory so we can detect the call without rendering the
        // real offcanvas (which has its own dependencies + animation).
        await page.addInitScript(() => {
            window.__cardioEditorCalls = [];
            const wait = setInterval(() => {
                if (window.UnifiedOffcanvasFactory) {
                    window.UnifiedOffcanvasFactory.createCardioEditor = (cfg) => {
                        window.__cardioEditorCalls.push({
                            groupId: cfg.groupId,
                            cardioConfig: cfg.cardioConfig,
                        });
                        return { id: 'stub', hide: () => {} };
                    };
                    clearInterval(wait);
                }
            }, 30);
        });
        await page.route(/\/api\/v3\/workouts(\?|$)/, async (route) => {
            if (route.request().method() !== 'GET') return route.continue();
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ workouts: [workout] }) });
        });
        await page.route(/\/api\/v3\/workouts\/[^/?]+(\?|$)/, async (route) => {
            if (route.request().method() !== 'GET') return route.continue();
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(workout) });
        });

        await page.goto(`${BASE}/workout-studio.html?id=${workout.id}`);
        await expect(page.locator('#studioWorkoutNameInput')).toHaveValue('Tap Test', { timeout: 10000 });
        await page.locator('#studioContinueBtn').click();

        const cardio = page.locator('.studio-card.studio-card-cardio');
        await expect(cardio).toHaveCount(1);

        // Tap the summary surface
        await cardio.locator('.studio-card-cardio-summary').click();

        const calls = await page.evaluate(() => window.__cardioEditorCalls);
        expect(calls.length).toBe(1);
        expect(calls[0].groupId).toMatch(/^studio:/);
        expect(calls[0].cardioConfig.activity_type).toBe('rowing');
    });

    test('redundant inline Back/Save buttons are gone (FABs cover both)', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await page.waitForFunction(() => !!document.getElementById('studio'), null, { timeout: 10000 });
        // Inline Back / Save row removed from Page 2
        await expect(page.locator('#studioOrganizeBack')).toHaveCount(0);
        await expect(page.locator('#studioSaveBtn')).toHaveCount(0);
        // FABs are the new home for those actions
        await expect(page.locator('#studioFabSave')).toHaveCount(1);
    });

    test('Plan card weight/protocol fields are left-justified on a single row (workout-mode CSS bleed override)', async ({ page }) => {
        // workout-mode.css's .weight-display / .repssets-display are
        // flex-column (label above big numeral) — perfect for Log cards,
        // wrong for Plan editor rows. The studio CSS scopes a flex-row
        // override for .studio-card to keep label + value on one line.
        await page.goto(`${BASE}/workout-studio.html`);
        const firstRow = page.locator('.studio-row').first();
        await firstRow.waitFor({ state: 'visible', timeout: 10000 });
        await firstRow.locator('.studio-row-add').click();
        await page.locator('#studioContinueBtn').click();

        const weightDisplay = page.locator('.studio-card .weight-display').first();
        const protocolDisplay = page.locator('.studio-card .repssets-display').first();
        await expect(weightDisplay).toBeVisible();
        await expect(protocolDisplay).toBeVisible();

        // Both displays should be row-direction, not column
        await expect(weightDisplay).toHaveCSS('flex-direction', 'row');
        await expect(protocolDisplay).toHaveCSS('flex-direction', 'row');

        // The big-numeral font-size from workout-mode (1.5rem-ish ≈ 24px)
        // should NOT be present on Plan card weight values.
        const fontSizePx = await weightDisplay.locator('.weight-value').first().evaluate(
            (el) => parseFloat(getComputedStyle(el).fontSize)
        );
        expect(fontSizePx).toBeLessThan(20);
    });

    test('cardio cards in the Log view render the summary surface, not weight/protocol fields', async ({ page }) => {
        const workout = {
            id: 'wkt-cardio-log',
            name: 'Run Day',
            description: '', tags: [], workout_type: 'standard',
            sections: [
                { type: 'standard', name: null, exercises: [
                    {
                        exercise_id: 'ex-c-run',
                        name: 'Running',
                        group_type: 'cardio',
                        cardio_config: {
                            activity_type: 'running',
                            duration_minutes: 30,
                        },
                    },
                ]},
            ],
            exercise_groups: [],
            template_notes: [],
        };
        await page.addInitScript(() => { delete window.dataManager; });
        await setupActivityStubs(page);
        await page.route(/\/api\/v3\/workouts(\?|$)/, async (route) => {
            if (route.request().method() !== 'GET') return route.continue();
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ workouts: [workout] }) });
        });
        await page.route(/\/api\/v3\/workouts\/[^/?]+(\?|$)/, async (route) => {
            if (route.request().method() !== 'GET') return route.continue();
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(workout) });
        });

        await page.goto(`${BASE}/workout-studio.html?id=${workout.id}`);
        await expect(page.locator('#studioWorkoutNameInput')).toHaveValue('Run Day', { timeout: 10000 });
        await page.locator('#studioContinueBtn').click();
        await enterLogSession(page);

        // Exactly one Log card and it's the cardio one — first not-yet-done
        // card auto-expands on mount, so the body should already be open.
        const logCard = page.locator('.studio-log-card');
        await expect(logCard).toHaveCount(1);
        await expect(logCard).toHaveClass(/expanded/);

        // Summary surface present + has the duration text
        const summary = logCard.locator('.studio-log-card-cardio-summary');
        await expect(summary).toBeVisible();
        await expect(summary).toContainText(/30\s*min/i);

        // Strength-style hero fields are NOT rendered for cardio in Log
        await expect(logCard.locator('.workout-weight-field')).toHaveCount(0);
        await expect(logCard.locator('.workout-repssets-field')).toHaveCount(0);
    });

    test('tapping the Log cardio summary opens the same offcanvas editor', async ({ page }) => {
        const workout = {
            id: 'wkt-cardio-log-tap',
            name: 'Row Day',
            description: '', tags: [], workout_type: 'standard',
            sections: [
                { type: 'standard', name: null, exercises: [
                    { exercise_id: 'ex-c-row', name: 'Rowing', group_type: 'cardio',
                      cardio_config: { activity_type: 'rowing', duration_minutes: 15 } },
                ]},
            ],
            exercise_groups: [],
            template_notes: [],
        };
        await page.addInitScript(() => { delete window.dataManager; });
        await page.addInitScript(() => {
            window.__cardioEditorCalls = [];
            const wait = setInterval(() => {
                if (window.UnifiedOffcanvasFactory) {
                    window.UnifiedOffcanvasFactory.createCardioEditor = (cfg) => {
                        window.__cardioEditorCalls.push({
                            groupId: cfg.groupId,
                            cardioConfig: cfg.cardioConfig,
                        });
                        return { id: 'stub', hide: () => {} };
                    };
                    clearInterval(wait);
                }
            }, 30);
        });
        await page.route(/\/api\/v3\/workouts(\?|$)/, async (route) => {
            if (route.request().method() !== 'GET') return route.continue();
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ workouts: [workout] }) });
        });
        await page.route(/\/api\/v3\/workouts\/[^/?]+(\?|$)/, async (route) => {
            if (route.request().method() !== 'GET') return route.continue();
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(workout) });
        });

        await page.goto(`${BASE}/workout-studio.html?id=${workout.id}`);
        await expect(page.locator('#studioWorkoutNameInput')).toHaveValue('Row Day', { timeout: 10000 });
        await page.locator('#studioContinueBtn').click();
        await enterLogSession(page);

        const logCard = page.locator('.studio-log-card');
        // First not-yet-done card auto-expands on mount; just tap the summary.
        await expect(logCard).toHaveClass(/expanded/);
        await logCard.locator('.studio-log-card-cardio-summary').click();

        const calls = await page.evaluate(() => window.__cardioEditorCalls);
        expect(calls.length).toBe(1);
        expect(calls[0].groupId).toMatch(/^studio:/);
        expect(calls[0].cardioConfig.activity_type).toBe('rowing');
    });
});

test.describe('Workout Studio — unified card edit (workout-mode parity)', () => {
    async function addOneExerciseAndContinue(page) {
        const firstRow = page.locator('.studio-row').first();
        await firstRow.waitFor({ state: 'visible', timeout: 10000 });
        await firstRow.locator('.studio-row-add').click();
        await page.locator('#studioWorkoutNameInput').fill('Inline edit test');
        await page.locator('#studioContinueBtn').click();
    }

    test('tapping any field opens all three editors and shows ONE card-level ✓/✗', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await addOneExerciseAndContinue(page);

        const card = page.locator('.studio-card').first();
        // Tap the protocol display
        await card.locator('.repssets-display').click();

        // All three editors become visible
        await expect(card.locator('.repssets-editor')).toBeVisible();
        await expect(card.locator('.studio-weight-editor')).toBeVisible();
        await expect(card.locator('.studio-rest-editor')).toBeVisible();

        // Exactly ONE save + ONE cancel for the entire card (no per-field pairs)
        await expect(card.locator('.studio-card-edit-save')).toHaveCount(1);
        await expect(card.locator('.studio-card-edit-cancel')).toHaveCount(1);

        // Card carries the editing class for visual feedback
        await expect(card).toHaveClass(/studio-card-editing/);
    });

    test('protocol persists verbatim — "5x5" stays "5x5" (no autoformat to "5×5")', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await addOneExerciseAndContinue(page);

        const card = page.locator('.studio-card').first();
        await card.locator('.repssets-display').click();
        await card.locator('.repssets-input').fill('5x5');

        // Single card-level ✓ commits everything
        await card.locator('.studio-card-edit-save').click();
        await expect(card.locator('.repssets-editor')).toBeHidden();
        await expect(card.locator('.repssets-value-text')).toHaveText('5x5');

        // Round-trip back to selection and forward — typed value should be intact
        await page.evaluate(() => window.workoutStudio && window.workoutStudio._showView('build'));
        await page.locator('#studioContinueBtn').click();
        await expect(page.locator('.studio-card .repssets-value-text').first()).toHaveText('5x5');
    });

    test('clicking off any input no longer reverts; commit is required', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await addOneExerciseAndContinue(page);

        const card = page.locator('.studio-card').first();
        await card.locator('.studio-rest-display').click();
        const restInput = card.locator('.studio-rest-input');
        await restInput.fill('90s');

        // Tap somewhere outside the inputs — used to trigger blur → cancel → revert.
        // Editor should stay open with typed value intact.
        await page.locator('#studioOrganizeCount').click();
        await expect(card.locator('.studio-rest-editor')).toBeVisible();
        await expect(restInput).toHaveValue('90s');

        // ✓ commits
        await card.locator('.studio-card-edit-save').click();
        await expect(card.locator('.studio-rest-editor')).toBeHidden();
        await expect(card.locator('.studio-rest-value-text')).toHaveText('90s');
    });

    test('✗ Cancel discards changes across all three fields at once', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await addOneExerciseAndContinue(page);

        const card = page.locator('.studio-card').first();

        // Commit a known starting state
        await card.locator('.weight-display').click();
        await card.locator('.weight-input').fill('135');
        await card.locator('.studio-card-edit-save').click();
        await expect(card.locator('.weight-value')).toHaveText('135');

        // Open again, change protocol AND weight, then ✗ Cancel — both revert
        await card.locator('.repssets-display').click();
        await card.locator('.repssets-input').fill('AMRAP');
        await card.locator('.weight-input').fill('200');
        await card.locator('.studio-card-edit-cancel').click();

        await expect(card.locator('.studio-weight-editor')).toBeHidden();
        await expect(card.locator('.weight-value')).toHaveText('135');
        // Protocol stays at whatever it was before this edit session (the
        // default seeded by _ensureOrganizeState, not 'AMRAP')
        await expect(card.locator('.repssets-value-text')).not.toHaveText('AMRAP');
    });
});

test.describe('Workout Studio — search includes activities by default', () => {
    test('typing "run" surfaces the Running activity without flipping a filter', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        // Wait for the live list to render before searching
        await page.locator('.studio-row').first().waitFor({ state: 'visible', timeout: 10000 });

        // Type into the search input
        const search = page.locator('#studioSearch, #studioSearchInput').first();
        await search.fill('run');

        // The Running activity should appear in the results with no filter
        // selection required. We don't assert exact ordering — just that
        // the row exists somewhere in the visible list within a reasonable
        // settle window.
        await expect(page.locator('.studio-row:has-text("Running")').first())
            .toBeVisible({ timeout: 5000 });
    });

    test('Strength filter chip narrows results back to exercises only', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await page.locator('.studio-row').first().waitFor({ state: 'visible', timeout: 10000 });

        // Drive the filter via the controller to avoid coupling to the
        // filter-bar markup details. The controller exposes itself for tests.
        await page.evaluate(() => {
            const ws = window.workoutStudio;
            if (!ws) throw new Error('workoutStudio not exposed');
            ws.filters.type = new Set(['strength']);
            ws._refreshList();
        });

        const search = page.locator('#studioSearch, #studioSearchInput').first();
        await search.fill('run');

        // With Strength selected, Running (an activity) should NOT appear.
        // Use a quick polling check — toHaveCount(0) settles immediately
        // if there's no match, or surfaces clearly if one slipped through.
        await page.waitForTimeout(300);
        await expect(page.locator('.studio-row:has-text("Running")')).toHaveCount(0);
    });
});

test.describe('Cardio editor — picked activity from "More" appears in the favorites row', () => {
    test('selecting HIIT from More inserts a temporary pill in the grid with .active', async ({ page }) => {
        // The studio loads both the offcanvas factory AND the activity
        // type registry, so we drive the offcanvas directly from there.
        await page.goto(`${BASE}/workout-studio.html`);
        await page.waitForFunction(() => !!(window.UnifiedOffcanvasFactory && window.ActivityTypeRegistry), null, { timeout: 15000 });

        // Open the cardio editor offcanvas with an arbitrary activity
        await page.evaluate(() => {
            window.UnifiedOffcanvasFactory.createCardioEditor({
                groupId: 'test-grp',
                cardioConfig: { activity_type: 'running' },
                onSave: () => {},
            });
        });

        // Wait for the favorites grid to mount
        const grid = page.locator('[id^="cardioTypeGrid-"]').last();
        await expect(grid).toBeVisible();

        // Sanity: HIIT is NOT a default favorite, so no pill yet
        await expect(grid.locator('[data-activity-type="hiit"]')).toHaveCount(0);

        // Click the More button → opens the category picker
        await grid.locator('.activity-type-more-btn').click();

        // Wait for the picker offcanvas to mount, then click HIIT
        // Scope to .offcanvas — the same id-prefix also matches the
        // h5 title element (`<id>Label`), and .last() grabs the title
        // rather than the picker. The .offcanvas tag uniquely names the
        // container itself.
        const picker = page.locator('.offcanvas[id^="activityPicker-"]').last();
        await expect(picker).toBeVisible({ timeout: 5000 });
        const hiitItem = picker.locator('.activity-picker-item[data-type-id="hiit"]');
        await hiitItem.scrollIntoViewIfNeeded();
        await hiitItem.click({ force: true });

        // The picker closes via a setTimeout(200) → onSelect fires → grid
        // gets a fresh pill. Poll for it.
        await expect(grid.locator('[data-activity-type="hiit"]')).toHaveCount(1, { timeout: 5000 });
        await expect(grid.locator('[data-activity-type="hiit"]')).toHaveClass(/active/);

        // The new pill carries the activity's short name + icon
        await expect(grid.locator('[data-activity-type="hiit"] span')).toHaveText(/HIIT/i);
        await expect(grid.locator('[data-activity-type="hiit"] i')).toHaveClass(/bx-bolt-circle/);
    });
});

test.describe('Workout Studio — FAB row (Discard / Save / Go)', () => {
    test('Back FAB is gone — view tabs are the navigation', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        const firstRow = page.locator('.studio-row').first();
        await firstRow.waitFor({ state: 'visible', timeout: 10000 });
        await firstRow.locator('.studio-row-add').click();
        await page.locator('#studioWorkoutNameInput').fill('Back FAB test');
        await page.locator('#studioContinueBtn').click();

        // FAB row visible on Plan, but the legacy Back FAB no longer exists
        await expect(page.locator('#studioFloatingFabs')).toBeVisible();
        await expect(page.locator('#studioFabBack')).toHaveCount(0);

        // Navigation back to Build happens via the view tab
        await page.locator('#studioViewBuildBtn').click();
        await expect(page.locator('#studio')).toHaveAttribute('data-view', 'build');
        await expect(page.locator('#studioFloatingFabs')).toBeHidden();
    });

    test('FAB row: Discard/Save/Go cluster right — no More overflow, no Back', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        const firstRow = page.locator('.studio-row').first();
        await firstRow.waitFor({ state: 'visible', timeout: 10000 });
        await firstRow.locator('.studio-row-add').click();
        await page.locator('#studioWorkoutNameInput').fill('FAB layout test');
        await page.locator('#studioContinueBtn').click();
        await expect(page.locator('#studio')).toHaveAttribute('data-view', 'plan');

        // Old More + Back FABs are gone.
        await expect(page.locator('#studioFabMore')).toHaveCount(0);
        await expect(page.locator('#studioFabBack')).toHaveCount(0);
        await expect(page.locator('#studioFabDiscard')).toBeVisible();

        const discard = await page.locator('#studioFabDiscard').boundingBox();
        const save = await page.locator('#studioFabSave').boundingBox();
        const go = await page.locator('#studioFabGo').boundingBox();

        expect(discard.x).toBeLessThan(save.x);          // Right cluster order
        expect(save.x).toBeLessThan(go.x);
        // Right cluster is tight (consecutive FABs within ~20px of each other)
        expect(save.x - (discard.x + discard.width)).toBeLessThan(20);
        expect(go.x - (save.x + save.width)).toBeLessThan(20);
    });

    test('Discard FAB confirms then clears the in-progress workout', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        const firstRow = page.locator('.studio-row').first();
        await firstRow.waitFor({ state: 'visible', timeout: 10000 });
        await firstRow.locator('.studio-row-add').click();
        await page.locator('#studioWorkoutNameInput').fill('Discard FAB test');
        await page.locator('#studioContinueBtn').click();
        await expect(page.locator('#studio')).toHaveAttribute('data-view', 'plan');

        // Auto-accept the confirm prompt
        page.on('dialog', dialog => dialog.accept());

        // Pre-state: tray had at least one exercise added above
        await expect(page.locator('#studioFabDiscard')).toBeVisible();

        await page.locator('#studioFabDiscard').click();

        // Discard navigates back to Page 1 with a cleared tray (new-workout path)
        await expect(page.locator('#studio')).toHaveAttribute('data-view', 'build');
        await expect(page.locator('.studio-tray-chip')).toHaveCount(0);
    });
});

test.describe('Cardio editor — newly-inserted More pill flashes for visibility', () => {
    test('inserted pill carries the studio-pill-just-added class briefly', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await page.waitForFunction(() => !!(window.UnifiedOffcanvasFactory && window.ActivityTypeRegistry), null, { timeout: 15000 });

        await page.evaluate(() => {
            window.UnifiedOffcanvasFactory.createCardioEditor({
                groupId: 'flash-test',
                cardioConfig: { activity_type: 'running' },
                onSave: () => {},
            });
        });

        const grid = page.locator('[id^="cardioTypeGrid-"]').last();
        await expect(grid).toBeVisible();
        await grid.locator('.activity-type-more-btn').click();

        const picker = page.locator('.offcanvas[id^="activityPicker-"]').last();
        await expect(picker).toBeVisible({ timeout: 5000 });
        const hiit = picker.locator('.activity-picker-item[data-type-id="hiit"]');
        await hiit.scrollIntoViewIfNeeded();
        await hiit.click({ force: true });

        // Pill appears AND immediately carries the flash class
        const pill = grid.locator('[data-activity-type="hiit"]');
        await expect(pill).toHaveCount(1, { timeout: 5000 });
        await expect(pill).toHaveClass(/studio-pill-just-added/);
    });
});

test.describe('Workout Studio — "Add another exercise" + new-block prepend', () => {
    test('Bottom "Add another exercise" button returns to selection view', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        const firstRow = page.locator('.studio-row').first();
        await firstRow.waitFor({ state: 'visible', timeout: 10000 });
        await firstRow.locator('.studio-row-add').click();
        await page.locator('#studioContinueBtn').click();

        // Visible at the bottom of the list once we have at least one card
        const addMore = page.locator('#studioAddMoreBtn');
        await expect(addMore).toBeVisible();

        await addMore.click();
        await expect(page.locator('#studio')).toHaveAttribute('data-view', 'build');
    });

    test('New block is prepended (appears at top of the organize list)', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        // Add 2 exercises so there's a clear "existing list" to prepend against
        const rows = page.locator('.studio-row');
        await rows.nth(0).waitFor({ state: 'visible', timeout: 10000 });
        await rows.nth(0).locator('.studio-row-add').click();
        await rows.nth(1).locator('.studio-row-add').click();
        await page.locator('#studioWorkoutNameInput').fill('Prepend test');
        await page.locator('#studioContinueBtn').click();

        // Add a block — it should land at the top, not below the existing cards
        await page.locator('#studioAddBlockBtn').click();

        const firstChild = page.locator('#studioOrganizeList > *').first();
        await expect(firstChild).toHaveClass(/studio-block/);
    });
});

test.describe('Workout Studio — notes inside blocks', () => {
    async function setupTwoExercisesAndBlock(page) {
        const rows = page.locator('.studio-row');
        await rows.nth(0).waitFor({ state: 'visible', timeout: 10000 });
        await rows.nth(0).locator('.studio-row-add').click();
        await rows.nth(1).locator('.studio-row-add').click();
        await page.locator('#studioWorkoutNameInput').fill('Notes-in-blocks test');
        await page.locator('#studioContinueBtn').click();
        await page.locator('#studioAddBlockBtn').click();
        await page.locator('.studio-block-name-input').first().fill('Warmup');
        await page.locator('.studio-block-name-input').first().press('Enter');
    }

    test('note menu offers "Move to: <block>" once a block exists', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await setupTwoExercisesAndBlock(page);

        // Add a top-level note
        await page.locator('#studioAddNoteBtn').click();
        const note = page.locator('.studio-note-card').first();
        await note.locator('[data-action="menu"]').click();

        // The note menu should now show a "Move to: Warmup" entry
        const moveToBlock = note.locator('[data-action="move-to-block"]');
        await expect(moveToBlock).toHaveCount(1);
        await expect(moveToBlock).toContainText('Warmup');
    });

    test('moving a note into a block renders it inside the block children slot', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await setupTwoExercisesAndBlock(page);

        await page.locator('#studioAddNoteBtn').click();
        // Type something so the note is non-trivial
        await page.locator('.studio-note-card .studio-note-textarea').first().fill('Warm up slow');

        // Drive the move programmatically — the menu's open/render-destroy
        // timing makes the click flow brittle in the test runner. We're
        // testing the move-to-block logic, not the menu UX (which has its
        // own 'menu offers Move to' spec above).
        await page.evaluate(() => {
            const ws = window.workoutStudio;
            const noteId = Array.from(ws.notes.keys())[0];
            const blockId = Array.from(ws.blocks.keys())[0];
            ws._moveNoteToBlock(noteId, blockId);
        });

        // The note now lives inside the block's children slot
        await expect(
            page.locator('.studio-block .studio-block-children .studio-note-card')
        ).toHaveCount(1);

        // Top level no longer holds the note
        await expect(
            page.locator('#studioOrganizeList > .studio-note-card')
        ).toHaveCount(0);

        // The block carries the in-block class on the note for visual sync
        await expect(
            page.locator('.studio-block .studio-note-card')
        ).toHaveClass(/studio-note-card-in-block/);
    });

    test('"Move out of block" returns the note to top-level after the block', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await setupTwoExercisesAndBlock(page);

        await page.locator('#studioAddNoteBtn').click();
        // Move into block programmatically (menu UX covered elsewhere)
        await page.evaluate(() => {
            const ws = window.workoutStudio;
            const noteId = Array.from(ws.notes.keys())[0];
            const blockId = Array.from(ws.blocks.keys())[0];
            ws._moveNoteToBlock(noteId, blockId);
        });
        await expect(page.locator('.studio-block .studio-note-card')).toHaveCount(1);

        // Now move it back out programmatically
        await page.evaluate(() => {
            const ws = window.workoutStudio;
            const noteId = Array.from(ws.notes.keys())[0];
            ws._moveNoteOutOfBlock(noteId);
        });

        await expect(page.locator('#studioOrganizeList > .studio-note-card')).toHaveCount(1);
        await expect(page.locator('.studio-block .studio-block-children .studio-note-card')).toHaveCount(0);
    });

    test('save payload emits notes-in-block as top-level template_notes at the block slot', async ({ page }) => {
        let postedBody = null;
        await page.route('**/api/v3/workouts', async (route) => {
            if (route.request().method() === 'POST') {
                try { postedBody = JSON.parse(route.request().postData() || '{}'); }
                catch (_) { postedBody = null; }
                await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'wkt-1', name: postedBody?.name }) });
            } else { await route.fallback(); }
        });

        await page.goto(`${BASE}/workout-studio.html`);
        await setupTwoExercisesAndBlock(page);
        await page.evaluate(() => { delete window.dataManager; });

        // Add a note + move into block + move both exercises in too
        await page.locator('#studioAddNoteBtn').click();
        await page.locator('.studio-note-card .studio-note-textarea').first().fill('Block note');
        await page.evaluate(() => {
            const ws = window.workoutStudio;
            const noteId = Array.from(ws.notes.keys())[0];
            const blockId = Array.from(ws.blocks.keys())[0];
            ws._moveNoteToBlock(noteId, blockId);
        });

        // Move the 2 loose cards into the block
        for (let i = 0; i < 2; i++) {
            const card = page.locator('#studioOrganizeList > .studio-card').first();
            await card.locator('[data-action="menu"]').click();
            await card.locator('[data-action="move-to-block"]').click();
        }

        await page.locator('#studioFabSave').click();
        await expect(page.locator('#studioOrganizeStatus')).toHaveText(/saved/i, { timeout: 5000 });

        expect(postedBody).toBeTruthy();
        const tn = (postedBody.template_notes || []).find((n) => n.content === 'Block note');
        expect(tn).toBeTruthy();
        // The block has 2 exercises starting at flat slot 0; the in-block
        // note's order_index should land at 0 (block's first slot).
        expect(tn.order_index).toBe(0);
    });
});

test.describe('Workout Studio — save payload integrity', () => {
    test('block_id + group_name propagate to flattened exercise_groups so workout-mode preserves blocks', async ({ page }) => {
        let postedBody = null;
        await page.route('**/api/v3/workouts', async (route) => {
            if (route.request().method() === 'POST') {
                try { postedBody = JSON.parse(route.request().postData() || '{}'); }
                catch (_) { postedBody = null; }
                await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'wkt-1', name: postedBody?.name }) });
            } else { await route.fallback(); }
        });

        await page.goto(`${BASE}/workout-studio.html`);
        const rows = page.locator('.studio-row');
        await rows.nth(0).waitFor({ state: 'visible', timeout: 10000 });
        await rows.nth(0).locator('.studio-row-add').click();
        await rows.nth(1).locator('.studio-row-add').click();
        await rows.nth(2).locator('.studio-row-add').click();
        await page.locator('#studioWorkoutNameInput').fill('Block roundtrip');
        await page.locator('#studioContinueBtn').click();
        await page.evaluate(() => { delete window.dataManager; });

        // Create a named block and move 2 cards in
        await page.locator('#studioAddBlockBtn').click();
        await page.locator('.studio-block-name-input').first().fill('Push Block');
        await page.locator('.studio-block-name-input').first().press('Enter');
        for (let i = 0; i < 2; i++) {
            const card = page.locator('#studioOrganizeList > .studio-card').first();
            await card.locator('[data-action="menu"]').click();
            await card.locator('[data-action="move-to-block"]').click();
        }

        await page.locator('#studioFabSave').click();
        await expect(page.locator('#studioOrganizeStatus')).toHaveText(/saved/i, { timeout: 5000 });

        expect(postedBody).toBeTruthy();
        const groups = postedBody.exercise_groups || [];
        // The 2 in-block exercises must share a block_id + carry the
        // block's name on group_name; the loose 3rd exercise must not.
        const inBlock = groups.filter((g) => g.block_id);
        expect(inBlock.length).toBe(2);
        expect(inBlock[0].block_id).toBe(inBlock[1].block_id);
        expect(inBlock[0].group_name).toBe('Push Block');
        const loose = groups.filter((g) => !g.block_id);
        expect(loose.length).toBe(1);
    });

    test('single top-level card (no block) does NOT carry a block_id', async ({ page }) => {
        let postedBody = null;
        await page.route('**/api/v3/workouts', async (route) => {
            if (route.request().method() === 'POST') {
                try { postedBody = JSON.parse(route.request().postData() || '{}'); }
                catch (_) { postedBody = null; }
                await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'wkt-2', name: postedBody?.name }) });
            } else { await route.fallback(); }
        });

        await page.goto(`${BASE}/workout-studio.html`);
        const firstRow = page.locator('.studio-row').first();
        await firstRow.waitFor({ state: 'visible', timeout: 10000 });
        await firstRow.locator('.studio-row-add').click();
        await page.locator('#studioWorkoutNameInput').fill('Lone card');
        await page.locator('#studioContinueBtn').click();
        await page.evaluate(() => { delete window.dataManager; });

        await page.locator('#studioFabSave').click();
        await expect(page.locator('#studioOrganizeStatus')).toHaveText(/saved/i, { timeout: 5000 });

        const groups = postedBody.exercise_groups || [];
        expect(groups.length).toBe(1);
        expect(groups[0].block_id == null).toBe(true);
        expect(groups[0].group_name == null).toBe(true);
    });
});

test.describe('Workout Studio — promoted to default editor', () => {
    test('?new=true clears any existing draft so the studio starts fresh', async ({ page }) => {
        // Seed a draft so the natural studio open would normally restore it
        await page.goto(`${BASE}/workout-studio.html`);
        await page.evaluate(() => {
            if (!window.StudioDraftService) return;
            window.StudioDraftService.save({
                workoutName: 'Stale draft',
                tags: ['old'],
                description: 'Should be cleared',
                items: [],
                organizeOrder: [],
                blocks: [],
                notes: [],
                organizeState: [],
            });
        });

        // Open with ?new=true → draft should be wiped
        await page.goto(`${BASE}/workout-studio.html?new=true`);
        await page.waitForFunction(() => !!window.workoutStudio, null, { timeout: 10000 });
        const draftRaw = await page.evaluate(() => {
            try { return localStorage.getItem('ffn:studio:draft:v1'); } catch (_) { return null; }
        });
        expect(draftRaw == null || draftRaw === '').toBeTruthy();

        // Workout name input is empty / placeholder-only (no Stale draft text)
        const nameVal = await page.locator('#studioWorkoutNameInput').inputValue();
        expect(nameVal).not.toBe('Stale draft');
    });
});

test.describe('Workout library — Edit Workout opens studio first', () => {
    test('Studio menu item renders before "Edit in Builder" on workout cards', async ({ page }) => {
        // workout-database.html loads workout-card.js — drive the card
        // render programmatically there since the database view itself
        // needs auth + workouts data we'd otherwise have to mock.
        await page.goto(`${BASE}/workout-database.html`);
        await page.waitForFunction(() => typeof window.WorkoutCard !== 'undefined', null, { timeout: 15000 });

        const order = await page.evaluate(() => {
            const card = new window.WorkoutCard(
                { id: 'wkt-1', name: 'Test', tags: [], is_archived: false },
                { dropdownActions: ['studio', 'edit'], actions: [] }
            );
            const el = card.render();
            const items = Array.from(el.querySelectorAll('[data-action]'))
                .map((n) => n.dataset.action)
                .filter((a) => a === 'studio' || a === 'edit');
            return items;
        });

        // Studio renders before Edit in Builder
        expect(order[0]).toBe('studio');
        expect(order[1]).toBe('edit');
    });
});

test.describe('Workout Studio — Page 2 layout matches the legacy builder', () => {
    async function setupCard(page) {
        const firstRow = page.locator('.studio-row').first();
        await firstRow.waitFor({ state: 'visible', timeout: 10000 });
        await firstRow.locator('.studio-row-add').click();
        await page.locator('#studioWorkoutNameInput').fill('Layout test');
        await page.locator('#studioContinueBtn').click();
    }

    test('Page 2 header has exactly Import + Reorder; no Block/Note in header', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await setupCard(page);

        const header = page.locator('.studio-organize-section-header .studio-organize-header-actions');
        await expect(header.locator('#studioImportPage2Btn')).toBeVisible();
        await expect(header.locator('#studioReorderBtn')).toHaveCount(1); // hidden until >=2 items
        // Block + Note are NOT in the header anymore — they live in the
        // bottom add-row instead.
        await expect(header.locator('#studioAddBlockBtn')).toHaveCount(0);
        await expect(header.locator('#studioAddNoteBtn')).toHaveCount(0);
    });

    test('Bottom of the card list shows + Add Exercise then Activity / Note / Block', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await setupCard(page);

        // The full-width Add Exercise CTA
        await expect(page.locator('#studioAddMoreBtn')).toBeVisible();
        await expect(page.locator('#studioAddMoreBtn')).toContainText(/Add Exercise/i);

        // The three-button row below it
        const row = page.locator('#studioBottomAddRow');
        await expect(row).toBeVisible();
        await expect(row.locator('#studioAddActivityBtn')).toBeVisible();
        await expect(row.locator('#studioAddNoteBtn')).toBeVisible();
        await expect(row.locator('#studioAddBlockBtn')).toBeVisible();

        // Order in DOM: Activity → Note → Block (matches the legacy layout)
        const order = await row.evaluate((el) =>
            Array.from(el.querySelectorAll('button')).map((b) => b.id)
        );
        expect(order).toEqual(['studioAddActivityBtn', 'studioAddNoteBtn', 'studioAddBlockBtn']);
    });

    test('Activity button creates a cardio card and opens the cardio editor', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await page.waitForFunction(() => !!window.UnifiedOffcanvasFactory, null, { timeout: 15000 });

        // Stub the cardio editor factory to capture the open call
        await page.evaluate(() => {
            window.__cardioOpens = [];
            window.UnifiedOffcanvasFactory.createCardioEditor = (cfg) => {
                window.__cardioOpens.push({ groupId: cfg.groupId, cardioConfig: cfg.cardioConfig });
                return { id: 'stub', hide: () => {} };
            };
        });

        await setupCard(page);

        // Click Activity in the bottom row
        await page.locator('#studioAddActivityBtn').click();

        // A new cardio card appears in the organize list
        const cardio = page.locator('.studio-card.studio-card-cardio');
        await expect(cardio).toHaveCount(1);

        // The cardio editor was opened on the new card (groupId is studio:<instanceId>)
        const opens = await page.evaluate(() => window.__cardioOpens);
        expect(opens.length).toBe(1);
        expect(opens[0].groupId).toMatch(/^studio:/);
        // Initial cardio_config is empty (the user hasn't picked an activity yet)
        expect(Object.keys(opens[0].cardioConfig || {})).toHaveLength(0);
    });
});

test.describe('Workout Studio — Page 2 bottom padding clears the FAB row', () => {
    test('organize view reserves vertical space below the bottom add-row', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        const firstRow = page.locator('.studio-row').first();
        await firstRow.waitFor({ state: 'visible', timeout: 10000 });
        await firstRow.locator('.studio-row-add').click();
        await page.locator('#studioWorkoutNameInput').fill('Padding test');
        await page.locator('#studioContinueBtn').click();

        // The organize view's computed padding-bottom should leave room for
        // the floating FAB row (~52px FAB + 16px viewport gap + safe-area).
        const pad = await page.locator('#studioViewOrganize').evaluate(
            (el) => parseInt(getComputedStyle(el).paddingBottom, 10) || 0
        );
        expect(pad).toBeGreaterThanOrEqual(80);

        // The Activity / Note / Block trio should sit ABOVE the FAB row
        // (their bottom edge clears the FAB row's top edge).
        const rowRect = await page.locator('#studioBottomAddRow').boundingBox();
        const fabRect = await page.locator('#studioFloatingFabs').boundingBox();
        expect(rowRect).toBeTruthy();
        expect(fabRect).toBeTruthy();
        // The add-row's BOTTOM edge sits at or above the FAB row's TOP edge
        // (small tolerance for sub-pixel rendering on different viewports).
        expect(rowRect.y + rowRect.height).toBeLessThanOrEqual(fabRect.y + 4);
    });
});

test.describe('Workout Studio — all studio buttons share the same 10px radius', () => {
    async function setupCard(page) {
        const firstRow = page.locator('.studio-row').first();
        await firstRow.waitFor({ state: 'visible', timeout: 10000 });
        await firstRow.locator('.studio-row-add').click();
        await page.locator('#studioWorkoutNameInput').fill('Radius test');
        await page.locator('#studioContinueBtn').click();
    }

    test('Page 2 buttons (Import, Reorder, Add Exercise, Activity, Note, Block) all = 10px', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await setupCard(page);

        // Add a second exercise so Reorder is visible too (it needs ≥2 items)
        await page.evaluate(() => window.workoutStudio && window.workoutStudio._showView('build'));
        await page.locator('.studio-row').nth(1).locator('.studio-row-add').click();
        await page.locator('#studioContinueBtn').click();

        const ids = [
            '#studioImportPage2Btn',
            '#studioReorderBtn',
            '#studioAddMoreBtn',
            '#studioAddActivityBtn',
            '#studioAddNoteBtn',
            '#studioAddBlockBtn',
        ];
        for (const id of ids) {
            await expect(page.locator(id)).toHaveCSS('border-radius', '10px');
        }
    });
});

test.describe('Workout Studio — Page 2 Import and Reorder are visually identical', () => {
    test('Import and Reorder share the same color + border + radius (just different icon/label)', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        // Add 2 exercises so Reorder is visible alongside Import in the header
        const rows = page.locator('.studio-row');
        await rows.nth(0).waitFor({ state: 'visible', timeout: 10000 });
        await rows.nth(0).locator('.studio-row-add').click();
        await rows.nth(1).locator('.studio-row-add').click();
        await page.locator('#studioWorkoutNameInput').fill('Match check');
        await page.locator('#studioContinueBtn').click();

        const importBtn = page.locator('#studioImportPage2Btn');
        const reorderBtn = page.locator('#studioReorderBtn');
        await expect(importBtn).toBeVisible();
        await expect(reorderBtn).toBeVisible();

        // Sample the computed style properties that determine visual identity.
        const styles = await page.evaluate(() => {
            const imp = document.querySelector('#studioImportPage2Btn');
            const reo = document.querySelector('#studioReorderBtn');
            const pick = (el) => {
                const cs = getComputedStyle(el);
                return {
                    color: cs.color,
                    borderColor: cs.borderTopColor, // all four sides identical
                    backgroundColor: cs.backgroundColor,
                    borderRadius: cs.borderRadius,
                    height: el.offsetHeight,
                    fontSize: cs.fontSize,
                    fontWeight: cs.fontWeight,
                };
            };
            return { i: pick(imp), r: pick(reo) };
        });

        expect(styles.i.color).toBe(styles.r.color);
        expect(styles.i.borderColor).toBe(styles.r.borderColor);
        expect(styles.i.backgroundColor).toBe(styles.r.backgroundColor);
        expect(styles.i.borderRadius).toBe(styles.r.borderRadius);
        expect(styles.i.height).toBe(styles.r.height);
        expect(styles.i.fontSize).toBe(styles.r.fontSize);
        expect(styles.i.fontWeight).toBe(styles.r.fontWeight);
    });
});

test.describe('Workout Studio — Log mode (Plan/Log toggle on Page 2)', () => {
    async function continueToOrganize(page) {
        const rows = page.locator('.studio-row');
        await rows.nth(0).waitFor({ state: 'visible', timeout: 10000 });
        await rows.nth(0).locator('.studio-row-add').click();
        await rows.nth(1).locator('.studio-row-add').click();
        await page.locator('#studioWorkoutNameInput').fill('Log mode test');
        await page.locator('#studioContinueBtn').click();
    }

    test('Page 2 shows a Plan/Log segmented toggle; defaults to Plan', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await continueToOrganize(page);

        await expect(page.locator('#studioViewPlanBtn')).toBeVisible();
        await expect(page.locator('#studioViewLogBtn')).toBeVisible();
        await expect(page.locator('#studioViewPlanBtn')).toHaveClass(/is-active/);
        await expect(page.locator('#studioViewLogBtn')).not.toHaveClass(/is-active/);
    });

    test('Plan view keeps the .studio-card editor shell; Log view renders the workout-mode .workout-card', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await continueToOrganize(page);

        // Plan view — template-editor cards. No Mark Done button anywhere.
        await expect(page.locator('#studioOrganizeList .studio-card').first()).toBeVisible();
        await expect(page.locator('#studioOrganizeList .workout-primary-action')).toHaveCount(0);

        // Log view — the new StudioLogCard uses workout-mode markup.
        await enterLogSession(page);
        await expect(page.locator('#studioViewLogBtn')).toHaveClass(/is-active/);
        await expect(page.locator('#studioLogList .workout-card')).toHaveCount(2);
        // Mark Done button only appears once a card is expanded — the
        // first not-yet-done card auto-expands at session start.
        await expect(page.locator('#studioLogList .workout-card.expanded')).toHaveCount(1);
        await expect(page.locator('#studioLogList .workout-card.expanded .workout-primary-action')).toBeVisible();

        // Flip back to Plan → workout-mode markup gone, plan cards intact.
        await page.locator('#studioViewPlanBtn').click();
        await expect(page.locator('#studioLogList .workout-card')).toHaveCount(0);
        await expect(page.locator('#studioOrganizeList .studio-card')).toHaveCount(2);
    });

    test('Mark Done flips the card to .logged + the button label to "Completed"', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await continueToOrganize(page);
        await enterLogSession(page);

        // First card is auto-expanded; tap its Mark Done.
        const card = page.locator('#studioLogList .workout-card').first();
        await expect(card).toHaveClass(/expanded/);
        const btn = card.locator('.workout-primary-action');
        await expect(btn).toContainText(/Mark Done/i);

        await btn.click();
        // Card carries the .logged class. The button text + class flip
        // before the auto-advance collapse runs (~600ms later) — the
        // advance behavior is exercised in the next spec.
        await expect(card).toHaveClass(/logged/);
        await expect(btn).toContainText(/Completed/i);
        await expect(btn).toHaveClass(/completed/);
    });

    test('Completing a card auto-collapses it and advances to the next not-yet-done card', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await continueToOrganize(page);
        await enterLogSession(page);

        const cards = page.locator('#studioLogList .workout-card');
        // First auto-expanded, second collapsed.
        await expect(cards.nth(0)).toHaveClass(/expanded/);
        await expect(cards.nth(1)).not.toHaveClass(/expanded/);

        await cards.nth(0).locator('.workout-primary-action').click();
        // After the 600ms advance delay: first collapses + carries
        // .logged; second expands to take the user to the next exercise.
        await expect(cards.nth(0)).not.toHaveClass(/expanded/, { timeout: 2000 });
        await expect(cards.nth(0)).toHaveClass(/logged/);
        await expect(cards.nth(1)).toHaveClass(/expanded/, { timeout: 2000 });
    });

    test('Anonymous Complete in Log mode finishes a local-only session (no API call)', async ({ page }) => {
        // Studio Log mode now runs through WorkoutSessionService. For
        // anonymous users (no authService), the service builds a
        // local-only session and completion writes nothing to the
        // network — completed state surfaces in the status banner and
        // the studio flips back to Plan with logState cleared.
        let networkCalls = 0;
        await page.route('**/api/v3/workout-sessions**', async (route) => {
            networkCalls++;
            await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        });

        await page.goto(`${BASE}/workout-studio.html`);
        await continueToOrganize(page);
        // Force anonymous: no dataManager AND no isUserAuthenticated.
        await page.evaluate(() => {
            delete window.dataManager;
            if (window.authService) window.authService.isUserAuthenticated = () => false;
        });

        await enterLogSession(page);
        await page.locator('#studioLogList .workout-card').first().locator('[data-action="mark-done"]').click();
        await page.locator('#studioFabGo').click();

        // End Workout offcanvas now intercepts the Go FAB — confirm the
        // user has to tap "Save Session" before completion lands.
        await expect(page.locator('#completeWorkoutOffcanvas')).toBeAttached({ timeout: 3000 });
        await page.locator('#confirmCompleteBtn').click();

        await expect(page.locator('#studioOrganizeStatus')).toHaveText(/completed/i, { timeout: 5000 });
        // Local-only session means no /workout-sessions HTTP calls at all
        expect(networkCalls).toBe(0);
        // After complete, studio flips back to Plan (Plan/Log toggle reflects)
        await expect(page.locator('#studioViewPlanBtn')).toHaveClass(/is-active/);
    });

    test('Authenticated Complete in Log mode POSTs start + complete to the session endpoints', async ({ page }) => {
        // With an authenticated user, the session lifecycle service
        // creates a session up front (POST /workout-sessions) and then
        // finalizes it (POST /workout-sessions/{id}/complete).
        const calls = { create: null, complete: null };
        await page.route('**/api/v3/workout-sessions', async (route) => {
            if (route.request().method() !== 'POST') return route.continue();
            try { calls.create = JSON.parse(route.request().postData() || '{}'); }
            catch (_) { calls.create = null; }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    id: 'session-test-1',
                    workout_id: calls.create?.workout_id,
                    workout_name: calls.create?.workout_name,
                    status: 'in_progress',
                }),
            });
        });
        await page.route('**/api/v3/workout-sessions/*/complete', async (route) => {
            try { calls.complete = JSON.parse(route.request().postData() || '{}'); }
            catch (_) { calls.complete = null; }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ id: 'session-test-1', status: 'completed' }),
            });
        });
        // History endpoint can stay empty
        await page.route('**/api/v3/workout-sessions/history/**', async (route) => {
            await route.fulfill({ status: 200, contentType: 'application/json',
                body: JSON.stringify({ workout_id: 'x', workout_name: 'x', exercises: {} }) });
        });

        await page.goto(`${BASE}/workout-studio.html`);
        await continueToOrganize(page);
        // Stub the auth surface so the session service follows the
        // authenticated branch.
        await page.evaluate(() => {
            window.authService = {
                isUserAuthenticated: () => true,
                getIdToken: async () => 'test-token',
            };
            // Studio's _ensureLogPrereqs auto-saves the template first
            // when authed without a workoutId; short-circuit that path
            // by planting a workoutId directly so we focus this test on
            // the session endpoints.
            if (window.workoutStudio) window.workoutStudio.workoutId = 'wk-test-1';
        });

        await enterLogSession(page);
        // Give the start call time to land
        await page.waitForTimeout(200);
        await page.locator('#studioLogList .workout-card').first().locator('[data-action="mark-done"]').click();
        await page.locator('#studioFabGo').click();

        // End Workout offcanvas appears first — confirm to actually
        // complete the session.
        await expect(page.locator('#completeWorkoutOffcanvas')).toBeAttached({ timeout: 3000 });
        await page.locator('#confirmCompleteBtn').click();

        await expect(page.locator('#studioOrganizeStatus')).toHaveText(/completed/i, { timeout: 5000 });
        expect(calls.create).toBeTruthy();
        expect(calls.create.session_mode).toBe('quick_log');
        expect(calls.create.workout_id).toBe('wk-test-1');
        expect(calls.complete).toBeTruthy();
        expect(Array.isArray(calls.complete.exercises_performed)).toBe(true);
        expect(calls.complete.exercises_performed.length).toBeGreaterThanOrEqual(1);
    });

    test('End Workout offcanvas opens on Go FAB; values pass through to completeSession', async ({ page }) => {
        // The End Workout bottom-sheet is the same one workout-mode
        // uses to finish a live session. In studio Log mode it gates
        // the Complete action so the user can confirm duration + enter
        // calories before the session is finalized.
        let completePayload = null;
        await page.route('**/api/v3/workout-sessions', async (route) => {
            if (route.request().method() !== 'POST') return route.continue();
            await route.fulfill({
                status: 200, contentType: 'application/json',
                body: JSON.stringify({ id: 'wss-1', status: 'in_progress' }),
            });
        });
        await page.route('**/api/v3/workout-sessions/*/complete', async (route) => {
            try { completePayload = JSON.parse(route.request().postData() || '{}'); }
            catch (_) { completePayload = null; }
            await route.fulfill({
                status: 200, contentType: 'application/json',
                body: JSON.stringify({ id: 'wss-1', status: 'completed' }),
            });
        });
        await page.route('**/api/v3/workout-sessions/history/**', async (route) => {
            await route.fulfill({ status: 200, contentType: 'application/json',
                body: JSON.stringify({ workout_id: 'x', workout_name: 'x', exercises: {} }) });
        });

        await page.goto(`${BASE}/workout-studio.html`);
        await continueToOrganize(page);
        await page.evaluate(() => {
            window.authService = {
                isUserAuthenticated: () => true,
                getIdToken: async () => 'test-token',
            };
            if (window.workoutStudio) window.workoutStudio.workoutId = 'wk-end-offcanvas';
        });

        await enterLogSession(page);
        await page.waitForTimeout(200);
        await page.locator('#studioLogList .workout-card').first().locator('[data-action="mark-done"]').click();
        await page.locator('#studioFabGo').click();

        // Offcanvas attaches and is visible. Title is "Session Complete".
        await expect(page.locator('#completeWorkoutOffcanvas')).toBeAttached({ timeout: 3000 });
        await expect(page.locator('#completeWorkoutOffcanvasLabel')).toContainText(/Session Complete/i);
        // Duration + Calories inputs are present
        await expect(page.locator('#sessionDurationInput')).toBeAttached();
        await expect(page.locator('#sessionCaloriesInput')).toBeAttached();
        // Discard link is hidden (studio has its own Discard FAB; this
        // discard would call into workout-mode's controller which
        // doesn't exist on this page). The hide runs on a short
        // setTimeout after the offcanvas mounts, so poll instead of
        // sampling once.
        await expect.poll(async () =>
            page.locator('#cancelDiscardBtn').evaluate(el => getComputedStyle(el).display),
            { timeout: 3000 }
        ).toBe('none');

        // Type a duration + calories and Save → the values pass through
        // into the completeSession payload.
        await page.locator('#sessionDurationInput').fill('48');
        await page.locator('#sessionCaloriesInput').fill('325');
        await page.locator('#confirmCompleteBtn').click();

        await expect(page.locator('#studioOrganizeStatus')).toHaveText(/completed/i, { timeout: 5000 });
        await expect.poll(() => completePayload, { timeout: 5000 }).toBeTruthy();
        expect(completePayload.duration_minutes).toBe(48);
        expect(completePayload.calories).toBe(325);
    });

    test('End Workout offcanvas dismissed without Save → no completion fires', async ({ page }) => {
        let completed = false;
        await page.route('**/api/v3/workout-sessions/*/complete', async (route) => {
            completed = true;
            await route.fulfill({ status: 200, contentType: 'application/json',
                body: JSON.stringify({ id: 'wss-noop', status: 'completed' }) });
        });

        await page.goto(`${BASE}/workout-studio.html`);
        await continueToOrganize(page);
        await page.evaluate(() => {
            delete window.dataManager;
            if (window.authService) window.authService.isUserAuthenticated = () => false;
        });

        await enterLogSession(page);
        await page.locator('#studioLogList .workout-card').first().locator('[data-action="mark-done"]').click();
        await page.locator('#studioFabGo').click();

        const offcanvas = page.locator('#completeWorkoutOffcanvas');
        await expect(offcanvas).toBeAttached({ timeout: 3000 });

        // Tap the bottom-sheet's Resume (data-bs-dismiss) — the offcanvas
        // closes and nothing should be completed.
        await offcanvas.locator('[data-bs-dismiss="offcanvas"]').first().click();
        await page.waitForTimeout(600);

        expect(completed).toBe(false);
        // Still in Log mode — Plan toggle isn't active
        await expect(page.locator('#studioViewLogBtn')).toHaveClass(/is-active/);
    });

    test('Save Log refuses when no exercise is marked Done (no actuals to record)', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await continueToOrganize(page);
        await page.evaluate(() => { delete window.dataManager; });

        await enterLogSession(page);
        await page.locator('#studioFabGo').click();
        await expect(page.locator('#studioOrganizeStatus')).toContainText(/Mark at least one exercise done/i, { timeout: 5000 });
    });

    test('Go FAB icon + tooltip swap based on view', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await continueToOrganize(page);

        const fab = page.locator('#studioFabGo');
        // Plan view → play icon. Title is "Start workout" when the
        // template is saved + Go is enabled; otherwise a friendlier
        // hint ("Save first to start", etc) — accept either.
        await expect(fab.locator('i')).toHaveClass(/bx-play/);
        await expect(fab).toHaveAttribute('title', /(Start workout|Save first to start)/);

        await enterLogSession(page);
        // Log view → check icon, 'Complete' title (only one possibility
        // here since the session is now active and ≥1 exercise exists).
        await expect(fab.locator('i')).toHaveClass(/bx-check/);
        await expect(fab).toHaveAttribute('title', 'Complete');
    });

    // 3-tab nav (Build | Plan | Log) replaces the legacy Plan/Log
    // toggle + the Complete/Discard/Cancel choice dialog. Tab switches
    // never prompt: the session keeps running across views, and the
    // user finalizes only via the Log Complete FAB.

    test('3-pill view tabs render in the slim header in order Build / Plan / Log, Build active', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('#studioViewBuildBtn')).toBeVisible();
        await expect(page.locator('#studioViewPlanBtn')).toBeVisible();
        await expect(page.locator('#studioViewLogBtn')).toBeVisible();
        // Build is the default active pill on a fresh studio
        await expect(page.locator('#studioViewBuildBtn')).toHaveClass(/is-active/);
        // DOM order matches the visual order: Build, Plan, Log
        const order = await page.locator('.studio-view-tabs > .studio-view-tab').evaluateAll(
            els => els.map(el => el.id)
        );
        expect(order).toEqual([
            'studioViewBuildBtn', 'studioViewPlanBtn', 'studioViewLogBtn',
        ]);
    });

    test('Continue CTA only shows on Build — hidden when switching to Plan or Log', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        // Add 2 exercises on Build → Continue CTA appears
        const rows = page.locator('.studio-row');
        await rows.nth(0).waitFor({ state: 'visible', timeout: 10000 });
        await rows.nth(0).locator('.studio-row-add').click();
        await rows.nth(1).locator('.studio-row-add').click();
        await page.locator('#studioWorkoutNameInput').fill('CTA test');

        const cta = page.locator('#studioContinueCta');
        await expect(cta).toBeVisible();

        // Tap Plan → CTA must disappear (it's a Build-only affordance)
        await page.locator('#studioViewPlanBtn').click();
        await expect(cta).toBeHidden();

        // Tap Log → still hidden
        await page.locator('#studioViewLogBtn').click();
        await expect(cta).toBeHidden();

        // Tap Build → it comes back since the tray still has items
        await page.locator('#studioViewBuildBtn').click();
        await expect(cta).toBeVisible();
    });

    test('Tabs sit outside the title card, full-row, with Plan centered between Build (left) and Log (right)', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await page.waitForLoadState('domcontentloaded');

        // Tabs row is a SIBLING of the slim-header card (not inside it).
        const slimHeaderContains = await page.locator('#studioSlimHeader').evaluate((slim) => {
            return slim.querySelector('.studio-view-tabs') !== null;
        });
        expect(slimHeaderContains).toBe(false);

        // Tabs row sits ABOVE the title card.
        const tabsBottom = await page.locator('.studio-view-tabs').evaluate(el => el.getBoundingClientRect().bottom);
        const headerTop = await page.locator('#studioSlimHeader').evaluate(el => el.getBoundingClientRect().top);
        expect(tabsBottom).toBeLessThanOrEqual(headerTop);

        // The three tabs are justified Build-left, Plan-center, Log-right.
        // We confirm by sampling their bounding-rect centers vs the row's
        // overall horizontal midpoint.
        const rects = await page.locator('.studio-view-tabs > .studio-view-tab').evaluateAll(
            els => els.map(el => {
                const r = el.getBoundingClientRect();
                return { id: el.id, left: r.left, center: r.left + r.width / 2, right: r.right };
            })
        );
        const rowRect = await page.locator('.studio-view-tabs').evaluate(el => {
            const r = el.getBoundingClientRect();
            return { left: r.left, right: r.right, center: r.left + r.width / 2 };
        });
        expect(rects).toHaveLength(3);
        const [build, plan, log] = rects;
        // Build hugs the left edge — within 4px.
        expect(Math.abs(build.left - rowRect.left)).toBeLessThanOrEqual(4);
        // Log hugs the right edge — within 4px.
        expect(Math.abs(log.right - rowRect.right)).toBeLessThanOrEqual(4);
        // Plan is centered — within 4px of the row's midpoint.
        expect(Math.abs(plan.center - rowRect.center)).toBeLessThanOrEqual(4);
    });

    test('Tapping Plan with an empty tray surfaces a flash and stays on Build', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await page.waitForLoadState('domcontentloaded');
        // No exercises added yet → tap Plan.
        await page.locator('#studioViewPlanBtn').click();
        // Cross-view flash appears with the prompt to add something first.
        const flash = page.locator('#studioFlash');
        await expect(flash).toBeVisible();
        await expect(flash).toContainText(/Select an exercise on Build first to start your Plan/i);
        // The user is bounced (or kept) on Build — Plan never activates.
        await expect(page.locator('#studioViewBuildBtn')).toHaveClass(/is-active/);
        await expect(page.locator('#studioViewPlanBtn')).not.toHaveClass(/is-active/);
    });

    test('Tapping Log with an empty tray surfaces the same flash and stays on Build', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await page.waitForLoadState('domcontentloaded');
        // No exercises added yet → tap Log.
        await page.locator('#studioViewLogBtn').click();
        // Same warning mechanism as Plan — cross-view flash.
        const flash = page.locator('#studioFlash');
        await expect(flash).toBeVisible();
        await expect(flash).toContainText(/Select an exercise on Build first to start a workout/i);
        // Bounced back to Build; Log never activates.
        await expect(page.locator('#studioViewBuildBtn')).toHaveClass(/is-active/);
        await expect(page.locator('#studioViewLogBtn')).not.toHaveClass(/is-active/);
        // The Log landing is NOT rendered — the user was redirected
        // before _renderLog ran, so the landing block stays hidden.
        await expect(page.locator('#studioLogLanding')).toBeHidden();
    });

    test('Switching tabs from Log with a dirty session no longer prompts (dialog markup is gone)', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await continueToOrganize(page);

        await enterLogSession(page);
        await page.locator('#studioLogList .workout-card').first().locator('[data-action="mark-done"]').click();

        // The old choice dialog (Complete / Discard / Cancel) is removed.
        await expect(page.locator('#studioModeSwitchDialog')).toHaveCount(0);

        // Tapping Plan switches immediately; the Log tab is no longer
        // active. No confirmation is shown.
        await page.locator('#studioViewPlanBtn').click();
        await expect(page.locator('#studioViewPlanBtn')).toHaveClass(/is-active/);
        await expect(page.locator('#studioViewLogBtn')).not.toHaveClass(/is-active/);
    });

    test('Switching tabs preserves the tray + workout name across views', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await continueToOrganize(page);
        // continueToOrganize put us on Plan view after picking 2 exercises +
        // setting the name to 'Log mode test'.
        const trayChipCount = await page.locator('#studioTrayChips > *').count();
        const nameVal = await page.locator('#studioWorkoutNameInput').inputValue();
        expect(trayChipCount).toBeGreaterThanOrEqual(2);
        expect(nameVal).toBe('Log mode test');

        // Cycle Build → Plan → Log → Build and assert tray + name persist.
        for (const id of ['#studioViewBuildBtn', '#studioViewPlanBtn', '#studioViewLogBtn', '#studioViewBuildBtn']) {
            await page.locator(id).click();
            await expect(page.locator('#studioTrayChips > *')).toHaveCount(trayChipCount);
            await expect(page.locator('#studioWorkoutNameInput')).toHaveValue('Log mode test');
        }
    });

    // Log landing — visible when no session is yet active, shows a
    // Start Workout button + preview, and disappears once Start is
    // tapped (the session list takes over).

    test('Log tab opens to a landing block with workout summary + Start Workout button', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await continueToOrganize(page);

        await page.locator('#studioViewLogBtn').click();
        // Landing visible; session list hidden.
        await expect(page.locator('#studioLogLanding')).toBeVisible();
        await expect(page.locator('#studioLogList')).toBeHidden();
        // Title mirrors the workout name set by continueToOrganize.
        await expect(page.locator('#studioLogLandingTitle')).toHaveText('Log mode test');
        // Meta line reads "<n> exercises" (continueToOrganize adds 2).
        await expect(page.locator('#studioLogLandingMeta')).toHaveText(/2 exercises/);
        // Default "Last completed" line is the not-yet-completed copy.
        await expect(page.locator('#studioLogLandingLast')).toHaveText(/Not yet completed/i);
        // Start button label is "Start Workout" (no persisted session).
        await expect(page.locator('#studioLogStartBtnText')).toHaveText('Start Workout');
    });

    test('Tapping Start Workout begins the session — landing hides, session card list appears', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await continueToOrganize(page);
        await page.locator('#studioViewLogBtn').click();
        await expect(page.locator('#studioLogLanding')).toBeVisible();

        await page.locator('#studioLogStartBtn').click();

        await expect(page.locator('#studioLogLanding')).toBeHidden();
        await expect(page.locator('#studioLogList')).toBeVisible();
        // Session cards mount as studio-cards with Done buttons.
        await expect(page.locator('#studioLogList .workout-card')).toHaveCount(2);
        await expect(page.locator('#studioLogList .workout-primary-action')).toHaveCount(2);
    });

    test('Switching to Plan during a session and returning to Log keeps the session list visible (no landing)', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await continueToOrganize(page);
        await enterLogSession(page);

        // Tab to Plan
        await page.locator('#studioViewPlanBtn').click();
        await expect(page.locator('#studioViewOrganize')).toBeVisible();
        await expect(page.locator('#studioViewLog')).toBeHidden();

        // Tab back to Log — the landing must NOT come back; the user is
        // mid-session and should see their cards.
        await page.locator('#studioViewLogBtn').click();
        await expect(page.locator('#studioLogLanding')).toBeHidden();
        await expect(page.locator('#studioLogList')).toBeVisible();
    });

    test('Log landing is unreachable with an empty tray (bounced via the flash gate)', async ({ page }) => {
        // The old behavior — opening Log on an empty tray to a landing
        // with a disabled Start button — was replaced by a hard gate
        // that mirrors Plan's empty-tray flash. With nothing in the
        // tray the user is redirected back to Build and the landing
        // never gets a chance to paint.
        await page.goto(`${BASE}/workout-studio.html`);
        await page.locator('#studioWorkoutNameInput').fill('Empty');
        await page.locator('#studioViewLogBtn').click();
        await expect(page.locator('#studioLogLanding')).toBeHidden();
        await expect(page.locator('#studioViewBuildBtn')).toHaveClass(/is-active/);
    });
});

test.describe('Workout Studio — session locks + session-scoped adds + skip', () => {
    async function startSession(page, n = 2) {
        const rows = page.locator('.studio-row');
        await rows.nth(0).waitFor({ state: 'visible', timeout: 10000 });
        for (let i = 0; i < n; i++) {
            await rows.nth(i).locator('.studio-row-add').click();
        }
        await page.locator('#studioWorkoutNameInput').fill('Session lock test');
        await page.locator('#studioViewLogBtn').click();
        await page.locator('#studioLogStartBtn').click();
        await expect(page.locator('#studioLogList .workout-card').first()).toBeVisible();
    }

    test('mid-session: Plan card menu has its structure ops blocked with a flash', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await startSession(page);

        // Tab to Plan — cards render with the template menu (Delete etc.)
        await page.locator('#studioViewPlanBtn').click();
        const card = page.locator('#studioOrganizeList .studio-card').first();
        await expect(card).toBeVisible();
        await card.locator('[data-action="menu"]').click();
        await card.locator('[data-action="delete"]').click();

        // Flash explains the lock; the card is still there.
        await expect(page.locator('#studioFlash')).toBeVisible();
        await expect(page.locator('#studioFlash')).toContainText(/Workout in progress/i);
        await expect(page.locator('#studioOrganizeList .studio-card')).toHaveCount(2);
    });

    test('mid-session: tray chip X is blocked (Build view)', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await startSession(page);

        await page.locator('#studioViewBuildBtn').click();
        const chips = page.locator('.studio-tray-chip');
        await expect(chips).toHaveCount(2);
        await chips.first().locator('.studio-tray-chip-remove').click();
        // Chip survives; flash explains.
        await expect(chips).toHaveCount(2);
        await expect(page.locator('#studioFlash')).toContainText(/Workout in progress/i);
    });

    test('mid-session: Build shows the session-add banner and adds are session-scoped', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await startSession(page);

        await page.locator('#studioViewBuildBtn').click();
        // Banner is visible mid-session...
        await expect(page.locator('#studioSessionAddBanner')).toBeVisible();

        // Add a third exercise — success flash names the session.
        await page.locator('.studio-row').nth(2).locator('.studio-row-add').click();
        await expect(page.locator('#studioFlash')).toContainText(/Added .* to this session/i);

        // It renders in the Log session list…
        await page.locator('#studioViewLogBtn').click();
        await expect(page.locator('#studioLogList .workout-card')).toHaveCount(3);

        // …and after Complete it's stripped from the template.
        await page.locator('#studioLogList .workout-card').first()
            .locator('[data-action="mark-done"]').click();
        await page.locator('#studioFabGo').click();
        await expect(page.locator('#completeWorkoutOffcanvas')).toBeAttached({ timeout: 3000 });
        await page.locator('#confirmCompleteBtn').click();
        await expect(page.locator('#studioOrganizeStatus')).toHaveText(/completed/i, { timeout: 5000 });
        // Back on Plan, only the original 2 template exercises remain.
        await expect(page.locator('#studioOrganizeList .studio-card')).toHaveCount(2);
        // Banner is gone now that the session ended.
        await page.locator('#studioViewBuildBtn').click();
        await expect(page.locator('#studioSessionAddBanner')).toBeHidden();
    });

    test('Log card menu offers Skip (not Delete); skipping greys the card + lands in the payload', async ({ page }) => {
        let completePayload = null;
        await page.route('**/api/v3/workout-sessions/*/complete', async (route) => {
            try { completePayload = JSON.parse(route.request().postData() || '{}'); }
            catch (_) { completePayload = null; }
            await route.fulfill({ status: 200, contentType: 'application/json',
                body: JSON.stringify({ id: 's-skip', status: 'completed' }) });
        });
        await page.route('**/api/v3/workout-sessions', async (route) => {
            if (route.request().method() !== 'POST') return route.continue();
            await route.fulfill({ status: 200, contentType: 'application/json',
                body: JSON.stringify({ id: 's-skip', status: 'in_progress' }) });
        });
        await page.route('**/api/v3/workout-sessions/history/**', async (route) => {
            await route.fulfill({ status: 200, contentType: 'application/json',
                body: JSON.stringify({ workout_id: 'x', workout_name: 'x', exercises: {} }) });
        });

        await page.goto(`${BASE}/workout-studio.html`);
        await page.evaluate(() => {
            window.authService = {
                isUserAuthenticated: () => true,
                getIdToken: async () => 'test-token',
            };
            if (window.workoutStudio) window.workoutStudio.workoutId = 'wk-skip-test';
        });
        await startSession(page);

        const cards = page.locator('#studioLogList .workout-card');
        const second = cards.nth(1);
        // Session-mode menu: Skip present, structure ops absent.
        await second.locator('[data-action="menu"]').click();
        await expect(second.locator('[data-action="skip"]')).toBeVisible();
        await expect(second.locator('[data-action="delete"]')).toHaveCount(0);
        await second.locator('[data-action="skip"]').click();

        // The skip-reason offcanvas opens (factory is loaded on this
        // page) — confirm with no reason text.
        const skipConfirm = page.locator('#confirmSkipBtn');
        await expect(skipConfirm).toBeVisible({ timeout: 3000 });
        await skipConfirm.click();

        // Card now renders skipped.
        await expect(page.locator('#studioLogList .workout-card.skipped')).toHaveCount(1);

        // Complete the session → payload carries is_skipped for it.
        await cards.first().locator('[data-action="mark-done"]').click();
        await page.locator('#studioFabGo').click();
        await expect(page.locator('#completeWorkoutOffcanvas')).toBeAttached({ timeout: 3000 });
        await page.locator('#confirmCompleteBtn').click();
        await expect.poll(() => completePayload, { timeout: 5000 }).toBeTruthy();
        const skipped = (completePayload.exercises_performed || []).filter(e => e.is_skipped);
        expect(skipped.length).toBe(1);
    });

    test('Discard FAB mid-session discards the SESSION only — template intact, lands on Log landing', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await startSession(page);

        page.on('dialog', dialog => {
            expect(dialog.message()).toMatch(/session/i);
            dialog.accept();
        });
        await page.locator('#studioFabDiscard').click();

        // Back on the Log landing; session gone but template intact.
        await expect(page.locator('#studioLogLanding')).toBeVisible();
        await expect(page.locator('#studioLogStartBtnText')).toHaveText('Start Workout');
        await page.locator('#studioViewPlanBtn').click();
        await expect(page.locator('#studioOrganizeList .studio-card')).toHaveCount(2);
    });

    test('FAB row is hidden on the Log landing; Save FAB hidden during a session', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        const rows = page.locator('.studio-row');
        await rows.nth(0).waitFor({ state: 'visible', timeout: 10000 });
        await rows.nth(0).locator('.studio-row-add').click();
        await page.locator('#studioWorkoutNameInput').fill('FAB visibility');

        // Log landing → FAB row hidden (Start button is the CTA there).
        await page.locator('#studioViewLogBtn').click();
        await expect(page.locator('#studioLogLanding')).toBeVisible();
        await expect(page.locator('#studioFloatingFabs')).toBeHidden();

        // Start → row shows, but Save is hidden (sessions auto-save).
        await page.locator('#studioLogStartBtn').click();
        await expect(page.locator('#studioFloatingFabs')).toBeVisible();
        await expect(page.locator('#studioFabSave')).toBeHidden();
        await expect(page.locator('#studioFabGo')).toBeVisible();
        await expect(page.locator('#studioFabDiscard')).toBeVisible();
    });

    test('Plan Go FAB saves and switches to the Log tab (no navigation to workout-mode.html)', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        const rows = page.locator('.studio-row');
        await rows.nth(0).waitFor({ state: 'visible', timeout: 10000 });
        await rows.nth(0).locator('.studio-row-add').click();
        await page.locator('#studioWorkoutNameInput').fill('Go to Log test');
        await page.locator('#studioContinueBtn').click();
        await expect(page.locator('#studio')).toHaveAttribute('data-view', 'plan');

        await page.locator('#studioFabGo').click();
        // Still on the studio page, now on the Log tab landing.
        await expect(page).toHaveURL(/workout-studio\.html/);
        await expect(page.locator('#studio')).toHaveAttribute('data-view', 'log');
        await expect(page.locator('#studioLogLanding')).toBeVisible();
    });
});

test.describe('Workout Studio — template promotion, Skip & Replace, session-card extras', () => {
    async function startSession(page, n = 2, name = 'Promo test') {
        const rows = page.locator('.studio-row');
        await rows.nth(0).waitFor({ state: 'visible', timeout: 10000 });
        for (let i = 0; i < n; i++) {
            await rows.nth(i).locator('.studio-row-add').click();
        }
        await page.locator('#studioWorkoutNameInput').fill(name);
        await page.locator('#studioViewLogBtn').click();
        await page.locator('#studioLogStartBtn').click();
        await expect(page.locator('#studioLogList .workout-card').first()).toBeVisible();
    }

    test('End Workout offcanvas shows the "Save changes to workout template" checkbox, off by default', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await startSession(page);
        await page.locator('#studioLogList .workout-card').first()
            .locator('[data-action="mark-done"]').click();
        await page.locator('#studioFabGo').click();
        await expect(page.locator('#completeWorkoutOffcanvas')).toBeAttached({ timeout: 3000 });
        const toggle = page.locator('#saveSessionToTemplateToggle');
        await expect(toggle).toBeAttached();
        await expect(toggle).not.toBeChecked();
    });

    test('checkbox OFF → mid-session add is stripped; checkbox ON → it stays + template saves', async ({ page }) => {
        let savedTemplate = null;
        await page.route('**/api/v3/workouts', async (route) => {
            if (route.request().method() !== 'POST') return route.continue();
            const body = JSON.parse(route.request().postData() || '{}');
            await route.fulfill({ status: 200, contentType: 'application/json',
                body: JSON.stringify({ ...body, id: 'wk-promo' }) });
        });
        await page.route('**/api/v3/workouts/wk-promo', async (route) => {
            if (route.request().method() === 'PUT') {
                savedTemplate = JSON.parse(route.request().postData() || '{}');
                return route.fulfill({ status: 200, contentType: 'application/json',
                    body: JSON.stringify({ ...savedTemplate, id: 'wk-promo' }) });
            }
            return route.continue();
        });
        await page.route('**/api/v3/workout-sessions', async (route) => {
            if (route.request().method() !== 'POST') return route.continue();
            await route.fulfill({ status: 200, contentType: 'application/json',
                body: JSON.stringify({ id: 's-promo', status: 'in_progress' }) });
        });
        await page.route('**/api/v3/workout-sessions/*/complete', async (route) => {
            await route.fulfill({ status: 200, contentType: 'application/json',
                body: JSON.stringify({ id: 's-promo', status: 'completed' }) });
        });
        await page.route('**/api/v3/workout-sessions/history/**', async (route) => {
            await route.fulfill({ status: 200, contentType: 'application/json',
                body: JSON.stringify({ workout_id: 'x', workout_name: 'x', exercises: {} }) });
        });

        await page.goto(`${BASE}/workout-studio.html`);
        await page.evaluate(() => {
            window.authService = {
                isUserAuthenticated: () => true,
                getIdToken: async () => 'test-token',
            };
            window.dataManager = window.dataManager || {};
            window.dataManager.isUserAuthenticated = () => true;
            window.dataManager.getAuthToken = async () => 'test-token';
        });
        await startSession(page, 2, 'Promotion test');

        // Add a third exercise mid-session via Build.
        await page.locator('#studioViewBuildBtn').click();
        await page.locator('.studio-row').nth(2).locator('.studio-row-add').click();
        await page.locator('#studioViewLogBtn').click();
        await expect(page.locator('#studioLogList .workout-card')).toHaveCount(3);

        // Complete WITH the save-to-template checkbox CHECKED.
        await page.locator('#studioLogList .workout-card').first()
            .locator('[data-action="mark-done"]').click();
        await page.locator('#studioFabGo').click();
        await expect(page.locator('#completeWorkoutOffcanvas')).toBeAttached({ timeout: 3000 });
        await page.locator('#saveSessionToTemplateToggle').check();
        await page.locator('#confirmCompleteBtn').click();
        await expect(page.locator('#studioOrganizeStatus')).toHaveText(/completed/i, { timeout: 5000 });

        // The mid-session add SURVIVED into the template (3 plan cards)…
        await expect(page.locator('#studioOrganizeList .studio-card')).toHaveCount(3);
    });

    test('Skip & Replace: menu item skips, swings to Build with banner, pick splices in after the skipped card', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await startSession(page, 3, 'Replace test');

        const cards = page.locator('#studioLogList .workout-card');
        // Capture names: replace the SECOND card so we can assert splice
        // position (replacement must land between #2 and #3).
        const secondName = (await cards.nth(1).locator('.workout-exercise-name').textContent() || '').trim();

        await cards.nth(1).locator('[data-action="menu"]').click();
        await cards.nth(1).locator('[data-action="skip-replace"]').click();

        // Build view with the replace banner naming the skipped exercise.
        await expect(page.locator('#studio')).toHaveAttribute('data-view', 'build');
        await expect(page.locator('#studioReplaceBanner')).toBeVisible();
        await expect(page.locator('#studioReplaceBannerName')).toHaveText(secondName);

        // Pick the 4th catalog exercise as the stand-in.
        await page.locator('.studio-row').nth(3).locator('.studio-row-add').click();

        // Auto-bounced back to Log; 4 cards; the replacement sits at
        // index 2 (right after the skipped source at index 1).
        await expect(page.locator('#studio')).toHaveAttribute('data-view', 'log');
        await expect(page.locator('#studioLogList .workout-card')).toHaveCount(4);
        await expect(page.locator('#studioLogList .workout-card').nth(1)).toHaveClass(/skipped/);
        // Skipped card shows the Replaced-with subline.
        await expect(page.locator('#studioLogList .workout-card').nth(1)
            .locator('.workout-note-preview')).toContainText(/Replaced with/i);
        // Banner cleared.
        await page.locator('#studioViewBuildBtn').click();
        await expect(page.locator('#studioReplaceBanner')).toBeHidden();
    });

    test('Skip & Replace: Cancel returns to Log leaving the exercise skipped', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await startSession(page, 2, 'Replace cancel test');

        const cards = page.locator('#studioLogList .workout-card');
        await cards.nth(0).locator('[data-action="menu"]').click();
        await cards.nth(0).locator('[data-action="skip-replace"]').click();
        await expect(page.locator('#studioReplaceBanner')).toBeVisible();

        await page.locator('#studioReplaceBannerCancel').click();
        await expect(page.locator('#studio')).toHaveAttribute('data-view', 'log');
        await expect(page.locator('#studioLogList .workout-card')).toHaveCount(2);
        await expect(page.locator('#studioLogList .workout-card').nth(0)).toHaveClass(/skipped/);
    });

    test('direction chips set next_weight_direction; note lands in notes — both in the completion payload', async ({ page }) => {
        let completePayload = null;
        await page.route('**/api/v3/workout-sessions', async (route) => {
            if (route.request().method() !== 'POST') return route.continue();
            await route.fulfill({ status: 200, contentType: 'application/json',
                body: JSON.stringify({ id: 's-extras', status: 'in_progress' }) });
        });
        await page.route('**/api/v3/workout-sessions/*/complete', async (route) => {
            try { completePayload = JSON.parse(route.request().postData() || '{}'); }
            catch (_) { completePayload = null; }
            await route.fulfill({ status: 200, contentType: 'application/json',
                body: JSON.stringify({ id: 's-extras', status: 'completed' }) });
        });
        await page.route('**/api/v3/workout-sessions/history/**', async (route) => {
            await route.fulfill({ status: 200, contentType: 'application/json',
                body: JSON.stringify({ workout_id: 'x', workout_name: 'x', exercises: {} }) });
        });

        await page.goto(`${BASE}/workout-studio.html`);
        await page.evaluate(() => {
            window.authService = {
                isUserAuthenticated: () => true,
                getIdToken: async () => 'test-token',
            };
            if (window.workoutStudio) window.workoutStudio.workoutId = 'wk-extras';
        });
        await startSession(page, 2, 'Extras test');

        const first = page.locator('#studioLogList .workout-card').first();
        // Direction chips render in the session card.
        await expect(first.locator('.workout-chip')).toHaveCount(3);
        // Tap "Raise" → chip activates.
        await first.locator('.workout-chip[data-direction="up"]').click();
        await expect(first.locator('.workout-chip[data-direction="up"]')).toHaveClass(/active/);

        // Add a note.
        await first.locator('[data-action="toggle-notes"]').click();
        const noteInput = first.locator('.workout-notes-input');
        await expect(noteInput).toBeVisible();
        await noteInput.fill('Shoulder felt tight on rep 6');
        await noteInput.blur();

        // Complete and verify the payload carries both fields.
        await first.locator('[data-action="mark-done"]').click();
        await page.locator('#studioFabGo').click();
        await expect(page.locator('#completeWorkoutOffcanvas')).toBeAttached({ timeout: 3000 });
        await page.locator('#confirmCompleteBtn').click();
        await expect.poll(() => completePayload, { timeout: 5000 }).toBeTruthy();
        const firstEx = (completePayload.exercises_performed || [])[0];
        expect(firstEx.next_weight_direction).toBe('up');
        expect(firstEx.notes).toBe('Shoulder felt tight on rep 6');
    });

    test('tapping the active direction chip clears it (toggle off)', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await startSession(page, 1, 'Chip toggle test');

        const first = page.locator('#studioLogList .workout-card').first();
        const up = first.locator('.workout-chip[data-direction="up"]');
        await up.click();
        await expect(up).toHaveClass(/active/);
        await up.click();
        await expect(up).not.toHaveClass(/active/);
    });
});

test.describe('Workout Studio — Log mode session timer + Last-session line', () => {
    async function continueToOrganize(page) {
        const rows = page.locator('.studio-row');
        await rows.nth(0).waitFor({ state: 'visible', timeout: 10000 });
        await rows.nth(0).locator('.studio-row-add').click();
        await page.locator('#studioWorkoutNameInput').fill('Timer test');
        await page.locator('#studioContinueBtn').click();
    }

    test('Session timer pill is hidden until a session starts, then stays visible across tab switches', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await continueToOrganize(page);

        // No session yet → timer hidden, regardless of view.
        await expect(page.locator('#studioModeTimer')).toBeHidden();

        // Start a session → timer appears and starts at 00:00.
        await enterLogSession(page);
        const timer = page.locator('#studioModeTimer');
        await expect(timer).toBeVisible();
        await expect(timer.locator('.studio-mode-timer-text')).toHaveText(/^00:00$/);

        // Wait > 1s and confirm the seconds counter advances.
        await page.waitForTimeout(1300);
        const ticked = await timer.locator('.studio-mode-timer-text').textContent();
        expect(ticked).not.toBe('00:00');
        expect(/^\d{2}:\d{2}$/.test(ticked || '')).toBe(true);

        // Tab back to Plan — the session keeps running, so the timer
        // pill STAYS visible (no more mode-toggle hiding it). This is
        // the gym-app expectation: the session continues across views
        // and the user gets light reassurance it's still alive.
        await page.locator('#studioViewPlanBtn').click();
        await expect(timer).toBeVisible();
        const onPlanText = await timer.locator('.studio-mode-timer-text').textContent();
        expect(onPlanText).not.toBe('00:00');

        // Tab back to Log — landing is hidden (session already active),
        // session list is shown, timer still ticking.
        await page.locator('#studioViewLogBtn').click();
        await expect(page.locator('#studioLogLanding')).toBeHidden();
        await expect(timer).toBeVisible();
        const resumedText = await timer.locator('.studio-mode-timer-text').textContent();
        expect(resumedText).not.toBe('00:00');
    });

    test('Last-session weight chip renders on a log card when the controller has history for that exercise', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await continueToOrganize(page);

        // Plant a fake history entry directly in the controller's Map
        // for the exercise name shown in the first plan card (template
        // editor). The Log view will pick this up.
        const firstExerciseName = await page.locator('#studioOrganizeList .studio-card-name').first().textContent();
        await page.evaluate((name) => {
            const ws = window.workoutStudio;
            ws.exerciseHistory.set((name || '').trim(), {
                weight: '185',
                unit: 'lbs',
                daysAgo: 3,
                sessionDate: new Date(Date.now() - 3 * 86400000).toISOString(),
            });
            ws._exerciseHistoryFetched = true;
        }, firstExerciseName);

        // Flip to Log → the planted history shows in the collapsed
        // header's state row ("Last: 185 lbs" chip).
        await enterLogSession(page);
        const card = page.locator('#studioLogList .workout-card').first();
        await expect(card.locator('.workout-state-row')).toContainText('Last: 185 lbs');

        // Plan view's editor cards don't render the Last subtitle —
        // that's a Log-only concern.
        await page.locator('#studioViewPlanBtn').click();
        await expect(page.locator('#studioOrganizeList .workout-state-row')).toHaveCount(0);
    });

    test('Page-2 Import button is hidden in Log mode and visible in Plan mode', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await continueToOrganize(page);

        const importBtn = page.locator('#studioImportPage2Btn');

        // Plan (default) → Import visible
        await expect(importBtn).toBeVisible();

        // Log → Import hides (planning action irrelevant during a live session)
        await enterLogSession(page);
        await expect(importBtn).toBeHidden();

        // Back to Plan → Import returns
        await page.locator('#studioViewPlanBtn').click();
        await expect(importBtn).toBeVisible();
    });
});

test.describe('Workout Studio — compact completed card + library start link', () => {
    async function startSession(page, n = 2, name = 'Compact done test') {
        const rows = page.locator('.studio-row');
        await rows.nth(0).waitFor({ state: 'visible', timeout: 10000 });
        for (let i = 0; i < n; i++) {
            await rows.nth(i).locator('.studio-row-add').click();
        }
        await page.locator('#studioWorkoutNameInput').fill(name);
        await page.locator('#studioViewLogBtn').click();
        await page.locator('#studioLogStartBtn').click();
        await expect(page.locator('#studioLogList .workout-card').first()).toBeVisible();
    }

    test('completed card auto-collapses (body hidden) and carries the .logged visual', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await startSession(page);

        const first = page.locator('#studioLogList .workout-card').first();
        // Pre-Done: card is the auto-expanded one; body visible.
        await expect(first).toHaveClass(/expanded/);
        await expect(first.locator('.workout-card-body')).toBeVisible();

        await first.locator('[data-action="mark-done"]').click();
        await expect(first).toHaveClass(/logged/);
        // After the 600ms auto-advance the body collapses (display: none
        // via the .studio-view-log .workout-card .workout-card-body rule).
        await expect(first).not.toHaveClass(/expanded/, { timeout: 2000 });
        await expect(first.locator('.workout-card-body')).toBeHidden();

        // Collapsed completed card is shorter than the now-expanded
        // next-in-line card.
        const second = page.locator('#studioLogList .workout-card').nth(1);
        const firstH = await first.evaluate(el => el.getBoundingClientRect().height);
        const secondH = await second.evaluate(el => el.getBoundingClientRect().height);
        expect(firstH).toBeLessThan(secondH);
    });

    test('tapping a collapsed-completed card re-expands it so the user can edit / un-complete', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await startSession(page);
        const first = page.locator('#studioLogList .workout-card').first();
        await first.locator('[data-action="mark-done"]').click();
        await expect(first).toHaveClass(/logged/);
        await expect(first).not.toHaveClass(/expanded/, { timeout: 2000 });

        // Tap the (collapsed) header → expand it again.
        await first.locator('.workout-card-header').click();
        await expect(first).toHaveClass(/expanded/);
        await expect(first.locator('.workout-card-body')).toBeVisible();
    });

    test('getWorkoutStartUrl now routes regular workouts to the studio with start=1', async ({ page }) => {
        // The helper lives in workout-card.js, which is loaded on the
        // database / public / dashboard pages — not on the studio
        // itself. Test from a page that actually loads it.
        await page.goto(`${BASE}/workout-database.html`);
        await page.waitForFunction(() => typeof window.getWorkoutStartUrl === 'function', null, { timeout: 10000 });
        const result = await page.evaluate(() => {
            return {
                regular: window.getWorkoutStartUrl({ id: 'wk-123', workout_type: 'standard' }),
                tabata: window.getWorkoutStartUrl({ id: 'wk-tab', workout_type: 'tabata' }),
                noArg: window.getWorkoutStartUrl(),
            };
        });
        expect(result).toBeTruthy();
        // Regular workouts route to the studio's Log entry, not the
        // legacy workout-mode page.
        expect(result.regular).toContain('workout-studio.html');
        expect(result.regular).toContain('id=wk-123');
        expect(result.regular).toContain('start=1');
        expect(result.regular).not.toContain('workout-mode.html');
        // Tabata still owns its own runner.
        expect(result.tabata).toContain('tabata-kettlebell.html');
        // No-arg fallback no longer dumps the user on workout-mode.html.
        expect(result.noArg).toContain('workout-studio.html');
    });

    test('studio honors ?start=1 — auto-jumps to the Log landing after the workout hydrates', async ({ page }) => {
        // Fake a saved workout in localStorage so the studio's load path
        // resolves it without auth / Firebase. data-manager's
        // getLocalStorageWorkouts reads from the "gym_workouts" key.
        await page.goto(`${BASE}/workout-studio.html`);
        await page.evaluate(() => {
            const workout = {
                id: 'auto-start-1',
                name: 'Auto Start',
                description: '',
                tags: [],
                exercise_groups: [
                    { group_id: 'g1', exercises: { a: 'Barbell Bench Press' },
                      sets: '3', reps: '8', rest: '60s' },
                ],
            };
            const existing = JSON.parse(localStorage.getItem('gym_workouts') || '[]');
            localStorage.setItem('gym_workouts', JSON.stringify(
                [...existing.filter(w => w.id !== workout.id), workout]
            ));
        });

        await page.goto(`${BASE}/workout-studio.html?id=auto-start-1&start=1`);
        // After hydration, the controller should land us on the Log
        // landing — the tabs reflect it and the Start button is visible.
        await expect(page.locator('#studio')).toHaveAttribute('data-view', 'log', { timeout: 10000 });
        await expect(page.locator('#studioLogLanding')).toBeVisible();
        await expect(page.locator('#studioLogStartBtn')).toBeVisible();
        // Workout name + exercise count made it through.
        await expect(page.locator('#studioLogLandingTitle')).toHaveText('Auto Start');
        await expect(page.locator('#studioLogLandingMeta')).toHaveText(/1 exercise/);
    });
});
