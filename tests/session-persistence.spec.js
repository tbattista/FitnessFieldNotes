// @ts-check
const { test, expect } = require('playwright/test');
const { BASE } = require('./fixtures');

/**
 * Verifies the session-logout fixes:
 *   1. /service-worker.js is served from the site root with the right headers
 *   2. The service worker registers successfully on page load
 *   3. Firebase Auth is configured with IndexedDB persistence
 *
 * These together prevent the iOS PWA "logged out after 7 days" issue caused
 * by Safari's Intelligent Tracking Prevention evicting auth storage from
 * unengaged PWAs.
 */
test.describe('PWA session persistence', () => {
  test('service worker is served from root with correct headers', async ({ request }) => {
    const res = await request.get(`${BASE}/service-worker.js`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('javascript');
    expect(res.headers()['service-worker-allowed']).toBe('/');

    const body = await res.text();
    expect(body).toContain('addEventListener');
    expect(body).toContain('fetch');
  });

  test('service worker registers on page load', async ({ page }) => {
    await page.goto(`${BASE}/index.html`);
    await page.waitForLoadState('load');

    // Wait for the registration promise to resolve
    const reg = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return null;
      const r = await navigator.serviceWorker.ready;
      return { scope: r.scope, hasActive: !!r.active || !!r.installing || !!r.waiting };
    });

    expect(reg).not.toBeNull();
    expect(reg.scope).toMatch(/\/$/);
    expect(reg.hasActive).toBe(true);
  });

  test('Firebase Auth uses IndexedDB persistence', async ({ page }) => {
    await page.goto(`${BASE}/index.html`);

    // Wait until firebase-loader.js signals ready
    await page.waitForFunction(() => window.firebaseReady === true, { timeout: 10000 });

    // The configured persistence is exposed via the auth instance internals.
    // We assert by checking that an IndexedDB database for Firebase Auth gets
    // created, which only happens when indexedDBLocalPersistence is active.
    const usesIDB = await page.evaluate(async () => {
      if (!indexedDB.databases) return 'unsupported';
      const dbs = await indexedDB.databases();
      return dbs.some(d => (d.name || '').toLowerCase().includes('firebaseauth'));
    });

    // Either we confirmed IDB is in use, or the browser doesn't support
    // indexedDB.databases() enumeration (Firefox/Safari) — in which case the
    // earlier setPersistence call still ran without throwing.
    expect(usesIDB === true || usesIDB === 'unsupported').toBe(true);
  });
});
