"""
Fitness Field Notes - Main Application Entry Point
Slim FastAPI application with modular router architecture
"""

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, PlainTextResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import os
import logging
from dotenv import load_dotenv

# Load environment variables FIRST before importing Firebase services
load_dotenv()

# Import routers
from .api import health, documents, workouts, programs, exercises, favorites, personal_records, auth, data, migration, workout_sessions, sharing, user_profile, export, cardio_sessions, import_routes, universal_log_routes, cron, exercise_images, spin_ride, tabata_kettlebell
from .services.sharing_service import sharing_service
import re
import html

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Fitness Field Notes API",
    description="API for generating customized gym log documents. Modular architecture with Firebase integration.",
    version="2.0.0",
    redirect_slashes=False  # Prevent 307 redirects that strip Authorization headers
)

# Add CORS middleware for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify actual origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router)
app.include_router(documents.router)
app.include_router(workouts.router)
app.include_router(workouts.firebase_router)  # Firebase-specific workout endpoints
app.include_router(programs.router)
app.include_router(programs.firebase_router)  # Firebase-specific program endpoints
app.include_router(exercises.router)
app.include_router(favorites.router)
app.include_router(personal_records.router)  # Personal records (PR) management
app.include_router(auth.router)
app.include_router(data.router)
app.include_router(migration.router)
app.include_router(workout_sessions.router)  # Workout session logging (premium feature)
app.include_router(sharing.router)  # Workout sharing endpoints
app.include_router(user_profile.router)  # User profile management
app.include_router(export.router)  # Export endpoints (text, image, print)
app.include_router(cardio_sessions.router)  # Cardio session logging
app.include_router(import_routes.router)  # Workout import parsing
app.include_router(universal_log_routes.router)  # Universal Logger (AI session logging)
app.include_router(cron.router)  # Scheduled task endpoints (daily workout generator)
app.include_router(exercise_images.router)  # Exercise GIF proxy/cache
app.include_router(spin_ride.router)  # Spin Ride generator (experimental)
app.include_router(tabata_kettlebell.router)  # Tabata Kettlebell generator (experimental)

logger.info("✅ All routers included successfully (22 routers total)")

# ============================================
# SEO Routes (robots.txt, sitemap.xml, llms.txt)
# ============================================

@app.get("/robots.txt", response_class=PlainTextResponse)
async def serve_robots():
    """Serve robots.txt for search engine crawlers"""
    try:
        with open("frontend/robots.txt", "r", encoding="utf-8") as f:
            return PlainTextResponse(content=f.read())
    except FileNotFoundError:
        # Fallback robots.txt
        return PlainTextResponse(content="User-agent: *\nAllow: /\n")

_sitemap_cache = {"xml": None, "generated_at": 0}
SITEMAP_CACHE_TTL = 3600  # 1 hour

@app.get("/sitemap.xml")
async def serve_sitemap():
    """Serve dynamic sitemap.xml with static pages + public workouts"""
    import time

    now = time.time()
    if _sitemap_cache["xml"] and (now - _sitemap_cache["generated_at"]) < SITEMAP_CACHE_TTL:
        return Response(content=_sitemap_cache["xml"], media_type="application/xml")

    base_url = os.getenv("RAILWAY_PUBLIC_DOMAIN", "fitnessfieldnotes.com")
    base_url = f"https://{base_url}" if not base_url.startswith("http") else base_url

    # Static pages
    urls = [
        f'  <url><loc>{base_url}/</loc><priority>1.0</priority><changefreq>weekly</changefreq></url>',
        f'  <url><loc>{base_url}/public-workouts</loc><priority>0.8</priority><changefreq>daily</changefreq></url>',
        f'  <url><loc>{base_url}/privacy.html</loc><priority>0.3</priority><changefreq>yearly</changefreq></url>',
        f'  <url><loc>{base_url}/terms.html</loc><priority>0.3</priority><changefreq>yearly</changefreq></url>',
    ]

    # Add public workouts dynamically
    try:
        result = await sharing_service.get_public_workouts(page=1, page_size=500)
        for workout in result.get("workouts", []):
            workout_id = workout.id if hasattr(workout, 'id') else workout.get('id', '')
            if workout_id:
                urls.append(f'  <url><loc>{base_url}/workout-builder.html?share_id={workout_id}</loc><priority>0.6</priority><changefreq>weekly</changefreq></url>')
        logger.info(f"Sitemap generated with {len(urls)} URLs ({len(result.get('workouts', []))} public workouts)")
    except Exception as e:
        logger.warning(f"Could not fetch public workouts for sitemap: {e}")

    xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    xml += '\n'.join(urls)
    xml += '\n</urlset>'

    _sitemap_cache["xml"] = xml
    _sitemap_cache["generated_at"] = now

    return Response(content=xml, media_type="application/xml")

