/**
 * Home Page Logic
 * Extracted from index.html inline script
 * Handles: auth routing, greeting, weekly progress, favorites, recent activity, activity chart
 * @version 1.0.0
 */
(function() {
    'use strict';

    // --- Configuration (overridable by desktop adapter) ---
    window._homeConfig = {
        maxRecentSessions: 3,
        activityChartDays: null  // null = use settings default
    };

    // --- Module State ---
    let homeWorkouts = [];
    let activeSession = null;
    let workoutDetailOffcanvas = null;
    let activityBlockChart = null;

    // --- Landing Layout (sidebar toggle for unauthenticated visitors) ---
    function updateLandingLayout(isAuthenticated) {
        const layoutMenu = document.getElementById('layout-menu');
        const menuToggle = document.querySelector('.layout-menu-toggle');

        if (isAuthenticated) {
            document.documentElement.classList.remove('layout-without-menu');
            if (layoutMenu) layoutMenu.style.display = '';
            if (menuToggle) menuToggle.style.display = '';
        } else {
            document.documentElement.classList.add('layout-without-menu');
            if (layoutMenu) layoutMenu.style.display = 'none';
            if (menuToggle) menuToggle.style.display = 'none';
        }
    }

    // --- Initialization ---
    async function initHomePage() {
        console.log('Initializing Home Page...');

        const authenticatedDashboard = document.getElementById('authenticatedDashboard');
        const unauthenticatedWelcome = document.getElementById('unauthenticatedWelcome');

        // Wait for Firebase to be ready
        if (!window.firebaseReady) {
            await new Promise(resolve => {
                window.addEventListener('firebaseReady', resolve, { once: true });
            });
        }

        // Wait for data manager
        if (!window.dataManager) {
            console.error('Data manager not available');
            return;
        }

        // Allow forcing the landing page via ?landing query param or /launch path
        const forceLanding = new URLSearchParams(window.location.search).has('landing')
            || window.location.pathname === '/launch' || window.location.pathname === '/launch.html';

        // Check auth state
        const checkAuthAndRender = async () => {
            const user = window.firebaseAuth.currentUser;

            if (forceLanding) {
                // Always show landing page when ?landing is in URL
                updateLandingLayout(false);
                authenticatedDashboard.style.display = 'none';
                unauthenticatedWelcome.style.display = 'block';
                if (window.initLandingAnimations) window.initLandingAnimations();
                return;
            }

            updateLandingLayout(!!user);

            if (user) {
                authenticatedDashboard.style.display = 'block';
                unauthenticatedWelcome.style.display = 'none';
                // Show demo banner if signed in as demo user
                const demoBanner = document.getElementById('demoBanner');
                if (demoBanner) {
                    demoBanner.style.display = window.DemoAutoSignIn?.isDemoUser(user) ? '' : 'none';
                }
                await loadHomeSections();
            } else {
                authenticatedDashboard.style.display = 'none';
                unauthenticatedWelcome.style.display = 'block';
                if (window.initLandingAnimations) window.initLandingAnimations();
            }
        };

        await checkAuthAndRender();

        // Listen for auth state changes
        window.firebaseAuth.onAuthStateChanged(async (user) => {
            await checkAuthAndRender();
        });
    }

    // --- Load All Sections ---
    async function loadHomeSections() {
        try {
            // Initialize workout detail offcanvas (once)
            if (!workoutDetailOffcanvas && window.WorkoutDetailOffcanvas) {
                workoutDetailOffcanvas = new WorkoutDetailOffcanvas({
                    showCreator: false,
                    showStats: false,
                    showDates: true,
                    actions: [
                        {
                            id: 'edit',
                            label: 'Edit',
                            icon: 'bx-edit',
                            variant: 'outline-primary',
                            onClick: (workout) => viewWorkoutDetails(workout.id)
                        },
                        {
                            id: 'share',
                            label: 'Share',
                            icon: 'bx-share-alt',
                            variant: 'outline-secondary',
                            onClick: (workout) => {
                                const url = `${window.location.origin}/workout-builder.html?id=${workout.id}`;
                                navigator.clipboard.writeText(url);
                                alert('Link copied to clipboard!');
                            }
                        },
                        {
                            id: 'start',
                            label: 'Start Workout',
                            icon: 'bx-play',
                            variant: 'primary',
                            primary: true,
                            onClick: (workout) => startWorkout(workout.id)
                        }
                    ]
                });
            }

            renderGreeting();

            const workouts = await loadWorkouts();
            const sessions = await loadSessions();

            const isNewUser = sessions.length === 0;
            const newUserWelcome = document.getElementById('newUserWelcome');
            const returningDashboard = document.getElementById('returningUserDashboard');

            if (isNewUser) {
                if (newUserWelcome) newUserWelcome.style.display = '';
                if (returningDashboard) returningDashboard.style.display = 'none';
            } else {
                if (newUserWelcome) newUserWelcome.style.display = 'none';
                if (returningDashboard) returningDashboard.style.display = '';

                // Wire the Log Session button to open the bottom sheet
                const logBtn = document.getElementById('homeLogSessionBtn');
                if (logBtn) {
                    logBtn.addEventListener('click', () => {
                        if (window.openLogSessionSheet) window.openLogSessionSheet();
                    });
                }

                await renderWhatsNextCard(workouts);
                renderWeeklyProgress(sessions);
                renderActivityChart(sessions);
                renderRecentActivity(sessions);
                renderFavoritesSection(workouts);
                renderProgramTracker();
            }
        } catch (error) {
            console.error('Error loading home sections:', error);
        }
    }

    // --- What's Next Card ---
    async function renderWhatsNextCard(workouts) {
        const container = document.getElementById('whatsNextCard');
        if (!container) return;

        // 1. Check for active session to resume
        try {
            const persisted = localStorage.getItem('ffn_active_workout_session');
            if (persisted) {
                const session = JSON.parse(persisted);
                if (session.workoutId && session.status === 'in_progress') {
                    container.innerHTML = `
                        <div class="card whats-next-card">
                            <div class="card-body py-3 px-3">
                                <small class="text-muted text-uppercase fw-semibold">Resume</small>
                                <h6 class="fw-bold mt-1 mb-2">${escapeHtml(session.workoutName || 'Workout')}</h6>
                                <a href="workout-mode.html?id=${session.workoutId}" class="btn btn-warning btn-sm">
                                    <i class="bx bx-play me-1"></i>Resume Workout
                                </a>
                            </div>
                        </div>
                    `;
                    return;
                }
            }
        } catch (e) { /* ignore */ }

        // 2. Check for active program (stored in localStorage, synced with API)
        const activeProgramId = localStorage.getItem('ffn_active_program_id');
        if (activeProgramId) {
            try {
                const programs = await window.dataManager?.getPrograms?.({ pageSize: 100 });
                const activeProgram = (programs || []).find(p => p.id === activeProgramId);
                if (activeProgram) {
                    const allWorkouts = await window.dataManager?.getWorkouts?.({ pageSize: 500 }).catch(() => []);

                    // Scheduled (weekly) program path
                    if (activeProgram.schedule_type === 'weekly'
                        && Array.isArray(activeProgram.schedule)
                        && activeProgram.schedule.length > 0) {
                        const next = _computeNextScheduledSlot(activeProgram);
                        if (next) {
                            const match = (allWorkouts || []).find(w => w.id === next.workout_id);
                            const workoutName = next.custom_name || match?.name || 'Workout';
                            const progressHtml = await _buildWeeklyProgressHtml(activeProgramId);

                            container.innerHTML = `
                                <div class="card whats-next-card">
                                    <div class="card-body py-3 px-3">
                                        <small class="text-muted text-uppercase fw-semibold">Your Program</small>
                                        <h6 class="fw-bold mt-1 mb-1">${escapeHtml(activeProgram.name)}</h6>
                                        ${progressHtml}
                                        <p class="text-muted small mb-2">Next: ${escapeHtml(workoutName)} <span class="text-muted">· ${escapeHtml(next.whenLabel)}</span></p>
                                        <a href="workout-mode.html?id=${next.workout_id}&programId=${activeProgramId}" class="btn btn-primary btn-sm">
                                            <i class="bx bx-play me-1"></i>Start Workout
                                        </a>
                                    </div>
                                </div>
                            `;
                            return;
                        }
                    }

                    // Flat program path (legacy)
                    if (activeProgram.workouts?.length > 0) {
                        const nextWorkout = activeProgram.workouts[0];
                        let workoutName = nextWorkout.custom_name;
                        if (!workoutName) {
                            const match = (allWorkouts || []).find(w => w.id === nextWorkout.workout_id);
                            workoutName = match?.name || 'Workout';
                        }

                        let progressHtml = '';
                        try {
                            if (window.authService?.isUserAuthenticated()) {
                                const token = await window.authService.getIdToken();
                                if (token) {
                                    const url = window.config.api.getUrl(`/api/v3/firebase/programs/${activeProgramId}/progress`);
                                    const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
                                    if (resp.ok) {
                                        const progress = await resp.json();
                                        const pct = Math.round(progress.completion_percentage || 0);
                                        const streak = progress.current_streak || 0;
                                        progressHtml = `
                                            <div class="d-flex align-items-center gap-2 mb-2">
                                                <div class="progress flex-grow-1" style="height: 5px;">
                                                    <div class="progress-bar bg-${pct >= 100 ? 'success' : 'primary'}" style="width: ${pct}%"></div>
                                                </div>
                                                <small class="text-muted">${progress.total_sessions} sessions</small>
                                                ${streak > 0 ? `<span class="badge bg-label-warning" style="font-size: 0.65rem;"><i class="bx bx-flame"></i>${streak}d</span>` : ''}
                                            </div>
                                        `;
                                    }
                                }
                            }
                        } catch (progressErr) {
                            // Silently fail - progress is optional enhancement
                        }

                        container.innerHTML = `
                            <div class="card whats-next-card">
                                <div class="card-body py-3 px-3">
                                    <small class="text-muted text-uppercase fw-semibold">Your Program</small>
                                    <h6 class="fw-bold mt-1 mb-1">${escapeHtml(activeProgram.name)}</h6>
                                    ${progressHtml}
                                    <p class="text-muted small mb-2">Next: ${escapeHtml(workoutName)}</p>
                                    <a href="workout-mode.html?id=${nextWorkout.workout_id}&programId=${activeProgramId}" class="btn btn-primary btn-sm">
                                        <i class="bx bx-play me-1"></i>Start Workout
                                    </a>
                                </div>
                            </div>
                        `;
                        return;
                    }
                }
            } catch (e) {
                console.warn('Could not load active program:', e);
            }
        }

        // 3. No active program — prompt to set one up
        container.innerHTML = `
            <div class="card whats-next-card">
                <div class="card-body py-3 px-3">
                    <small class="text-muted text-uppercase fw-semibold">What's Next</small>
                    <h6 class="fw-bold mt-1 mb-2">Set up a training program</h6>
                    <p class="text-muted small mb-2">Pin a program to see your next scheduled workout here.</p>
                    <a href="programs.html" class="btn btn-outline-primary btn-sm">
                        <i class="bx bx-list-check me-1"></i>Browse Programs
                    </a>
                </div>
            </div>
        `;
    }

    // --- Weekly Program Helpers ---

    // Find the next scheduled slot on or after today, based on start_date + schedule.
    // Skips today's slot if it's already in the past for today (simple heuristic: today
    // counts if it's scheduled, regardless of time).
    function _computeNextScheduledSlot(program) {
        if (!program || !Array.isArray(program.schedule) || program.schedule.length === 0) return null;
        if (!program.start_date) return null;

        const start = new Date(program.start_date + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const duration = program.duration_weeks || program.weeks_in_cycle || 1;
        const weeksInCycle = program.weeks_in_cycle || 1;

        const daysSinceStart = Math.floor((today - start) / 86400000);
        const todayWeekIdx = daysSinceStart >= 0 ? Math.floor(daysSinceStart / 7) : 0;
        const todayDow = daysSinceStart >= 0 ? (daysSinceStart % 7) : -1;

        // Walk forward week by week looking for scheduled slots
        for (let wi = Math.max(0, todayWeekIdx); wi < duration; wi++) {
            const cycleWeek = (wi % weeksInCycle) + 1;
            const slots = program.schedule
                .filter(e => e.week_number === cycleWeek)
                .sort((a, b) => a.day_of_week - b.day_of_week);
            for (const slot of slots) {
                // Skip slots before today's day-of-week in the current week
                if (wi === todayWeekIdx && slot.day_of_week < todayDow) continue;
                const slotDate = new Date(start);
                slotDate.setDate(slotDate.getDate() + wi * 7 + slot.day_of_week);
                const delta = Math.round((slotDate - today) / 86400000);
                let whenLabel;
                if (delta === 0) whenLabel = 'Today';
                else if (delta === 1) whenLabel = 'Tomorrow';
                else if (delta > 1 && delta < 7) whenLabel = `In ${delta} days`;
                else whenLabel = slotDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                return { ...slot, whenLabel };
            }
        }
        return null;
    }

    async function _buildWeeklyProgressHtml(programId) {
        try {
            if (!window.authService?.isUserAuthenticated()) return '';
            const token = await window.authService.getIdToken();
            if (!token) return '';
            const url = window.config.api.getUrl(`/api/v3/firebase/programs/${programId}/adherence`);
            const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!resp.ok) return '';
            const a = await resp.json();
            if (a.schedule_type !== 'weekly') return '';
            const pct = a.adherence_percentage || 0;
            const currentWeek = a.weeks?.find(w => w.week_index === a.current_week);
            const thisWeekLabel = currentWeek
                ? `${currentWeek.completed_count}/${currentWeek.scheduled_count} this week`
                : `${a.total_completed}/${a.total_scheduled} total`;
            return `
                <div class="d-flex align-items-center gap-2 mb-2">
                    <div class="progress flex-grow-1" style="height: 5px;">
                        <div class="progress-bar bg-${pct >= 80 ? 'success' : 'primary'}" style="width: ${pct}%"></div>
                    </div>
                    <small class="text-muted">${thisWeekLabel}</small>
                </div>
            `;
        } catch (_) {
            return '';
        }
    }

    // --- Greeting ---
    function renderGreeting() {
        const dateEl = document.getElementById('homeDate');
        const greetingEl = document.getElementById('homeGreeting');

        if (dateEl) {
            const today = new Date();
            const options = { weekday: 'long', month: 'long', day: 'numeric' };
            dateEl.textContent = today.toLocaleDateString('en-US', options);
        }

        if (greetingEl) {
            const hour = new Date().getHours();
            let greeting = 'Good Evening';
            if (hour < 12) greeting = 'Good Morning';
            else if (hour < 18) greeting = 'Good Afternoon';

            const user = window.dataManager?.getCurrentUser();
            const fbUser = window.firebaseAuth?.currentUser;
            const userName = user?.displayName || fbUser?.displayName || user?.email?.split('@')[0] || fbUser?.email?.split('@')[0] || '';
            greetingEl.textContent = userName ? `${greeting}, ${userName}!` : `${greeting}!`;
        }
    }

    // --- Weekly Progress ---
    async function loadSessions() {
        try {
            const token = await window.dataManager.getAuthToken();
            const [workoutResponse, cardioResponse] = await Promise.all([
                fetch('/api/v3/workout-sessions?status=completed&page_size=100&sort=desc', {
                    headers: { 'Authorization': `Bearer ${token}` }
                }),
                fetch('/api/v3/cardio-sessions?page_size=100', {
                    headers: { 'Authorization': `Bearer ${token}` }
                }).catch(() => null)
            ]);

            let workoutSessions = [];
            if (workoutResponse && workoutResponse.ok) {
                const workoutData = await workoutResponse.json();
                workoutSessions = (workoutData.sessions || []).map(s => ({ ...s, _sessionType: 'strength' }));
            }

            let cardioSessions = [];
            if (cardioResponse && cardioResponse.ok) {
                const cardioData = await cardioResponse.json();
                cardioSessions = (cardioData.sessions || []).map(s => ({ ...s, _sessionType: 'cardio' }));
            }

            return [...workoutSessions, ...cardioSessions].sort((a, b) => {
                const dateA = new Date(a.completed_at || a.started_at || a.created_at);
                const dateB = new Date(b.completed_at || b.started_at || b.created_at);
                return dateB - dateA;
            });
        } catch (err) {
            console.warn('Error loading sessions:', err);
            return [];
        }
    }

    function renderWeeklyProgress(sessions) {
        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        weekStart.setHours(0, 0, 0, 0);

        const weekSessions = sessions.filter(s => {
            const date = new Date(s.completed_at || s.started_at || s.created_at);
            return date >= weekStart;
        });
        const completed = weekSessions.length;
        const streak = calculateStreak(sessions);

        const statEl = document.getElementById('weeklyStatText');
        if (statEl) {
            statEl.textContent = completed === 0
                ? 'No sessions this week yet'
                : `${completed} session${completed !== 1 ? 's' : ''} this week`;
        }

        const streakBadge = document.getElementById('weeklyStreakBadge');
        if (streakBadge) {
            if (streak > 0) {
                streakBadge.textContent = `${streak} day streak!`;
                streakBadge.style.display = 'inline';
            } else {
                streakBadge.style.display = 'none';
            }
        }

        // Progress bar: use 7 as a soft visual guide (not a hard goal)
        const percentage = Math.min(Math.round((completed / 7) * 100), 100);
        const progressFill = document.getElementById('weeklyProgressFill');
        if (progressFill) {
            setTimeout(() => {
                progressFill.style.width = `${percentage}%`;
            }, 100);
        }

        const progressText = document.getElementById('weeklyProgressText');
        if (progressText) {
            progressText.textContent = completed === 0 ? '' : `Keep it up!`;
        }
    }

    function calculateStreak(sessions) {
        if (sessions.length === 0) return 0;

        const workoutDays = new Set();
        sessions.forEach(s => {
            const dateStr = s.completed_at || s.started_at || s.created_at;
            if (!dateStr) return;
            const date = new Date(dateStr);
            date.setHours(0, 0, 0, 0);
            workoutDays.add(date.getTime());
        });

        const sortedDays = [...workoutDays].sort((a, b) => b - a);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const oneDayMs = 1000 * 60 * 60 * 24;

        const daysSinceLast = Math.round((today.getTime() - sortedDays[0]) / oneDayMs);
        if (daysSinceLast > 1) return 0;

        let streak = 1;
        for (let i = 1; i < sortedDays.length; i++) {
            const diff = Math.round((sortedDays[i - 1] - sortedDays[i]) / oneDayMs);
            if (diff === 1) {
                streak++;
            } else {
                break;
            }
        }

        return streak;
    }

    // --- Activity Block Chart ---
    function renderActivityChart(sessions) {
        const enabled = window.settingsManager?.get('ffn_show_activity_chart', true);
        const section = document.getElementById('activityChartSection');
        if (!section) return;

        if (!enabled) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        const days = window._homeConfig.activityChartDays
            || window.settingsManager?.get('ffn_activity_chart_days', 45);

        // Recreate chart if day count changed
        if (activityBlockChart && activityBlockChart.daysToShow !== days) {
            activityBlockChart = null;
        }

        if (!activityBlockChart && window.ActivityBlockChart) {
            activityBlockChart = new ActivityBlockChart('activityBlockChart', {
                daysToShow: days
            });
        }

        if (activityBlockChart) {
            activityBlockChart.setSessionData(sessions);
        }
    }

    // --- Favorites ---
    async function loadWorkouts() {
        try {
            const workouts = await window.dataManager.getWorkouts({ pageSize: 100 });
            homeWorkouts = Array.isArray(workouts) ? workouts : [];
            return homeWorkouts;
        } catch (err) {
            console.warn('Error loading workouts:', err);
            return [];
        }
    }

    function renderFavoritesSection(workouts) {
        const section = document.getElementById('favoritesSection');
        const container = document.getElementById('favoritesContent');

        if (!container) return;

        const favorites = workouts
            .filter(w => w.is_favorite)
            .sort((a, b) => new Date(b.favorited_at) - new Date(a.favorited_at));

        if (favorites.length === 0) {
            // Hide entire section when no favorites
            if (section) section.style.display = 'none';
            return;
        }

        if (section) section.style.display = '';
        const cardRenderer = window.renderFavoriteCard || renderFavoriteCard;
        container.innerHTML = favorites.map(workout => cardRenderer(workout)).join('');
    }

    function renderFavoriteCard(workout) {
        const exerciseCount = window.ExerciseDataUtils ? ExerciseDataUtils.getGroupCount(workout) : (workout.exercise_groups?.length || 0);
        return `
            <div class="card favorite-card" onclick="showWorkoutDetail('${workout.id}')">
                <div class="card-body py-3 px-3">
                    <div class="d-flex align-items-center gap-2">
                        <i class="bx bxs-heart text-danger"></i>
                        <div>
                            <div class="fw-medium">${escapeHtml(workout.name)}</div>
                            <small class="text-muted">${exerciseCount} exercises</small>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function showWorkoutDetail(workoutId) {
        const workout = homeWorkouts.find(w => w.id === workoutId);
        if (workout && workoutDetailOffcanvas) {
            workoutDetailOffcanvas.show(workout);
        } else {
            console.warn('Could not show workout detail:', workoutId);
        }
    }

    // --- Program Tracker ---
    async function renderProgramTracker() {
        const section = document.getElementById('programTrackerSection');
        const container = document.getElementById('programTrackerContent');
        if (!section || !container) return;

        try {
            // Load ALL programs and filter to tracker-enabled ones
            const programs = await window.dataManager?.getPrograms?.({ pageSize: 100 });
            const trackerPrograms = (programs || []).filter(p => p.tracker_enabled);

            if (trackerPrograms.length === 0) {
                section.style.display = 'none';
                return;
            }

            section.style.display = '';

            if (!window.ProgramProgress) {
                container.innerHTML = '<small class="text-muted">Tracker loading...</small>';
                return;
            }

            // Render a compact tracker card for each tracker-enabled program
            container.innerHTML = trackerPrograms.map((_, i) =>
                `<div id="programTracker_${i}" class="${i > 0 ? 'mt-3 pt-3 border-top' : ''}"></div>`
            ).join('');

            for (let i = 0; i < trackerPrograms.length; i++) {
                const program = trackerPrograms[i];

                // Build workout name map
                const workoutDetailsMap = {};
                (program.workouts || []).forEach(pw => {
                    const w = homeWorkouts.find(hw => hw.id === pw.workout_id);
                    if (w) workoutDetailsMap[pw.workout_id] = w.name;
                });

                const progressComponent = new window.ProgramProgress(`programTracker_${i}`, {
                    compact: true,
                    showChecklist: false,
                    showTracker: true,
                    trackerDays: 45
                });

                await progressComponent.loadProgress(program, workoutDetailsMap);
            }

        } catch (error) {
            console.warn('Could not render program tracker:', error);
            section.style.display = 'none';
        }
    }

    // --- Recent Activity ---
    function renderRecentActivity(sessions) {
        const section = document.getElementById('recentActivitySection');
        const container = document.getElementById('recentActivityContent');

        if (!container) return;

        if (sessions.length === 0) {
            // Hide entire section when no sessions
            if (section) section.style.display = 'none';
            return;
        }

        if (section) section.style.display = '';
        const recentSessions = sessions.slice(0, window._homeConfig.maxRecentSessions);
        const cardRenderer = window.renderActivityCard || renderActivityCard;
        container.innerHTML = recentSessions.map(session => cardRenderer(session)).join('');
    }

    function renderActivityCard(session) {
        if (session._sessionType === 'cardio') {
            return renderCardioActivityCard(session);
        }

        const exercises = session.exercises_performed || [];
        const completed = exercises.filter(ex => !ex.is_skipped).length;
        const total = exercises.length;

        let badge = '';
        if (total > 0) {
            if (completed === total) {
                badge = '<span class="badge bg-success">Complete</span>';
            } else if (completed > 0) {
                badge = '<span class="badge bg-warning">Partial</span>';
            }
        }

        const date = formatRelativeDate(session.completed_at);
        const duration = session.duration_minutes ? `${session.duration_minutes} min` : '';
        const volume = calculateSessionVolume(session);

        return `
            <div class="card recent-activity-card" onclick="viewSessionDetails('${session.id}')">
                <div class="card-body py-3 px-3">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <div class="d-flex align-items-center gap-2">
                            <div class="bg-label-primary rounded p-2">
                                <i class="bx bx-dumbbell"></i>
                            </div>
                            <span class="fw-medium">${escapeHtml(session.workout_name || 'Workout')}</span>
                        </div>
                        ${badge}
                    </div>
                    <div class="d-flex gap-3 text-muted small mb-1">
                        <span><i class="bx bx-calendar me-1"></i>${date}</span>
                        ${duration ? `<span><i class="bx bx-time me-1"></i>${duration}</span>` : ''}
                        ${volume ? `<span><i class="bx bx-trending-up me-1"></i>${volume}</span>` : ''}
                    </div>
                    ${total > 0 ? `<small class="text-muted"><i class="bx bx-check-circle me-1"></i>${completed}/${total} exercises completed</small>` : ''}
                </div>
            </div>
        `;
    }

    function renderCardioActivityCard(session) {
        const registry = window.ActivityTypeRegistry;
        const icon = registry ? registry.getIcon(session.activity_type) : 'bx-run';
        const name = session.activity_name || (registry ? registry.getName(session.activity_type) : session.activity_type) || 'Activity';
        const date = formatRelativeDate(session.completed_at || session.started_at || session.created_at);
        const duration = session.duration_minutes ? `${session.duration_minutes} min` : '';
        const distance = session.distance ? `${session.distance} ${session.distance_unit || 'mi'}` : '';

        return `
            <div class="card recent-activity-card" onclick="viewSessionDetails('${session.id}')">
                <div class="card-body py-3 px-3">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <div class="d-flex align-items-center gap-2">
                            <div class="bg-label-success rounded p-2">
                                <i class="bx ${icon}"></i>
                            </div>
                            <span class="fw-medium">${escapeHtml(name)}</span>
                        </div>
                        <span class="badge bg-success">Complete</span>
                    </div>
                    <div class="d-flex gap-3 text-muted small mb-1">
                        <span><i class="bx bx-calendar me-1"></i>${date}</span>
                        ${duration ? `<span><i class="bx bx-time me-1"></i>${duration}</span>` : ''}
                        ${distance ? `<span><i class="bx bx-map me-1"></i>${distance}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    // --- Navigation Helpers ---
    function viewWorkoutDetails(workoutId) {
        window.location.href = `workout-builder.html?id=${workoutId}`;
    }

    function startWorkout(workoutId) {
        window.location.href = `workout-mode.html?id=${workoutId}`;
    }

    function viewSessionDetails(sessionId) {
        window.location.href = `workout-history.html?session=${sessionId}`;
    }

    // --- Utility Functions ---
    function formatRelativeDate(dateString) {
        if (!dateString) return 'In progress';
        const diffDays = getCalendarDaysAgo(dateString);

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    function calculateSessionVolume(session) {
        const exercises = session.exercises_performed || [];
        const totalVolume = exercises.reduce((sum, ex) => {
            if (ex.is_skipped) return sum;
            const weight = parseFloat(ex.weight) || 0;
            const sets = parseInt(ex.sets_completed || ex.target_sets) || 0;
            const reps = parseInt(ex.target_reps) || 0;
            return sum + (weight * sets * reps);
        }, 0);

        if (totalVolume === 0) return '';
        return totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(1)}K lbs` : `${totalVolume} lbs`;
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // --- Initialize & Expose ---
    document.addEventListener('DOMContentLoaded', initHomePage);

    // Re-render What's Next card when active program sync completes (race condition fix)
    window.addEventListener('activeProgramSynced', async function() {
        try {
            const workouts = homeWorkouts.length ? homeWorkouts : await loadWorkouts();
            await renderWhatsNextCard(workouts);
        } catch (e) { /* ignore */ }
    });

    // Refresh the program card whenever the home tab becomes visible again
    // (e.g. user finishes a workout in workout-mode.html and navigates back).
    // Without this, progress.total_sessions stays stale until a hard reload.
    async function _refreshWhatsNextCard() {
        try {
            const container = document.getElementById('whatsNextCard');
            if (!container) return;
            const workouts = homeWorkouts.length ? homeWorkouts : await loadWorkouts();
            await renderWhatsNextCard(workouts);
        } catch (_) { /* ignore */ }
    }
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') _refreshWhatsNextCard();
    });
    window.addEventListener('pageshow', (e) => {
        // bfcache restore or normal navigation back
        if (e.persisted) _refreshWhatsNextCard();
    });
    // Also listen for the existing session-state-changed event so we update
    // immediately without waiting for a tab switch.
    window.addEventListener('sessionStateChanged', (e) => {
        if (e?.detail?.type === 'completed') _refreshWhatsNextCard();
    });

    // Expose on window for cross-module access and onclick handlers
    window.initHomePage = initHomePage;
    window.loadHomeSections = loadHomeSections;
    window.viewWorkoutDetails = viewWorkoutDetails;
    window.startWorkout = startWorkout;
    window.viewSessionDetails = viewSessionDetails;
    window.showWorkoutDetail = showWorkoutDetail;

    // Expose rendering functions for desktop adapter overrides
    window.renderFavoriteCard = renderFavoriteCard;
    window.renderActivityCard = renderActivityCard;
    window.escapeHtml = escapeHtml;
    window.formatRelativeDate = formatRelativeDate;
    window.calculateSessionVolume = calculateSessionVolume;

})();
