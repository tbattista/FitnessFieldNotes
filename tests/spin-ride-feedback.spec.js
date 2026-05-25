// @ts-check
const { test, expect } = require('playwright/test');
const { BASE } = require('./fixtures');

/**
 * Spin Ride end-of-ride feedback widget tests.
 *
 * These tests verify the widget DOM is wired up correctly and the
 * feedback service surface is exposed on window. The full interactive
 * flow (clicking End Ride -> rating -> submit) requires a real auth
 * session and is exercised manually; here we cover what we can
 * deterministically check without a Firebase backend.
 */

test.describe('Spin Ride feedback widget', () => {
  test('finished state markup contains rating widget and 5 stars', async ({ page }) => {
    await page.goto(`${BASE}/spin-ride`);
    await page.waitForLoadState('domcontentloaded');

    // Widget is part of the static markup inside #finishedState. It's
    // hidden along with the rest of the finished state until End Ride
    // fires, so we check the DOM is attached rather than visible.
    await expect(page.locator('#rideFeedbackWidget')).toBeAttached();
    await expect(page.locator('#rideFeedbackStars .ride-feedback-star')).toHaveCount(5);
    await expect(page.locator('#rideFeedbackComment')).toBeAttached();
    await expect(page.locator('#rideFeedbackSubmitBtn')).toBeAttached();

    // Each star button must declare its rating value for accessibility/wire-up.
    for (let i = 1; i <= 5; i++) {
      await expect(
        page.locator(`#rideFeedbackStars .ride-feedback-star[data-rating="${i}"]`),
      ).toHaveCount(1);
    }
  });

  test('spinRideFeedbackService is exposed on window and validates input', async ({ page }) => {
    await page.goto(`${BASE}/spin-ride`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    const hasService = await page.evaluate(() => {
      return !!(window.spinRideFeedbackService
        && typeof window.spinRideFeedbackService.submit === 'function');
    });
    expect(hasService).toBe(true);

    // Bad ratings must be rejected before any Firestore call happens.
    const result = await page.evaluate(async () => {
      try {
        await window.spinRideFeedbackService.submit({
          ridePlan: { duration_minutes: 10, difficulty: 'moderate' },
          rating: 0,
          comment: '',
        });
        return 'unexpectedly succeeded';
      } catch (e) {
        return e.message;
      }
    });
    expect(result).toMatch(/rating/i);
  });

  test('admin page route serves HTML', async ({ page }) => {
    const response = await page.goto(`${BASE}/spin-ride-feedback-admin`);
    expect(response.status()).toBe(200);
    // Auth gate will alert+redirect before the admin UI loads, but the
    // page itself should render the static markup (which we check for).
    const html = await response.text();
    expect(html).toContain('Spin Ride Feedback Admin');
    expect(html).toContain('spin-ride-feedback-admin-service.js');
  });
});
