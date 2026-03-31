// @ts-check
const { test, expect } = require('playwright/test');
const { BASE, waitForAppReady } = require('./fixtures');
const { STANDARD_WORKOUT } = require('./test-data');

/**
 * Helper: load workout mode page with workout data
 */
async function loadWorkoutMode(page) {
  await page.setViewportSize({ width: 375, height: 812 });

  // Pre-populate localStorage with a workout
  await page.goto(`${BASE}/settings.html`);
  await page.evaluate((workout) => {
    localStorage.setItem('gym_workouts', JSON.stringify([workout]));
  }, STANDARD_WORKOUT);

  // Navigate to workout mode
  await page.goto(`${BASE}/workout-mode.html?id=${STANDARD_WORKOUT.id}`);
  await waitForAppReady(page);
  await page.waitForTimeout(3000);
}

test.describe('Calories Field - Session Level', () => {

  test('calories field is NOT rendered in exercise cards', async ({ page }) => {
    await loadWorkoutMode(page);

    // Expand the first exercise card
    const firstCard = page.locator('.workout-card').first();
    await firstCard.click();
    await page.waitForTimeout(500);

    // Calories section should NOT exist on exercise cards
    const caloriesSection = firstCard.locator('.workout-calories-section');
    await expect(caloriesSection).toHaveCount(0);
  });

  test('calories input appears in finish workout offcanvas', async ({ page }) => {
    await loadWorkoutMode(page);

    // Start session if not already started
    const startBtn = page.locator('#startSessionBtn, [data-action="start-session"]');
    if (await startBtn.isVisible()) {
      await startBtn.click();
      await page.waitForTimeout(1000);
    }

    // Click finish workout button
    const finishBtn = page.locator('#finishWorkoutBtn, [data-action="finish-workout"], button:has-text("Finish")');
    if (await finishBtn.isVisible()) {
      await finishBtn.click();
      await page.waitForTimeout(1000);
    }

    // Check for the calories input in the offcanvas
    const caloriesInput = page.locator('#sessionCaloriesInput');
    await expect(caloriesInput).toBeVisible();

    // Verify it accepts numeric input
    await caloriesInput.fill('350');
    await expect(caloriesInput).toHaveValue('350');
  });

  test('updateExerciseCalories method still exists on session service', async ({ page }) => {
    await loadWorkoutMode(page);

    const hasMethod = await page.evaluate(() => {
      const sessionService = window.workoutModeController?.sessionService;
      return typeof sessionService?.updateExerciseCalories === 'function';
    });
    expect(hasMethod).toBe(true);
  });
});
