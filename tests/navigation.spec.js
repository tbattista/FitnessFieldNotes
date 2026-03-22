// @ts-check
const { test, expect } = require('playwright/test');
const { BASE, waitForAppReady } = require('./fixtures');

test.describe('Navigation - Sidebar', () => {

  test('sidebar has 4 nav items: Home, Workouts, History, Exercises', async ({ page }) => {
    await page.goto(`${BASE}/index.html`);
    await waitForAppReady(page);

    const menu = page.locator('#layout-menu');
    await expect(menu).toBeAttached();

    // Verify the 4 nav items exist
    const menuItems = menu.locator('.menu-item');
    await expect(menuItems).toHaveCount(4);

    // Verify correct links within the nav element (not the brand link)
    const nav = menu.locator('nav[aria-label="Main navigation"]');
    await expect(nav.locator('a[href*="index.html"]')).toBeAttached();
    await expect(nav.locator('a[href*="workout-database.html"]')).toBeAttached();
    await expect(nav.locator('a[href*="workout-history.html"]')).toBeAttached();
    await expect(nav.locator('a[href*="exercise-database.html"]')).toBeAttached();
  });

  test('sidebar has Navigation and Data Management section headers', async ({ page }) => {
    await page.goto(`${BASE}/index.html`);
    await waitForAppReady(page);

    const headers = page.locator('#layout-menu .menu-header');
    await expect(headers).toHaveCount(2);
    await expect(headers.nth(0)).toHaveText('Navigation');
    await expect(headers.nth(1)).toHaveText('Data Management');
  });

  test('sidebar wraps menu in semantic nav element', async ({ page }) => {
    await page.goto(`${BASE}/index.html`);
    await waitForAppReady(page);

    const nav = page.locator('#layout-menu nav[aria-label="Main navigation"]');
    await expect(nav).toBeAttached();
  });

  test('active page is highlighted with aria-current', async ({ page }) => {
    await page.goto(`${BASE}/index.html`);
    await waitForAppReady(page);

    const activeItem = page.locator('#layout-menu .menu-item.active[aria-current="page"]');
    await expect(activeItem).toBeAttached();
    await expect(activeItem.locator('.text-truncate')).toHaveText('Home');
  });

  test('workout-builder page highlights Workouts in sidebar', async ({ page }) => {
    await page.goto(`${BASE}/workout-builder.html`);
    await waitForAppReady(page);

    const activeItem = page.locator('#layout-menu .menu-item.active');
    await expect(activeItem.locator('.text-truncate')).toHaveText('Workouts');
  });

  test('removed nav items are no longer present', async ({ page }) => {
    await page.goto(`${BASE}/index.html`);
    await waitForAppReady(page);

    const menu = page.locator('#layout-menu');
    // These should all be removed
    await expect(menu.locator('a[href*="activity-log.html"]')).toHaveCount(0);
    await expect(menu.locator('a[href*="workout-mode.html"]')).toHaveCount(0);
    await expect(menu.locator('a[href*="workout-builder.html"]')).toHaveCount(0);
    await expect(menu.locator('a[href*="programs.html"]')).toHaveCount(0);
    await expect(menu.locator('a[href*="public-workouts.html"]')).toHaveCount(0);
  });
});

