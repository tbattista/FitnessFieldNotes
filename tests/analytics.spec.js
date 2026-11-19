import { test, expect } from '@playwright/test';

// Stub third-party analytics so tests never hit the network, and record what was requested.
async function stubAnalytics(page) {
  const requested = [];
  await page.route(/matomo-production-72c8\.up\.railway\.app|static\.cloudflareinsights\.com/, route => {
    requested.push(route.request().url());
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
  });
  return requested;
}

test('pages load analytics through the shared loader (Matomo kept during migration)', async ({ page }) => {
  const requested = await stubAnalytics(page);
  await page.goto('/');

  await expect(page.locator('script[src*="analytics-loader.js"]')).toHaveCount(1);
  // No inline Matomo snippet left in the page.
  const inlineMatomo = await page.locator('script:not([src])').evaluateAll(
    els => els.filter(e => e.textContent.includes('matomo')).length
  );
  expect(inlineMatomo).toBe(0);

  await expect(page.locator('script[data-analytics="matomo"]')).toHaveCount(1);
  expect(await page.evaluate(() => Array.isArray(window._paq))).toBe(true);
  expect(requested.some(u => u.includes('matomo.js'))).toBe(true);
});

test('Cloudflare beacon is injected when a token is set, Matomo can be switched off', async ({ page }) => {
  await stubAnalytics(page);
  await page.addInitScript(() => { window.FFN_ANALYTICS = { cfToken: 'test-token', matomo: false }; });
  await page.goto('/privacy.html');

  const beacon = page.locator('script[data-analytics="cloudflare"]');
  await expect(beacon).toHaveCount(1);
  expect(JSON.parse(await beacon.getAttribute('data-cf-beacon'))).toEqual({ token: 'test-token' });
  await expect(page.locator('script[data-analytics="matomo"]')).toHaveCount(0);
  // analytics-service.js calls must stay safe with Matomo off.
  expect(await page.evaluate(() => Array.isArray(window._paq))).toBe(true);
  await expect(page.getByRole('heading', { name: 'Cloudflare Web Analytics' })).toBeVisible();
});
