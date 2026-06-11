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


test.describe('Edit Cardio Activity History', () => {

  test('cardio edit functions are loaded', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await waitForAppReady(page);

    const editFnExists = await page.evaluate(() => typeof window.openEditCardioSessionModal === 'function');
    expect(editFnExists).toBe(true);

    const saveFnExists = await page.evaluate(() => typeof window.saveCardioSessionEdits === 'function');
    expect(saveFnExists).toBe(true);
  });

  test('cardio session dropdown contains Edit option', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await waitForAppReady(page);

    const hasEditOption = await page.evaluate(() => {
      if (!window.ffn) window.ffn = {};
      if (!window.ffn.workoutHistory) window.ffn.workoutHistory = {};
      window.ffn.workoutHistory.sessions = [{
        id: 'cardio-test-1',
        _sessionType: 'cardio',
        activity_type: 'running',
        activity_name: 'Morning Run',
        started_at: '2026-03-28T07:00:00Z',
        duration_minutes: 30,
        distance: 3.1,
        distance_unit: 'mi',
        status: 'completed'
      }];
      window.ffn.workoutHistory.expandedSessions = new Set();
      window.ffn.workoutHistory.isAllMode = true;
      window.ffn.workoutHistory.deleteMode = false;
      window.ffn.workoutHistory.selectedSessionIds = new Set();

      if (typeof window.renderCardioHistoryEntry === 'function') {
        const html = window.renderCardioHistoryEntry(window.ffn.workoutHistory.sessions[0]);
        return html.includes('Edit Session');
      }
      return false;
    });

    expect(hasEditOption).toBe(true);
  });

  test('cardio edit modal opens with correct fields', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await waitForAppReady(page);

    await page.evaluate(() => {
      if (!window.ffn) window.ffn = {};
      if (!window.ffn.workoutHistory) window.ffn.workoutHistory = {};
      window.ffn.workoutHistory.sessions = [{
        id: 'cardio-test-edit',
        _sessionType: 'cardio',
        activity_type: 'running',
        activity_name: 'Tempo Run',
        started_at: '2026-03-28T06:30:00Z',
        completed_at: '2026-03-28T07:15:00Z',
        duration_minutes: 45,
        distance: 5.0,
        distance_unit: 'mi',
        pace_per_unit: '9:00',
        avg_heart_rate: 155,
        max_heart_rate: 175,
        calories: 450,
        rpe: 7,
        elevation_gain: 200,
        elevation_unit: 'ft',
        notes: 'Felt strong',
        status: 'completed'
      }];

      window.openEditCardioSessionModal('cardio-test-edit');
    });

    await page.waitForTimeout(500);

    // Check key form fields exist and are pre-filled
    await expect(page.locator('#editCardioActivityType')).toBeAttached();
    await expect(page.locator('#editCardioActivityName')).toBeAttached();
    await expect(page.locator('#editCardioStartDate')).toBeAttached();
    await expect(page.locator('#editCardioStartTime')).toBeAttached();
    await expect(page.locator('#editCardioDuration')).toBeAttached();
    await expect(page.locator('#editCardioDistance')).toBeAttached();
    await expect(page.locator('#editCardioPace')).toBeAttached();
    await expect(page.locator('#editCardioAvgHR')).toBeAttached();
    await expect(page.locator('#editCardioCalories')).toBeAttached();
    await expect(page.locator('#editCardioRPE')).toBeAttached();
    await expect(page.locator('#editCardioElevation')).toBeAttached();
    await expect(page.locator('#editCardioNotes')).toBeAttached();

    // Check pre-filled values
    const name = await page.locator('#editCardioActivityName').inputValue();
    expect(name).toBe('Tempo Run');

    const dist = await page.locator('#editCardioDistance').inputValue();
    expect(dist).toBe('5');

    const notes = await page.locator('#editCardioNotes').inputValue();
    expect(notes).toBe('Felt strong');

    const dur = await page.locator('#editCardioDuration').inputValue();
    expect(dur).toBe('45');
  });

  /* ============================================================
     Edit Summary offcanvas — reuses the End Workout bottom sheet
     from workout-mode but pre-fills it with this completed
     session's duration + calories. Save → PATCH the session.
     ============================================================ */

  test('summary offcanvas function is registered on the history page', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await waitForAppReady(page);
    // Both the wrapper + the underlying factory should be there.
    const present = await page.evaluate(() => ({
      summary: typeof window.openSummaryOffcanvas,
      factory: typeof window.UnifiedOffcanvasFactory?.createCompleteWorkout,
    }));
    expect(present.summary).toBe('function');
    expect(present.factory).toBe('function');
  });

  test('session dropdown includes "Edit Summary" alongside "Edit Session"', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await waitForAppReady(page);
    const html = await page.evaluate(() => {
      if (!window.ffn) window.ffn = {};
      window.ffn.workoutHistory = window.ffn.workoutHistory || {};
      window.ffn.workoutHistory.sessions = [{
        // _sessionType: 'strength' is the discriminator the renderer
        // uses to NOT route to the cardio path — without it, some
        // upstream loader can flag the row as cardio depending on
        // device viewport state.
        _sessionType: 'strength',
        id: 's-1', workout_id: 'w-1', workout_name: 'Test', status: 'completed',
        duration_minutes: 45, calories: 220, exercises_performed: [],
        started_at: '2026-03-28T10:00:00Z', completed_at: '2026-03-28T10:45:00Z',
      }];
      window.ffn.workoutHistory.expandedSessions = new Set();
      window.ffn.workoutHistory.isAllMode = false;
      window.ffn.workoutHistory.deleteMode = false;
      window.ffn.workoutHistory.selectedSessionIds = new Set();
      return typeof window.createSessionEntry === 'function'
        ? window.createSessionEntry(window.ffn.workoutHistory.sessions[0])
        : '';
    });
    expect(html).toContain('Edit Summary');
    expect(html).toContain('Edit Session');
    expect(html).toContain("openSummaryOffcanvas('s-1')");
  });

  test('Edit Summary offcanvas opens pre-filled with duration + calories', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await waitForAppReady(page);
    await page.evaluate(() => {
      if (!window.ffn) window.ffn = {};
      window.ffn.workoutHistory = window.ffn.workoutHistory || {};
      window.ffn.workoutHistory.sessions = [{
        id: 's-summary', workout_id: 'w-2', workout_name: 'Pull Day',
        status: 'completed', duration_minutes: 55, calories: 310,
        exercises_performed: [
          { exercise_name: 'Pull-up', group_id: 'g1', order_index: 0,
            weight: '0', weight_unit: 'lbs', target_sets: '3', target_reps: '8' },
        ],
        started_at: '2026-03-28T08:00:00Z', completed_at: '2026-03-28T08:55:00Z',
      }];
      window.openSummaryOffcanvas('s-summary');
    });

    // Bottom sheet should be in the DOM with our retitled header
    await expect(page.locator('#completeWorkoutOffcanvas')).toBeAttached({ timeout: 4000 });
    await expect(page.locator('#completeWorkoutOffcanvasLabel')).toContainText(/Edit Summary/i);
    // Duration prefilled to 55, calories prefilled to 310
    await expect(page.locator('#sessionDurationInput')).toHaveValue('55');
    await expect(page.locator('#sessionCaloriesInput')).toHaveValue('310');
    // Discard link is hidden in edit mode (no live session to discard)
    const discardDisplay = await page.locator('#cancelDiscardBtn').evaluate(el => getComputedStyle(el).display);
    expect(discardDisplay).toBe('none');
    // Save button retitled
    await expect(page.locator('#confirmCompleteBtn')).toContainText(/Save Changes/i);
  });

  test('Edit Summary save PATCHes the session with the new duration + calories', async ({ page }) => {
    let patched = null;
    await page.route('**/api/v3/workout-sessions/s-patch', async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      try { patched = JSON.parse(route.request().postData() || '{}'); }
      catch (_) { patched = null; }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 's-patch', workout_name: 'Squats Day',
          duration_minutes: patched?.duration_minutes ?? 60,
          calories: patched?.calories ?? 0,
          status: 'completed',
          exercises_performed: [],
          started_at: '2026-03-28T07:00:00Z',
          completed_at: '2026-03-28T08:00:00Z',
        }),
      });
    });

    await page.goto(`${BASE}/workout-history.html`);
    await waitForAppReady(page);
    await page.evaluate(() => {
      // Force an authed dataManager so the patch wrapper doesn't bail.
      window.dataManager = {
        isUserAuthenticated: () => true,
        getAuthToken: async () => 'test-token',
      };
      if (!window.ffn) window.ffn = {};
      window.ffn.workoutHistory = window.ffn.workoutHistory || {};
      window.ffn.workoutHistory.sessions = [{
        id: 's-patch', workout_id: 'w-3', workout_name: 'Squats Day',
        status: 'completed', duration_minutes: 60, calories: 200,
        exercises_performed: [],
        started_at: '2026-03-28T07:00:00Z',
        completed_at: '2026-03-28T08:00:00Z',
      }];
      window.openSummaryOffcanvas('s-patch');
    });

    await expect(page.locator('#sessionDurationInput')).toHaveValue('60');
    await page.locator('#sessionDurationInput').fill('75');
    await page.locator('#sessionCaloriesInput').fill('420');
    await page.locator('#confirmCompleteBtn').click();

    // Wait for the PATCH to land
    await expect.poll(() => patched, { timeout: 5000 }).toBeTruthy();
    expect(patched.duration_minutes).toBe(75);
    expect(patched.calories).toBe(420);
  });

  test('Edit Summary save with no field changes skips the PATCH', async ({ page }) => {
    let patched = null;
    await page.route('**/api/v3/workout-sessions/s-nop', async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      patched = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.goto(`${BASE}/workout-history.html`);
    await waitForAppReady(page);
    await page.evaluate(() => {
      window.dataManager = {
        isUserAuthenticated: () => true,
        getAuthToken: async () => 'test-token',
      };
      if (!window.ffn) window.ffn = {};
      window.ffn.workoutHistory = window.ffn.workoutHistory || {};
      window.ffn.workoutHistory.sessions = [{
        id: 's-nop', workout_id: 'w-4', workout_name: 'Mobility',
        status: 'completed', duration_minutes: 30, calories: 80,
        exercises_performed: [],
        started_at: '2026-03-28T06:00:00Z',
        completed_at: '2026-03-28T06:30:00Z',
      }];
      window.openSummaryOffcanvas('s-nop');
    });

    // Save without touching either input
    await expect(page.locator('#sessionDurationInput')).toHaveValue('30');
    await page.locator('#confirmCompleteBtn').click();
    // No PATCH should land
    await page.waitForTimeout(800);
    expect(patched).toBeNull();
  });

});
