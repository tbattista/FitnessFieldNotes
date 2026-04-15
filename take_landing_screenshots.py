"""
Take landing page screenshots from the production site using the demo user.
Uses a single browser context so Firebase auth persists across page navigations.
"""

import asyncio
from playwright.async_api import async_playwright

BASE_URL = "https://fitnessfieldnotes.com"
IMG_DIR = "frontend/assets/img"
LANDING_DIR = f"{IMG_DIR}/landing"

MOBILE = {"width": 390, "height": 844}
DESKTOP = {"width": 1440, "height": 900}


async def wait_for_demo_login(page, timeout=20000):
    """Wait for the demo user to be auto-signed in."""
    try:
        await page.wait_for_function(
            "() => window.firebaseAuth?.currentUser != null",
            timeout=timeout
        )
        print("  Demo user signed in!")
        await page.wait_for_timeout(3000)
    except Exception as e:
        print(f"  Warning: Demo login wait: {e}")


async def take_screenshots():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        # ========================================
        # DESKTOP CONTEXT - for dashboard screenshot
        # ========================================
        print("--- Desktop Screenshots ---")
        desktop_ctx = await browser.new_context(
            viewport=DESKTOP,
            device_scale_factor=2
        )
        desktop_page = await desktop_ctx.new_page()

        # 1. Desktop Dashboard
        print("1. Desktop dashboard...")
        await desktop_page.goto(f"{BASE_URL}/", wait_until="domcontentloaded", timeout=30000)
        await wait_for_demo_login(desktop_page)
        await desktop_page.wait_for_timeout(2000)
        await desktop_page.screenshot(
            path=f"{IMG_DIR}/landing-dashboard-preview.png",
        )
        print("  Saved landing-dashboard-preview.png")
        await desktop_ctx.close()

        # ========================================
        # MOBILE CONTEXT - reuse auth across pages
        # ========================================
        print("\n--- Mobile Screenshots ---")
        mobile_ctx = await browser.new_context(
            viewport=MOBILE,
            device_scale_factor=2
        )
        mobile_page = await mobile_ctx.new_page()

        # First, go to home page and wait for demo login
        print("Logging in as demo user on mobile...")
        await mobile_page.goto(f"{BASE_URL}/", wait_until="domcontentloaded", timeout=30000)
        await wait_for_demo_login(mobile_page)

        # 2. Workout Database (hero workout mode image) - show workout library with data
        print("2. Workout database (hero)...")
        await mobile_page.goto(f"{BASE_URL}/workout-database.html", wait_until="domcontentloaded", timeout=30000)
        await mobile_page.wait_for_timeout(6000)
        await mobile_page.screenshot(
            path=f"{LANDING_DIR}/landing-hero-workout-mode.png",
            full_page=False
        )
        print("  Saved landing-hero-workout-mode.png")

        # 3. Workout Builder - try to open a workout
        print("3. Workout builder...")
        await mobile_page.goto(f"{BASE_URL}/workout-builder.html", wait_until="domcontentloaded", timeout=30000)
        await mobile_page.wait_for_timeout(3000)
        # Try clicking "My Workouts" to load a workout
        try:
            my_workouts_btn = await mobile_page.query_selector('button:has-text("My Workouts"), a:has-text("My Workouts")')
            if my_workouts_btn:
                await my_workouts_btn.click()
                await mobile_page.wait_for_timeout(2000)
                # Click first workout in list
                first_workout = await mobile_page.query_selector('.workout-card, .list-group-item, [data-workout-id]')
                if first_workout:
                    await first_workout.click()
                    await mobile_page.wait_for_timeout(2000)
        except Exception as e:
            print(f"  Note: {e}")
        await mobile_page.screenshot(
            path=f"{LANDING_DIR}/landing-feature-builder.png",
            full_page=False
        )
        print("  Saved landing-feature-builder.png")

        # 4. Workout Mode - find a workout to start
        print("4. Workout mode/session...")
        # Go to workout database to find a workout ID
        await mobile_page.goto(f"{BASE_URL}/workout-database.html", wait_until="domcontentloaded", timeout=30000)
        await mobile_page.wait_for_timeout(3000)
        # Get a workout ID from the page
        workout_id = await mobile_page.evaluate("""
            () => {
                const card = document.querySelector('[data-workout-id], [data-id]');
                return card?.dataset?.workoutId || card?.dataset?.id || null;
            }
        """)
        if workout_id:
            print(f"  Found workout ID: {workout_id}")
            await mobile_page.goto(f"{BASE_URL}/workout-mode.html?id={workout_id}", wait_until="domcontentloaded", timeout=30000)
        else:
            print("  No workout ID found, going to workout-mode directly")
            await mobile_page.goto(f"{BASE_URL}/workout-mode.html", wait_until="domcontentloaded", timeout=30000)
        await mobile_page.wait_for_timeout(4000)
        await mobile_page.screenshot(
            path=f"{LANDING_DIR}/landing-feature-session.png",
            full_page=False
        )
        print("  Saved landing-feature-session.png")

        # 5. Activity Log (AI Logger)
        print("5. Activity log / AI logger...")
        await mobile_page.goto(f"{BASE_URL}/activity-log.html", wait_until="domcontentloaded", timeout=30000)
        await mobile_page.wait_for_timeout(3000)
        await mobile_page.screenshot(
            path=f"{LANDING_DIR}/landing-feature-ai-logger.png",
            full_page=False
        )
        print("  Saved landing-feature-ai-logger.png")

        await mobile_ctx.close()
        await browser.close()
        print("\nAll screenshots saved!")


asyncio.run(take_screenshots())
