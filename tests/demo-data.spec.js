import { test, expect } from '@playwright/test';

test.describe('Demo Auto Sign-In', () => {

  test.beforeEach(async ({ page }) => {
    // Clear any existing auth state
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
  });

  test('anonymous visitors are auto-signed into demo account', async ({ page }) => {
    await page.goto('/');
    // Wait for Firebase + demo auto sign-in (2s delay + fetch + auth)
    await page.waitForTimeout(8000);

    // Should be authenticated as demo user
    const uid = await page.evaluate(() => window.firebaseAuth?.currentUser?.uid);
    expect(uid).toBe('reviewer-demo-user');
  });

  test('demo user sees authenticated dashboard (not landing page)', async ({ page }) => {
    await page.goto('/');

    // Wait for auto sign-in and page render
    const dashboard = page.locator('#authenticatedDashboard');
    await expect(dashboard).toBeVisible({ timeout: 15000 });

    // Landing page should be hidden
    const landing = page.locator('#unauthenticatedWelcome');
    await expect(landing).toBeHidden();
  });

  test('demo user sees demo mode banner', async ({ page }) => {
    await page.goto('/');

    // Wait for dashboard to appear (proves auto sign-in worked)
    const dashboard = page.locator('#authenticatedDashboard');
    await expect(dashboard).toBeVisible({ timeout: 15000 });

    const demoBanner = page.locator('#demoBanner');
    await expect(demoBanner).toBeVisible({ timeout: 5000 });
    await expect(demoBanner).toContainText('Demo Mode');
  });

  test('demo-token API endpoint returns a valid token', async ({ page }) => {
    const response = await page.request.post('/api/v3/auth/demo-token');
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.token).toBeTruthy();
  });

});
