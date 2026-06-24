// @ts-check
const { test, expect } = require('playwright/test');

const BASE = 'http://localhost:8001';
const STORAGE_KEY = 'ffn:betaBanner:dismissed:v1-2026-06';

test.describe('Beta banner', () => {

    test.beforeEach(async ({ page }) => {
        // Each test starts with a clean dismissal slate so the banner
        // actually appears (otherwise localStorage from a previous test
        // run would hide it).
        await page.addInitScript((key) => {
            try { localStorage.removeItem(key); } catch (_) {}
        }, STORAGE_KEY);
    });

    test('renders at the top of the home page with BETA pill, message, and dismiss X', async ({ page }) => {
        await page.goto(`${BASE}/index.html`);
        const banner = page.locator('#ffnBetaBanner');
        await expect(banner).toBeVisible({ timeout: 5000 });
        await expect(banner.locator('.ffn-beta-banner-label')).toContainText(/BETA/);
        await expect(banner.locator('.ffn-beta-banner-text')).toContainText(/work in progress/i);
        await expect(banner.locator('.ffn-beta-banner-dismiss')).toBeVisible();
    });

    test('sits above the navbar — first element child of <body>', async ({ page }) => {
        await page.goto(`${BASE}/index.html`);
        await page.waitForSelector('#ffnBetaBanner', { timeout: 5000 });
        const firstId = await page.evaluate(() => document.body.firstElementChild?.id || '');
        expect(firstId).toBe('ffnBetaBanner');
    });

    test('dismiss X hides the banner and writes the persistence flag to localStorage', async ({ page }) => {
        await page.goto(`${BASE}/index.html`);
        const banner = page.locator('#ffnBetaBanner');
        await expect(banner).toBeVisible();
        await banner.locator('.ffn-beta-banner-dismiss').click();
        await expect(banner).toHaveCount(0);
        // Flag persisted so subsequent loads in the same browser stay hidden.
        // (Reload-persistence isn't testable here because beforeEach's
        // addInitScript would re-clear the key on the new navigation —
        // the localStorage assertion is the actual contract.)
        const stored = await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY);
        expect(stored).toBe('true');
    });

    test('appears on workout-studio as well as the home page', async ({ page }) => {
        // We already verified the home page in earlier tests; this covers
        // a second navbar-injection page so we know the wiring landed
        // across the file set, not just on index.html. Other pages
        // (public-workouts, terms, privacy) keep the 'load' event pending
        // on Firebase hydration in this sandbox, which doesn't matter for
        // banner correctness — that's covered by the first test on /.
        await page.goto(`${BASE}/workout-studio.html`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#ffnBetaBanner')).toBeVisible({ timeout: 10000 });
    });

    test('does NOT appear on the auth pages (no navbar there, no banner either)', async ({ page }) => {
        await page.goto(`${BASE}/auth-login-basic.html`);
        await page.waitForTimeout(800);
        await expect(page.locator('#ffnBetaBanner')).toHaveCount(0);
    });

    test('FFNBetaBanner.show() / hide() manual hooks work', async ({ page }) => {
        await page.goto(`${BASE}/index.html`);
        await page.waitForSelector('#ffnBetaBanner', { timeout: 5000 });
        // Hide via hook
        await page.evaluate(() => window.FFNBetaBanner.hide());
        await expect(page.locator('#ffnBetaBanner')).toHaveCount(0);
        // Show via hook
        await page.evaluate(() => window.FFNBetaBanner.show());
        await expect(page.locator('#ffnBetaBanner')).toBeVisible();
    });
});
