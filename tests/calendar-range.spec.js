// @ts-check
const { test, expect } = require('playwright/test');
const { BASE, waitForAppReady } = require('./fixtures');

test.describe('Calendar Range Selection & Day Detail', () => {

  test('calendar range presets container exists in DOM', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await waitForAppReady(page);

    // The presets container should exist in the DOM (even if empty before init)
    const presets = page.locator('#calendarRangePresets, #desktopCalendarRangePresets');
    await expect(presets.first()).toBeAttached();
  });

  test('calendar range session list container exists in DOM', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await waitForAppReady(page);

    const container = page.locator('#calendarRangeSessionList, #desktopCalendarRangeSessionList');
    await expect(container.first()).toBeAttached();
  });

  test('CalendarView class has selection methods', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await waitForAppReady(page);

    // Wait for CalendarView class to be available
    await page.waitForFunction(() => typeof window.CalendarView === 'function');

    const methods = await page.evaluate(() => {
      const proto = window.CalendarView.prototype;
      return {
        hasSetSelection: typeof proto.setSelection === 'function',
        hasClearSelection: typeof proto.clearSelection === 'function',
        hasSetRangeMode: typeof proto.setRangeMode === 'function',
        hasGetSessionsInRange: typeof proto.getSessionsInRange === 'function',
        hasGetSessionsForDate: typeof proto.getSessionsForDate === 'function',
        hasNavigateToDate: typeof proto.navigateToDate === 'function',
        hasIsInRange: typeof proto.isInRange === 'function'
      };
    });

    expect(methods.hasSetSelection).toBe(true);
    expect(methods.hasClearSelection).toBe(true);
    expect(methods.hasSetRangeMode).toBe(true);
    expect(methods.hasGetSessionsInRange).toBe(true);
    expect(methods.hasGetSessionsForDate).toBe(true);
    expect(methods.hasNavigateToDate).toBe(true);
    expect(methods.hasIsInRange).toBe(true);
  });

  test('CalendarView range selection logic works correctly', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await waitForAppReady(page);

    await page.waitForFunction(() => typeof window.CalendarView === 'function');

    const result = await page.evaluate(() => {
      // Create a test CalendarView instance
      const div = document.createElement('div');
      div.id = 'testCalGrid';
      document.body.appendChild(div);

      const cv = new window.CalendarView('testCalGrid', {});

      // Test isInRange with no selection
      const noRange = cv.isInRange('2026-04-15');

      // Test setSelection
      cv.setSelection('2026-04-10', '2026-04-20');
      const inRange = cv.isInRange('2026-04-15');
      const startNotInRange = cv.isInRange('2026-04-10'); // endpoints exclusive
      const endNotInRange = cv.isInRange('2026-04-20');
      const beforeRange = cv.isInRange('2026-04-05');
      const afterRange = cv.isInRange('2026-04-25');

      // Test clearSelection
      cv.clearSelection();
      const afterClear = cv.isInRange('2026-04-15');

      // Test getSessionsInRange with mock sessions
      cv.sessions = [
        { workout_name: 'A', completed_at: '2026-04-10T10:00:00Z', status: 'completed' },
        { workout_name: 'B', completed_at: '2026-04-15T10:00:00Z', status: 'completed' },
        { workout_name: 'C', completed_at: '2026-04-20T10:00:00Z', status: 'completed' },
        { workout_name: 'D', completed_at: '2026-04-25T10:00:00Z', status: 'completed' }
      ];
      const rangeSessions = cv.getSessionsInRange('2026-04-10', '2026-04-20');
      const dateSessions = cv.getSessionsForDate('2026-04-15');

      // Cleanup
      div.remove();

      return {
        noRange,
        inRange,
        startNotInRange,
        endNotInRange,
        beforeRange,
        afterRange,
        afterClear,
        rangeSessionCount: rangeSessions.length,
        dateSessionCount: dateSessions.length
      };
    });

    expect(result.noRange).toBe(false);
    expect(result.inRange).toBe(true);
    expect(result.startNotInRange).toBe(false);  // Endpoints exclusive from isInRange
    expect(result.endNotInRange).toBe(false);
    expect(result.beforeRange).toBe(false);
    expect(result.afterRange).toBe(false);
    expect(result.afterClear).toBe(false);
    expect(result.rangeSessionCount).toBe(3);    // Apr 10, 15, 20 (inclusive)
    expect(result.dateSessionCount).toBe(1);     // Only Apr 15
  });

  test('applySessionFilters handles both single date and range objects', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await waitForAppReady(page);

    await page.waitForFunction(() => typeof window.applySessionFilters === 'function');

    const result = await page.evaluate(() => {
      const sessions = [
        { workout_name: 'Push', completed_at: '2026-04-10T10:00:00Z', status: 'completed' },
        { workout_name: 'Pull', completed_at: '2026-04-15T10:00:00Z', status: 'completed' },
        { workout_name: 'Legs', completed_at: '2026-04-20T10:00:00Z', status: 'completed' }
      ];

      // Save and restore original state
      const origFilter = window.ffn.workoutHistory.dateFilter;
      const origWorkoutFilters = window.ffn.workoutHistory.workoutTypeFilters;
      window.ffn.workoutHistory.workoutTypeFilters = [];

      // Test single date
      window.ffn.workoutHistory.dateFilter = '2026-04-15';
      const singleResult = window.applySessionFilters(sessions);

      // Test range
      window.ffn.workoutHistory.dateFilter = { start: '2026-04-10', end: '2026-04-16' };
      const rangeResult = window.applySessionFilters(sessions);

      // Test no filter
      window.ffn.workoutHistory.dateFilter = null;
      const noFilterResult = window.applySessionFilters(sessions);

      // Restore
      window.ffn.workoutHistory.dateFilter = origFilter;
      window.ffn.workoutHistory.workoutTypeFilters = origWorkoutFilters;

      return {
        singleCount: singleResult.length,
        rangeCount: rangeResult.length,
        noFilterCount: noFilterResult.length
      };
    });

    expect(result.singleCount).toBe(1);
    expect(result.rangeCount).toBe(2);     // Apr 10 and Apr 15 are in range
    expect(result.noFilterCount).toBe(3);
  });

  test('calendar global functions are exported', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await waitForAppReady(page);

    const exports = await page.evaluate(() => ({
      initHistoryCalendar: typeof window.initHistoryCalendar === 'function',
      showDayDetailOffcanvas: typeof window.showDayDetailOffcanvas === 'function',
      setDateFilter: typeof window.setDateFilter === 'function',
      setDateRangeFilter: typeof window.setDateRangeFilter === 'function',
      clearDateFilter: typeof window.clearDateFilter === 'function',
      initCalendarPresets: typeof window.initCalendarPresets === 'function',
      applyCalendarPreset: typeof window.applyCalendarPreset === 'function',
      toggleRangeMode: typeof window.toggleRangeMode === 'function',
      renderCalendarRangeSessions: typeof window.renderCalendarRangeSessions === 'function',
      hideCalendarRangeSessions: typeof window.hideCalendarRangeSessions === 'function'
    }));

    Object.entries(exports).forEach(([name, exists]) => {
      expect(exists, `${name} should be exported`).toBe(true);
    });
  });
});
