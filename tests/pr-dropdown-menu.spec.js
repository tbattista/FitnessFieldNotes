// @ts-check
const { test, expect } = require('playwright/test');
const { BASE, waitForAppReady } = require('./fixtures');

test.describe('PR Section Dropdown Menu', () => {

  test('3-dot menu button exists instead of separate buttons', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await waitForAppReady(page);

    // Render PR section with mock data
    await page.evaluate(() => {
      const state = window.ffn && window.ffn.workoutHistory;
      if (!state) return;
      state.personalRecords = state.personalRecords || new Map();
      const mockPRs = [
        { id: 'weight_bench', exercise_name: 'Bench Press', value: '225', value_unit: 'lbs', pr_type: 'weight' },
      ];
      mockPRs.forEach(pr => state.personalRecords.set(pr.id, pr));
      window.renderPRSection();
    });

    await page.waitForTimeout(200);

    // 3-dot menu button should exist
    const menuBtn = page.locator('.pr-menu-btn');
    await expect(menuBtn).toHaveCount(1);

    // Old separate buttons should NOT exist
    await expect(page.locator('.pr-add-btn')).toHaveCount(0);
    await expect(page.locator('.pr-collapse-btn')).toHaveCount(0);
    await expect(page.locator('.pr-reorder-btn')).toHaveCount(0);
  });

  test('dropdown menu contains Add PR, Hide, and Reorder options', async ({ page }) => {
    await page.goto(`${BASE}/workout-history.html`);
    await waitForAppReady(page);

    // Render PR section with mock data and make containers visible
    await page.evaluate(() => {
      // Make both mobile and desktop containers visible
      document.querySelectorAll('#prSectionContainer, #desktopPrSectionContainer').forEach(el => {
        el.style.display = 'block';
      });
      const state = window.ffn && window.ffn.workoutHistory;
      if (!state) return;
      state.personalRecords = state.personalRecords || new Map();
      state.personalRecords.set('weight_bench', {
        id: 'weight_bench', exercise_name: 'Bench Press', value: '225', value_unit: 'lbs', pr_type: 'weight'
      });
      window.renderPRSection();
    });

    await page.waitForTimeout(200);

    // Verify dropdown items exist in the rendered HTML
    const items = page.locator('.pr-section-menu .dropdown-item');
    // There may be 3 or 6 items (mobile + desktop), check at least 3
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(3);
    await expect(items.nth(0)).toContainText('Add PR');
    await expect(items.nth(1)).toContainText('Hide');
    await expect(items.nth(2)).toContainText('Reorder');
  });
});
