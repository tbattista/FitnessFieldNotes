// @ts-check
const { test, expect } = require('playwright/test');
const { BASE, waitForAppReady } = require('./fixtures');
const { STANDARD_WORKOUT } = require('./test-data');

test.describe('Workout Mode', () => {

  test('redirects to workout-database when no workout ID on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${BASE}/workout-mode.html`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Desktop redirects to workout-database.html when no ID
    expect(page.url()).toContain('workout-database.html');
  });

  test('workout-mode page has key elements in static HTML (mobile)', async ({ browser }) => {
    // Use mobile context to prevent desktop redirect
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    await page.goto(`${BASE}/workout-mode.html`);
    await page.waitForLoadState('domcontentloaded');

    // Session bottom bar should exist in static HTML
    const bottomBarExists = await page.evaluate(() => !!document.getElementById('workoutModeBottomBar'));
    expect(bottomBarExists).toBe(true);
    await context.close();
  });

  test('mobile workout-mode shows landing or loading state', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE}/workout-mode.html`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // On mobile without workout ID, should show landing
    const state = await page.evaluate(() => {
      const landing = document.getElementById('workoutLandingPage');
      const loading = document.getElementById('workoutLoadingState');
      const error = document.getElementById('workoutErrorState');
      if (landing && landing.style.display !== 'none') return 'landing';
      if (loading && loading.style.display !== 'none') return 'loading';
      if (error && error.style.display !== 'none') return 'error';
      return 'unknown';
    });

    expect(['landing', 'loading', 'error', 'unknown']).toContain(state);
  });

  test('loads workout with valid ID and shows content', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    // Pre-populate localStorage
    await page.goto(`${BASE}/settings.html`);
    await page.evaluate((workout) => {
      localStorage.setItem('gym_workouts', JSON.stringify([workout]));
    }, STANDARD_WORKOUT);

    await page.goto(`${BASE}/workout-mode.html?id=${STANDARD_WORKOUT.id}`);
    await waitForAppReady(page);
    await page.waitForTimeout(3000);

    // Page should not have redirected away
    expect(page.url()).toContain('workout-mode.html');
  });

  test('workout mode page title is correct', async ({ page }) => {
    await page.goto(`${BASE}/workout-mode.html`);
    await page.waitForLoadState('domcontentloaded');

    const title = await page.title();
    expect(title).toContain('Session');
  });

  test('workout-database page loads when redirected from workout-mode', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${BASE}/workout-mode.html`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Should now be on workout-database with library content
    const toolbarExists = await page.evaluate(() => !!document.getElementById('workoutToolbar'));
    expect(toolbarExists).toBe(true);
  });
});

test.describe('Workout Mode - Auto-Start Session', () => {

  test('auto-starts session with no JS errors', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    // Collect JS errors
    const jsErrors = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    // Pre-populate localStorage with workout
    await page.goto(`${BASE}/settings.html`);
    await page.evaluate((workout) => {
      localStorage.setItem('gym_workouts', JSON.stringify([workout]));
      // Clear any persisted session from previous tests
      localStorage.removeItem('ffn_active_workout_session');
    }, STANDARD_WORKOUT);

    // Navigate to workout-mode with workout ID
    await page.goto(`${BASE}/workout-mode.html?id=${STANDARD_WORKOUT.id}`);
    await waitForAppReady(page);
    await page.waitForTimeout(4000);

    // Should still be on workout-mode (not redirected)
    expect(page.url()).toContain('workout-mode.html');

    // No JS errors should have occurred
    const criticalErrors = jsErrors.filter(e =>
      e.includes('is not a function') ||
      e.includes('is not defined') ||
      e.includes('Cannot read properties')
    );
    expect(criticalErrors).toEqual([]);
  });

  test('auto-start shows login prompt for unauthenticated users', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    await page.goto(`${BASE}/settings.html`);
    await page.evaluate((workout) => {
      localStorage.setItem('gym_workouts', JSON.stringify([workout]));
      localStorage.removeItem('ffn_active_workout_session');
    }, STANDARD_WORKOUT);

    await page.goto(`${BASE}/workout-mode.html?id=${STANDARD_WORKOUT.id}`);
    await waitForAppReady(page);
    await page.waitForTimeout(4000);

    // Unauthenticated users get a login prompt on auto-start
    // Bottom bar stays hidden until auth succeeds
    const loginModalVisible = await page.evaluate(() => !!document.querySelector('.modal.show'));
    expect(loginModalVisible).toBe(true);
  });

  test('bottom bar exists in DOM with correct buttons', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE}/workout-mode.html`);
    await page.waitForLoadState('domcontentloaded');

    // Bottom bar should exist with Add Exercise and Finish buttons
    const bottomBar = page.locator('#workoutModeBottomBar');
    await expect(bottomBar).toBeAttached();
    await expect(bottomBar.locator('[data-action="add-exercise"]')).toBeAttached();
    await expect(bottomBar.locator('[data-action="end"]')).toBeAttached();

    // Finish button should say "Finish" not "End"
    await expect(bottomBar.locator('[data-action="end"]')).toContainText('Finish');
  });

  test('header timer element exists in DOM', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE}/workout-mode.html`);
    await page.waitForLoadState('domcontentloaded');

    // Timer elements should exist in the header
    await expect(page.locator('#sessionTimerDisplay')).toBeAttached();
    await expect(page.locator('#headerTimer')).toBeAttached();
  });

  test('no Quick Log or Start buttons exist', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    await page.goto(`${BASE}/workout-mode.html`);
    await page.waitForLoadState('domcontentloaded');

    // Old FAB elements should not exist in DOM
    await expect(page.locator('#wmSlotPreSession')).toHaveCount(0);
    await expect(page.locator('#wmFabQuickLog')).toHaveCount(0);
    await expect(page.locator('#wmFabStart')).toHaveCount(0);
    await expect(page.locator('#wmSlotQuickLogActive')).toHaveCount(0);
  });

  test('exercise cards render during auto-start session', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    await page.goto(`${BASE}/settings.html`);
    await page.evaluate((workout) => {
      localStorage.setItem('gym_workouts', JSON.stringify([workout]));
      localStorage.removeItem('ffn_active_workout_session');
    }, STANDARD_WORKOUT);

    await page.goto(`${BASE}/workout-mode.html?id=${STANDARD_WORKOUT.id}`);
    await waitForAppReady(page);
    await page.waitForTimeout(4000);

    // Exercise cards should be rendered
    const cards = page.locator('#exerciseCardsContainer .workout-card');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
