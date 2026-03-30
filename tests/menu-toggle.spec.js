// @ts-check
const { test, expect } = require('playwright/test');
const { BASE, waitForAppReady } = require('./fixtures');

test.describe('Menu Toggle Button', () => {

  test.describe('Mobile (375x812)', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test('menu toggle opens and closes sidebar', async ({ page }) => {
      await page.goto(`${BASE}/index.html`);
      await waitForAppReady(page);

      const layoutMenu = page.locator('#layout-menu');
      const toggleBtn = page.locator('.layout-menu-toggle').first();

      // Menu should start closed on mobile
      await expect(layoutMenu).not.toHaveClass(/menu-open/);

      // Click toggle to open
      await toggleBtn.click();
      await expect(layoutMenu).toHaveClass(/menu-open/);

      // Click toggle again to close
      await toggleBtn.click();
      await expect(layoutMenu).not.toHaveClass(/menu-open/);
    });

    test('overlay closes the menu', async ({ page }) => {
      await page.goto(`${BASE}/index.html`);
      await waitForAppReady(page);

      const layoutMenu = page.locator('#layout-menu');
      const toggleBtn = page.locator('.layout-menu-toggle').first();
      const overlay = page.locator('.layout-overlay');

      // Open menu
      await toggleBtn.click();
      await expect(layoutMenu).toHaveClass(/menu-open/);
      await expect(overlay).toHaveClass(/active/);

      // Click overlay to close
      await overlay.click({ force: true });
      await expect(layoutMenu).not.toHaveClass(/menu-open/);
      await expect(overlay).not.toHaveClass(/active/);
    });

    test('menu toggle works on multiple pages', async ({ page }) => {
      const pages = ['index.html', 'workout-history.html', 'exercise-database.html'];

      for (const pagePath of pages) {
        await page.goto(`${BASE}/${pagePath}`);
        await waitForAppReady(page);

        const layoutMenu = page.locator('#layout-menu');
        const toggleBtn = page.locator('.layout-menu-toggle').first();

        // Open
        await toggleBtn.click();
        await expect(layoutMenu).toHaveClass(/menu-open/);

        // Close
        await toggleBtn.click();
        await expect(layoutMenu).not.toHaveClass(/menu-open/);
      }
    });

    test('body overflow is restored after closing menu', async ({ page }) => {
      await page.goto(`${BASE}/index.html`);
      await waitForAppReady(page);

      const toggleBtn = page.locator('.layout-menu-toggle').first();

      // Open menu - body overflow should be hidden
      await toggleBtn.click();
      const overflowOpen = await page.evaluate(() => document.body.style.overflow);
      expect(overflowOpen).toBe('hidden');

      // Close menu - body overflow should be cleared
      await toggleBtn.click();
      const overflowClosed = await page.evaluate(() => document.body.style.overflow);
      expect(overflowClosed).toBe('');
    });
  });

  test.describe('Desktop (1280x800)', () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test('menu toggle collapses sidebar on desktop', async ({ page }) => {
      await page.goto(`${BASE}/index.html`);
      await waitForAppReady(page);

      const toggleBtn = page.locator('.layout-menu-toggle').first();

      // Click toggle on desktop
      await toggleBtn.click();
      const hasCollapsed = await page.evaluate(() =>
        document.documentElement.classList.contains('desktop-menu-collapsed')
      );
      expect(hasCollapsed).toBe(true);

      // Click again to expand
      await toggleBtn.click();
      const stillCollapsed = await page.evaluate(() =>
        document.documentElement.classList.contains('desktop-menu-collapsed')
      );
      expect(stillCollapsed).toBe(false);
    });
  });
});
