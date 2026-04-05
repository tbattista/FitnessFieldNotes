import { test, expect } from '@playwright/test';

test.describe('Demo Account History Tab', () => {
  test.setTimeout(60000);

  test('history tab loads without weight_change.toFixed error', async ({ page }) => {
    // Collect console errors
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');

    // Wait for demo sign-in and dashboard
    const dashboard = page.locator('#authenticatedDashboard');
    await expect(dashboard).toBeVisible({ timeout: 25000 });

    // The History tab should be visible and active by default
    const historyTab = page.locator('text=History').first();
    await expect(historyTab).toBeVisible({ timeout: 10000 });
    await historyTab.click();

    // Wait for history content to load - should NOT show error state
    await page.waitForTimeout(5000);

    // Verify no "Error Loading History" message is shown
    const errorHeading = page.locator('text=Error Loading History');
    await expect(errorHeading).toHaveCount(0);

    // Verify no toFixed errors occurred
    const toFixedErrors = errors.filter((e) => e.includes('toFixed'));
    expect(toFixedErrors).toHaveLength(0);
  });
});
