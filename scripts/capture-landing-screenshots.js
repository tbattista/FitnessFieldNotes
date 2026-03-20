// Playwright script to capture fresh mobile screenshots for the landing page

const { chromium } = require('playwright');
const path = require('path');

const BASE_URL = 'https://fitnessfieldnotes.com';
const REVIEW_URL = `${BASE_URL}/?review_code=GcbTRNP_5n18v6HLzGSSj2CDpeNtUV0H`;
const IMG_DIR = path.join(__dirname, '..', 'frontend', 'assets', 'img');
const LANDING_DIR = path.join(IMG_DIR, 'landing');

const MOBILE = { width: 393, height: 852 };

async function closeOffcanvas(page) {
  // Try multiple ways to close the offcanvas
  try {
    // Press Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    // Also try clicking the close button
    const closeBtn = page.locator('.offcanvas.show .btn-close').first();
    if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await closeBtn.click({ force: true });
    }
    // Wait for offcanvas to fully close
    await page.waitForTimeout(1000);
  } catch (e) {}
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  const ctx = await browser.newContext({
    viewport: MOBILE,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });

  const page = await ctx.newPage();

  // --- Authenticate ---
  console.log('Authenticating...');
  await page.goto(REVIEW_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);

  // ==========================================================
  // 1. EXERCISE DATABASE (landing-feature-ai-logger.png)
  // ==========================================================
  console.log('\n1. Exercise Database...');
  await page.goto(`${BASE_URL}/exercise-database.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  await page.screenshot({
    path: path.join(LANDING_DIR, 'landing-feature-ai-logger.png'),
    fullPage: false,
  });
  console.log('  -> Saved landing-feature-ai-logger.png');

  // ==========================================================
  // 2. PUBLIC WORKOUTS → Push workout detail (hero workout mode)
  // ==========================================================
  console.log('\n2. Push workout for hero shot...');
  await page.goto(`${BASE_URL}/public-workouts.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);

  // Click "Push" filter chip
  const pushChip = page.locator('.category-chip[data-tag="push"], button').filter({ hasText: /^Push$/ }).first();
  if (await pushChip.isVisible({ timeout: 2000 })) {
    await pushChip.click();
    await page.waitForTimeout(2000);
  }

  // Click first workout title
  const pushTitle = page.locator('.card-title, h5, h6').first();
  if (await pushTitle.isVisible({ timeout: 2000 })) {
    await pushTitle.click();
    await page.waitForTimeout(3000);
  }

  // Screenshot offcanvas with push workout
  const offcanvas = page.locator('.offcanvas.show');
  if (await offcanvas.isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.screenshot({
      path: path.join(LANDING_DIR, 'landing-hero-workout-mode.png'),
      fullPage: false,
    });
    console.log('  -> Saved landing-hero-workout-mode.png (Push workout detail)');

    // Save this workout to library
    const saveBtn = page.locator('button').filter({ hasText: /Save to My Workouts/ }).first();
    if (await saveBtn.isVisible({ timeout: 2000 })) {
      console.log('  Saving push workout...');
      await saveBtn.click();
      await page.waitForTimeout(3000);
      // If it redirected to builder, go back
      if (page.url().includes('workout-builder')) {
        console.log('  Redirected to builder after save');
      }
    }
  }

  // Close offcanvas before continuing
  await closeOffcanvas(page);
  await page.waitForTimeout(1000);

  // ==========================================================
  // 3. PUBLIC WORKOUTS → Pull workout detail (session shot)
  // ==========================================================
  console.log('\n3. Pull workout for session shot...');
  await page.goto(`${BASE_URL}/public-workouts.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);

  // Click "Pull" filter chip
  const pullChip = page.locator('.category-chip[data-tag="pull"], button').filter({ hasText: /^Pull$/ }).first();
  if (await pullChip.isVisible({ timeout: 2000 })) {
    await pullChip.click();
    await page.waitForTimeout(2000);
  }

  // Click first pull workout title
  const pullTitle = page.locator('.card-title, h5, h6').first();
  if (await pullTitle.isVisible({ timeout: 2000 })) {
    await pullTitle.click();
    await page.waitForTimeout(3000);
  }

  if (await offcanvas.isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.screenshot({
      path: path.join(LANDING_DIR, 'landing-feature-session.png'),
      fullPage: false,
    });
    console.log('  -> Saved landing-feature-session.png (Pull workout detail)');
  }

  await closeOffcanvas(page);

  // ==========================================================
  // 4. WORKOUT BUILDER (landing-feature-builder.png)
  //    Go to builder - if save worked, we'll have a workout there
  // ==========================================================
  console.log('\n4. Workout Builder...');
  await page.goto(`${BASE_URL}/workout-builder.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);

  // Dismiss toasts
  try {
    const toasts = page.locator('.toast .btn-close');
    for (let i = 0; i < await toasts.count(); i++) {
      if (await toasts.nth(i).isVisible({ timeout: 500 })) {
        await toasts.nth(i).click({ force: true });
      }
    }
  } catch (e) {}
  await page.waitForTimeout(500);

  await page.screenshot({
    path: path.join(LANDING_DIR, 'landing-feature-builder.png'),
    fullPage: false,
  });
  console.log('  -> Saved landing-feature-builder.png');

  // ==========================================================
  // 5. HOME DASHBOARD (landing-dashboard-preview.png)
  // ==========================================================
  console.log('\n5. Home Dashboard...');
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  await page.screenshot({
    path: path.join(IMG_DIR, 'landing-dashboard-preview.png'),
    fullPage: false,
  });
  console.log('  -> Saved landing-dashboard-preview.png');

  await ctx.close();
  await browser.close();
  console.log('\nAll screenshots captured!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
