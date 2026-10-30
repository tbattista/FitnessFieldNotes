// @ts-check
const { test, expect } = require('playwright/test');
const { BASE } = require('./fixtures');

/**
 * Public workout library (server-rendered SEO pages).
 * Locally Firestore is unavailable, so the in-memory store serves the fixture
 * workouts from backend/services/workout_library_fixtures.py.
 */

const TABATA_SLUG = 'full-body-kettlebell-tabata-burner';
const SPIN_SLUG = '30-minute-rolling-hills-ride';

test.describe('Workout library pages', () => {
  test('hub lists Tabata and Spin workouts by category', async ({ page }) => {
    const res = await page.goto(`${BASE}/free-workouts`);
    expect(res.status()).toBe(200);
    await expect(page.locator('h1')).toHaveText('Free Tabata & Spin Workouts');
    await expect(page.locator('#tabata .wl-group-title').first()).toHaveText('Full Body');
    await expect(page.locator(`#tabata a.wl-card[href="/tabata-workouts/${TABATA_SLUG}"]`)).toBeVisible();
    await expect(page.locator(`#spin a.wl-card[href="/spin-workouts/${SPIN_SLUG}"]`)).toBeVisible();

    // Sidebar shows the library entry with absolute links (works on nested URLs)
    await expect(page.locator('#layout-menu a.menu-link[href="/free-workouts"]')).toBeAttached();
    await expect(page.locator('#layout-menu a.menu-link[href="/index.html"]')).toBeAttached();
  });

  test('type hub groups by category with jump chips', async ({ page }) => {
    await page.goto(`${BASE}/tabata-workouts`);
    await expect(page.locator('.wl-chip')).toHaveText([/Full Body\s*3/, /Core\s*1/]);
    await expect(page.locator('#core .wl-card')).toHaveCount(1);

    await page.goto(`${BASE}/spin-workouts`);
    await expect(page.locator('#moderate .wl-card-title')).toHaveText('30-Minute Rolling Hills Ride');
  });

  test('tabata workout page has SEO tags, structured data and the full breakdown', async ({ page }) => {
    await page.goto(`${BASE}/tabata-workouts/${TABATA_SLUG}`);
    await expect(page).toHaveTitle('Full Body Kettlebell Tabata Burner | Fitness Field Notes');
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /14-minute 20\/10 kettlebell Tabata/);
    await expect(page.locator('link[rel="canonical"]'))
      .toHaveAttribute('href', `https://fitnessfieldnotes.com/tabata-workouts/${TABATA_SLUG}`);

    const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
    const types = ld.map((t) => JSON.parse(t)['@type']);
    expect(types).toEqual(['ExercisePlan', 'BreadcrumbList']);

    await expect(page.locator('.wl-set')).toHaveCount(3);
    await expect(page.locator('.wl-set').first().locator('tbody tr')).toHaveCount(8);
    await expect(page.locator('.wl-set').first().locator('tbody tr').first()).toContainText('KB Swing');

    // Do This Workout hands off to the player with the library id
    await expect(page.locator('#doWorkoutBtn')).toHaveAttribute('href', '/tabata-kettlebell?library=fixture-tabata-0');
    await expect(page.locator('.wl-related .wl-card')).toHaveCount(3);
  });

  test('spin workout page shows the intensity profile and every block', async ({ page }) => {
    await page.goto(`${BASE}/spin-workouts/${SPIN_SLUG}`);
    await expect(page.locator('h1')).toHaveText('30-Minute Rolling Hills Ride');
    await expect(page.locator('.wl-profile rect')).toHaveCount(8);
    await expect(page.locator('.wl-breakdown tbody tr')).toHaveCount(8);
    await expect(page.locator('.wl-breakdown tbody tr').nth(1)).toContainText('Hill Climb 1');
    await expect(page.locator('#doWorkoutBtn')).toHaveAttribute('href', '/spin-ride?library=fixture-spin-4');
  });

  test('print view is a clean sheet: no nav or buttons, URL footer, checkboxes', async ({ page }) => {
    await page.goto(`${BASE}/tabata-workouts/${TABATA_SLUG}`);
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('#layout-menu')).toBeHidden();
    await expect(page.locator('#doWorkoutBtn')).toBeHidden();
    await expect(page.locator('.wl-related')).toBeHidden();
    await expect(page.locator('.wl-print-footer')).toBeVisible();
    await expect(page.locator('.wl-print-footer')).toContainText(`/tabata-workouts/${TABATA_SLUG}`);
    await expect(page.locator('.wl-box').first()).toBeVisible();
    // Sets sit side by side so the sheet fits on one page
    const tops = await page.locator('.wl-set h3').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(1);
  });

  test('unknown slug returns a 404 page that is not indexed', async ({ page }) => {
    const res = await page.goto(`${BASE}/tabata-workouts/does-not-exist`);
    expect(res.status()).toBe(404);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    await expect(page.locator('a.btn-primary')).toHaveAttribute('href', '/tabata-workouts');
  });

  test('sitemap lists the hubs and every workout page', async ({ request }) => {
    const xml = await (await request.get(`${BASE}/sitemap.xml`)).text();
    for (const path of ['/free-workouts', '/tabata-workouts', '/spin-workouts',
      `/tabata-workouts/${TABATA_SLUG}`, `/spin-workouts/${SPIN_SLUG}`]) {
      expect(xml).toContain(`<loc>https://fitnessfieldnotes.com${path}</loc>`);
    }
    const robots = await (await request.get(`${BASE}/robots.txt`)).text();
    expect(robots).toContain('Allow: /tabata-workouts');
    expect(robots).toContain('Disallow: /library-admin');
  });

  test('library API is public for reads and admin-only for edits', async ({ request }) => {
    const list = await (await request.get(`${BASE}/api/v3/library?type=spin`)).json();
    expect(list.total).toBe(2);
    const one = await (await request.get(`${BASE}/api/v3/library/workouts/fixture-spin-4`)).json();
    expect(one.plan.segments.length).toBe(8);

    expect((await request.get(`${BASE}/api/v3/library/admin/all`)).status()).toBe(401);
    expect((await request.patch(`${BASE}/api/v3/library/workouts/fixture-spin-4`, { data: { status: 'hidden' } })).status()).toBe(401);
    expect((await request.get(`${BASE}/api/v3/library/workouts/nope`)).status()).toBe(404);
  });

  test('library admin page asks a signed-out visitor to sign in', async ({ page }) => {
    await page.goto(`${BASE}/library-admin`);
    await expect(page.locator('#adminMessage')).toContainText('Sign in', { timeout: 10000 });
  });
});