@app.get("/llms.txt", response_class=PlainTextResponse)
async def serve_llms_txt():
    """Serve llms.txt for AI/LLM crawlers (ChatGPT, Claude, etc.)"""
    try:
        with open("frontend/llms.txt", "r", encoding="utf-8") as f:
            return PlainTextResponse(content=f.read())
    except FileNotFoundError:
        return PlainTextResponse(content="# Fitness Field Notes\nA minimalist workout tracking application.\n")

@app.get("/manifest.json")
async def serve_manifest():
    """Serve PWA manifest.json"""
    try:
        with open("frontend/manifest.json", "r", encoding="utf-8") as f:
            return Response(content=f.read(), media_type="application/manifest+json")
    except FileNotFoundError:
        return Response(content="{}", media_type="application/manifest+json")

logger.info("✅ SEO routes registered (robots.txt, sitemap.xml, llms.txt, manifest.json)")

# Create necessary directories
os.makedirs("backend/uploads", exist_ok=True)
os.makedirs("backend/templates/html", exist_ok=True)

# Mount static files (frontend)
frontend_path = Path("frontend")

# Mount main frontend (V0.4.1 Sneat-based)
if frontend_path.exists():
    logger.info(f"✅ Frontend directory found: {frontend_path.absolute()}")
    app.mount("/static", StaticFiles(directory="frontend"), name="static")
else:
    logger.error(f"❌ Frontend directory not found at: {frontend_path.absolute()}")


# Serve HTML pages

@app.get("/", response_class=HTMLResponse)
@app.get("/index.html", response_class=HTMLResponse)
async def serve_home():
    """Serve the Ghost Gym home/dashboard page"""
    try:
        with open("frontend/index.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        return HTMLResponse(
            content="<h1>Home page not found</h1><p>Please ensure frontend/index.html exists</p>",
            status_code=404
        )

@app.get("/programs", response_class=HTMLResponse)
@app.get("/programs.html", response_class=HTMLResponse)
async def serve_programs():
    """Serve the Programs Management page"""
    try:
        with open("frontend/programs.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        return HTMLResponse(
            content="<h1>Programs page not found</h1><p>Please ensure frontend/programs.html exists</p>",
            status_code=404
        )

@app.get("/workouts", response_class=HTMLResponse)
@app.get("/workout-builder", response_class=HTMLResponse)
@app.get("/workout-builder.html", response_class=HTMLResponse)
async def serve_workout_builder():
    """Serve the Workout Builder page"""
    try:
        with open("frontend/workout-builder.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        return HTMLResponse(
            content="<h1>Workout Builder page not found</h1><p>Please ensure frontend/workout-builder.html exists</p>",
            status_code=404
        )

@app.get("/exercise-database", response_class=HTMLResponse)
@app.get("/exercise-database.html", response_class=HTMLResponse)
async def serve_exercise_database():
    """Serve the Exercise Database page"""
    try:
        with open("frontend/exercise-database.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        return HTMLResponse(
            content="<h1>Exercise Database not found</h1><p>Please ensure frontend/exercise-database.html exists</p>",
            status_code=404
        )

@app.get("/exercise-edit", response_class=HTMLResponse)
@app.get("/exercise-edit.html", response_class=HTMLResponse)
async def serve_exercise_edit():
    """Serve the Exercise Edit page - Edit custom exercises and link to database"""
    try:
        with open("frontend/exercise-edit.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        return HTMLResponse(
            content="<h1>Exercise Edit not found</h1><p>Please ensure frontend/exercise-edit.html exists</p>",
            status_code=404
        )

@app.get("/workout-database", response_class=HTMLResponse)
@app.get("/workout-database.html", response_class=HTMLResponse)
async def serve_workout_database():
    """Serve the Workout Library page"""
    try:
        with open("frontend/workout-database.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        return HTMLResponse(
            content="<h1>Workout Library not found</h1><p>Please ensure frontend/workout-database.html exists</p>",
            status_code=404
        )

@app.get("/workout-mode", response_class=HTMLResponse)
@app.get("/workout-mode.html", response_class=HTMLResponse)
async def serve_workout_mode():
    """Serve the Workout Mode page"""
    try:
        with open("frontend/workout-mode.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        return HTMLResponse(
            content="<h1>Workout Mode not found</h1><p>Please ensure frontend/workout-mode.html exists</p>",
            status_code=404
        )

@app.get("/feedback-admin", response_class=HTMLResponse)
@app.get("/feedback-admin.html", response_class=HTMLResponse)
async def serve_feedback_admin():
    """Serve the Feedback Admin Dashboard page"""
    try:
        with open("frontend/feedback-admin.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        return HTMLResponse(
            content="<h1>Feedback Admin not found</h1><p>Please ensure frontend/feedback-admin.html exists</p>",
            status_code=404
        )

