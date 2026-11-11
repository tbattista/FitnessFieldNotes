// @ts-check
const { test, expect } = require('playwright/test');
const { BASE } = require('./fixtures');

/**
 * "View exercise" links from Tabata workouts into the exercise database.
 * Locally the database runs on its seed data (no Firestore), which has
 * "Kettlebell One Arm Clean and Jerk" and "Dumbbell Goblet Squat".
 */

/** Name shown in the open exercise detail (desktop side panel or mobile sheet), or null. */
async function openDetailName(page) {
  return page.evaluate(() => {
    const sheet = document.querySelector('#exerciseDetailOffcanvas.show #exerciseOffcanvasName');
    if (sheet) return sheet.textContent.trim();
    const panel = document.getElementById('exerciseDetailContent');
    if (panel && panel.offsetParent !== null && window._selectedExerciseId) {
      const h = panel.querySelector('h4, h5, h3');
      return h ? h.textContent.trim() : panel.textContent.trim().slice(0, 80);
    }
    return null;
  });
}

test.describe('Exercise database deep link (?find=)', () => {
  test('opens the matching kettlebell exercise', async ({ page }) => {
    await page.goto(`${BASE}/exercise-database.html?find=${encodeURIComponent('KB Clean and Jerk (left)')}`);
    await expect.poll(() => openDetailName(page), { timeout: 15000 })
      .toContain('Kettlebell One Arm Clean and Jerk');
    await expect(page.locator('#exerciseSearchInput')).toHaveValue('Kettlebell One Arm Clean and Jerk');
  });

  test('with no kettlebell version, shows search results instead of the wrong tool', async ({ page }) => {
    await page.goto(`${BASE}/exercise-database.html?find=${encodeURIComponent('KB Goblet Squat')}`);
    await expect(page.locator('#exerciseSearchInput')).toHaveValue('goblet squat', { timeout: 15000 });
    await expect(page.locator('body')).toContainText('Dumbbell Goblet Squat');
    await page.waitForTimeout(500);
    expect(await openDetailName(page)).toBeNull();
  });

  test('widens the search when no exercise has every word', async ({ page }) => {
    await page.goto(`${BASE}/exercise-database.html?find=${encodeURIComponent('KB Sumo Deadlift High Pull')}`);
    await expect(page.locator('#exerciseSearchInput')).not.toHaveValue('', { timeout: 15000 });
    const value = await page.locator('#exerciseSearchInput').inputValue();
    // Falls back to the move's last words that some exercise actually has
    expect(['sumo deadlift high pull', 'deadlift high pull', 'high pull', 'pull']).toContain(value);
    expect(await openDetailName(page)).toBeNull();
  });
});

test.describe('Links from Tabata workouts', () => {
  test('player info button links the current exercise, and the next one during rests', async ({ page }) => {
    await page.goto(`${BASE}/tabata-kettlebell?library=fixture-tabata-0`);
    await expect(page.locator('#workoutState')).toBeVisible({ timeout: 10000 });
    const info = page.locator('#exerciseInfoLink');
    await expect(info).toBeVisible();
    await expect(info).toHaveAttribute('href', '/exercise-database.html?find=KB%20Swing');
    await expect(info).toHaveAttribute('target', '_blank'); // timer keeps running in this tab
    await expect(info).toHaveAttribute('aria-label', 'View KB Swing in the exercise database');

    // Jump into the first rest: the button points at the next move
    await page.evaluate(() => {
      const s = JSON.parse(sessionStorage.getItem('tabataKettlebellSession'));
      s.workoutStartedAt = new Date(Date.now() - 22 * 1000).toISOString();
      s.pausedAt = new Date().toISOString();
      sessionStorage.setItem('tabataKettlebellSession', JSON.stringify(s));
    });
    await page.reload();
    await expect(page.locator('#currentExerciseName')).toHaveText('Rest Interval', { timeout: 10000 });
    await expect(info).toHaveAttribute('href', '/exercise-database.html?find=Goblet%20Squat');
  });

  test('library workout page links each exercise to the database', async ({ page }) => {
    await page.goto(`${BASE}/tabata-workouts/full-body-kettlebell-tabata-burner`);
    const first = page.locator('.wl-set').first().locator('tbody tr').first().locator('a.wl-ex-link');
    await expect(first).toHaveText('KB Swing');
    await expect(first).toHaveAttribute('href', '/exercise-database.html?find=KB%20Swing');
    await expect(page.locator('.wl-breakdown-note a.wl-ex-link')).toHaveCount(4);

    // Print sheet stays plain text
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.wl-sheet a')).toHaveCount(0);
  });

  test('fine-tune picker offers the new moves and drops the Get-Up', async ({ page }) => {
    await page.addInitScript(() => {
      const user = { uid: 'test-user', getIdToken: async () => 'test-token' };
      let real = null;
      Object.defineProperty(window, 'authService', {
        configurable: true,
        get() { return real ? Object.assign(real, { currentUser: user }) : { currentUser: user }; },
        set(v) { real = v; },
      });
      sessionStorage.removeItem('tabataKettlebellSession');
    });
    await page.goto(`${BASE}/tabata-kettlebell`);
    const chips = page.locator('.tk-exercise-chip');
    await expect(chips.filter({ hasText: 'Hand-to-Hand Swing' })).toHaveCount(1);
    await expect(chips.filter({ hasText: 'Turkish Sit-Up' })).toHaveCount(1);
    await expect(chips.filter({ hasText: 'Hip Thrust' })).toHaveCount(1);
    await expect(chips.filter({ hasText: 'Get-Up' })).toHaveCount(0);
  });
});

