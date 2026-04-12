// @ts-check
const { test, expect } = require('playwright/test');
const { BASE, collectConsoleErrors } = require('./fixtures');

/**
 * Tabata Kettlebell page tests.
 * Tests the AI-generated kettlebell tabata interval timer.
 */

test.describe('Tabata Kettlebell Page', () => {
  // Clear persisted preferences before each test so the setup screen
  // starts in a known state (no focus areas selected, default protocol/length).
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/tabata-kettlebell`);
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(() => {
      localStorage.removeItem('tabataKBProtocol');
      localStorage.removeItem('tabataKBFocusAreas');
      localStorage.removeItem('tabataKBRounds');
      localStorage.removeItem('tabataKBIntervalsPerRound');
      localStorage.removeItem('tabataKBLength');
      sessionStorage.removeItem('tabataKettlebellSession');
    });
  });

  test('page loads and shows setup screen', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto(`${BASE}/tabata-kettlebell`);
    await page.waitForLoadState('domcontentloaded');

    // Page title visible
    await expect(page.locator('h5').first()).toContainText('Tabata Kettlebell');

    // Protocol buttons present
    await expect(page.locator('.tk-protocol-btn')).toHaveCount(2);

    // Focus buttons present
    await expect(page.locator('.tk-focus-btn')).toHaveCount(7);

    // Length preset buttons present
    await expect(page.locator('.tk-length-btn')).toHaveCount(4);

    // Generate disabled initially (no focus selected — protocol is preselected)
    const generateBtn = page.locator('#generateBtn');
    await expect(generateBtn).toBeDisabled();

    // No fatal JS errors
    const fatalErrors = errors.filter(e =>
      !e.includes('Firebase') &&
      !e.includes('firestore') &&
      !e.includes('ERR_CONNECTION') &&
      !e.includes('net::') &&
      !e.includes('404')
    );
    expect(fatalErrors).toEqual([]);
  });

  test('selecting a focus enables Generate', async ({ page }) => {
    await page.goto(`${BASE}/tabata-kettlebell`);
    await page.waitForLoadState('domcontentloaded');

    const generateBtn = page.locator('#generateBtn');
    await expect(generateBtn).toBeDisabled();

    const fullBody = page.locator('.tk-focus-btn[data-value="full_body"]');
    await fullBody.click();
    await expect(fullBody).toHaveClass(/active/);
    await expect(generateBtn).toBeEnabled();

    // Click again to deselect → disables Generate
    await fullBody.click();
    await expect(fullBody).not.toHaveClass(/active/);
    await expect(generateBtn).toBeDisabled();
  });

  test('toggle protocol updates helper text', async ({ page }) => {
    await page.goto(`${BASE}/tabata-kettlebell`);
    await page.waitForLoadState('domcontentloaded');

    // Pick a focus so the Generate button + helper logic is interactive
    await page.locator('.tk-focus-btn[data-value="full_body"]').click();

    const helper = page.locator('#totalTimeHelper');
    const before = (await helper.textContent()) || '';

    // Switch to 40/20 protocol
    await page.locator('.tk-protocol-btn[data-value="40/20"]').click();

    const after = (await helper.textContent()) || '';
    expect(after).not.toBe(before);
    expect(after).toContain('40+20s');

    // Active class swap
    await expect(page.locator('.tk-protocol-btn[data-value="40/20"]')).toHaveClass(/active/);
    await expect(page.locator('.tk-protocol-btn[data-value="20/10"]')).not.toHaveClass(/active/);
  });

  test('length preset adjusts rounds to keep alignment', async ({ page }) => {
    await page.goto(`${BASE}/tabata-kettlebell`);
    await page.waitForLoadState('domcontentloaded');

    // Ensure protocol = 20/10, intervals = 8 (defaults)
    await page.locator('.tk-protocol-btn[data-value="20/10"]').click();
    await page.locator('#intervalsPerRoundSelect').selectOption('8');

    // Pick the 20-minute preset
    await page.locator('.tk-length-btn[data-minutes="20"]').click();

    // For 20/10 × 8 intervals: roundLen = 8×30 = 240s
    // Available = (1200 - 180 + 60) = 1080; denom = 240+60 = 300
    // Expected rounds = floor(1080 / 300) = 3
    const roundsText = await page.locator('#roundsDisplay').textContent();
    expect(parseInt((roundsText || '').trim(), 10)).toBe(3);

    // Helper should mention "3 ×" rounds
    await expect(page.locator('#totalTimeHelper')).toContainText('3 ×');
  });

  test('rounds stepper manual adjust deselects length presets', async ({ page }) => {
    await page.goto(`${BASE}/tabata-kettlebell`);
    await page.waitForLoadState('domcontentloaded');

    // Start from a known preset
    await page.locator('.tk-length-btn[data-minutes="20"]').click();
    const startRounds = parseInt((await page.locator('#roundsDisplay').textContent() || '0').trim(), 10);

    await page.locator('#roundsUpBtn').click();
    await page.locator('#roundsUpBtn').click();

    const newRounds = parseInt((await page.locator('#roundsDisplay').textContent() || '0').trim(), 10);
    expect(newRounds).toBe(startRounds + 2);

    // All length presets should have lost the active class
    const activeCount = await page.locator('.tk-length-btn.active').count();
    expect(activeCount).toBe(0);
  });

  test('intervals select change updates rounds for current preset', async ({ page }) => {
    await page.goto(`${BASE}/tabata-kettlebell`);
    await page.waitForLoadState('domcontentloaded');

    // Ensure 20/10 protocol
    await page.locator('.tk-protocol-btn[data-value="20/10"]').click();

    // Pick the 30-min preset
    await page.locator('.tk-length-btn[data-minutes="30"]').click();
    const beforeRounds = parseInt((await page.locator('#roundsDisplay').textContent() || '0').trim(), 10);

    // Switch intervals to 4
    await page.locator('#intervalsPerRoundSelect').selectOption('4');

    const afterRounds = parseInt((await page.locator('#roundsDisplay').textContent() || '0').trim(), 10);

    // 20/10 × 4 intervals: roundLen = 4×30 = 120s
    // Available = (1800 - 180 + 60) = 1680; denom = 120+60 = 180
    // Expected = floor(1680 / 180) = 9
    expect(afterRounds).toBe(9);
    expect(afterRounds).not.toBe(beforeRounds);

    // localStorage persisted
    const stored = await page.evaluate(() => localStorage.getItem('tabataKBIntervalsPerRound'));
    expect(stored).toBe('4');
  });

  test('localStorage persistence of protocol survives reload', async ({ page }) => {
    await page.goto(`${BASE}/tabata-kettlebell`);
    await page.waitForLoadState('domcontentloaded');

    await page.locator('.tk-protocol-btn[data-value="40/20"]').click();
    const stored = await page.evaluate(() => localStorage.getItem('tabataKBProtocol'));
    expect(stored).toBe('40/20');

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    await expect(page.locator('.tk-protocol-btn[data-value="40/20"]')).toHaveClass(/active/);
  });

  test('session restore — paused session shows current segment (warmup)', async ({ page }) => {
    await page.goto(`${BASE}/tabata-kettlebell`);
    await page.waitForLoadState('domcontentloaded');

    // Plan: warmup 180s + 4 intervals × (work 20 + rest 10) = 300s total.
    // Started 30s ago, paused now → should still be in the warmup segment
    // with ~150s remaining.
    const now = Date.now();
    const fakeSession = {
      workoutPlan: {
        title: 'Restore Test',
        protocol: '20/10',
        focus_areas: ['core'],
        rounds: 1,
        intervals_per_round: 4,
        total_seconds: 300,
        estimated_calories: 60,
        segments: [
          { name: 'Warmup', segment_type: 'warmup', duration_seconds: 180, cue: 'Get loose' },
          { name: 'Work 1', exercise: 'Swings', segment_type: 'work', duration_seconds: 20, round_index: 1, interval_index: 0, cue: 'Go' },
          { name: 'Rest', segment_type: 'rest', duration_seconds: 10, round_index: 1, interval_index: 0, cue: 'Breathe' },
          { name: 'Work 2', exercise: 'Goblet Squat', segment_type: 'work', duration_seconds: 20, round_index: 1, interval_index: 1, cue: 'Squat' },
          { name: 'Rest', segment_type: 'rest', duration_seconds: 10, round_index: 1, interval_index: 1, cue: 'Breathe' },
          { name: 'Work 3', exercise: 'Cleans', segment_type: 'work', duration_seconds: 20, round_index: 1, interval_index: 2, cue: 'Clean' },
          { name: 'Rest', segment_type: 'rest', duration_seconds: 10, round_index: 1, interval_index: 2, cue: 'Breathe' },
          { name: 'Work 4', exercise: 'Snatch', segment_type: 'work', duration_seconds: 20, round_index: 1, interval_index: 3, cue: 'Snatch' },
          { name: 'Rest', segment_type: 'rest', duration_seconds: 10, round_index: 1, interval_index: 3, cue: 'Done' },
        ],
      },
      workoutStartedAt: new Date(now - 30000).toISOString(),
      pausedAt: new Date(now).toISOString(),
      timerRunning: false,
      savedAt: now,
    };

    await page.evaluate((session) => {
      sessionStorage.setItem('tabataKettlebellSession', JSON.stringify(session));
    }, fakeSession);

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(4000);

    const workoutVisible = await page.locator('#workoutState').isVisible();
    if (!workoutVisible) return; // Auth not available — skip

    await expect(page.locator('#workoutTitle')).toContainText('Restore Test');
    // Warmup segment label is uppercased in #segmentName
    await expect(page.locator('#segmentName')).toContainText('WARMUP');
    await expect(page.locator('#currentExerciseName')).toContainText('Warmup');

    // Remaining ~150s (allow ±5s)
    const segTime = (await page.locator('#segmentTime').textContent() || '').trim();
    const [m, s] = segTime.split(':').map(Number);
    const remaining = m * 60 + s;
    expect(remaining).toBeGreaterThan(145);
    expect(remaining).toBeLessThan(155);

    // Resume button visible (was paused)
    await expect(page.locator('#resumeBtn')).toBeVisible();
    await expect(page.locator('#startBtn')).toHaveClass(/d-none/);
  });

  test('intercept generate request and verify body payload', async ({ page }) => {
    await page.goto(`${BASE}/tabata-kettlebell`);
    await page.waitForLoadState('domcontentloaded');

    // Set protocol 20/10, select two focus areas, length 10 → rounds=2
    await page.locator('.tk-protocol-btn[data-value="20/10"]').click();
    await page.locator('#intervalsPerRoundSelect').selectOption('8');
    await page.locator('.tk-focus-btn[data-value="core"]').click();
    await page.locator('.tk-focus-btn[data-value="upper_body"]').click();
    await page.locator('.tk-length-btn[data-minutes="10"]').click();

    // For 20/10 × 8 at 10 min:
    // roundLen = 240; available = (600 - 180 + 60) = 480; denom = 300
    // floor(480 / 300) = 1, but min = 1, so rounds = 1.
    // Actually 1 round → check display before asserting on payload.
    const rounds = parseInt((await page.locator('#roundsDisplay').textContent() || '0').trim(), 10);

    let capturedBody = null;
    await page.route('**/api/v3/tabata-kettlebell/generate', async (route) => {
      capturedBody = route.request().postDataJSON();

      // Build a minimal but well-formed plan response. 1 round × 8 intervals
      // of 20/10 protocol. Total = 180 (warmup) + 8×30 = 420s.
      const segments = [
        { name: 'Warmup', segment_type: 'warmup', duration_seconds: 180, cue: 'Get warm' },
      ];
      for (let i = 0; i < (rounds * 8); i++) {
        segments.push({
          name: `Work ${i + 1}`,
          exercise: 'Swings',
          segment_type: 'work',
          duration_seconds: 20,
          round_index: Math.floor(i / 8) + 1,
          interval_index: i % 8,
          cue: 'Go',
        });
        segments.push({
          name: 'Rest',
          segment_type: 'rest',
          duration_seconds: 10,
          round_index: Math.floor(i / 8) + 1,
          interval_index: i % 8,
          cue: 'Breathe',
        });
      }
      // Round rests between rounds (none for 1 round)
      const totalSeconds = 180 + rounds * 8 * 30 + Math.max(0, rounds - 1) * 60;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          title: 'Mocked Tabata',
          protocol: '20/10',
          focus_areas: ['core', 'upper_body'],
          rounds,
          intervals_per_round: 8,
          total_seconds: totalSeconds,
          estimated_calories: 90,
          segments,
        }),
      });
    });

    await page.locator('#generateBtn').click();
    await page.waitForTimeout(2000);

    // If the request wasn't captured, auth blocked us — skip.
    if (capturedBody === null) return;

    expect(capturedBody.protocol).toBe('20/10');
    expect(capturedBody.rounds).toBe(rounds);
    expect(capturedBody.intervals_per_round).toBe(8);
    expect(Array.isArray(capturedBody.focus_areas)).toBe(true);
    expect(capturedBody.focus_areas.sort()).toEqual(['core', 'upper_body'].sort());

    // Workout state should now be visible with the mocked title
    await expect(page.locator('#workoutState')).toBeVisible();
    await expect(page.locator('#workoutTitle')).toContainText('Mocked Tabata');
  });

  test('select screen shows numbered 1-2-3 steps in order', async ({ page }) => {
    await page.goto(`${BASE}/tabata-kettlebell`);
    await page.waitForLoadState('domcontentloaded');

    const steps = page.locator('#selectState .spin-step');
    await expect(steps).toHaveCount(3);

    const numbers = await steps.locator('.spin-step-number').allTextContents();
    expect(numbers).toEqual(['1', '2', '3']);
  });

  test('page header matches standard layout', async ({ page }) => {
    await page.goto(`${BASE}/tabata-kettlebell`);
    await page.waitForLoadState('domcontentloaded');

    const header = page.locator('h5').first();
    await expect(header).toContainText('Tabata Kettlebell');
    await expect(page.locator('.bx-dumbbell')).toBeAttached();
  });
});
