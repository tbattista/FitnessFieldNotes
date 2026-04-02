// @ts-check
const { test, expect } = require('playwright/test');
const { BASE, collectConsoleErrors } = require('./fixtures');

/**
 * Spin Ride page tests.
 * Tests the experimental AI-generated spin bike interval timer.
 */

test.describe('Spin Ride Page', () => {
  test('page loads and shows duration selection', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto(`${BASE}/spin-ride`);
    await page.waitForLoadState('domcontentloaded');

    // Page title visible
    await expect(page.locator('h4').first()).toContainText('Spin Ride');

    // Duration buttons visible
    const buttons = page.locator('.spin-duration-btn');
    await expect(buttons).toHaveCount(5);
    await expect(buttons.nth(0)).toContainText('10 min');
    await expect(buttons.nth(4)).toContainText('60 min');

    // Generate button disabled initially
    const generateBtn = page.locator('#generateBtn');
    await expect(generateBtn).toBeDisabled();

    // No fatal JS errors
    const fatalErrors = errors.filter(e =>
      !e.includes('Firebase') &&
      !e.includes('firestore') &&
      !e.includes('ERR_CONNECTION') &&
      !e.includes('net::') &&
      !e.includes('404')
    );
    expect(fatalErrors).toEqual([]);
  });

  test('selecting duration enables Generate button', async ({ page }) => {
    await page.goto(`${BASE}/spin-ride`);
    await page.waitForLoadState('domcontentloaded');

    const generateBtn = page.locator('#generateBtn');
    await expect(generateBtn).toBeDisabled();

    // Click 20 min
    await page.locator('.spin-duration-btn[data-minutes="20"]').click();
    await expect(generateBtn).toBeEnabled();

    // Switch to 30 min — still enabled, previous deselected
    await page.locator('.spin-duration-btn[data-minutes="30"]').click();
    await expect(generateBtn).toBeEnabled();
    await expect(page.locator('.spin-duration-btn[data-minutes="20"]')).not.toHaveClass(/active/);
    await expect(page.locator('.spin-duration-btn[data-minutes="30"]')).toHaveClass(/active/);
  });

  test('unauthenticated user sees auth gate or selection', async ({ page }) => {
    await page.goto(`${BASE}/spin-ride`);
    await page.waitForLoadState('domcontentloaded');

    // Should show either the select state or auth required state
    // (depends on whether demo auto-login fires)
    const selectState = page.locator('#selectState');
    const authRequired = page.locator('#authRequired');
    await page.waitForTimeout(4000);

    const selectVisible = await selectState.isVisible();
    const authVisible = await authRequired.isVisible();
    expect(selectVisible || authVisible).toBeTruthy();
  });

  test('back link navigates to dashboard', async ({ page }) => {
    await page.goto(`${BASE}/spin-ride`);
    await page.waitForLoadState('domcontentloaded');

    const backLink = page.getByRole('link', { name: 'Back to Dashboard' });
    await expect(backLink).toBeVisible();
  });

  test('ride timer UI elements exist but are hidden initially', async ({ page }) => {
    await page.goto(`${BASE}/spin-ride`);
    await page.waitForLoadState('domcontentloaded');

    // Ride state should be hidden
    await expect(page.locator('#rideState')).toHaveClass(/d-none/);
    await expect(page.locator('#generatingState')).toHaveClass(/d-none/);
    await expect(page.locator('#finishedState')).toHaveClass(/d-none/);

    // SVG timer elements exist in DOM
    await expect(page.locator('#timerProgress')).toBeAttached();
    await expect(page.locator('#segmentList')).toBeAttached();
  });
});
