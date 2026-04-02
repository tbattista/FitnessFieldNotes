import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.describe('Demo Auto Sign-In (Per-Visitor)', () => {
  // Provisioning ~47 Firestore docs per visitor takes 3-5s; generous timeouts needed
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
  });

  test('anonymous visitors are auto-signed into a unique demo account', async ({ page }) => {
    await page.goto('/');
    // Wait for Firebase + demo auto sign-in (2s delay + provisioning ~3-5s)
    await page.waitForTimeout(12000);

    const uid = await page.evaluate(() => window.firebaseAuth?.currentUser?.uid);
    expect(uid).toMatch(/^demo-/);
  });

  test('demo user sees authenticated dashboard (not landing page)', async ({ page }) => {
    await page.goto('/');

    const dashboard = page.locator('#authenticatedDashboard');
    await expect(dashboard).toBeVisible({ timeout: 25000 });

    const landing = page.locator('#unauthenticatedWelcome');
    await expect(landing).toBeHidden();
  });

  test('demo user sees demo mode banner', async ({ page }) => {
    await page.goto('/');

    const dashboard = page.locator('#authenticatedDashboard');
    await expect(dashboard).toBeVisible({ timeout: 25000 });

    const demoBanner = page.locator('#demoBanner');
    await expect(demoBanner).toBeVisible({ timeout: 5000 });
    await expect(demoBanner).toContainText('Demo Mode');
  });

  test('?landing param forces landing page even when signed in', async ({ page }) => {
    await page.goto('/?landing');
    await page.waitForTimeout(4000);

    const landing = page.locator('#unauthenticatedWelcome');
    await expect(landing).toBeVisible({ timeout: 5000 });

    const dashboard = page.locator('#authenticatedDashboard');
    await expect(dashboard).toBeHidden();
  });

  test('demo-token API returns unique UIDs with tokens', async ({ page }) => {
    const resp1 = await page.request.post('/api/v3/auth/demo-token');
    const resp2 = await page.request.post('/api/v3/auth/demo-token');

    expect(resp1.ok()).toBeTruthy();
    expect(resp2.ok()).toBeTruthy();

    const body1 = await resp1.json();
    const body2 = await resp2.json();

    expect(body1.token).toBeTruthy();
    expect(body1.uid).toMatch(/^demo-/);
    expect(body2.uid).toMatch(/^demo-/);
    expect(body1.uid).not.toBe(body2.uid);
  });

  test('demo user can modify their own sandbox data', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(10000);

    const token = await page.evaluate(async () => {
      const user = window.firebaseAuth?.currentUser;
      return user ? await user.getIdToken() : null;
    });

    if (token) {
      const response = await page.request.post('/api/v3/firebase/workouts', {
        headers: { 'Authorization': `Bearer ${token}` },
        data: { name: 'My Custom Workout', exercise_groups: [] },
      });
      // Per-visitor accounts can freely create workouts
      expect(response.ok()).toBeTruthy();
    }
  });

});
