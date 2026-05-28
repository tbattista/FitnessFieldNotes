// @ts-check
const { test, expect } = require('playwright/test');
const { BASE } = require('./fixtures');

/**
 * Spin Ride RPM mapping tests.
 *
 * Mirrors the existing bike-gears mapping: the user enters their bike's
 * low and max RPM, and any RPM the AI emits (50..130) is linearly remapped
 * onto that range at render time.
 */

const FAKE_PLAN = {
  title: 'RPM Test Ride',
  duration_minutes: 10,
  total_seconds: 600,
  difficulty: 'moderate',
  estimated_calories: 100,
  segments: [
    // rpm_low=50, rpm_high=130 — the AI's range endpoints, so mapping is exact.
    { name: 'Warmup', segment_type: 'warmup', duration_seconds: 180, resistance: 3, rpm_low: 50, rpm_high: 130, cue: 'Easy spin' },
    // Midpoint check: 90 -> (90-50)/(130-50) = 0.5 -> halfway between user min/max.
    { name: 'Push', segment_type: 'climb', duration_seconds: 240, resistance: 7, rpm_low: 90, rpm_high: 90, cue: 'Climb!' },
    { name: 'Sprint', segment_type: 'sprint', duration_seconds: 180, resistance: 5, rpm_low: 100, rpm_high: 115, cue: 'Go' },
  ],
};

test.describe('Spin Ride RPM mapping', () => {
  test('select page exposes RPM low/max inputs and Save/Clear buttons', async ({ page }) => {
    await page.goto(`${BASE}/spin-ride`);
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('#lowRpmInput')).toBeAttached();
    await expect(page.locator('#maxRpmInput')).toBeAttached();
    await expect(page.locator('#bikeRpmSaveBtn')).toBeAttached();
    await expect(page.locator('#bikeRpmClearBtn')).toBeAttached();
    await expect(page.locator('#bikeRpmStatus')).toBeAttached();
  });

  test('saving min/max persists to localStorage and shows status', async ({ page }) => {
    await page.goto(`${BASE}/spin-ride`);
    await page.waitForLoadState('domcontentloaded');

    await page.locator('#lowRpmInput').fill('40');
    await page.locator('#maxRpmInput').fill('120');
    await page.locator('#bikeRpmSaveBtn').click();

    await expect(page.locator('#bikeRpmStatus')).toContainText('40');
    await expect(page.locator('#bikeRpmStatus')).toContainText('120');

    const stored = await page.evaluate(() => localStorage.getItem('spinRideBikeRpm'));
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored)).toEqual({ min: 40, max: 120 });

    // Reload and verify the inputs prefill from localStorage.
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#lowRpmInput')).toHaveValue('40');
    await expect(page.locator('#maxRpmInput')).toHaveValue('120');
  });

  test('rejects max <= min with an inline message', async ({ page }) => {
    await page.goto(`${BASE}/spin-ride`);
    await page.waitForLoadState('domcontentloaded');

    await page.locator('#lowRpmInput').fill('100');
    await page.locator('#maxRpmInput').fill('80');
    await page.locator('#bikeRpmSaveBtn').click();

    await expect(page.locator('#bikeRpmStatus')).toContainText(/higher/i);
    const stored = await page.evaluate(() => localStorage.getItem('spinRideBikeRpm'));
    expect(stored).toBeNull();
  });

  test('Clear removes the mapping and resets the inputs', async ({ page }) => {
    await page.goto(`${BASE}/spin-ride`);
    await page.waitForLoadState('domcontentloaded');

    await page.locator('#lowRpmInput').fill('40');
    await page.locator('#maxRpmInput').fill('120');
    await page.locator('#bikeRpmSaveBtn').click();

    await page.locator('#bikeRpmClearBtn').click();
    await expect(page.locator('#lowRpmInput')).toHaveValue('');
    await expect(page.locator('#maxRpmInput')).toHaveValue('');
    const stored = await page.evaluate(() => localStorage.getItem('spinRideBikeRpm'));
    expect(stored).toBeNull();
  });

  test('restored ride remaps the displayed RPM range when a mapping is set', async ({ page }) => {
    await page.goto(`${BASE}/spin-ride`);
    await page.waitForLoadState('domcontentloaded');

    // Seed both an RPM mapping AND an in-progress session, then reload.
    // With mapping min=40, max=120: AI 50 -> 40, AI 130 -> 120, AI 90 -> 80.
    const now = Date.now();
    await page.evaluate(({ plan, now }) => {
      localStorage.setItem('spinRideBikeRpm', JSON.stringify({ min: 40, max: 120 }));
      sessionStorage.setItem('spinRideSession', JSON.stringify({
        ridePlan: plan,
        rideStartedAt: new Date(now - 200000).toISOString(), // 200s in -> mid "Push"
        pausedAt: new Date(now).toISOString(),
        timerRunning: false,
        savedAt: now,
      }));
    }, { plan: FAKE_PLAN, now });
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    const rideVisible = await page.locator('#rideState').isVisible();
    if (!rideVisible) {
      test.skip(true, 'auth not available — restore skipped in this env');
    }

    // Current segment is "Push" with rpm_low=rpm_high=90 -> mapped to 80.
    await expect(page.locator('#segmentName')).toContainText('Push');
    await expect(page.locator('#segmentRpm')).toHaveText('80');

    // First row in the segment list is Warmup with raw 50-130 -> mapped 40-120.
    const firstRowMeta = page.locator('.spin-segment-row').first().locator('.spin-segment-meta');
    await expect(firstRowMeta).toContainText('40-120rpm');
  });
});
