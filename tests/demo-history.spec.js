import { test, expect } from '@playwright/test';

test.describe('Demo Account History Tab', () => {
  test.setTimeout(60000);

  test('history page loads workout sessions for demo user', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    // Sign in as demo user
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');

    const dashboard = page.locator('#authenticatedDashboard');
    await expect(dashboard).toBeVisible({ timeout: 25000 });

    // Go directly to history page
    await page.goto('/workout-history.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(8000);

    // Content should be visible (not error or empty state)
    const contentVisible = await page.locator('#historyContent').isVisible().catch(() => false);
    const errorVisible = await page.locator('#historyErrorState').isVisible().catch(() => false);

    expect(errorVisible).toBe(false);
    expect(contentVisible).toBe(true);

    // Should have workout sessions loaded (not just cardio)
    const apiState = await page.evaluate(() => {
      const state = window.ffn?.workoutHistory;
      const workoutSessions = (state?.sessions || []).filter(s => s._sessionType === 'strength');
      return {
        total: state?.sessions?.length || 0,
        workout: workoutSessions.length,
      };
    });

    expect(apiState.total).toBeGreaterThan(0);
    expect(apiState.workout).toBeGreaterThan(0);

    // Session entries should be rendered in the DOM
    const sessionEntries = await page.locator('.session-entry').count();
    expect(sessionEntries).toBeGreaterThan(0);

    // No page errors
    const toFixedErrors = errors.filter((e) => e.includes('toFixed'));
    expect(toFixedErrors).toHaveLength(0);
  });
});
