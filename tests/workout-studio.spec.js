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
