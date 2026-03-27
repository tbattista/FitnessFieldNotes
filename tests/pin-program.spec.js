// @ts-check
const { test, expect } = require('playwright/test');
const { BASE, waitForAppReady } = require('./fixtures');

test.describe('Pin Program to Active', () => {

  test.beforeEach(async ({ page }) => {
    // Seed localStorage with a program so the programs page has something to show
    await page.goto(`${BASE}/programs.html`);
    await page.evaluate(() => {
      const programs = [{
        id: 'test-program-1',
        name: 'Test Strength Program',
        description: 'A test program',
        difficulty_level: 'intermediate',
        duration_weeks: 4,
        tags: ['strength'],
        workouts: [],
        created_date: new Date().toISOString(),
        modified_date: new Date().toISOString()
      }];
      localStorage.setItem('gym_programs', JSON.stringify(programs));
      localStorage.removeItem('ffn_active_program_id');
    });
    await page.reload();
    await waitForAppReady(page);
  });

  test('program card dropdown contains Set as Active Program option', async ({ page }) => {
    // Wait for at least one program card to appear
    const card = page.locator('.program-card').first();
    await expect(card).toBeAttached({ timeout: 5000 });

    // Click the 3-dot menu button
    const menuBtn = card.locator('[data-bs-toggle="dropdown"]');
    await menuBtn.click();

    // The dropdown menu should show "Set as Active Program"
    const pinItem = card.locator('[data-action="toggle-active"]');
    await expect(pinItem).toBeVisible({ timeout: 3000 });
    await expect(pinItem).toContainText('Set as Active Program');
  });

  test('clicking Set as Active Program sets localStorage and shows badge', async ({ page }) => {
    const card = page.locator('.program-card').first();
    await expect(card).toBeAttached({ timeout: 5000 });

    // Click the 3-dot menu
    const menuBtn = card.locator('[data-bs-toggle="dropdown"]');
    await menuBtn.click();

    // Click "Set as Active Program"
    const pinItem = card.locator('[data-action="toggle-active"]');
    await pinItem.click();

    // Wait for re-render - the active program ID should be in localStorage
    await page.waitForFunction(() => {
      return localStorage.getItem('ffn_active_program_id') === 'test-program-1';
    }, null, { timeout: 5000 });

    // The dropdown should be closed after clicking
    const dropdownMenu = card.locator('.dropdown-menu');
    await expect(dropdownMenu).not.toBeVisible({ timeout: 3000 });
  });

});
