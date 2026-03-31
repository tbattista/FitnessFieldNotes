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

  test('program cards show tap-to-edit footer', async ({ page }) => {
    await page.goto(`${BASE}/programs.html`);
    await waitForAppReady(page);
    await page.waitForTimeout(1000);

    const cards = page.locator('.program-card');
    const cardCount = await cards.count();

    if (cardCount > 0) {
      const footer = cards.first().locator('.program-card-footer');
      await expect(footer).toBeAttached();
      await expect(footer).toContainText('Tap to edit');
    }
  });

  test('clicking program card opens detail offcanvas with grab bar', async ({ page }) => {
    await page.goto(`${BASE}/programs.html`);
    await waitForAppReady(page);
    await page.waitForTimeout(1000);

    const cards = page.locator('.program-card');
    const cardCount = await cards.count();

    if (cardCount > 0) {
      // Click the card body (not dropdown)
      await cards.first().click();

      const offcanvas = page.locator('#programDetailOffcanvas');
      await expect(offcanvas).toBeVisible({ timeout: 3000 });

      // Grab bar should be present
      const grabBar = offcanvas.locator('.offcanvas-grab-bar');
      await expect(grabBar).toBeAttached();

      // Add Workouts button should be visible and prominent
      const addBtn = offcanvas.locator('#addWorkoutsBtn');
      await expect(addBtn).toBeAttached();
      await expect(addBtn).toContainText('Add Workouts');
    }
  });

  test('program detail offcanvas shows workout chips with numbers and drag handles', async ({ page }) => {
    await page.goto(`${BASE}/programs.html`);
    await waitForAppReady(page);
    await page.waitForTimeout(1000);

    const cards = page.locator('.program-card');
    const cardCount = await cards.count();

    if (cardCount > 0) {
      await cards.first().click();

      const offcanvas = page.locator('#programDetailOffcanvas');
      await expect(offcanvas).toBeVisible({ timeout: 3000 });

      // Check for workout chips (if any workouts in the program)
      const chips = offcanvas.locator('.workout-chip');
      const chipCount = await chips.count();

      if (chipCount > 0) {
        // Number badge should exist
        const numberBadge = chips.first().locator('.workout-chip-number');
        await expect(numberBadge).toBeAttached();
        await expect(numberBadge).toHaveText('1');

        // Drag handle should use grid-vertical icon
        const handle = chips.first().locator('.workout-chip-handle .bx-grid-vertical');
        await expect(handle).toBeAttached();

        // Reorder hint should be above the list
        const hint = offcanvas.locator('text=Hold and drag to reorder');
        await expect(hint).toBeAttached();
      }
    }
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
