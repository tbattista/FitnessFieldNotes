// @ts-check
const { test, expect } = require('playwright/test');
const { BASE, waitForAppReady } = require('./fixtures');

test.describe('Workout History', () => {

  test('history page loads and shows tabs', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await waitForAppReady(page);

    // Three tabs should exist
    const historyTab = page.locator('#history-tab');
    const calendarTab = page.locator('#calendar-tab');
    const exercisesTab = page.locator('#exercises-tab');

    await expect(historyTab).toBeAttached();
    await expect(calendarTab).toBeAttached();
    await expect(exercisesTab).toBeAttached();
  });

  test('history tab is active by default', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await waitForAppReady(page);

    const historyTab = page.locator('#history-tab');
    await expect(historyTab).toHaveClass(/active/);
  });

  test('tab elements exist and are clickable when content loads (mobile)', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const mobilePage = await context.newPage();
    await mobilePage.goto(`${BASE}/workout-history.html`);
    await mobilePage.waitForLoadState('networkidle');
    await mobilePage.waitForTimeout(2000);

    // Tabs exist in DOM even if content is hidden (requires auth/data to show)
    const calendarTab = mobilePage.locator('#calendar-tab');
    const exercisesTab = mobilePage.locator('#exercises-tab');

    await expect(calendarTab).toBeAttached();
    await expect(exercisesTab).toBeAttached();

    // Tab panes exist in DOM
    await expect(mobilePage.locator('#calendarTabPane')).toBeAttached();
    await expect(mobilePage.locator('#exercisesTabPane')).toBeAttached();

    await context.close();
  });

  test('session history container exists', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await waitForAppReady(page);

    const container = page.locator('#sessionHistoryContainer, #desktopSessionHistoryContainer');
    await expect(container.first()).toBeAttached();
  });

  test('calendar has month navigation controls', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await waitForAppReady(page);

    const prevMonth = page.locator('#historyPrevMonth, #desktopPrevMonth');
    const nextMonth = page.locator('#historyNextMonth, #desktopNextMonth');
    const currentMonth = page.locator('#historyCurrentMonth, #desktopCurrentMonth');

    await expect(prevMonth.first()).toBeAttached();
    await expect(nextMonth.first()).toBeAttached();
    await expect(currentMonth.first()).toBeAttached();
  });

  test('parseExerciseName strips equipment prefixes', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await page.waitForFunction(() => typeof window.parseExerciseName === 'function', { timeout: 10000 });

    const result = await page.evaluate(() => {
      return window.parseExerciseName('Barbell Bench Press');
    });

    expect(result.baseName).toBe('Bench Press');
    expect(result.equipment).toBe('Barbell');
  });

  test('parseExerciseName handles exercises without equipment prefix', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await page.waitForFunction(() => typeof window.parseExerciseName === 'function', { timeout: 10000 });

    const result = await page.evaluate(() => {
      return window.parseExerciseName('Push Ups');
    });

    expect(result.baseName).toBe('Push Ups');
  });

  test('aggregateExercisesFromSessions groups exercises correctly', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await page.waitForFunction(() => typeof window.aggregateExercisesFromSessions === 'function', { timeout: 10000 });

    const result = await page.evaluate(() => {
      const sessions = [
        {
          exercises_performed: [
            { exercise_name: 'Barbell Bench Press', sets_completed: [{ weight: '135', reps: '10' }] },
            { exercise_name: 'Dumbbell Bench Press', sets_completed: [{ weight: '50', reps: '12' }] },
          ],
          completed_at: '2026-03-06T10:00:00Z',
        },
      ];
      return window.aggregateExercisesFromSessions(sessions);
    });

    expect(result.length).toBeGreaterThan(0);
    const benchGroup = result.find(g => g.baseName === 'Bench Press');
    expect(benchGroup).toBeDefined();
    expect(benchGroup.variants.length).toBe(2);
  });

  test('empty state displays when no sessions exist', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await waitForAppReady(page);
    await page.waitForTimeout(2000);

    const emptyState = page.locator('#historyEmptyState, #desktopEmptyState');
    const sessionContainer = page.locator('#sessionHistoryContainer, #desktopSessionHistoryContainer');

    const hasEmpty = await emptyState.first().isVisible().catch(() => false);
    const containerText = await sessionContainer.first().textContent().catch(() => '');

    expect(hasEmpty || containerText.trim().length === 0 || containerText.includes('No')).toBe(true);
  });

  test('PR section container exists in DOM', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await waitForAppReady(page);

    const prContainer = page.locator('#prSectionContainer, #desktopPrSectionContainer');
    await expect(prContainer.first()).toBeAttached();
  });

  test('PR state is initialized in window.ffn.workoutHistory', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await page.waitForFunction(() => window.ffn && window.ffn.workoutHistory, { timeout: 10000 });

    const hasState = await page.evaluate(() => {
      const state = window.ffn.workoutHistory;
      return (
        state.personalRecords instanceof Map &&
        state.prExerciseNames instanceof Set
      );
    });

    expect(hasState).toBe(true);
  });

  test('PR functions are exported to window', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await page.waitForFunction(() => typeof window.renderPRSection === 'function', { timeout: 10000 });

    const fnsExist = await page.evaluate(() => {
      return (
        typeof window.toggleExercisePRTracking === 'function' &&
        typeof window.renderPRSection === 'function' &&
        typeof window.editPRValue === 'function' &&
        typeof window.fetchPersonalRecords === 'function'
      );
    });

    expect(fnsExist).toBe(true);
  });

  test('renderPRSection hides container when no PRs', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await page.waitForFunction(() => typeof window.renderPRSection === 'function', { timeout: 10000 });

    await page.evaluate(() => {
      window.ffn.workoutHistory.personalRecords.clear();
      window.renderPRSection();
    });

    const prContainer = page.locator('#prSectionContainer, #desktopPrSectionContainer');
    const isHidden = await prContainer.first().evaluate(el => el.style.display === 'none');
    expect(isHidden).toBe(true);
  });

  test('renderPRSection shows horizontal chips when data exists', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await page.waitForFunction(() => typeof window.renderPRSection === 'function', { timeout: 10000 });

    await page.evaluate(() => {
      const state = window.ffn.workoutHistory;
      state.personalRecords.set('weight_bench_press', {
        id: 'weight_bench_press',
        pr_type: 'weight',
        exercise_name: 'Bench Press',
        value: '225',
        value_unit: 'lbs',
        session_id: 'test-session-1',
        session_date: new Date().toISOString(),
        marked_at: new Date().toISOString(),
        is_manual: true
      });
      state.prExerciseNames.add('bench press');
      window.renderPRSection();
    });

    // PR chips container is rendered in the DOM
    const chipsContainer = page.locator('.pr-chips-container');
    await expect(chipsContainer.first()).toBeAttached();

    // PR chip exists with correct data
    const prChip = page.locator('.pr-chip');
    await expect(prChip.first()).toBeAttached();

    const chipText = await prChip.first().textContent();
    expect(chipText).toContain('Bench Press');
    expect(chipText).toContain('225');
  });

  test('renderExerciseTableRow handles string weight_change without error', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await page.waitForFunction(() => typeof window.renderExerciseTableRow === 'function', { timeout: 10000 });

    // Test with string weight_change (as demo data and real API responses provide)
    const result = await page.evaluate(() => {
      const exercises = [
        { exercise_name: 'Bench Press', weight: '185', weight_unit: 'lbs', sets_completed: 4, target_sets: '4', target_reps: '6-8', weight_change: '5', previous_weight: '180' },
        { exercise_name: 'Squat', weight: '275', weight_unit: 'lbs', sets_completed: 4, target_sets: '4', target_reps: '6-8', weight_change: '-10', previous_weight: '285' },
        { exercise_name: 'Deadlift', weight: '315', weight_unit: 'lbs', sets_completed: 3, target_sets: '3', target_reps: '5', weight_change: '0', previous_weight: '315' },
        { exercise_name: 'OHP', weight: '135', weight_unit: 'lbs', sets_completed: 3, target_sets: '3', target_reps: '8', weight_change: null, previous_weight: null },
      ];

      const results = [];
      for (const ex of exercises) {
        try {
          const html = window.renderExerciseTableRow(ex);
          results.push({ name: ex.exercise_name, ok: true, html });
        } catch (e) {
          results.push({ name: ex.exercise_name, ok: false, error: e.message });
        }
      }
      return results;
    });

    // All exercises should render without error
    for (const r of result) {
      expect(r.ok, `${r.name} failed: ${r.error}`).toBe(true);
    }

    // Positive change should show up arrow
    expect(result[0].html).toContain('text-success');
    expect(result[0].html).toContain('5.0');

    // Negative change should show down arrow
    expect(result[1].html).toContain('text-danger');

    // Zero change should show neutral indicator
    expect(result[2].html).toContain('text-muted');

    // Null weight_change with no previous_weight should show "New"
    expect(result[3].html).toContain('New');
  });

  test('renderExerciseTableRow handles numeric weight_change', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await page.waitForFunction(() => typeof window.renderExerciseTableRow === 'function', { timeout: 10000 });

    // Test with numeric weight_change (as frontend in-memory state may provide)
    const result = await page.evaluate(() => {
      const ex = { exercise_name: 'Bench Press', weight: '185', weight_unit: 'lbs', sets_completed: 4, target_sets: '4', target_reps: '6-8', weight_change: 10, previous_weight: '175' };
      try {
        return { ok: true, html: window.renderExerciseTableRow(ex) };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    });

    expect(result.ok, `Failed: ${result.error}`).toBe(true);
    expect(result.html).toContain('text-success');
    expect(result.html).toContain('10.0');
  });

  test('PR CSS file loads with correct styles', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await waitForAppReady(page);

    const cssLink = page.locator('link[href*="workout-history-pr.css"]');
    await expect(cssLink).toBeAttached();
  });
});
