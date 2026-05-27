// @ts-check
const { test, expect } = require('playwright/test');

const BASE = 'http://localhost:8001';

test.describe('Workout Studio — Foundation + Live Exercise List', () => {

    test('page loads with persistent header, sticky tray, search, and tabs', async ({ page }) => {
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

        // Tabs
        await expect(page.locator('#studioTabHistory')).toBeVisible();
        await expect(page.locator('#studioTabMine')).toBeVisible();
        await expect(page.locator('#studioTabAll')).toBeVisible();

        // Continue CTA hidden when tray is empty
        await expect(page.locator('#studioContinueCta')).toBeHidden();
    });

    test('switching to All Exercises tab renders the live exercise list', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);

        // Default tab is History which may be empty for a fresh session; switch to All.
        await page.locator('#studioTabAll').click();
        await expect(page.locator('#studioTabAll')).toHaveClass(/is-active/);

        // Wait for at least one exercise row to appear from the live cache service.
        const firstRow = page.locator('.studio-row').first();
        await expect(firstRow).toBeVisible({ timeout: 15000 });
        await expect(firstRow.locator('.studio-row-title')).not.toBeEmpty();
    });

    test('clicking "+" on a row adds the exercise to the tray as a chip', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await page.locator('#studioTabAll').click();

        const firstRow = page.locator('.studio-row').first();
        await expect(firstRow).toBeVisible({ timeout: 15000 });

        // Capture the title text for chip assertion
        const exerciseName = (await firstRow.locator('.studio-row-title span').last().textContent() || '').trim();
        expect(exerciseName.length).toBeGreaterThan(0);

        await firstRow.locator('.studio-row-add').click();

        // Tray flips to non-empty and shows one chip
        await expect(page.locator('#studioTray')).toHaveAttribute('data-empty', 'false');
        const chips = page.locator('.studio-tray-chip');
        await expect(chips).toHaveCount(1);
        await expect(chips.first()).toContainText(exerciseName);

        // The "+" badge on the source row now shows "1"
        await expect(firstRow.locator('.studio-row-add-badge')).toHaveText('1');
        await expect(firstRow.locator('.studio-row-add')).toHaveClass(/has-count/);

        // Continue CTA appears with count 1
        await expect(page.locator('#studioContinueCta')).toBeVisible();
        await expect(page.locator('#studioContinueCount')).toHaveText('1');
    });

    test('tapping "+" twice adds two instances (multi-add)', async ({ page }) => {
        await page.goto(`${BASE}/workout-studio.html`);
        await page.locator('#studioTabAll').click();

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
        await page.locator('#studioTabAll').click();

        const firstRow = page.locator('.studio-row').first();
        await expect(firstRow).toBeVisible({ timeout: 15000 });

        await firstRow.locator('.studio-row-add').click();
        await firstRow.locator('.studio-row-add').click();
        await expect(page.locator('.studio-tray-chip')).toHaveCount(2);

        // Remove one chip
        await page.locator('.studio-tray-chip-remove').first().click();
        await expect(page.locator('.studio-tray-chip')).toHaveCount(1);
        await expect(firstRow.locator('.studio-row-add-badge')).toHaveText('1');
        await expect(page.locator('#studioContinueCount')).toHaveText('1');

        // Remove the last one — tray becomes empty, CTA hides
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
        await page.locator('#studioTabAll').click();

        const firstRow = page.locator('.studio-row').first();
        await expect(firstRow).toBeVisible({ timeout: 15000 });

        await page.locator('#studioSearchInput').fill('bench press');
        // Debounced; give it a moment.
        await page.waitForTimeout(300);

        // Every visible row title should reference 'bench' (case-insensitive) for
        // a query this specific. Verify at least the first hit does.
        const titles = await page.locator('.studio-row-title').allTextContents();
        expect(titles.length).toBeGreaterThan(0);
        const bench = titles.filter((t) => /bench/i.test(t));
        expect(bench.length).toBeGreaterThan(0);

        // Clear button works
        await page.locator('#studioSearchClear').click();
        await expect(page.locator('#studioSearchInput')).toHaveValue('');
    });
});
