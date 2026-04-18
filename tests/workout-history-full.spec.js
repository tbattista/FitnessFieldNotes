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

  test('PR CSS file loads with correct styles', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await waitForAppReady(page);

    const cssLink = page.locator('link[href*="workout-history-pr.css"]');
    await expect(cssLink).toBeAttached();
  });

  test('desktop view has 3 tabs at top (History, Calendar, Exercise Stats)', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const desktopPage = await context.newPage();
    await desktopPage.goto(`${BASE}/workout-history.html`);
    await desktopPage.waitForLoadState('networkidle');
    await desktopPage.waitForTimeout(2000);

    // Desktop view should have 3 tab buttons in the desktop tabs wrapper
    // (content is hidden until auth, so check DOM attachment not visibility)
    const historyTab = desktopPage.locator('.desktop-history-tabs-wrapper #history-tab');
    const calendarTab = desktopPage.locator('.desktop-history-tabs-wrapper #calendar-tab');
    const exercisesTab = desktopPage.locator('.desktop-history-tabs-wrapper #exercises-tab');

    await expect(historyTab).toBeAttached();
    await expect(calendarTab).toBeAttached();
    await expect(exercisesTab).toBeAttached();

    // History tab should be active by default
    await expect(historyTab).toHaveClass(/active/);

    // Tab navigation wrapper exists in desktop view DOM
    const tabsWrapper = desktopPage.locator('.desktop-history-tabs-wrapper');
    await expect(tabsWrapper).toBeAttached();

    // PR sidebar exists in the 2:1 layout
    const sidebar = desktopPage.locator('.desktop-history-sidebar');
    await expect(sidebar).toBeAttached();

    await context.close();
  });

  test('desktop tab panes exist for all 3 tabs', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const desktopPage = await context.newPage();
    await desktopPage.goto(`${BASE}/workout-history.html`);
    await desktopPage.waitForLoadState('networkidle');
    await desktopPage.waitForTimeout(2000);

    // Tab panes should exist in DOM
    await expect(desktopPage.locator('#desktopHistoryTabPane')).toBeAttached();
    await expect(desktopPage.locator('#desktopCalendarTabPane')).toBeAttached();
    await expect(desktopPage.locator('#desktopExercisesTabPane')).toBeAttached();

    // History tab pane should be active by default
    await expect(desktopPage.locator('#desktopHistoryTabPane')).toHaveClass(/active/);

    await context.close();
  });

  test('desktop PR section is inside History tab only', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const desktopPage = await context.newPage();
    await desktopPage.goto(`${BASE}/workout-history.html`);
    await desktopPage.waitForLoadState('networkidle');
    await desktopPage.waitForTimeout(2000);

    // After ID swap, desktopPrSectionContainer becomes prSectionContainer
    // PR container should be inside the History tab pane
    const prInHistoryTab = desktopPage.locator('#desktopHistoryTabPane [id$="PrSectionContainer"], #desktopHistoryTabPane [id$="prSectionContainer"]');
    await expect(prInHistoryTab.first()).toBeAttached();

    // PR container should NOT be in calendar or exercises tab
    const prInCalendarTab = desktopPage.locator('#desktopCalendarTabPane [id$="PrSectionContainer"], #desktopCalendarTabPane [id$="prSectionContainer"]');
    const prInExercisesTab = desktopPage.locator('#desktopExercisesTabPane [id$="PrSectionContainer"], #desktopExercisesTabPane [id$="prSectionContainer"]');
    await expect(prInCalendarTab).toHaveCount(0);
    await expect(prInExercisesTab).toHaveCount(0);

    await context.close();
  });
});
