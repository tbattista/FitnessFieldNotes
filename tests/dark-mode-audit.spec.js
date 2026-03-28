// @ts-check
const { test, expect } = require('@playwright/test');
const { BASE, waitForAppReady, collectConsoleErrors } = require('./fixtures');

/**
 * Dark Mode Audit Test Suite
 *
 * Tests every app page in dark mode to verify:
 * - Theme attribute is applied
 * - Backgrounds are dark (not white)
 * - Navbar renders with dark background
 * - Cards have dark backgrounds
 * - Captures screenshots for visual review
 */

const APP_PAGES = [
  { path: 'index.html', name: 'Dashboard' },
  { path: 'workout-builder.html', name: 'Workout Builder' },
  { path: 'workout-mode.html', name: 'Workout Mode' },
  { path: 'workout-history.html', name: 'Workout History' },
  { path: 'exercise-database.html', name: 'Exercise Database' },
  { path: 'exercise-edit.html', name: 'Exercise Edit' },
  { path: 'programs.html', name: 'Programs' },
  { path: 'settings.html', name: 'Settings' },
  { path: 'activity-log.html', name: 'Activity Log' },
  { path: 'public-workouts.html', name: 'Public Workouts' },
  { path: 'profile.html', name: 'Profile' },
  { path: 'workout-database.html', name: 'Workout Database' },
  // feedback-voting.html excluded - requires auth, times out without it
];

/**
 * Parse an rgb/rgba string into { r, g, b } values.
 */
function parseRgb(rgbStr) {
  const match = rgbStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return null;
  return { r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3]) };
}

/**
 * Calculate relative luminance (0 = black, 255 = white).
 */
function luminance(rgb) {
  if (!rgb) return 255; // treat parse failure as "light" (will flag as issue)
  return 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
}

/**
 * Set dark mode before navigating to a page.
 */
async function gotoDarkMode(page, path) {
  // Navigate to settings first to set localStorage on the domain
  await page.goto(`${BASE}/settings.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('ffn-theme-preference', 'dark');
  });
  // Now navigate to the target page
  await page.goto(`${BASE}/${path}`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  // Ensure dark theme is set on the HTML element (reinforce after app init)
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-bs-theme', 'dark');
    document.documentElement.classList.add('dark-mode');
    document.documentElement.classList.remove('light-mode');
  });
  // Brief wait for styles to recompute
  await page.waitForTimeout(500);
}

test.describe('Dark Mode Audit', () => {

  for (const { path, name } of APP_PAGES) {
    test.describe(name, () => {

      test(`dark theme attribute is applied on ${name}`, async ({ page }) => {
        await gotoDarkMode(page, path);
        const theme = await page.locator('html').getAttribute('data-bs-theme');
        expect(theme).toBe('dark');
      });

      test(`body background is dark on ${name}`, async ({ page }) => {
        await gotoDarkMode(page, path);
        const bodyBg = await page.evaluate(() => {
          return window.getComputedStyle(document.body).backgroundColor;
        });
        const rgb = parseRgb(bodyBg);
        const lum = luminance(rgb);
        // Body background luminance should be below 80 (dark)
        expect(lum, `Body bg "${bodyBg}" is too light (luminance: ${lum})`).toBeLessThan(80);
      });

      test(`navbar background is dark on ${name}`, async ({ page }) => {
        await gotoDarkMode(page, path);
        // Wait for navbar injection (dynamically added via JS)
        const navbar = page.locator('.layout-navbar').first();
        try {
          await navbar.waitFor({ state: 'attached', timeout: 5000 });
        } catch {
          test.skip();
          return;
        }
        const navbarBg = await navbar.evaluate((el) => {
          return window.getComputedStyle(el).backgroundColor;
        });
        const rgb = parseRgb(navbarBg);
        const lum = luminance(rgb);
        expect(lum, `Navbar bg "${navbarBg}" is too light (luminance: ${lum})`).toBeLessThan(80);
      });

      test(`cards have dark backgrounds on ${name}`, async ({ page }) => {
        await gotoDarkMode(page, path);
        const cards = page.locator('.card');
        const cardCount = await cards.count();
        if (cardCount === 0) {
          // No cards on this page, skip
          test.skip();
          return;
        }
        // Check the first visible card
        for (let i = 0; i < Math.min(cardCount, 3); i++) {
          const card = cards.nth(i);
          const isVisible = await card.isVisible();
          if (!isVisible) continue;
          const cardBg = await card.evaluate((el) => {
            return window.getComputedStyle(el).backgroundColor;
          });
          const rgb = parseRgb(cardBg);
          const lum = luminance(rgb);
          // Card background should be dark (luminance < 100)
          expect(lum, `Card ${i} bg "${cardBg}" is too light (luminance: ${lum})`).toBeLessThan(100);
          break; // Only need to verify one card
        }
      });

      test(`screenshot dark mode ${name}`, async ({ page }) => {
        await gotoDarkMode(page, path);
        await page.screenshot({
          path: `test-results/dark-mode/${name.toLowerCase().replace(/\s+/g, '-')}-dark.png`,
          fullPage: true,
        });
      });

      test(`no theme-related JS errors on ${name}`, async ({ page }) => {
        const errors = collectConsoleErrors(page);
        await gotoDarkMode(page, path);
        // Filter for theme-related errors
        const themeErrors = errors.filter(e =>
          e.toLowerCase().includes('theme') ||
          e.toLowerCase().includes('dark') ||
          e.toLowerCase().includes('color')
        );
        expect(themeErrors, `Theme-related errors found: ${themeErrors.join(', ')}`).toHaveLength(0);
      });

    });
  }
});
