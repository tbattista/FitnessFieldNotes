// @ts-check
const { test, expect } = require('playwright/test');
const { BASE, collectConsoleErrors } = require('./fixtures');

/**
 * Round 3 Fixes — verifies all issues from the app review are resolved.
 */

test.describe('FIX 3: No Browse Workouts in header', () => {
  test('navbar does not contain Browse Workouts link', async ({ page }) => {
    await page.goto(`${BASE}/index.html`);
    await page.waitForLoadState('domcontentloaded');

    const browseLink = page.locator('a:has-text("Browse Workouts")').first();
    // The navbar Browse Workouts link should not exist
    // (landing page hero CTA is fine — we only removed the navbar one)
    const navbarBrowse = page.locator('.navbar a:has-text("Browse Workouts")');
    await expect(navbarBrowse).toHaveCount(0);
  });

  test('no Browse Workouts on workout-database page', async ({ page }) => {
    await page.goto(`${BASE}/workout-database.html`);
    await page.waitForLoadState('domcontentloaded');

    const navbarBrowse = page.locator('.navbar a:has-text("Browse Workouts")');
    await expect(navbarBrowse).toHaveCount(0);
  });
});

test.describe('FIX 4: Landing page stats bar', () => {
  test('stats bar displays "No Credit Card" clearly', async ({ page }) => {
    await page.goto(`${BASE}/index.html`);
    await page.waitForLoadState('domcontentloaded');

    const statsSection = page.locator('.lp-stats');
    await expect(statsSection).toBeVisible();

    // Check that "No Credit Card" appears as the stat number
    const statNumber = page.locator('.lp-stat-number:has-text("No Credit Card")');
    await expect(statNumber).toBeVisible();
  });
});

test.describe('FIX 5: Page title says Workouts not Library', () => {
  test('workout-database page title is Workouts', async ({ page }) => {
    await page.goto(`${BASE}/workout-database.html`);
    await expect(page).toHaveTitle(/Workouts - Fitness Field Notes/);
  });
});

test.describe('FIX 2: Consistent FAB on all pages', () => {
  const pages = [
    { path: 'index.html', name: 'Home' },
    { path: 'workout-database.html', name: 'Workouts' },
    { path: 'workout-history.html', name: 'History' },
    { path: 'exercise-database.html', name: 'Exercises' },
  ];

  for (const { path, name } of pages) {
    test(`FAB is a compact right-aligned pill on ${name} page (mobile)`, async ({ page }) => {
      await page.setViewportSize({ width: 430, height: 932 });
      await page.goto(`${BASE}/${path}`);
      await page.waitForLoadState('domcontentloaded');
      // Wait for menu injection
      await page.waitForTimeout(1500);

      const fab = page.locator('#globalLogFab');
      // FAB may not appear on every page if excluded, but if it exists check styling
      const count = await fab.count();
      if (count > 0) {
        await expect(fab).toBeVisible();
        // Should have the label with "+ Log Session" text
        const label = fab.locator('.global-log-fab-label');
        await expect(label).toBeVisible();
        await expect(label).toHaveText('+ Log Session');
        // Check it's pill-shaped (border-radius: 50px)
        const borderRadius = await fab.evaluate(el => getComputedStyle(el).borderRadius);
        expect(borderRadius).toBe('50px');
        // Check it's right-aligned (not full-width)
        const styles = await fab.evaluate(el => {
          const cs = getComputedStyle(el);
          return { left: cs.left, right: cs.right, width: cs.width };
        });
        expect(styles.left).toBe('auto');
        // Check body has padding class for content visibility
        const hasPaddingClass = await page.evaluate(() =>
          document.body.classList.contains('has-global-log-fab')
        );
        expect(hasPaddingClass).toBe(true);
      }
    });
  }
});

test.describe('FIX 7: History page no stale Loading text', () => {
  test('empty history shows clean empty state without Loading text', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000); // Wait for data load to complete

    // The page title should not say "Loading..."
    const workoutName = page.locator('#workoutName');
    const text = await workoutName.textContent();
    expect(text).not.toBe('Loading...');

    // If empty state is shown, loading state should be hidden
    const emptyState = page.locator('#historyEmptyState');
    const loadingState = page.locator('#historyLoadingState');
    const emptyVisible = await emptyState.isVisible().catch(() => false);
    if (emptyVisible) {
      await expect(loadingState).not.toBeVisible();
    }
  });
});

test.describe('FIX 1: Build mode auto-start', () => {
  test('workout-mode.html?mode=build does not redirect to library', async ({ page }) => {
    await page.goto(`${BASE}/workout-mode.html?mode=build`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    // Should still be on workout-mode.html (not redirected to workout-database)
    const url = page.url();
    expect(url).toContain('workout-mode');
    expect(url).not.toContain('workout-database');
  });

  test('bottom bar has only Exercise and Finish buttons', async ({ page }) => {
    await page.goto(`${BASE}/workout-mode.html`);
    await page.waitForLoadState('domcontentloaded');

    // Check that Note and Reorder buttons are NOT in the bottom bar
    const bottomBar = page.locator('#workoutModeBottomBar');
    const noteBtn = bottomBar.locator('[data-action="add-note"]');
    const reorderBtn = bottomBar.locator('[data-action="reorder"]');
    await expect(noteBtn).toHaveCount(0);
    await expect(reorderBtn).toHaveCount(0);

    // Exercise and Finish buttons should exist
    const exerciseBtn = bottomBar.locator('[data-action="add-exercise"]');
    const finishBtn = bottomBar.locator('[data-action="end"]');
    await expect(exerciseBtn).toHaveCount(1);
    await expect(finishBtn).toHaveCount(1);
  });
});
