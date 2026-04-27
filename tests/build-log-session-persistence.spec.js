// @ts-check
const { test, expect } = require('playwright/test');
const { BASE } = require('./fixtures');

/**
 * Stub the Firebase globals the data manager waits for. Without this the
 * sandboxed test environment can't load Firebase from gstatic, so
 * `waitForAuthReady()` never resolves and the controller hangs before it
 * gets to load the workout or check the persisted session.
 *
 * Stubbing as anonymous (no current user) keeps storage on localStorage,
 * which is what the rest of the test setup expects.
 */
async function stubFirebaseReady(page) {
  await page.addInitScript(() => {
    window.firebaseAuth = {
      currentUser: null,
      authStateReady: () => Promise.resolve(),
      onAuthStateChanged: () => () => {},
    };
    window.firebaseReady = true;
    // Fire the event after listeners attach.
    setTimeout(() => {
      try { window.dispatchEvent(new Event('firebaseReady')); } catch (_) {}
    }, 0);
  });
}

/**
 * Build & Log session persistence tests.
 *
 * Covers two related fixes:
 *   1. The "Resume Workout?" prompt should only appear when the page has been
 *      idle 60+ minutes (was 2 minutes, which fired far too aggressively).
 *   2. Exercises added in workout mode (especially Build & Log) must be
 *      persisted to the workout template so a navigate-away + resume doesn't
 *      reload an empty workout and leave the user with a blank screen.
 *
 * Build & Log requires Firebase auth, so end-to-end of the full build flow
 * isn't testable here. We instead validate the underlying mechanisms:
 *   - threshold value and prompt-vs-auto-resume gating
 *   - that the operations manager calls dataManager.updateWorkout when an
 *     exercise/activity is added (so it survives reload)
 */

const TEMPLATE_WORKOUT = {
  id: 'test-build-log-workout',
  name: 'Build & Log Test',
  description: '',
  exercise_groups: [
    {
      group_id: 'group-1',
      exercises: { a: 'Barbell Bench Press' },
      sets: '3',
      reps: '8-12',
      rest: '90s',
      default_weight: '135',
      default_weight_unit: 'lbs',
      group_type: 'standard',
    },
  ],
  sections: [],
  tags: [],
  created_date: '2026-03-01T10:00:00Z',
  modified_date: '2026-03-01T10:00:00Z',
  is_archived: false,
};

function makePersistedSession(workoutId, minutesAgo) {
  const now = Date.now();
  const lastActive = new Date(now - minutesAgo * 60 * 1000).toISOString();
  return {
    sessionId: `test-session-${workoutId}`,
    workoutId,
    workoutName: 'Build & Log Test',
    startedAt: new Date(now - (minutesAgo + 5) * 60 * 1000).toISOString(),
    status: 'in_progress',
    sessionMode: 'timed',
    exercises: {
      'Barbell Bench Press': {
        weight: '135',
        weight_unit: 'lbs',
        target_sets: '3',
        target_reps: '8-12',
        rest: '90s',
        order_index: 0,
        is_modified: false,
        is_skipped: false,
        is_completed: false,
        notes: '',
      },
    },
    sessionNotes: [],
    exerciseOrder: [],
    lastUpdated: lastActive,
    lastPageActive: lastActive,
    version: '2.4',
    schemaVersion: 2,
  };
}

