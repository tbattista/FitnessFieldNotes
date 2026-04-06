// @ts-check
const { test, expect } = require('playwright/test');
const { BASE, waitForAppReady } = require('./fixtures');
const { CARDIO_WORKOUT } = require('./test-data');

/**
 * Helper: load workout mode with cardio workout
 */
async function loadCardioWorkout(page) {
  await page.setViewportSize({ width: 375, height: 812 });

  await page.goto(`${BASE}/settings.html`);
  await page.evaluate((workout) => {
    localStorage.setItem('gym_workouts', JSON.stringify([workout]));
  }, CARDIO_WORKOUT);

  await page.goto(`${BASE}/workout-mode.html?id=${CARDIO_WORKOUT.id}`);
  await waitForAppReady(page);
  await page.waitForTimeout(3000);
}

test.describe('Activity Card Inline Editing', () => {

  test('activity card renders with display fields and edit button', async ({ page }) => {
    await loadCardioWorkout(page);

    const cardioCard = page.locator('.workout-card[data-card-type="cardio"]');
    await expect(cardioCard).toBeVisible();

    // Pen icon should be present
    const editBtn = cardioCard.locator('.workout-edit-btn');
    await expect(editBtn).toBeVisible();

    // Display fields should be visible
    const displayFields = cardioCard.locator('.activity-fields-display');
    await expect(displayFields).toBeVisible();

    // Editor should be hidden
    const editor = cardioCard.locator('.activity-fields-editor');
    await expect(editor).toBeHidden();
  });

  test('clicking pen icon expands card and enters edit mode', async ({ page }) => {
    await loadCardioWorkout(page);

    const cardioCard = page.locator('.workout-card[data-card-type="cardio"]');

    // Click the pen icon
    const editBtn = cardioCard.locator('.workout-edit-btn');
    await editBtn.click();
    await page.waitForTimeout(300);

    // Card should be expanded
    await expect(cardioCard).toHaveClass(/expanded/);

    // Editor should now be visible
    const editor = cardioCard.locator('.activity-fields-editor');
    await expect(editor).toBeVisible();

    // Display fields should be hidden
    const displayFields = cardioCard.locator('.activity-fields-display');
    await expect(displayFields).toBeHidden();

    // Save and cancel buttons should be visible
    const saveBtn = cardioCard.locator('.activity-unified-save-btn');
    await expect(saveBtn).toBeVisible();
    const cancelBtn = cardioCard.locator('.activity-unified-cancel-btn');
    await expect(cancelBtn).toBeVisible();
  });

  test('clicking display fields enters edit mode', async ({ page }) => {
    await loadCardioWorkout(page);

    const cardioCard = page.locator('.workout-card[data-card-type="cardio"]');

    // Expand the card first
    await cardioCard.click();
    await page.waitForTimeout(300);

    // Click on display fields area
    const displayFields = cardioCard.locator('.activity-fields-display');
    await displayFields.click();
    await page.waitForTimeout(300);

    // Editor should be visible
    const editor = cardioCard.locator('.activity-fields-editor');
    await expect(editor).toBeVisible();
  });

  test('cancel button exits edit mode without saving', async ({ page }) => {
    await loadCardioWorkout(page);

    const cardioCard = page.locator('.workout-card[data-card-type="cardio"]');

    // Enter edit mode via pen icon
    const editBtn = cardioCard.locator('.workout-edit-btn');
    await editBtn.click();
    await page.waitForTimeout(300);

    // Modify duration
    const durationInput = cardioCard.locator('.activity-edit-duration');
    await durationInput.fill('45');

    // Click cancel
    const cancelBtn = cardioCard.locator('.activity-unified-cancel-btn');
    await cancelBtn.click();
    await page.waitForTimeout(300);

    // Editor should be hidden
    const editor = cardioCard.locator('.activity-fields-editor');
    await expect(editor).toBeHidden();

    // Display should be back
    const displayFields = cardioCard.locator('.activity-fields-display');
    await expect(displayFields).toBeVisible();
  });

  test('save button saves inline edits and updates display', async ({ page }) => {
    await loadCardioWorkout(page);

    // Start a session first so changes can be saved
    await page.evaluate(() => {
      const sessionService = window.workoutModeController?.sessionService;
      if (!sessionService) return;

      sessionService.currentSession = {
        id: 'test-edit-session',
        workoutId: 'test-workout-cardio',
        workoutName: 'Test Cardio Session',
        startedAt: new Date(),
        status: 'in_progress',
        sessionMode: 'timed',
        exercises: {}
      };

      window.workoutModeController?.renderWorkout?.(true);
    });
    await page.waitForTimeout(500);

    const cardioCard = page.locator('.workout-card[data-card-type="cardio"]');

    // Enter edit mode
    const editBtn = cardioCard.locator('.workout-edit-btn');
    await editBtn.click();
    await page.waitForTimeout(300);

    // Update duration to 45
    const durationInput = cardioCard.locator('.activity-edit-duration');
    await durationInput.fill('45');

    // Click save
    const saveBtn = cardioCard.locator('.activity-unified-save-btn');
    await saveBtn.click();
    await page.waitForTimeout(500);

    // After re-render, verify the session config was updated
    const sessionConfig = await page.evaluate(() => {
      return window.workoutModeController?.sessionService?.getActivitySessionConfig?.('Running');
    });

    expect(sessionConfig).toBeTruthy();
    expect(sessionConfig.duration_minutes).toBe(45);
  });

  test('editor has all expected input fields', async ({ page }) => {
    await loadCardioWorkout(page);

    const cardioCard = page.locator('.workout-card[data-card-type="cardio"]');

    // Enter edit mode
    const editBtn = cardioCard.locator('.workout-edit-btn');
    await editBtn.click();
    await page.waitForTimeout(300);

    // Check all fields exist
    await expect(cardioCard.locator('.activity-edit-duration')).toBeVisible();
    await expect(cardioCard.locator('.activity-edit-distance')).toBeVisible();
    await expect(cardioCard.locator('.activity-edit-distance-unit')).toBeVisible();
    await expect(cardioCard.locator('.activity-edit-pace')).toBeVisible();
    await expect(cardioCard.locator('.activity-edit-rpe')).toBeVisible();
    await expect(cardioCard.locator('.activity-edit-hr')).toBeVisible();
    await expect(cardioCard.locator('.activity-edit-calories')).toBeVisible();
    await expect(cardioCard.locator('.activity-edit-notes')).toBeVisible();
  });
});
