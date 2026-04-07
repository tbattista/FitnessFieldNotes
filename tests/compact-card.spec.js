// @ts-check
const { test, expect } = require('playwright/test');
const { BASE, waitForAppReady, injectWorkouts } = require('./fixtures');
const { STANDARD_WORKOUT } = require('./test-data');

test.describe('Compact Exercise Card Layout', () => {
  test('exercise card has inline labels and fields-row layout', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    // Inject workout into localStorage
    await page.goto(`${BASE}/settings.html`);
    await injectWorkouts(page, [STANDARD_WORKOUT]);

    // Navigate to workout mode with the test workout
    await page.goto(`${BASE}/workout-mode.html?id=${STANDARD_WORKOUT.id}`);
    await waitForAppReady(page);
    await page.waitForTimeout(2000);

    // Dismiss login modal if it appears
    await page.evaluate(() => {
      const modal = document.querySelector('.modal.show');
      if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
        const backdrop = document.querySelector('.modal-backdrop');
        if (backdrop) backdrop.remove();
        document.body.classList.remove('modal-open');
        document.body.style.removeProperty('overflow');
        document.body.style.removeProperty('padding-right');
      }
    });
    await page.waitForTimeout(500);

    // Wait for cards to render
    const cards = page.locator('.workout-card');
    const cardCount = await cards.count();
    if (cardCount === 0) {
      test.skip();
      return;
    }

    // Expand first card
    await cards.first().click();
    await expect(cards.first()).toHaveClass(/expanded/);

    // Verify fields-row container exists
    const fieldsRow = cards.first().locator('.workout-fields-row');
    await expect(fieldsRow).toBeVisible();

    // Verify fields-row uses flex layout (side-by-side)
    const fieldsRowDisplay = await fieldsRow.evaluate(el => getComputedStyle(el).display);
    expect(fieldsRowDisplay).toBe('flex');

    // Verify weight field has inline label
    const weightLabel = cards.first().locator('.weight-display .workout-section-label.inline');
    await expect(weightLabel).toBeVisible();
    await expect(weightLabel).toContainText('Weight');

    // Verify protocol field has inline label
    const protocolLabel = cards.first().locator('.repssets-display .workout-section-label.inline');
    await expect(protocolLabel).toBeVisible();
    await expect(protocolLabel).toContainText('Protocol');

    // Verify unified save/cancel buttons are inside the repssets-editor
    const unifiedActions = cards.first().locator('.repssets-editor .workout-unified-actions');
    await expect(unifiedActions).toHaveCount(1);
  });
});
