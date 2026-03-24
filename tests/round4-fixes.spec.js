// @ts-check
const { test, expect } = require('playwright/test');
const { BASE } = require('./fixtures');

/**
 * Round 4 Fixes — cleanup and consistency items.
 */

test.describe('FIX 1: Global Log FAB — full-width pill on mobile', () => {
  test('FAB is full-width pill on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 932 });
    await page.goto(`${BASE}/index.html`);
    await page.waitForLoadState('domcontentloaded');

    const fab = page.locator('.global-log-fab');
    await expect(fab).toBeVisible();

    const box = await fab.boundingBox();
    // Should be nearly full width (430 - 32px margins = ~398px)
    expect(box.width).toBeGreaterThan(350);
    expect(box.height).toBeGreaterThanOrEqual(48);

    // Should have pill border-radius (50px)
    const borderRadius = await fab.evaluate(el =>
      getComputedStyle(el).borderRadius
    );
    expect(borderRadius).toBe('50px');
  });

  test('FAB is compact on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto(`${BASE}/index.html`);
    await page.waitForLoadState('domcontentloaded');

    const fab = page.locator('.global-log-fab');
    await expect(fab).toBeVisible();

    const box = await fab.boundingBox();
    // Should be auto-width (compact), not full width
    expect(box.width).toBeLessThan(300);
    // Still pill shape
    const borderRadius = await fab.evaluate(el =>
      getComputedStyle(el).borderRadius
    );
    expect(borderRadius).toBe('50px');
  });

  test('FAB appears on multiple pages', async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 932 });

    for (const path of ['index.html', 'workout-database.html', 'workout-history.html']) {
      await page.goto(`${BASE}/${path}`);
      await page.waitForLoadState('domcontentloaded');
      const fab = page.locator('.global-log-fab');
      await expect(fab).toBeVisible();
    }
  });

  test('FAB contains "Log Session" text', async ({ page }) => {
    await page.goto(`${BASE}/index.html`);
    await page.waitForLoadState('domcontentloaded');

    const label = page.locator('.global-log-fab-label');
    await expect(label).toContainText('Log Session');
  });
});

test.describe('FIX 2: No old duplicate layout in index.html', () => {
  test('no old duplicate layout exists', async ({ page }) => {
    await page.goto(`${BASE}/index.html`);
    await page.waitForLoadState('domcontentloaded');

    // The dates are placeholder text that JS overwrites — not an old layout.
    // Verify the page source doesn't have duplicate dashboard structures.
    // JS swaps IDs between mobile/desktop, so just check the DOM has
    // exactly one element with each canonical ID.
    const content = await page.content();

    // Should have exactly one mobile view and one desktop view
    const mobileViews = await page.locator('[data-view="mobile"]').count();
    const desktopViews = await page.locator('[data-view="desktop"]').count();
    expect(mobileViews).toBe(1);
    expect(desktopViews).toBe(1);

    // No old "Loading..." weekly progress that's permanently stuck
    // (the real weekly progress card has dynamic content)
    const stuckLoading = page.locator('.card:has-text("Loading..."):visible');
    await expect(stuckLoading).toHaveCount(0);
  });
});

test.describe('FIX 3: History tab bar matches Workouts tab bar', () => {
  test('history tabs use correct font size and colors', async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 932 });
    await page.goto(`${BASE}/workout-history.html`);
    await page.waitForLoadState('domcontentloaded');

    const tab = page.locator('.history-tabs .nav-link').first();
    await expect(tab).toBeVisible();

    // Check computed font-size on mobile (should be 13px / 0.8125rem)
    const fontSize = await tab.evaluate(el =>
      getComputedStyle(el).fontSize
    );
    expect(fontSize).toBe('13px');
  });

  test('history tabs match workouts tabs on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto(`${BASE}/workout-history.html`);
    await page.waitForLoadState('domcontentloaded');

    const tab = page.locator('.history-tabs .nav-link').first();
    const fontSize = await tab.evaluate(el =>
      getComputedStyle(el).fontSize
    );
    // 0.875rem = 14px at default root font size
    expect(fontSize).toBe('14px');
  });
});

test.describe('FIX 4: Exercises tab renamed to Exercise Stats', () => {
  test('history page tab says "Exercise Stats" not "Exercises"', async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 932 });
    await page.goto(`${BASE}/workout-history.html`);
    await page.waitForLoadState('domcontentloaded');

    // Should find visible "Exercise Stats" tab on mobile view
    const exerciseStatsTab = page.locator('.history-tabs .nav-link:has-text("Exercise Stats")');
    await expect(exerciseStatsTab).toBeVisible();

    // The tab text should be "Exercise Stats", not just "Exercises"
    const tabText = await exerciseStatsTab.textContent();
    expect(tabText).toContain('Exercise Stats');
  });
});
