import { test, expect } from '@playwright/test';

test.describe('Page Headers & Headings Standardization', () => {

  test('Explore page heading matches My Workouts and Programs (h5, consistent size)', async ({ page }) => {
    await page.goto('http://localhost:8001/public-workouts.html');
    const heading = page.locator('h5', { hasText: 'Shared Workouts' });
    await expect(heading).toBeVisible();
    const desc = page.locator('p.text-muted.small', { hasText: 'Browse and save workouts shared by the community' });
    await expect(desc).toBeVisible();
    // Should NOT have an h4 heading
    const h4 = page.locator('h4', { hasText: /Shared Workouts|Discover/ });
    await expect(h4).toHaveCount(0);
  });

  test('History page has a proper static heading in markup', async ({ page }) => {
    await page.goto('http://localhost:8001/workout-history.html');
    // Verify the h5 heading and description exist in the DOM
    const html = await page.content();
    // The heading is an h5 with the history icon — check both mobile and desktop have it
    const h5Pattern = /<h5 class="mb-1">.*?bx-history.*?History/s;
    expect(html).toMatch(h5Pattern);
    expect(html).toContain('View your past sessions and track progress');
  });

  test('Browser tab titles are correct', async ({ page }) => {
    const expected = [
      { url: '/public-workouts.html', title: 'Explore - Fitness Field Notes' },
      { url: '/activity-log.html', title: 'Log Activity - Fitness Field Notes' },
      { url: '/workout-builder.html', title: 'Workout Builder - Fitness Field Notes' },
      { url: '/workout-database.html', title: 'Workouts - Fitness Field Notes' },
      { url: '/workout-history.html', title: 'History - Fitness Field Notes' },
      { url: '/exercise-database.html', title: 'Exercises - Fitness Field Notes' },
      { url: '/programs.html', title: 'Programs - Fitness Field Notes' },
    ];

    for (const { url, title } of expected) {
      await page.goto(`http://localhost:8001${url}`);
      await expect(page).toHaveTitle(title);
    }
  });

});
