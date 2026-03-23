// @ts-check
const { test, expect } = require('playwright/test');
const { BASE, waitForAppReady, injectWorkouts } = require('./fixtures');
const { STANDARD_WORKOUT } = require('./test-data');

test.describe('Workout Save / Session Completion', () => {

  test('SessionLifecycleApiService._fetchWithRetry retries on network error', async ({ page }) => {
    await page.goto(`${BASE}/workout-mode.html?id=${STANDARD_WORKOUT.id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Test the retry helper directly in the browser context
    const result = await page.evaluate(async () => {
      // Dynamically access the service class from the page
      const svc = new SessionLifecycleApiService();

      let attempts = 0;
      const originalFetch = window.fetch;

      // Mock fetch to fail twice with TypeError then succeed
      window.fetch = async (url, opts) => {
        attempts++;
        if (attempts <= 2) {
          throw new TypeError('Load failed');
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      };

      try {
        const response = await svc._fetchWithRetry('/test', {}, 2);
        const data = await response.json();
        return { attempts, success: data.ok, error: null };
      } catch (err) {
        return { attempts, success: false, error: err.message };
      } finally {
        window.fetch = originalFetch;
      }
    });

    expect(result.attempts).toBe(3); // 2 failures + 1 success
    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
  });

  test('SessionLifecycleApiService._fetchWithRetry throws after max retries', async ({ page }) => {
    await page.goto(`${BASE}/workout-mode.html?id=${STANDARD_WORKOUT.id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const result = await page.evaluate(async () => {
      const svc = new SessionLifecycleApiService();

      let attempts = 0;
      const originalFetch = window.fetch;

      // Mock fetch to always fail
      window.fetch = async () => {
        attempts++;
        throw new TypeError('Load failed');
      };

      try {
        await svc._fetchWithRetry('/test', {}, 2);
        return { attempts, error: null };
      } catch (err) {
        return { attempts, error: err.message };
      } finally {
        window.fetch = originalFetch;
      }
    });

    expect(result.attempts).toBe(3); // initial + 2 retries
    expect(result.error).toBe('Load failed');
  });

  test('anonymous user can load workout mode without Load failed errors', async ({ page }) => {
    // Inject workout into localStorage
    await page.goto(`${BASE}/settings.html`, { waitUntil: 'domcontentloaded' });
    await injectWorkouts(page, [STANDARD_WORKOUT]);

    // Collect console errors
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && msg.text().includes('Load failed')) {
        consoleErrors.push(msg.text());
      }
    });

    // Navigate to workout mode
    await page.goto(`${BASE}/workout-mode.html?id=${STANDARD_WORKOUT.id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Page should be in a valid state - either exercise cards, landing, or quick log
    const hasContent =
      await page.locator('.exercise-card, [data-exercise-name]').count() > 0 ||
      await page.locator('#workoutLandingPage').isVisible().catch(() => false) ||
      await page.locator('#quickLogSection').isVisible().catch(() => false) ||
      await page.locator('.layout-page').isVisible().catch(() => false);

    expect(hasContent).toBe(true);
    expect(consoleErrors).toHaveLength(0);
  });
});
