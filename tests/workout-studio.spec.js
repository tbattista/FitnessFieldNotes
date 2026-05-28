// @ts-check
const { test, expect } = require('playwright/test');

const BASE = 'http://localhost:8001';

test.describe('Workout Studio — Foundation + Live Exercise List', () => {

    test('page loads with persistent header, sticky tray, search, and filter chips', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);

        // Header pieces
        await expect(page.locator('#studioBackBtn')).toBeVisible();
        await expect(page.locator('#studioWorkoutPicker')).toContainText('New Workout');
        await expect(page.locator('#studioModePlan')).toHaveClass(/is-active/);
        await expect(page.locator('#studioModeLog')).not.toHaveClass(/is-active/);

        // Tray starts empty
        await expect(page.locator('#studioTray')).toHaveAttribute('data-empty', 'true');
        await expect(page.locator('#studioTrayEmpty')).toBeVisible();

        // Search input
        await expect(page.locator('#studioSearchInput')).toBeVisible();

        // Filter chips (replacing the previous tab strip)
        await expect(page.locator('#studioFilterAll')).toBeVisible();
        await expect(page.locator('#studioFilterRecent')).toBeVisible();
        await expect(page.locator('#studioFilterMine')).toBeVisible();
        await expect(page.locator('#studioFilterAll')).toHaveClass(/is-active/);

        // Continue CTA hidden when tray is empty
        await expect(page.locator('#studioContinueCta')).toBeHidden();
    });

    test('default "All" filter renders the live exercise list immediately', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);

        // No tab click required — "All" is the default, exercises should populate.
        const firstRow = page.locator('.studio-row').first();
        await expect(firstRow).toBeVisible({ timeout: 15000 });
        await expect(firstRow.locator('.studio-row-title')).not.toBeEmpty();
    });

    test('switching filter chips changes active state and section title', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await expect(page.locator('#studioFilterAll')).toHaveClass(/is-active/);
        await expect(page.locator('#studioSectionTitle')).toHaveText('Exercises');

        await page.locator('#studioFilterRecent').click();
        await expect(page.locator('#studioFilterRecent')).toHaveClass(/is-active/);
        await expect(page.locator('#studioFilterAll')).not.toHaveClass(/is-active/);
        await expect(page.locator('#studioSectionTitle')).toHaveText('Recent');

        await page.locator('#studioFilterMine').click();
        await expect(page.locator('#studioFilterMine')).toHaveClass(/is-active/);
        await expect(page.locator('#studioSectionTitle')).toHaveText('My Exercises');

        await page.locator('#studioFilterAll').click();
        await expect(page.locator('#studioFilterAll')).toHaveClass(/is-active/);
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

    test('Continue button navigates to Page 2 with one row per tray instance', async ({ page }) => {
        await addNFromGrid(page, 3);

        await expect(page.locator('#studioContinueCta')).toBeVisible();
        await page.locator('#studioContinueBtn').click();

        // View flips to organize
        await expect(page.locator('#studio')).toHaveAttribute('data-view', 'organize');
        await expect(page.locator('#studioViewOrganize')).toBeVisible();
        await expect(page.locator('#studioViewSelect')).toBeHidden();

        // Floating CTA hides on Page 2 (Save action is in-flow)
        await expect(page.locator('#studioContinueCta')).toBeHidden();

        // One row per tray instance + default field values populated
        await expect(page.locator('.studio-org-row')).toHaveCount(3);
        const firstRow = page.locator('.studio-org-row').first();
        await expect(firstRow.locator('input[data-field="sets"]')).toHaveValue('3');
        await expect(firstRow.locator('input[data-field="reps"]')).toHaveValue('8-12');
        await expect(firstRow.locator('input[data-field="rest"]')).toHaveValue('60s');
        await expect(firstRow.locator('input[data-field="weight"]')).toHaveValue('');

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

    test('header back button on Page 2 returns to Page 1 instead of leaving the studio', async ({ page }) => {
        await addNFromGrid(page, 1);
        await page.locator('#studioContinueBtn').click();
        await expect(page.locator('#studio')).toHaveAttribute('data-view', 'organize');

        await page.locator('#studioBackBtn').click();
        await expect(page.locator('#studio')).toHaveAttribute('data-view', 'select');
    });

    test('removing the last tray item from Page 2 bounces back to Page 1', async ({ page }) => {
        await addNFromGrid(page, 1);
        await page.locator('#studioContinueBtn').click();
        await expect(page.locator('.studio-org-row')).toHaveCount(1);

        await page.locator('.studio-org-row-remove').first().click();
        await expect(page.locator('#studio')).toHaveAttribute('data-view', 'select');
        await expect(page.locator('#studioTray')).toHaveAttribute('data-empty', 'true');
    });

    test('editing fields persists when navigating back and forward', async ({ page }) => {
        await addNFromGrid(page, 1);
        await page.locator('#studioContinueBtn').click();

        const firstRow = page.locator('.studio-org-row').first();
        await firstRow.locator('input[data-field="sets"]').fill('5');
        await firstRow.locator('input[data-field="reps"]').fill('5');
        await firstRow.locator('input[data-field="weight"]').fill('185');
        await firstRow.locator('input[data-field="rest"]').fill('120s');

        await page.locator('#studioOrganizeBack').click();
        await page.locator('#studioContinueBtn').click();

        const reopened = page.locator('.studio-org-row').first();
        await expect(reopened.locator('input[data-field="sets"]')).toHaveValue('5');
        await expect(reopened.locator('input[data-field="reps"]')).toHaveValue('5');
        await expect(reopened.locator('input[data-field="weight"]')).toHaveValue('185');
        await expect(reopened.locator('input[data-field="rest"]')).toHaveValue('120s');
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

        await page.locator('#studioOrganizeName').fill('Studio Test Push Day');
        await page.locator('.studio-org-row').first().locator('input[data-field="weight"]').fill('135');

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
