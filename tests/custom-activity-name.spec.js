// @ts-check
const { test, expect } = require('playwright/test');
const { BASE, waitForAppReady } = require('./fixtures');

/**
 * Helper: bypass auth and show activity log content
 */
async function showActivityLog(page) {
  await page.goto(`${BASE}/activity-log.html`);
  await waitForAppReady(page);

  // Bypass auth gate: show main content and initialize
  await page.evaluate(() => {
    const authEl = document.getElementById('authRequiredState');
    const contentEl = document.getElementById('activityLogContent');
    if (authEl) authEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'block';
    if (window.initActivityLog) window.initActivityLog();
  });
  await page.waitForTimeout(500);
}

test.describe('Custom Activity Name', () => {

  test('session name field is hidden until an activity type is selected', async ({ page }) => {
    await showActivityLog(page);

    const nameRow = page.locator('#sessionNameRow');
    await expect(nameRow).toBeHidden();

    // Click the first activity type button
    const firstActivityBtn = page.locator('.activity-type-btn[data-type]').first();
    await firstActivityBtn.click();

    // Now the name field should be visible
    await expect(nameRow).toBeVisible();
  });

  test('session name input has a dynamic placeholder after selecting activity', async ({ page }) => {
    await showActivityLog(page);

    // Select an activity
    const firstActivityBtn = page.locator('.activity-type-btn[data-type]').first();
    await firstActivityBtn.click();

    const nameInput = page.locator('#sessionName');
    await expect(nameInput).toBeVisible();

    // Placeholder should contain helpful example text
    const placeholder = await nameInput.getAttribute('placeholder');
    expect(placeholder).toBeTruthy();
    expect(placeholder.startsWith('e.g.,')).toBeTruthy();
  });

  test('user can type a custom session name', async ({ page }) => {
    await showActivityLog(page);

    // Select activity
    const firstActivityBtn = page.locator('.activity-type-btn[data-type]').first();
    await firstActivityBtn.click();

    // Type a custom name
    const nameInput = page.locator('#sessionName');
    await nameInput.fill('Kettlebell Leg HIIT');
    await expect(nameInput).toHaveValue('Kettlebell Leg HIIT');
  });

  test('session name input enforces maxlength of 100', async ({ page }) => {
    await showActivityLog(page);

    const firstActivityBtn = page.locator('.activity-type-btn[data-type]').first();
    await firstActivityBtn.click();

    const nameInput = page.locator('#sessionName');
    const maxLength = await nameInput.getAttribute('maxlength');
    expect(maxLength).toBe('100');
  });
});
