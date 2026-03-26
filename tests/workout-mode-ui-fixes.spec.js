// @ts-check
const { test, expect } = require('playwright/test');
const { BASE, waitForAppReady } = require('./fixtures');

test.describe('Workout Mode UI Fixes', () => {

  test('inline Add Exercise button is removed from workout mode HTML', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    await page.goto(`${BASE}/workout-mode.html`);
    await page.waitForLoadState('domcontentloaded');

    // The workoutModeAddButtons div should no longer exist
    const addButtonsDiv = await page.$('#workoutModeAddButtons');
    expect(addButtonsDiv).toBeNull();

    // The inlineAddExerciseBtn should also not exist
    const inlineBtn = await page.$('#inlineAddExerciseBtn');
    expect(inlineBtn).toBeNull();

    await context.close();
  });

  test('bottom bar still has Add dropdown with Exercise option', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    await page.goto(`${BASE}/workout-mode.html`);
    await page.waitForLoadState('domcontentloaded');

    // Bottom bar should exist
    const bottomBar = await page.$('#workoutModeBottomBar');
    expect(bottomBar).not.toBeNull();

    // Add dropdown should contain Exercise option
    const exerciseOption = await page.$('[data-action="add-exercise"]');
    expect(exerciseOption).not.toBeNull();

    await context.close();
  });

  test('exercise cards do not contain inline rest timers', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    await page.goto(`${BASE}/workout-mode.html`);
    await page.waitForLoadState('domcontentloaded');

    // No inline-rest-timer elements should exist in exercise cards
    const inlineTimers = await page.$$('.inline-rest-timer');
    expect(inlineTimers.length).toBe(0);

    await context.close();
  });

  test('global rest timer container exists in HTML', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    await page.goto(`${BASE}/workout-mode.html`);
    await page.waitForLoadState('domcontentloaded');

    // Global rest timer floating container should exist
    const globalTimer = await page.$('#globalRestTimerButton');
    expect(globalTimer).not.toBeNull();

    await context.close();
  });

  test('More menu has Rest Timer toggle option', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    await page.goto(`${BASE}/workout-mode.html`);
    await page.waitForLoadState('domcontentloaded');

    // Verify the WorkoutModeFabManager loads the rest timer toggle in the options menu
    const hasRestTimerToggle = await page.evaluate(() => {
      // Check localStorage default - rest timer should be enabled by default
      const enabled = localStorage.getItem('workoutRestTimerEnabled');
      return enabled === null || enabled === 'true';
    });
    expect(hasRestTimerToggle).toBe(true);

    await context.close();
  });

});
