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

test.describe('Calories Burned Field', () => {

  test('updateExerciseCalories method exists on session service', async ({ page }) => {
    await loadWorkoutMode(page);

    const hasMethod = await page.evaluate(() => {
      const sessionService = window.workoutModeController?.sessionService;
      return typeof sessionService?.updateExerciseCalories === 'function';
    });
    expect(hasMethod).toBe(true);
  });

  test('calories field is rendered in exercise cards', async ({ page }) => {
    await loadWorkoutMode(page);

    // Expand the first exercise card
    const firstCard = page.locator('.workout-card').first();
    await firstCard.click();
    await page.waitForTimeout(500);

    // Check that the calories section exists
    const caloriesSection = firstCard.locator('.workout-calories-section');
    await expect(caloriesSection).toBeVisible();

    // Check section label
    const label = caloriesSection.locator('.workout-section-label');
    await expect(label).toContainText('Calories Burned');
  });

  test('calories value is saved to session state', async ({ page }) => {
    await loadWorkoutMode(page);

    const exerciseName = await page.evaluate(() => {
      const workout = JSON.parse(localStorage.getItem('gym_workouts') || '[]')[0];
      return workout?.exercise_groups?.[0]?.exercises?.a || null;
    });

    expect(exerciseName).toBeTruthy();

    // Save calories via JS API
    const result = await page.evaluate(({ name }) => {
      const sessionService = window.workoutModeController?.sessionService;
      if (!sessionService) return { error: 'no sessionService' };

      sessionService.updateExerciseCalories(name, 250);
      const data = sessionService.getExerciseWeight(name);
      return { calories: data?.calories_burned };
    }, { name: exerciseName });

    expect(result.calories).toBe(250);
  });

  test('calories field shows display and edit modes', async ({ page }) => {
    await loadWorkoutMode(page);

    // Expand the first exercise card
    const firstCard = page.locator('.workout-card').first();
    await firstCard.click();
    await page.waitForTimeout(500);

    const caloriesField = firstCard.locator('.workout-calories-field').first();

    // Display mode should be visible, editor hidden
    await expect(caloriesField.locator('.calories-display')).toBeVisible();
    await expect(caloriesField.locator('.calories-editor')).toBeHidden();

    // Click display to enter edit mode
    await caloriesField.locator('.calories-display').click();
    await page.waitForTimeout(300);

    // Editor should now be visible
    await expect(caloriesField.locator('.calories-editor')).toBeVisible();
    await expect(caloriesField.locator('.calories-display')).toBeHidden();
  });
});
