// @ts-check
const { test, expect } = require('playwright/test');
const { BASE, waitForAppReady, injectWorkouts } = require('./fixtures');
const { STANDARD_WORKOUT } = require('./test-data');

/**
 * Generate N workout objects for pagination testing.
 * Each workout gets a unique id and name.
 */
function generateWorkouts(count) {
  const workouts = [];
  for (let i = 1; i <= count; i++) {
    workouts.push({
      ...STANDARD_WORKOUT,
      id: `test-workout-${i}`,
      name: `Workout ${String(i).padStart(3, '0')}`,
      modified_date: new Date(Date.now() - i * 60000).toISOString(),
    });
  }
  return workouts;
}

test.describe('Workout Database Pagination', () => {

  test('pagination controls appear when workouts exceed page size', async ({ page }) => {
    // Default pageSize is 20, inject 25 workouts
    const workouts = generateWorkouts(25);
    await page.goto(`${BASE}/settings.html`);
    await injectWorkouts(page, workouts);
    await page.goto(`${BASE}/workout-database.html`);
    await waitForAppReady(page);

    // Pagination should be visible
    const pagination = page.locator('.workout-grid-pagination');
    await expect(pagination).toBeVisible({ timeout: 5000 });

    // Should show page 1 and page 2
    const page1 = page.locator('.pagination [data-page="1"]');
    const page2 = page.locator('.pagination [data-page="2"]');
    await expect(page1).toBeAttached();
    await expect(page2).toBeAttached();
  });

  test('clicking page 2 shows different workout cards', async ({ page }) => {
    const workouts = generateWorkouts(25);
    await page.goto(`${BASE}/settings.html`);
    await injectWorkouts(page, workouts);
    await page.goto(`${BASE}/workout-database.html`);
    await waitForAppReady(page);

    // Capture first card name on page 1
    const firstCardPage1 = await page.locator('#workoutCardsGrid .col').first().textContent();

    // Click page 2
    await page.locator('.pagination [data-page="2"]').click();
    await page.waitForTimeout(500);

    // Cards should be different on page 2
    const firstCardPage2 = await page.locator('#workoutCardsGrid .col').first().textContent();
    expect(firstCardPage1).not.toEqual(firstCardPage2);

    // Page 2 should be active
    const activePage = page.locator('.pagination .page-item.active [data-page]');
    await expect(activePage).toHaveAttribute('data-page', '2');
  });

  test('clicking previous/next navigation works', async ({ page }) => {
    const workouts = generateWorkouts(25);
    await page.goto(`${BASE}/settings.html`);
    await injectWorkouts(page, workouts);
    await page.goto(`${BASE}/workout-database.html`);
    await waitForAppReady(page);

    // Click next (page 2)
    await page.locator('.pagination [aria-label="Next"]').click();
    await page.waitForTimeout(500);

    const activePage = page.locator('.pagination .page-item.active [data-page]');
    await expect(activePage).toHaveAttribute('data-page', '2');

    // Click previous (back to page 1)
    await page.locator('.pagination [aria-label="Previous"]').click();
    await page.waitForTimeout(500);

    await expect(activePage).toHaveAttribute('data-page', '1');
  });

  test('pagination is hidden when workouts fit on one page', async ({ page }) => {
    const workouts = generateWorkouts(5);
    await page.goto(`${BASE}/settings.html`);
    await injectWorkouts(page, workouts);
    await page.goto(`${BASE}/workout-database.html`);
    await waitForAppReady(page);

    // Pagination should not be visible
    const pagination = page.locator('.workout-grid-pagination');
    await expect(pagination).toBeHidden();
  });
});
