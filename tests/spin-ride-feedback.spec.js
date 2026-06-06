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

  test('clicking a star fills it and enables the submit button (regression)', async ({ page }) => {
    // Regression for: stars on the feedback page didn't respond to clicks.
    // Root cause was setupRideFeedbackWidget capturing references to the
    // star + submit buttons BEFORE cloning them — so the click handler
    // updated detached DOM nodes the user never saw.
    await page.goto(`${BASE}/spin-ride`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    // Reveal the finished state and invoke the widget setup directly via
    // the test hook (avoids the auth-gated ride flow).
    await page.evaluate(() => {
      ['selectState', 'generatingState', 'rideState', 'authRequired', 'errorState'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.classList.add('d-none');
      });
      document.getElementById('finishedState').classList.remove('d-none');
      window.__spinRideTestHooks.setupRideFeedbackWidget({
        ridePlan: { title: 'Repro Ride', duration_minutes: 10, difficulty: 'moderate', segments: [] },
        segmentsCompleted: 1,
        actualSeconds: 60,
        includeAllOuts: false,
      });
    });

    // Submit starts disabled, no stars filled.
    await expect(page.locator('#rideFeedbackSubmitBtn')).toBeDisabled();
    await expect(
      page.locator('#rideFeedbackStars .ride-feedback-star[data-rating="4"] i.bxs-star'),
    ).toHaveCount(0);

    // Click the 4th star.
    await page.locator('#rideFeedbackStars .ride-feedback-star[data-rating="4"]').click();

    // Stars 1..4 should now be FILLED in the visible DOM, star 5 still empty.
    for (const r of [1, 2, 3, 4]) {
      await expect(
        page.locator(`#rideFeedbackStars .ride-feedback-star[data-rating="${r}"] i`),
      ).toHaveClass(/bxs-star/);
    }
    await expect(
      page.locator('#rideFeedbackStars .ride-feedback-star[data-rating="5"] i'),
    ).toHaveClass(/bx-star/);

    // Submit button should be enabled.
    await expect(page.locator('#rideFeedbackSubmitBtn')).toBeEnabled();
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