@app.get("/feedback-voting", response_class=HTMLResponse)
@app.get("/feedback-voting.html", response_class=HTMLResponse)
async def serve_feedback_voting():
    """Serve the Feedback Voting page - Public feature requests and bug voting"""
    try:
        with open("frontend/feedback-voting.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        return HTMLResponse(
            content="<h1>Feedback Voting not found</h1><p>Please ensure frontend/feedback-voting.html exists</p>",
            status_code=404
        )

@app.get("/profile", response_class=HTMLResponse)
@app.get("/settings", response_class=HTMLResponse)
@app.get("/settings.html", response_class=HTMLResponse)
async def serve_settings():
    """Serve the Settings page"""
    try:
        with open("frontend/settings.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        return HTMLResponse(
            content="<h1>Settings page not found</h1><p>Please ensure frontend/settings.html exists</p>",
            status_code=404
        )

@app.get("/profile.html", response_class=HTMLResponse)
async def serve_profile():
    """Serve the User Profile page"""
    try:
        with open("frontend/profile.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        return HTMLResponse(
            content="<h1>Profile page not found</h1><p>Please ensure frontend/profile.html exists</p>",
            status_code=404
        )

@app.get("/workout-history", response_class=HTMLResponse)
@app.get("/workout-history.html", response_class=HTMLResponse)
async def serve_workout_history():
    """Serve the Workout History page"""
    try:
        with open("frontend/workout-history.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        return HTMLResponse(
            content="<h1>Workout History not found</h1><p>Please ensure frontend/workout-history.html exists</p>",
            status_code=404
        )

@app.get("/activity-log", response_class=HTMLResponse)
@app.get("/activity-log.html", response_class=HTMLResponse)
async def serve_activity_log():
    """Serve the Activity Log page"""
    try:
        with open("frontend/activity-log.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        return HTMLResponse(
            content="<h1>Activity Log not found</h1><p>Please ensure frontend/activity-log.html exists</p>",
            status_code=404
        )

@app.get("/public-workouts", response_class=HTMLResponse)
@app.get("/public-workouts.html", response_class=HTMLResponse)
async def serve_public_workouts():
    """Serve the Public Workouts (Discover) page"""
    try:
        with open("frontend/public-workouts.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        return HTMLResponse(
            content="<h1>Public Workouts not found</h1><p>Please ensure frontend/public-workouts.html exists</p>",
            status_code=404
        )

@app.get("/dashboard", response_class=HTMLResponse)
@app.get("/dashboard.html", response_class=HTMLResponse)
async def serve_dashboard():
    """Serve the Dashboard page - Mobile-first user dashboard"""
    try:
        with open("frontend/dashboard.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        return HTMLResponse(
            content="<h1>Dashboard not found</h1><p>Please ensure frontend/dashboard.html exists</p>",
            status_code=404
        )

@app.get("/program-manager", response_class=HTMLResponse)
@app.get("/program-manager.html", response_class=HTMLResponse)
async def serve_program_manager():
    """Serve the Program Manager page - Create/manage programs and workouts"""
    try:
        with open("frontend/program-manager.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        return HTMLResponse(
            content="<h1>Program Manager not found</h1><p>Please ensure frontend/program-manager.html exists</p>",
            status_code=404
        )

@app.get("/workout-sessions-demo", response_class=HTMLResponse)
@app.get("/workout-sessions-demo.html", response_class=HTMLResponse)
async def serve_workout_sessions_demo():
    """Serve the Workout Sessions Demo page - Workout history viewer"""
    try:
        with open("frontend/workout-sessions-demo.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        return HTMLResponse(
            content="<h1>Workout Sessions Demo not found</h1><p>Please ensure frontend/workout-sessions-demo.html exists</p>",
            status_code=404
        )

@app.get("/exercise-history-demo", response_class=HTMLResponse)
@app.get("/exercise-history-demo.html", response_class=HTMLResponse)
async def serve_exercise_history_demo():
    """Serve the Exercise History Demo page - Side-by-side workout comparison"""
    try:
        with open("frontend/exercise-history-demo.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        return HTMLResponse(
            content="<h1>Exercise History Demo not found</h1><p>Please ensure frontend/exercise-history-demo.html exists</p>",
            status_code=404
        )


@app.get("/privacy.html", response_class=HTMLResponse)
async def serve_privacy_page():
    try:
        with open("frontend/privacy.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        return HTMLResponse(
            content="<h1>Privacy Policy not found</h1><p>Please ensure frontend/privacy.html exists</p>",
            status_code=404
        )