test.describe('Resume threshold (1 hour)', () => {
  test('source defines the auto-resume threshold as 60 minutes', async ({ request }) => {
    // Sanity check that the threshold constant is set to 60 in the shipped JS.
    // Catches accidental regressions back to the 2-minute value.
    const res = await request.get(
      `${BASE}/static/assets/js/services/workout-lifecycle-manager.js`
    );
    expect(res.ok()).toBeTruthy();
    const src = await res.text();
    expect(src).toMatch(/AUTO_RESUME_THRESHOLD_MINUTES\s*=\s*60\b/);
  });

  test('session idle for 30 minutes auto-resumes without showing the prompt', async ({ page }) => {
    const consoleLogs = [];
    page.on('console', (msg) => consoleLogs.push(msg.text()));
    await stubFirebaseReady(page);

    // Seed workout + a recently-active session so the controller auto-resumes.
    await page.goto(`${BASE}/settings.html`);
    await page.evaluate(({ workout, session }) => {
      localStorage.setItem('gym_workouts', JSON.stringify([workout]));
      localStorage.setItem('ffn_active_workout_session', JSON.stringify(session));
    }, { workout: TEMPLATE_WORKOUT, session: makePersistedSession(TEMPLATE_WORKOUT.id, 30) });

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE}/workout-mode.html?id=${TEMPLATE_WORKOUT.id}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // The Resume offcanvas should never have been shown for a 30-min idle.
    const offcanvasCount = await page.locator('#resumeSessionOffcanvas').count();
    expect(offcanvasCount).toBe(0);

    // And the lifecycle manager should have logged that it auto-resumed.
    const sawAutoResume = consoleLogs.some((line) =>
      /Auto-resuming session.*page inactive/.test(line)
    );
    expect(sawAutoResume).toBe(true);
  });

  test('session idle for 90 minutes shows the resume prompt', async ({ page }) => {
    const consoleLogs = [];
    page.on('console', (msg) => consoleLogs.push(msg.text()));
    await stubFirebaseReady(page);

    await page.goto(`${BASE}/settings.html`);
    await page.evaluate(({ workout, session }) => {
      localStorage.setItem('gym_workouts', JSON.stringify([workout]));
      localStorage.setItem('ffn_active_workout_session', JSON.stringify(session));
    }, { workout: TEMPLATE_WORKOUT, session: makePersistedSession(TEMPLATE_WORKOUT.id, 90) });

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE}/workout-mode.html?id=${TEMPLATE_WORKOUT.id}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // The lifecycle manager logs which branch it took. We rely on that signal
    // since the offcanvas DOM element only mounts if UnifiedOffcanvasFactory
    // is loaded — so checking the log is the most reliable assertion of
    // "the threshold gate decided this session was idle long enough."
    const sawPromptLog = consoleLogs.some((line) =>
      /showing resume prompt/.test(line) ||
      /Found persisted session.*page inactive for/.test(line)
    );
    const sawAutoResumeLog = consoleLogs.some((line) =>
      /Auto-resuming session.*page inactive for/.test(line)
    );

    expect(sawAutoResumeLog).toBe(false);
    expect(sawPromptLog).toBe(true);
  });
});

test.describe('Adding an exercise in workout mode persists to backend', () => {
  test('_addExerciseGroupToWorkout calls dataManager.updateWorkout', async ({ page }) => {
    await stubFirebaseReady(page);

    // Anonymous mode: workouts live in localStorage, dataManager.updateWorkout
    // still routes through the same code path. We spy on the call to verify
    // a save fires when an exercise is added in workout mode.
    await page.goto(`${BASE}/settings.html`);
    await page.evaluate((workout) => {
      localStorage.setItem('gym_workouts', JSON.stringify([workout]));
    }, TEMPLATE_WORKOUT);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE}/workout-mode.html?id=${TEMPLATE_WORKOUT.id}`);
    await page.waitForLoadState('networkidle');

    // Wait for the controller to have loaded the workout — without this the
    // ops manager is registered but currentWorkout is null and the persist
    // call is skipped.
    await page.waitForFunction(
      () =>
        !!window.workoutModeController?.exerciseOpsManager &&
        !!window.workoutModeController?.currentWorkout?.id,
      { timeout: 10000 }
    );

    // Wrap dataManager.updateWorkout to record calls. Wrap on the same instance
    // the ops manager holds so the call is intercepted.
    await page.evaluate(() => {
      const dm = window.workoutModeController.exerciseOpsManager.dataManager;
      window.__updateWorkoutCalls = [];
      const orig = dm.updateWorkout.bind(dm);
      dm.updateWorkout = async (id, data) => {
        window.__updateWorkoutCalls.push({
          id,
          groupCount: data?.exercise_groups?.length ?? 0,
          names: (data?.exercise_groups || []).map((g) => g?.exercises?.a),
        });
        return orig(id, data);
      };
    });

    // Trigger an exercise add programmatically through the public manager API.
    // (The full UI flow opens an offcanvas; calling the manager exercises the
    // same persistence path without depending on offcanvas rendering.)
    await page.evaluate(async () => {
      const ops = window.workoutModeController.exerciseOpsManager;
      await ops._addExerciseGroupToWorkout({
        name: 'Cable Pulldown',
        sets: '3',
        reps: '12',
        rest: '60s',
        weight: '',
        weight_unit: 'lbs',
      }, null);
    });

    const calls = await page.evaluate(() => window.__updateWorkoutCalls);
    expect(calls.length).toBeGreaterThan(0);
    const last = calls[calls.length - 1];
    expect(last.id).toBe(TEMPLATE_WORKOUT.id);
    expect(last.names).toContain('Cable Pulldown');
  });
});
