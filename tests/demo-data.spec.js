import { test, expect } from '@playwright/test';

test.describe('Anonymous Demo Data', () => {

  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
  });

  test('seeds demo data for anonymous visitors on home page', async ({ page }) => {
    await page.goto('/');
    // Wait for Firebase to init and demo seeder to run
    await page.waitForTimeout(3000);

    // Check that demo data was seeded
    const hasDemoFlag = await page.evaluate(() => localStorage.getItem('ffn_demo_seeded'));
    expect(hasDemoFlag).toBe('true');

    // Check workouts were seeded
    const workouts = await page.evaluate(() => JSON.parse(localStorage.getItem('gym_workouts') || '[]'));
    expect(workouts.length).toBe(3);
    expect(workouts[0].name).toContain('[Sample]');

    // Check program was seeded
    const programs = await page.evaluate(() => JSON.parse(localStorage.getItem('gym_programs') || '[]'));
    expect(programs.length).toBe(1);
    expect(programs[0].name).toContain('[Sample]');

    // Check sessions were seeded
    const sessions = await page.evaluate(() => JSON.parse(localStorage.getItem('ffn_completed_sessions') || '[]'));
    expect(sessions.length).toBeGreaterThan(10);
  });

  test('shows authenticated dashboard with demo data instead of landing page', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);

    // The authenticated dashboard should be visible
    const dashboard = page.locator('#authenticatedDashboard');
    await expect(dashboard).toBeVisible({ timeout: 5000 });

    // The landing page should be hidden
    const landing = page.locator('#unauthenticatedWelcome');
    await expect(landing).toBeHidden();
  });

  test('shows demo banner on home page', async ({ page }) => {
    await page.goto('/');

    // Wait for the dashboard to appear first
    const dashboard = page.locator('#authenticatedDashboard');
    await expect(dashboard).toBeVisible({ timeout: 10000 });

    const demoBanner = page.locator('#demoBanner');
    await expect(demoBanner).toBeVisible({ timeout: 5000 });
    await expect(demoBanner).toContainText('Demo Mode');
  });

  test('workout database loads with demo data for anonymous user', async ({ page }) => {
    // Seed demo data first via home page
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Navigate to workout database
    await page.goto('/workout-database.html');
    await page.waitForTimeout(3000);

    // Should show workout cards (not a blank page)
    const workoutCards = page.locator('.workout-list-card, .workout-card, [data-workout-id]');
    const count = await workoutCards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('does not re-seed if demo data already exists', async ({ page }) => {
    // First visit - seeds data
    await page.goto('/');
    await page.waitForTimeout(3000);

    const firstWorkouts = await page.evaluate(() => JSON.parse(localStorage.getItem('gym_workouts') || '[]'));
    const firstIds = firstWorkouts.map(w => w.id);

    // Second visit - should NOT re-seed
    await page.goto('/');
    await page.waitForTimeout(3000);

    const secondWorkouts = await page.evaluate(() => JSON.parse(localStorage.getItem('gym_workouts') || '[]'));
    const secondIds = secondWorkouts.map(w => w.id);

    expect(firstIds).toEqual(secondIds);
  });

});
