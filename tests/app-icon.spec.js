import { test, expect } from '@playwright/test';

test('home page links a loadable apple-touch-icon', async ({ page, request }) => {
  await page.goto('http://localhost:8001/');
  const href = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect(href).toContain('apple-touch-icon.png');

  const res = await request.get(new URL(href, 'http://localhost:8001/').toString());
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('image/png');
});
