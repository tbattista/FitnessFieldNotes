// @ts-check
const { test, expect } = require('@playwright/test');
const { BASE } = require('./fixtures');

test.describe('Program Tracking Feature', () => {

  test('program modal has tracker toggle', async ({ page }) => {
    await page.goto(`${BASE}/programs.html`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Open create program modal
    const createBtn = page.locator('#createProgramBtn');
    await expect(createBtn).toBeAttached({ timeout: 10000 });
    await createBtn.click();

    const modal = page.locator('#programModal');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Tracker toggle should exist
    const trackerToggle = page.locator('#programTrackerEnabled');
    await expect(trackerToggle).toBeAttached();
    await expect(trackerToggle).not.toBeChecked();

    // Goal selector should be hidden initially
    const goalGroup = page.locator('#trackerGoalGroup');
    await expect(goalGroup).toBeHidden();
  });

  test('enabling tracker toggle shows goal selector', async ({ page }) => {
    await page.goto(`${BASE}/programs.html`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Open create program modal
    await page.locator('#createProgramBtn').click();
    await expect(page.locator('#programModal')).toBeVisible({ timeout: 5000 });

    // Toggle tracker on
    const trackerToggle = page.locator('#programTrackerEnabled');
    await trackerToggle.check();

    // Goal selector should now be visible
    const goalGroup = page.locator('#trackerGoalGroup');
    await expect(goalGroup).toBeVisible();

    // Select a goal
    const goalSelect = page.locator('#programTrackerGoal');
    await goalSelect.selectOption('3/week');
    await expect(goalSelect).toHaveValue('3/week');
  });

  test('program progress component script loads on programs page', async ({ page }) => {
    await page.goto(`${BASE}/programs.html`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const hasProgramProgress = await page.evaluate(() => typeof window.ProgramProgress === 'function');
    expect(hasProgramProgress).toBe(true);
  });

  test('program progress component script loads on home page', async ({ page }) => {
    await page.goto(`${BASE}/`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const hasProgramProgress = await page.evaluate(() => typeof window.ProgramProgress === 'function');
    expect(hasProgramProgress).toBe(true);
  });

  test('program tracker section exists on home page', async ({ page }) => {
    await page.goto(`${BASE}/`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // The tracker section should exist in the DOM (either mobile or desktop variant)
    const trackerSection = page.locator('#programTrackerSection, #desktopProgramTrackerSection, #mobile_programTrackerSection');
    await expect(trackerSection.first()).toBeAttached();
  });

  test('program card dropdown has Enable Tracker option', async ({ page }) => {
    await page.goto(`${BASE}/programs.html`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Check if any program cards exist; if so, verify dropdown has tracker option
    const cards = page.locator('.program-card');
    const cardCount = await cards.count();
    if (cardCount > 0) {
      // Open the dropdown on the first card
      const firstCard = cards.first();
      const dropdownBtn = firstCard.locator('[data-bs-toggle="dropdown"]');
      await dropdownBtn.click();

      // Should have an Enable Tracker option
      const trackerOption = firstCard.locator('[data-action="toggle-tracker"]');
      await expect(trackerOption).toBeAttached();
    }
  });

  test('API progress endpoint returns auth error for unauthenticated requests', async ({ page }) => {
    const response = await page.request.get(`${BASE}/api/v3/firebase/programs/test-id/progress`);
    // Should get 401 (unauthenticated) - not 404 (route not found) or 405
    expect(response.status()).toBe(401);
  });

});