test.describe('Exercise info pauses the workout and resumes on return', () => {
  /** Remaining seconds on the big segment timer. */
  async function remaining(page) {
    const [m, s] = (await page.locator('#segmentTime').textContent()).trim().split(':').map(Number);
    return m * 60 + s;
  }

  test('tapping ⓘ pauses; coming back resumes without losing time', async ({ page, context }) => {
    await page.goto(`${BASE}/tabata-kettlebell?library=fixture-tabata-0`);
    await expect(page.locator('#workoutState')).toBeVisible({ timeout: 10000 });
    await page.locator('#startBtn').click();
    await expect(page.locator('#pauseBtn')).toBeVisible();
    await page.waitForTimeout(1500);

    const [infoTab] = await Promise.all([
      context.waitForEvent('page'),
      page.locator('#exerciseInfoLink').click(),
    ]);
    await expect(page.locator('#resumeBtn')).toBeVisible();
    await expect(page.locator('#pauseBtn')).toBeHidden();
    const pausedAt = await remaining(page);

    // Athlete reads the exercise in the other tab; the workout tab is away
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(2500);
    expect(await remaining(page)).toBe(pausedAt);

    // Back to the workout tab → resumes from where it paused
    await infoTab.close();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.locator('#pauseBtn')).toBeVisible();
    await expect(page.locator('#resumeBtn')).toBeHidden();
    expect(await remaining(page)).toBeGreaterThanOrEqual(pausedAt - 1);
    expect(await page.evaluate(() => sessionStorage.getItem('tabataKBInfoPause'))).toBeNull();
  });

  test('does not resume if the page was never left (new tab blocked / opened in background)', async ({ page, context }) => {
    await page.goto(`${BASE}/tabata-kettlebell?library=fixture-tabata-0`);
    await expect(page.locator('#workoutState')).toBeVisible({ timeout: 10000 });
    await page.locator('#startBtn').click();
    const opened = context.waitForEvent('page');
    await page.locator('#exerciseInfoLink').click();
    await (await opened).close();
    await page.evaluate(() => window.dispatchEvent(new Event('focus'))); // no blur first
    await page.waitForTimeout(500);
    await expect(page.locator('#resumeBtn')).toBeVisible();
  });

  test('a manual pause is never auto-resumed, and ⓘ before Start does nothing to the timer', async ({ page, context }) => {
    await page.goto(`${BASE}/tabata-kettlebell?library=fixture-tabata-0`);
    await expect(page.locator('#workoutState')).toBeVisible({ timeout: 10000 });

    // Not started yet: info opens, timer untouched
    let opened = context.waitForEvent('page');
    await page.locator('#exerciseInfoLink').click();
    await (await opened).close();
    await expect(page.locator('#startBtn')).toBeVisible();

    // Manually paused, then info + leave + return: stays paused
    await page.locator('#startBtn').click();
    await page.locator('#pauseBtn').click();
    opened = context.waitForEvent('page');
    await page.locator('#exerciseInfoLink').click();
    await (await opened).close();
    await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
    await page.waitForTimeout(500);
    await expect(page.locator('#resumeBtn')).toBeVisible();
  });

  test('if the phone reloads the tab while away, it still resumes on return', async ({ page }) => {
    await page.goto(`${BASE}/tabata-kettlebell?library=fixture-tabata-0`);
    await expect(page.locator('#workoutState')).toBeVisible({ timeout: 10000 });
    await page.locator('#startBtn').click();
    await page.evaluate(() => {
      // Paused 5s into the workout, info-paused and away
      const s = JSON.parse(sessionStorage.getItem('tabataKettlebellSession'));
      s.workoutStartedAt = new Date(Date.now() - 65 * 1000).toISOString();
      s.pausedAt = new Date(Date.now() - 60 * 1000).toISOString();
      s.timerRunning = false;
      sessionStorage.setItem('tabataKettlebellSession', JSON.stringify(s));
      sessionStorage.setItem('tabataKBInfoPause', 'away');
    });
    await page.reload();
    await expect(page.locator('#pauseBtn')).toBeVisible({ timeout: 10000 });
    // The minute away didn't count: still in round 1 with ~15s left
    expect(await remaining(page)).toBeGreaterThanOrEqual(13);
    await expect(page.locator('#currentExerciseName')).toHaveText('KB Swing');
  });
});