@app.get("/terms.html", response_class=HTMLResponse)
async def serve_terms_page():
    try:
        with open("frontend/terms.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        return HTMLResponse(
            content="<h1>Terms of Service not found</h1><p>Please ensure frontend/terms.html exists</p>",
            status_code=404
        )

@app.get("/spin-ride", response_class=HTMLResponse)
@app.get("/spin-ride.html", response_class=HTMLResponse)
async def serve_spin_ride():
    """Serve the Spin Ride page (experimental, direct link only)"""
    try:
        with open("frontend/spin-ride.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        return HTMLResponse(
            content="<h1>Spin Ride not found</h1><p>Please ensure frontend/spin-ride.html exists</p>",
            status_code=404
        )

@app.get("/tabata-kettlebell", response_class=HTMLResponse)
@app.get("/tabata-kettlebell.html", response_class=HTMLResponse)
async def serve_tabata_kettlebell():
    """Serve the Tabata Kettlebell page (experimental, direct link only)"""
    try:
        with open("frontend/tabata-kettlebell.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        return HTMLResponse(
            content="<h1>Tabata Kettlebell not found</h1><p>Please ensure frontend/tabata-kettlebell.html exists</p>",
            status_code=404
        )

@app.get("/launch", response_class=HTMLResponse)
@app.get("/launch.html", response_class=HTMLResponse)
async def serve_launch_page():
    """Serve the launch/landing page (same as index.html)"""
    with open("frontend/index.html", "r", encoding="utf-8") as f:
        return f.read()

@app.get("/share/{token}", response_class=HTMLResponse)
async def serve_share_page(token: str):
    """Serve share.html with dynamic meta tags for SEO and social sharing"""
    try:
        with open("frontend/share.html", "r", encoding="utf-8") as f:
            html_content = f.read()

        # Try to fetch workout data for dynamic meta tags
        try:
            share_data = await sharing_service.get_private_share(token)
            if share_data:
                workout_data = share_data.get("workout_data", {}) if isinstance(share_data, dict) else share_data.workout_data
                workout_name = html.escape(workout_data.get("name", "Shared Workout"))
                creator_name = html.escape(share_data.get("creator_name", "") if isinstance(share_data, dict) else (share_data.creator_name or ""))

                # Count exercises
                exercise_groups = workout_data.get("exercise_groups", [])
                exercise_count = sum(len(g.get("exercises", [])) for g in exercise_groups)

                # Build dynamic meta content
                if creator_name:
                    meta_description = f"{workout_name} - {exercise_count} exercises. Created by {creator_name}. View and save this workout template."
                else:
                    meta_description = f"{workout_name} - {exercise_count} exercises. View and save this workout template."

                og_title = f"{workout_name} - Shared Workout | Fitness Field Notes"

                # Replace default meta tags with dynamic content
                html_content = re.sub(
                    r'<title>.*?</title>',
                    f'<title>{html.escape(og_title)}</title>',
                    html_content
                )
                html_content = re.sub(
                    r'<meta name="description" content="[^"]*"',
                    f'<meta name="description" content="{meta_description}"',
                    html_content
                )
                html_content = re.sub(
                    r'<meta property="og:title" content="[^"]*"',
                    f'<meta property="og:title" content="{html.escape(og_title)}"',
                    html_content
                )
                html_content = re.sub(
                    r'<meta property="og:description" content="[^"]*"',
                    f'<meta property="og:description" content="{meta_description}"',
                    html_content
                )
                html_content = re.sub(
                    r'<meta name="twitter:title" content="[^"]*"',
                    f'<meta name="twitter:title" content="{html.escape(og_title)}"',
                    html_content
                )
                html_content = re.sub(
                    r'<meta name="twitter:description" content="[^"]*"',
                    f'<meta name="twitter:description" content="{meta_description}"',
                    html_content
                )

                logger.info(f"Served share page with dynamic SEO for workout: {workout_name}")
        except Exception as e:
            # If we can't fetch workout data, serve with default meta tags
            logger.warning(f"Could not fetch workout data for share/{token}: {e}")

        return HTMLResponse(content=html_content)
    except FileNotFoundError:
        return HTMLResponse(
            content="<h1>Share page not found</h1><p>Please ensure frontend/share.html exists</p>",
            status_code=404
        )

@app.get("/share.html", response_class=HTMLResponse)
async def serve_share_page_html():
    """Serve share.html for direct access (token will be read from query params by JS)"""
    try:
        with open("frontend/share.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        return HTMLResponse(
            content="<h1>Share page not found</h1><p>Please ensure frontend/share.html exists</p>",
            status_code=404
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)

logger.info("🚀 Fitness Field Notes API initialized successfully")
