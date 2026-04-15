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

  test('_detectProgramId falls back to any program containing the workout', async ({ page }) => {
    // Regression test for program workout tracking bug: previously the
    // detection only matched pinned or tracker-enabled programs, so sessions
    // for workouts in ordinary programs were never linked.
    await page.goto(`${BASE}/workout-mode.html?id=does-not-matter`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    const detected = await page.evaluate(async () => {
      // Stub dataManager to return a single non-tracker, non-pinned program
      window.dataManager = window.dataManager || {};
      window.dataManager.getPrograms = async () => ([
        {
          id: 'prog-fallback-1',
          name: 'Ordinary Program',
          tracker_enabled: false,
          workouts: [{ workout_id: 'workout-xyz' }]
        }
      ]);
      localStorage.removeItem('ffn_active_program_id');

      const svc = new SessionLifecycleApiService({});
      return await svc._detectProgramId('workout-xyz');
    });

    expect(detected).toBe('prog-fallback-1');
  });

  test('_detectProgramId honors explicit programId URL parameter', async ({ page }) => {
    await page.goto(`${BASE}/workout-mode.html?id=abc&programId=explicit-prog-id`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    const detected = await page.evaluate(async () => {
      const svc = new SessionLifecycleApiService({});
      return await svc._detectProgramId('abc');
    });

    expect(detected).toBe('explicit-prog-id');
  });

  test('home card never displays a raw workout- id as the Next label', async ({ page }) => {
    // Regression test for Bug A: the "Your Program" card used to fall back to
    // the raw workout_id (e.g. "workout-1e3c1017") when the workout couldn't
    // be looked up by custom_name. After the fix, the fallback chain should
    // be custom_name -> workout.name -> "Workout" — never the raw id.
    await page.goto(`${BASE}/`);
    await page.waitForTimeout(2500);

    const card = page.locator('.whats-next-card');
    if (await card.count() === 0) {
      test.skip(); // No program card rendered in current state
      return;
    }
    const text = (await card.first().textContent()) || '';
    // If a "Next:" line is present, its value must not be a raw workout- id
    const match = text.match(/Next:\s*([^\n·]+?)(?:\s+·|\s*$)/);
    if (match) {
      const nextValue = match[1].trim();
      expect(nextValue).not.toMatch(/^workout-[a-z0-9-]{6,}$/i);
    }
  });

});
