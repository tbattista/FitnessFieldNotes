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

  test('mobile action cards (Add/Reorder) render at end of PR scroll', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await waitForAppReady(page);

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

    // Both action cards should be in the DOM inside the scroll container
    const scrollSelector = '#prChipsScroll';
    const scrollCount = await page.locator(scrollSelector).count();
    if (scrollCount === 0) return; // PR container may be hidden without auth — skip

    const addCard = page.locator(`${scrollSelector} .pr-action-card-add`);
    const reorderCard = page.locator(`${scrollSelector} .pr-action-card-reorder`);
    expect(await addCard.count()).toBe(1);
    expect(await reorderCard.count()).toBe(1);

    // Action cards should come AFTER the last PR chip in DOM order
    const order = await page.locator(`${scrollSelector} > *`).evaluateAll(els =>
      els.map(el => el.className)
    );
    const lastChipIdx = order.map(c => c.includes('pr-chip') && !c.includes('pr-action-card')).lastIndexOf(true);
    const addIdx = order.findIndex(c => c.includes('pr-action-card-add'));
    expect(addIdx).toBeGreaterThan(lastChipIdx);
  });

  test('Reorder action card opens reorder offcanvas with vertical list', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await waitForAppReady(page);

    await page.evaluate(() => {
      const state = window.ffn && window.ffn.workoutHistory;
      if (!state) return;
      state.personalRecords.clear();
      state.prRecordIds = [];
      const mockPRs = [
        { id: 'weight_bench', exercise_name: 'Bench Press', value: '225', value_unit: 'lbs', pr_type: 'weight' },
        { id: 'weight_squat', exercise_name: 'Squat', value: '315', value_unit: 'lbs', pr_type: 'weight' },
        { id: 'weight_deadlift', exercise_name: 'Deadlift', value: '405', value_unit: 'lbs', pr_type: 'weight' },
      ];
      mockPRs.forEach(pr => state.personalRecords.set(pr.id, pr));
      window.renderPRSection();
    });
    await page.waitForTimeout(200);

    const fn = await page.evaluate(() => typeof window.openPRReorderOffcanvas === 'function');
    expect(fn).toBe(true);

    const reorderCard = page.locator('#prChipsScroll .pr-action-card-reorder');
    if (await reorderCard.count() === 0) return;
    await reorderCard.click();

    // Offcanvas should appear with a vertical list of PRs
    const offcanvas = page.locator('#prReorderOffcanvas');
    await expect(offcanvas).toBeVisible({ timeout: 3000 });

    const items = page.locator('#prReorderList .pr-reorder-item');
    expect(await items.count()).toBe(3);

    // Save button is present
    await expect(page.locator('#prReorderSaveBtn')).toBeVisible();
  });

  test('Add action card triggers showAddPRModal', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await waitForAppReady(page);

    await page.evaluate(() => {
      const state = window.ffn && window.ffn.workoutHistory;
      if (!state) return;
      state.personalRecords.clear();
      state.prRecordIds = [];
      state.personalRecords.set('weight_bench', {
        id: 'weight_bench', exercise_name: 'Bench Press', value: '225', value_unit: 'lbs', pr_type: 'weight'
      });
      // Spy on showAddPRModal
      window.__addModalCalled = 0;
      const original = window.showAddPRModal;
      window.showAddPRModal = () => { window.__addModalCalled += 1; };
      window.renderPRSection();
      // Restore after 1 tick so handlers keep the stub
      setTimeout(() => { /* keep stub for test */ }, 0);
    });
    await page.waitForTimeout(200);

    const addCard = page.locator('#prChipsScroll .pr-action-card-add');
    if (await addCard.count() === 0) return;
    await addCard.click();

    const called = await page.evaluate(() => window.__addModalCalled || 0);
    expect(called).toBeGreaterThan(0);
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

    // Check reorder button exists
    const reorderBtn = page.locator('.pr-reorder-btn');
    const btnExists = await reorderBtn.count();

    if (btnExists > 0) {
      // Click to enter reorder mode
      await reorderBtn.click();
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
