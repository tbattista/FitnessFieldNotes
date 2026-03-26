// @ts-check
const { test, expect } = require('@playwright/test');
const { BASE } = require('./fixtures');

test.describe('Workout Mode UI Fixes', () => {

  test('inline Add Exercise button is removed from workout mode HTML', async ({ page }) => {
    await page.goto(`${BASE}/workout-mode.html`);
    await page.waitForLoadState('domcontentloaded');

    const addButtonsDiv = await page.$('#workoutModeAddButtons');
    expect(addButtonsDiv).toBeNull();

    const inlineBtn = await page.$('#inlineAddExerciseBtn');
    expect(inlineBtn).toBeNull();
  });

  test('bottom bar has Add dropdown with Exercise option', async ({ page }) => {
    await page.goto(`${BASE}/workout-mode.html`);
    await page.waitForLoadState('domcontentloaded');

    const bottomBar = await page.$('#workoutModeBottomBar');
    expect(bottomBar).not.toBeNull();

    const exerciseOption = await page.$('[data-action="add-exercise"]');
    expect(exerciseOption).not.toBeNull();
  });

  test('exercise cards do not contain inline rest timers', async ({ page }) => {
    await page.goto(`${BASE}/workout-mode.html`);
    await page.waitForLoadState('domcontentloaded');

    const inlineTimers = await page.$$('.inline-rest-timer');
    expect(inlineTimers.length).toBe(0);
  });

  test('rest timer row exists inside the bottom bar', async ({ page }) => {
    await page.goto(`${BASE}/workout-mode.html`);
    await page.waitForLoadState('domcontentloaded');

    // Timer row should exist inside the bottom bar
    const timerRow = await page.$('#workoutModeBottomBar #globalRestTimerButton');
    expect(timerRow).not.toBeNull();

    // It should have the wm-rest-timer-row class
    const hasClass = await page.evaluate(() => {
      const el = document.getElementById('globalRestTimerButton');
      return el?.classList.contains('wm-rest-timer-row');
    });
    expect(hasClass).toBe(true);
  });

  test('GlobalRestTimer class is available on window', async ({ page }) => {
    await page.goto(`${BASE}/workout-mode.html`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const hasClass = await page.evaluate(() => typeof window.GlobalRestTimer === 'function');
    expect(hasClass).toBe(true);
  });

  test('overscroll-behavior is set to none on html and body', async ({ page }) => {
    await page.goto(`${BASE}/workout-mode.html`);
    await page.waitForLoadState('networkidle');

    const overscrollValues = await page.evaluate(() => {
      const htmlStyle = getComputedStyle(document.documentElement);
      const bodyStyle = getComputedStyle(document.body);
      return {
        html: htmlStyle.overscrollBehaviorY,
        body: bodyStyle.overscrollBehaviorY
      };
    });

    expect(overscrollValues.html).toBe('none');
    expect(overscrollValues.body).toBe('none');
  });

  test('exercise cards container has sufficient bottom padding', async ({ page }) => {
    await page.goto(`${BASE}/workout-mode.html`);
    await page.waitForLoadState('networkidle');

    const paddingBottom = await page.evaluate(() => {
      const container = document.getElementById('exerciseCardsContainer');
      if (!container) return '0px';
      return getComputedStyle(container).paddingBottom;
    });

    // Should have at least 100px to clear the bottom bar
    const paddingValue = parseInt(paddingBottom);
    expect(paddingValue).toBeGreaterThanOrEqual(100);
  });

  test('rest timer default is enabled in localStorage', async ({ page }) => {
    await page.goto(`${BASE}/workout-mode.html`);
    await page.waitForLoadState('domcontentloaded');

    const hasRestTimerToggle = await page.evaluate(() => {
      const enabled = localStorage.getItem('workoutRestTimerEnabled');
      return enabled === null || enabled === 'true';
    });
    expect(hasRestTimerToggle).toBe(true);
  });

});