test.describe('Navigation - Workouts Tab Bar', () => {

  test('tab bar shows on workout-database with My Workouts active', async ({ page }) => {
    await page.goto(`${BASE}/workout-database.html`);
    await waitForAppReady(page);

    const tabBar = page.locator('.workouts-tab-bar');
    await expect(tabBar).toBeVisible();

    const activeTab = tabBar.locator('.nav-link.active');
    await expect(activeTab).toHaveText(/My Workouts/);
    await expect(activeTab).toHaveAttribute('aria-current', 'page');
  });

  test('tab bar shows on programs with Programs active', async ({ page }) => {
    await page.goto(`${BASE}/programs.html`);
    await waitForAppReady(page);

    const tabBar = page.locator('.workouts-tab-bar');
    await expect(tabBar).toBeVisible();

    const activeTab = tabBar.locator('.nav-link.active');
    await expect(activeTab).toHaveText(/Programs/);
    await expect(activeTab).toHaveAttribute('aria-current', 'page');
  });

  test('tab bar shows on public-workouts with Explore active', async ({ page }) => {
    await page.goto(`${BASE}/public-workouts.html`);
    await waitForAppReady(page);

    const tabBar = page.locator('.workouts-tab-bar');
    await expect(tabBar).toBeVisible();

    const activeTab = tabBar.locator('.nav-link.active');
    await expect(activeTab).toHaveText(/Explore/);
    await expect(activeTab).toHaveAttribute('aria-current', 'page');
  });

  test('tab bar has 3 tabs with correct links', async ({ page }) => {
    await page.goto(`${BASE}/workout-database.html`);
    await waitForAppReady(page);

    const tabBar = page.locator('.workouts-tab-bar');
    const tabs = tabBar.locator('.nav-link');
    await expect(tabs).toHaveCount(3);

    await expect(tabBar.locator('a[href*="workout-database.html"]')).toBeAttached();
    await expect(tabBar.locator('a[href*="programs.html"]')).toBeAttached();
    await expect(tabBar.locator('a[href*="public-workouts.html"]')).toBeAttached();
  });

  test('clicking Programs tab navigates to programs page', async ({ page }) => {
    await page.goto(`${BASE}/workout-database.html`);
    await waitForAppReady(page);

    await page.locator('.workouts-tab-bar a[href*="programs.html"]').click();
    await page.waitForURL(/programs\.html/);
  });

  test('tab bar uses semantic nav with aria-label', async ({ page }) => {
    await page.goto(`${BASE}/workout-database.html`);
    await waitForAppReady(page);

    const nav = page.locator('nav[aria-label="Workouts sections"]');
    await expect(nav).toBeAttached();

    const tablist = nav.locator('[role="tablist"]');
    await expect(tablist).toBeAttached();
  });

  test('tab bar is NOT present on non-workout pages', async ({ page }) => {
    await page.goto(`${BASE}/index.html`);
    await waitForAppReady(page);

    await expect(page.locator('.workouts-tab-bar')).toHaveCount(0);
  });

  test('sidebar highlights Workouts on all tab pages', async ({ page }) => {
    for (const url of ['workout-database.html', 'programs.html', 'public-workouts.html']) {
      await page.goto(`${BASE}/${url}`);
      await waitForAppReady(page);

      const activeItem = page.locator('#layout-menu .menu-item.active');
      await expect(activeItem.locator('.text-truncate')).toHaveText('Workouts');
    }
  });
});

test.describe('Navigation - Global Log FAB', () => {

  test('log FAB is visible on home page', async ({ page }) => {
    await page.goto(`${BASE}/index.html`);
    await waitForAppReady(page);

    const fab = page.locator('.global-log-fab');
    await expect(fab).toBeVisible();
  });

  test('log FAB is visible on workout-database', async ({ page }) => {
    await page.goto(`${BASE}/workout-database.html`);
    await waitForAppReady(page);

    const fab = page.locator('.global-log-fab');
    await expect(fab).toBeVisible();
  });

  test('log FAB is a button that opens bottom sheet', async ({ page }) => {
    await page.goto(`${BASE}/index.html`);
    await waitForAppReady(page);

    const fab = page.locator('.global-log-fab');
    // Should be a button, not a link
    await expect(fab).toHaveAttribute('type', 'button');

    // Click should open the log session offcanvas
    await fab.click();
    await page.waitForTimeout(500);
    const offcanvas = page.locator('#logSessionOffcanvas');
    await expect(offcanvas).toBeVisible();

    // Should have 4 logging options
    const rows = offcanvas.locator('[data-log-action]');
    await expect(rows).toHaveCount(4);
  });

  test('log FAB has accessible label', async ({ page }) => {
    await page.goto(`${BASE}/index.html`);
    await waitForAppReady(page);

    const fab = page.locator('.global-log-fab');
    await expect(fab).toHaveAttribute('aria-label', 'Log a workout');
  });

  test('log FAB is NOT present on workout-builder', async ({ page }) => {
    await page.goto(`${BASE}/workout-builder.html`);
    await waitForAppReady(page);

    await expect(page.locator('.global-log-fab')).toHaveCount(0);
  });
});
