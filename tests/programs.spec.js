// @ts-check
const { test, expect } = require('playwright/test');
const { BASE, waitForAppReady } = require('./fixtures');

test.describe('Programs', () => {

  test('programs page loads successfully', async ({ page }) => {
    await page.goto(`${BASE}/programs.html`);
    await waitForAppReady(page);

    const grid = page.locator('#programsGridContainer');
    await expect(grid).toBeAttached();
  });

  test('programs toolbar has search input', async ({ page }) => {
    await page.goto(`${BASE}/programs.html`);
    await waitForAppReady(page);

    const searchInput = page.locator('#programSearchInput');
    await expect(searchInput).toBeAttached();
  });

  test('create program button exists', async ({ page }) => {
    await page.goto(`${BASE}/programs.html`);
    await waitForAppReady(page);

    const createBtn = page.locator('#createProgramBtn');
    await expect(createBtn).toBeAttached();
  });

  test('create program button opens modal', async ({ page }) => {
    await page.goto(`${BASE}/programs.html`);
    await waitForAppReady(page);

    const createBtn = page.locator('#createProgramBtn');
    await createBtn.click();

    const modal = page.locator('#programModal');
    await expect(modal).toBeVisible({ timeout: 3000 });

    // Modal should have form fields
    await expect(page.locator('#programName')).toBeVisible();
    await expect(page.locator('#programDescription')).toBeVisible();
    await expect(page.locator('#saveProgramBtn')).toBeVisible();
  });

  test('program modal has all required form fields', async ({ page }) => {
    await page.goto(`${BASE}/programs.html`);
    await waitForAppReady(page);

    await page.locator('#createProgramBtn').click();
    const modal = page.locator('#programModal.show, #programModal[style*="display: block"]');
    await expect(modal).toBeVisible({ timeout: 3000 });

    await expect(page.locator('#programName')).toBeAttached();
    await expect(page.locator('#programDescription')).toBeAttached();
    await expect(page.locator('#programDuration')).toBeAttached();
    await expect(page.locator('#programDifficulty')).toBeAttached();
    await expect(page.locator('#programTags')).toBeAttached();
  });

  test('sort button exists in toolbar', async ({ page }) => {
    await page.goto(`${BASE}/programs.html`);
    await waitForAppReady(page);

    const sortBtn = page.locator('#sortCycleBtn');
    await expect(sortBtn).toBeAttached();
  });

  test('filter button opens filter offcanvas', async ({ page }) => {
    await page.goto(`${BASE}/programs.html`);
    await waitForAppReady(page);

    const filterBtn = page.locator('#filterBtn');
    await filterBtn.click();

    const offcanvas = page.locator('#filtersOffcanvas');
    await expect(offcanvas).toBeVisible({ timeout: 3000 });
  });

  test('programs page shows total count', async ({ page }) => {
    await page.goto(`${BASE}/programs.html`);
    await waitForAppReady(page);

    const countEl = page.locator('#totalProgramsCount');
    await expect(countEl).toBeAttached();
  });

  test('programs page has alertContainer for toast notifications', async ({ page }) => {
    await page.goto(`${BASE}/programs.html`);
    await waitForAppReady(page);

    const alertContainer = page.locator('#alertContainer');
    await expect(alertContainer).toBeAttached();
  });

  test('set active program dropdown item exists on program cards', async ({ page }) => {
    await page.goto(`${BASE}/programs.html`);
    await waitForAppReady(page);

    // Wait for grid to render
    await page.waitForTimeout(1000);

    // Check if any program cards exist
    const cards = page.locator('.program-card');
    const cardCount = await cards.count();

    if (cardCount > 0) {
      // Open the first card's dropdown menu
      const firstDropdownBtn = cards.first().locator('[data-bs-toggle="dropdown"]');
      await firstDropdownBtn.click();

      // Verify the toggle-active action exists in the dropdown
      const toggleActiveItem = page.locator('[data-action="toggle-active"]');
      await expect(toggleActiveItem).toBeVisible({ timeout: 2000 });
    }
  });
});
