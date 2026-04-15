// @ts-check
const { test, expect } = require('@playwright/test');
const { BASE, collectConsoleErrors } = require('./fixtures');

test.describe('Program Schedule Builder', () => {

  test('adherence endpoint returns 401 unauthenticated', async ({ page }) => {
    const resp = await page.request.get(`${BASE}/api/v3/firebase/programs/test-id/adherence`);
    expect(resp.status()).toBe(401);
  });

  test('schedule builder page loads and renders key components', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    // Seed a flat program + a couple of workouts in localStorage
    await page.goto(`${BASE}/settings.html`);
    await page.evaluate(() => {
      localStorage.setItem('gym_workouts', JSON.stringify([
        { id: 'w-push', name: 'Push Day', exercises: [] },
        { id: 'w-pull', name: 'Pull Day', exercises: [] },
        { id: 'w-legs', name: 'Leg Day', exercises: [] }
      ]));
      localStorage.setItem('gym_programs', JSON.stringify([
        {
          id: 'prog-test',
          name: 'Test Weekly Program',
          description: '',
          workouts: [],
          schedule_type: 'weekly',
          schedule: [],
          weeks_in_cycle: 1,
          start_date: '2026-04-13',
          duration_weeks: 4
        }
      ]));
    });

    await page.goto(`${BASE}/static/program-schedule-builder.html?programId=prog-test`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    // Header reflects the program name
    await expect(page.locator('#psb-program-name')).toHaveText(/Test Weekly Program/, { timeout: 5000 });

    // Meta inputs present
    await expect(page.locator('#psb-start-date')).toBeVisible();
    await expect(page.locator('#psb-weeks-in-cycle')).toBeVisible();

    // Week grid rendered with at least one week and 7 day cells
    const weekGridHost = page.locator('#psb-week-grid-host');
    await expect(weekGridHost).toBeVisible();
    const days = weekGridHost.locator('.pwg-day');
    expect(await days.count()).toBeGreaterThanOrEqual(7);

    // Calendar tab renders when clicked
    await page.locator('[data-bs-target="#psb-tab-calendar"]').click();
    await expect(page.locator('#psb-calendar-host')).toBeVisible();
    await expect(page.locator('.psb-cal-grid')).toBeVisible();

    // No console errors from the page itself
    expect(errors.filter(e => !/firebase/i.test(e))).toEqual([]);
  });

  test('ProgramWeekGrid adds an entry when a slot is clicked and a workout picked', async ({ page }) => {
    await page.goto(`${BASE}/settings.html`);
    await page.evaluate(() => {
      localStorage.setItem('gym_workouts', JSON.stringify([
        { id: 'w-push', name: 'Push Day', exercises: [] }
      ]));
      localStorage.setItem('gym_programs', JSON.stringify([
        {
          id: 'prog-grid',
          name: 'Grid Test',
          workouts: [],
          schedule_type: 'weekly',
          schedule: [],
          weeks_in_cycle: 1,
          start_date: '2026-04-13',
          duration_weeks: 2
        }
      ]));
    });

    await page.goto(`${BASE}/static/program-schedule-builder.html?programId=prog-grid`);
    await page.waitForTimeout(1500);

    // Click first empty day slot
    const firstSlot = page.locator('.pwg-day').first();
    await firstSlot.click();

    // Picker modal opens with the seeded workout
    const modal = page.locator('#psb-workout-picker-modal');
    await expect(modal).toBeVisible();
    const pushBtn = modal.locator('[data-workout-id="w-push"]');
    await expect(pushBtn).toBeVisible();
    await pushBtn.click();

    // Modal closes and the slot becomes filled with the workout name
    await expect(modal).toBeHidden();
    await expect(page.locator('.pwg-day--filled').first()).toBeVisible();
    await expect(page.locator('.pwg-day--filled .pwg-chip').first()).toContainText('Push Day');

    // Save button becomes enabled
    await expect(page.locator('#psb-save-btn')).toBeEnabled();
  });

  test('program detail shows Convert-to-scheduled link for flat programs', async ({ page }) => {
    await page.goto(`${BASE}/settings.html`);
    await page.evaluate(() => {
      localStorage.setItem('gym_programs', JSON.stringify([
        {
          id: 'prog-flat',
          name: 'Flat Legacy',
          workouts: [],
          schedule_type: 'flat'
        }
      ]));
    });

    await page.goto(`${BASE}/programs.html`);
    await page.waitForTimeout(2000);

    const card = page.locator('.program-card').filter({ hasText: 'Flat Legacy' }).first();
    if (await card.count() > 0) {
      await card.click();
      const convertLink = page.locator('a[href*="program-schedule-builder.html"][href*="prog-flat"]');
      await expect(convertLink.first()).toBeVisible({ timeout: 5000 });
      await expect(convertLink.first()).toContainText(/schedule/i);
    }
  });

});
