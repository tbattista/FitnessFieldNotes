// @ts-check
const { test, expect } = require('playwright/test');
const { BASE, waitForAppReady } = require('./fixtures');

test.describe('Edit Workout History', () => {

  test('history page loads edit script without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(`${BASE}/workout-history.html`);
    await waitForAppReady(page);

    // Verify the edit module loaded
    const editFnExists = await page.evaluate(() => typeof window.openEditSessionModal === 'function');
    expect(editFnExists).toBe(true);

    const saveFnExists = await page.evaluate(() => typeof window.saveSessionEdits === 'function');
    expect(saveFnExists).toBe(true);

    // No JS errors from loading the module
    const editErrors = errors.filter(e => e.includes('edit'));
    expect(editErrors).toHaveLength(0);
  });

  test('session dropdown contains Edit option when sessions exist', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await waitForAppReady(page);

    // Inject a mock session into the page state and render
    const hasEditOption = await page.evaluate(() => {
      // Set up mock session data
      if (!window.ffn) window.ffn = {};
      if (!window.ffn.workoutHistory) window.ffn.workoutHistory = {};
      window.ffn.workoutHistory.sessions = [{
        id: 'test-session-1',
        workout_id: 'wk-1',
        workout_name: 'Test Workout',
        started_at: '2026-03-28T10:00:00Z',
        completed_at: '2026-03-28T11:00:00Z',
        duration_minutes: 60,
        status: 'completed',
        exercises_performed: [{
          exercise_name: 'Bench Press',
          group_id: 'g1',
          sets_completed: 3,
          target_sets: '3',
          target_reps: '8-12',
          weight: '135',
          weight_unit: 'lbs',
          order_index: 0
        }]
      }];
      window.ffn.workoutHistory.expandedSessions = new Set();
      window.ffn.workoutHistory.isAllMode = false;
      window.ffn.workoutHistory.deleteMode = false;
      window.ffn.workoutHistory.selectedSessionIds = new Set();

      // Create a session entry
      if (typeof window.createSessionEntry === 'function') {
        const html = window.createSessionEntry(window.ffn.workoutHistory.sessions[0]);
        return html.includes('Edit Session');
      }
      return false;
    });

    expect(hasEditOption).toBe(true);
  });

  test('edit modal opens with correct form fields', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await waitForAppReady(page);

    // Set up mock session data and open modal
    const modalOpened = await page.evaluate(() => {
      if (!window.ffn) window.ffn = {};
      if (!window.ffn.workoutHistory) window.ffn.workoutHistory = {};
      window.ffn.workoutHistory.sessions = [{
        id: 'test-session-edit',
        workout_id: 'wk-1',
        workout_name: 'Push Day',
        started_at: '2026-03-28T10:00:00Z',
        completed_at: '2026-03-28T11:30:00Z',
        duration_minutes: 90,
        status: 'completed',
        notes: 'Great workout',
        exercises_performed: [{
          exercise_name: 'Bench Press',
          group_id: 'g1',
          sets_completed: 3,
          target_sets: '3',
          target_reps: '8-12',
          weight: '185',
          weight_unit: 'lbs',
          is_skipped: false,
          order_index: 0
        }, {
          exercise_name: 'Overhead Press',
          group_id: 'g2',
          sets_completed: 4,
          target_sets: '4',
          target_reps: '6-8',
          weight: '115',
          weight_unit: 'lbs',
          is_skipped: false,
          order_index: 1
        }]
      }];

      if (typeof window.openEditSessionModal === 'function') {
        window.openEditSessionModal('test-session-edit');
        return true;
      }
      return false;
    });

    expect(modalOpened).toBe(true);

    // Wait for modal to appear
    await page.waitForTimeout(500);

    // Check form fields exist
    await expect(page.locator('#editWorkoutName')).toBeAttached();
    await expect(page.locator('#editStartDate')).toBeAttached();
    await expect(page.locator('#editStartTime')).toBeAttached();
    await expect(page.locator('#editEndDate')).toBeAttached();
    await expect(page.locator('#editEndTime')).toBeAttached();
    await expect(page.locator('#editDuration')).toBeAttached();
    await expect(page.locator('#editSessionNotes')).toBeAttached();

    // Check form values are pre-filled
    const workoutName = await page.locator('#editWorkoutName').inputValue();
    expect(workoutName).toBe('Push Day');

    const notes = await page.locator('#editSessionNotes').inputValue();
    expect(notes).toBe('Great workout');

    const duration = await page.locator('#editDuration').inputValue();
    expect(duration).toBe('90');

    // Check exercise rows are rendered
    const exerciseRows = page.locator('.exercise-edit-row');
    await expect(exerciseRows).toHaveCount(2);

    // Check first exercise weight
    const firstWeight = await page.locator('.edit-weight').first().inputValue();
    expect(firstWeight).toBe('185');
  });

  test('edit modal has Save and Cancel buttons', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await waitForAppReady(page);

    await page.evaluate(() => {
      if (!window.ffn) window.ffn = {};
      if (!window.ffn.workoutHistory) window.ffn.workoutHistory = {};
      window.ffn.workoutHistory.sessions = [{
        id: 'test-session-btns',
        workout_id: 'wk-1',
        workout_name: 'Leg Day',
        started_at: '2026-03-28T10:00:00Z',
        completed_at: '2026-03-28T11:00:00Z',
        duration_minutes: 60,
        status: 'completed',
        exercises_performed: []
      }];
      window.openEditSessionModal('test-session-btns');
    });

    await page.waitForTimeout(500);

    // Check Save and Cancel buttons exist
    const saveBtn = page.locator('.modal-footer .btn-primary', { hasText: 'Save Changes' });
    const cancelBtn = page.locator('.modal-footer .btn-secondary', { hasText: 'Cancel' });

    await expect(saveBtn).toBeAttached();
    await expect(cancelBtn).toBeAttached();
  });

  test('edit modal auto-calculates duration when dates change', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await waitForAppReady(page);

    await page.evaluate(() => {
      if (!window.ffn) window.ffn = {};
      if (!window.ffn.workoutHistory) window.ffn.workoutHistory = {};
      window.ffn.workoutHistory.sessions = [{
        id: 'test-session-dur',
        workout_id: 'wk-1',
        workout_name: 'Test',
        started_at: '2026-03-28T10:00:00Z',
        completed_at: '2026-03-28T11:00:00Z',
        duration_minutes: 60,
        status: 'completed',
        exercises_performed: []
      }];
      window.openEditSessionModal('test-session-dur');
    });

    await page.waitForTimeout(500);

    // Change end time to 12:00 (2 hours from 10:00)
    await page.fill('#editEndTime', '12:00');
    await page.locator('#editEndTime').dispatchEvent('change');

    await page.waitForTimeout(200);

    const duration = await page.locator('#editDuration').inputValue();
    expect(parseInt(duration)).toBe(120);
  });

});
