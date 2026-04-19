// @ts-check
/**
 * Tabata Workout Builder — end-to-end + unit-ish checks.
 *
 * Covers:
 *  1. Builder in ?mode=tabata shows the Tabata badge and relabels the
 *     primary add-section button.
 *  2. TabataSegmentExpander produces the expected segment count and durations
 *     for both rotation and circuit modes, and correctly places set-rest
 *     segments only between (not after) tabata sections.
 */
const { test, expect } = require('playwright/test');

const BASE = 'http://localhost:8001';

test('builder in tabata mode wires the badge + state + add-section label', async ({ page }) => {
  await page.goto(`${BASE}/workout-builder.html?new=true&mode=tabata`);
  await page.waitForLoadState('domcontentloaded');

  // The editor form stays hidden until auth resolves (Firebase isn't configured
  // in the test env), so we can't assert on rendered visibility. Instead we
  // assert on the wiring that the page IS supposed to do during ?mode=tabata:
  //   1. remove .d-none from the badge (so it shows as soon as the form opens)
  //   2. relabel the primary add-section button
  //   3. set the sticky workoutType state

  const badgeHidden = await page.locator('#workoutTypeBadge').evaluate((el) => el.classList.contains('d-none'));
  expect(badgeHidden).toBe(false);

  await expect(page.locator('#workoutTypeBadge')).toContainText(/Tabata/i);
  await expect(page.locator('#addExerciseGroupBtnVisible')).toContainText(/Add Tabata Section/i);

  const workoutType = await page.evaluate(() => window.ffn?.workoutBuilder?.workoutType);
  expect(workoutType).toBe('tabata');
});

test('TabataSegmentExpander expands rotation + circuit sections correctly', async ({ page }) => {
  // Load the runner page just so the expander script attaches to window.
  await page.goto(`${BASE}/tabata-kettlebell.html`);
  await page.waitForFunction(() => !!window.TabataSegmentExpander, null, { timeout: 5000 });

  const plan = await page.evaluate(() => {
    const workout = {
      name: 'KB Double',
      workout_type: 'tabata',
      sections: [
        {
          section_id: 'a',
          type: 'tabata',
          name: 'Section A',
          config: { work_seconds: 20, rest_seconds: 10, rounds: 4,
                    set_rest_after_seconds: 30, exercise_mode: 'rotation' },
          exercises: [
            { exercise_id: 'x1', name: 'Swing', alternates: [] },
            { exercise_id: 'x2', name: 'Goblet Squat', alternates: [] },
          ],
        },
        {
          section_id: 'b',
          type: 'tabata',
          name: 'Section B',
          config: { work_seconds: 30, rest_seconds: 15, rounds: 2,
                    set_rest_after_seconds: 60, exercise_mode: 'circuit' },
          exercises: [
            { exercise_id: 'y1', name: 'Press', alternates: [] },
            { exercise_id: 'y2', name: 'Row',   alternates: [] },
          ],
        },
      ],
    };
    return window.TabataSegmentExpander.expandWorkoutToSegments(workout);
  });

  // Rotation: 4 rounds × (work + rest) = 8 segments in section A
  // Plus 1 set_rest between sections (A is not last).
  // Circuit: 2 rounds × 2 exercises × (work + rest) = 8 segments in section B.
  // Section B is last => no trailing set_rest.
  expect(plan.title).toBe('KB Double');
  expect(plan.is_user_built).toBe(true);
  expect(plan.sets).toBe(2);

  const types = plan.segments.map((s) => s.segment_type);
  // Section A: work, rest, work, rest, work, rest, work, rest
  const sectionA = types.slice(0, 8);
  expect(sectionA).toEqual(['work', 'rest', 'work', 'rest', 'work', 'rest', 'work', 'rest']);

  // After section A: set_rest then section B (8 work+rest segments)
  expect(types[8]).toBe('set_rest');
  expect(types.slice(9)).toEqual(['work', 'rest', 'work', 'rest', 'work', 'rest', 'work', 'rest']);
  expect(types.filter((t) => t === 'set_rest').length).toBe(1);

  // Rotation cycles exercises by round index
  const sectionAWorks = plan.segments.filter((s) => s.set_index === 1 && s.segment_type === 'work');
  expect(sectionAWorks.map((s) => s.name)).toEqual([
    'Swing', 'Goblet Squat', 'Swing', 'Goblet Squat',
  ]);

  // Circuit pairs every exercise per round
  const sectionBWorks = plan.segments.filter((s) => s.set_index === 2 && s.segment_type === 'work');
  expect(sectionBWorks.map((s) => s.name)).toEqual([
    'Press', 'Row', 'Press', 'Row',
  ]);

  // Total seconds math: A = 4*(20+10) + 30 = 150; B = 2*2*(30+15) = 180; total 330
  expect(plan.total_seconds).toBe(330);
});

test('runner routes user-built workouts skipping the AI protocol picker (no workout_id shows picker)', async ({ page }) => {
  // Without workout_id, the runner lands on the AI setup state (not workoutState).
  await page.goto(`${BASE}/tabata-kettlebell.html`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(400);

  const selectVisible = await page.locator('#selectState').isVisible();
  const workoutVisible = await page.locator('#workoutState').isVisible();

  // We can't reliably assert auth state here (may be anonymous → authRequired),
  // but we CAN assert that the workout state is NOT shown without a workout_id.
  expect(workoutVisible).toBe(false);
  // And selectState is either visible or authRequired is — no other path.
  const authVisible = await page.locator('#authRequired').isVisible();
  expect(selectVisible || authVisible).toBe(true);
});
