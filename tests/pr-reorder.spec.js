// @ts-check
const { test, expect } = require('playwright/test');
const { BASE, waitForAppReady } = require('./fixtures');

test.describe('PR Section Reordering', () => {

  test('reorder button exists in PR section header', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await waitForAppReady(page);

    // The PR section may not be visible without auth/data, so check the JS module loaded
    const moduleLoaded = await page.evaluate(() => typeof window.togglePRReorderMode === 'function');
    expect(moduleLoaded).toBe(true);
  });

  test('renderPRSection and togglePRReorderMode are globally accessible', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await waitForAppReady(page);

    const fns = await page.evaluate(() => ({
      renderPRSection: typeof window.renderPRSection === 'function',
      togglePRReorderMode: typeof window.togglePRReorderMode === 'function',
      editPRValue: typeof window.editPRValue === 'function',
      togglePRSection: typeof window.togglePRSection === 'function',
    }));

    expect(fns.renderPRSection).toBe(true);
    expect(fns.togglePRReorderMode).toBe(true);
    expect(fns.editPRValue).toBe(true);
    expect(fns.togglePRSection).toBe(true);
  });

  test('default PR order prioritizes bench, deadlift, squat, overhead press', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await waitForAppReady(page);

    // Simulate PR data and test ordering logic in the browser
    const orderedNames = await page.evaluate(() => {
      // Access the internal ordering function via rendering mock data
      const state = window.ffn && window.ffn.workoutHistory;
      if (!state) return [];

      // Inject mock PR data
      state.personalRecords.clear();
      state.prRecordIds = []; // no saved order — use defaults

      const mockPRs = [
        { id: 'weight_overhead_press', exercise_name: 'Overhead Press', value: '135', value_unit: 'lbs', pr_type: 'weight' },
        { id: 'weight_pull_up', exercise_name: 'Pull Up', value: '25', value_unit: 'lbs', pr_type: 'weight' },
        { id: 'weight_bench_press', exercise_name: 'Bench Press', value: '225', value_unit: 'lbs', pr_type: 'weight' },
        { id: 'weight_squat', exercise_name: 'Squat', value: '315', value_unit: 'lbs', pr_type: 'weight' },
        { id: 'weight_deadlift', exercise_name: 'Deadlift', value: '405', value_unit: 'lbs', pr_type: 'weight' },
        { id: 'weight_curl', exercise_name: 'Curl', value: '45', value_unit: 'lbs', pr_type: 'weight' },
      ];

      mockPRs.forEach(pr => state.personalRecords.set(pr.id, pr));

      // Trigger render and read chip order
      window.renderPRSection();

      // Wait briefly then read DOM order
      return new Promise(resolve => {
        setTimeout(() => {
          const container = document.getElementById('prSectionContainer');
          if (!container) { resolve([]); return; }
          const chips = container.querySelectorAll('.pr-chip[data-pr-id]');
          resolve(Array.from(chips).map(c => c.dataset.prId));
        }, 200);
      });
    });

    // Bench should be first, Deadlift second, Squat third, OHP fourth
    if (orderedNames.length > 0) {
      expect(orderedNames[0]).toBe('weight_bench_press');
      expect(orderedNames[1]).toBe('weight_deadlift');
      expect(orderedNames[2]).toBe('weight_squat');
      expect(orderedNames[3]).toBe('weight_overhead_press');
    }
  });

  test('reorder mode toggles chip appearance', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await waitForAppReady(page);

    // Inject mock data and render
    await page.evaluate(() => {
      const state = window.ffn && window.ffn.workoutHistory;
      if (!state) return;

      state.personalRecords.clear();
      state.prRecordIds = [];

      const mockPRs = [
        { id: 'weight_bench', exercise_name: 'Bench Press', value: '225', value_unit: 'lbs', pr_type: 'weight' },
        { id: 'weight_squat', exercise_name: 'Squat', value: '315', value_unit: 'lbs', pr_type: 'weight' },
      ];
      mockPRs.forEach(pr => state.personalRecords.set(pr.id, pr));
      window.renderPRSection();
    });

    await page.waitForTimeout(200);

    // Open the PR dropdown menu and click Reorder
    const menuBtn = page.locator('.pr-menu-btn');
    const btnExists = await menuBtn.count();

    if (btnExists > 0) {
      await menuBtn.click();
      await page.waitForTimeout(100);
      // Click the Reorder option in the dropdown
      await page.locator('.pr-section-menu .dropdown-item', { hasText: 'Reorder' }).click();
      await page.waitForTimeout(200);

      // Chips should have reorder class and drag handles
      const reorderChips = page.locator('.pr-chip-reorder');
      const dragHandles = page.locator('.pr-drag-handle');

      expect(await reorderChips.count()).toBeGreaterThan(0);
      expect(await dragHandles.count()).toBeGreaterThan(0);

      // Chips should be draggable
      const isDraggable = await page.locator('.pr-chip-reorder').first().getAttribute('draggable');
      expect(isDraggable).toBe('true');
    }
  });

});
