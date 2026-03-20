/**
 * Desktop Home Adapter
 * Overrides home-page.js rendering for desktop-optimized layout
 * Follows same IIFE + early-exit pattern as desktop-view-adapter.js
 * @version 1.0.0
 */
(function() {
    'use strict';

    const isDesktop = document.documentElement.classList.contains('desktop-view');
    if (!isDesktop) return;

    console.log('Desktop home adapter activating...');

    // ============================================
    // CONFIG OVERRIDES
    // ============================================

    window._homeConfig = window._homeConfig || {};
    window._homeConfig.maxRecentSessions = 5;
    window._homeConfig.activityChartDays = 90;

    // ============================================
    // OVERRIDE: renderFavoriteCard
    // Desktop adds inline Start button + exercise count
    // ============================================

    window.renderFavoriteCard = function(workout) {
        const exerciseCount = window.ExerciseDataUtils ? ExerciseDataUtils.getGroupCount(workout) : (workout.exercise_groups?.length || 0);
        const esc = window.escapeHtml || function(t) { return t || ''; };

        return `
            <div class="desktop-favorite-item d-flex align-items-center justify-content-between px-4 py-3"
                 style="border-bottom: 1px solid var(--bs-border-color); cursor: pointer;"
                 onclick="showWorkoutDetail('${workout.id}')">
                <div class="d-flex align-items-center gap-3">
                    <i class="bx bxs-heart text-danger"></i>
                    <div>
                        <div class="fw-medium">${esc(workout.name)}</div>
                        <small class="text-muted">${exerciseCount} exercise${exerciseCount !== 1 ? 's' : ''}</small>
                    </div>
                </div>
                <button class="btn btn-sm btn-outline-primary"
                        onclick="event.stopPropagation(); startWorkout('${workout.id}')">
                    <i class="bx bx-play me-1"></i>Start
                </button>
            </div>
        `;
    };

    // ============================================
    // OVERRIDE: renderActivityCard
    // Desktop adds exercise name list + row layout
    // ============================================

    window.renderActivityCard = function(session) {
        if (session._sessionType === 'cardio') {
            return renderDesktopCardioCard(session);
        }

        const exercises = session.exercises_performed || [];
        const completed = exercises.filter(ex => !ex.is_skipped).length;
        const total = exercises.length;
        const esc = window.escapeHtml || function(t) { return t || ''; };
        const fmtDate = window.formatRelativeDate || function() { return ''; };
        const calcVol = window.calculateSessionVolume || function() { return ''; };

        // Completion badge
        let badge = '';
        if (!session.completed_at) {
            badge = '<span class="badge bg-label-secondary">In Progress</span>';
        } else if (total > 0) {
            if (completed === total) {
                badge = '<span class="badge bg-success">Complete</span>';
            } else if (completed > 0) {
                badge = '<span class="badge bg-warning">Partial</span>';
            }
        }

        const date = fmtDate(session.completed_at);
        const duration = session.duration_minutes ? `${session.duration_minutes} min` : '';
        const volume = calcVol(session);

        // Exercise names (up to 4) - desktop enhancement
        const exerciseNames = exercises
            .filter(ex => !ex.is_skipped)
            .slice(0, 4)
            .map(ex => esc(ex.exercise_name || ex.name || 'Exercise'))
            .join(', ');
        const moreCount = Math.max(0, completed - 4);

        return `
            <div class="desktop-activity-item d-flex align-items-center px-4 py-3"
                 style="border-bottom: 1px solid var(--bs-border-color); cursor: pointer;"
                 onclick="viewSessionDetails('${session.id}')">
                <div class="bg-label-primary rounded p-2 me-3 flex-shrink-0">
                    <i class="bx bx-dumbbell"></i>
                </div>
                <div class="flex-grow-1" style="min-width: 0;">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <span class="fw-medium">${esc(session.workout_name || 'Workout')}</span>
                        ${badge}
                    </div>
                    <div class="d-flex gap-3 text-muted small">
                        <span><i class="bx bx-calendar me-1"></i>${date}</span>
                        ${duration ? `<span><i class="bx bx-time me-1"></i>${duration}</span>` : ''}
                        ${volume ? `<span><i class="bx bx-trending-up me-1"></i>${volume}</span>` : ''}
                        ${total > 0 ? `<span><i class="bx bx-check-circle me-1"></i>${completed}/${total}</span>` : ''}
                    </div>
                    ${exerciseNames ? `<small class="text-muted d-block mt-1 text-truncate">${exerciseNames}${moreCount > 0 ? ` +${moreCount} more` : ''}</small>` : ''}
                </div>
            </div>
        `;
    };

    function renderDesktopCardioCard(session) {
        const esc = window.escapeHtml || function(t) { return t || ''; };
        const fmtDate = window.formatRelativeDate || function() { return ''; };
        const registry = window.ActivityTypeRegistry;
        const icon = registry ? registry.getIcon(session.activity_type) : 'bx-run';
        const name = session.activity_name || (registry ? registry.getName(session.activity_type) : session.activity_type) || 'Activity';
        const date = fmtDate(session.completed_at || session.started_at || session.created_at);
        const duration = session.duration_minutes ? `${session.duration_minutes} min` : '';
        const distance = session.distance ? `${session.distance} ${session.distance_unit || 'mi'}` : '';

        return `
            <div class="desktop-activity-item d-flex align-items-center px-4 py-3"
                 style="border-bottom: 1px solid var(--bs-border-color); cursor: pointer;"
                 onclick="viewSessionDetails('${session.id}')">
                <div class="bg-label-success rounded p-2 me-3 flex-shrink-0">
                    <i class="bx ${icon}"></i>
                </div>
                <div class="flex-grow-1" style="min-width: 0;">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <span class="fw-medium">${esc(name)}</span>
                        <span class="badge bg-success">Complete</span>
                    </div>
                    <div class="d-flex gap-3 text-muted small">
                        <span><i class="bx bx-calendar me-1"></i>${date}</span>
                        ${duration ? `<span><i class="bx bx-time me-1"></i>${duration}</span>` : ''}
                        ${distance ? `<span><i class="bx bx-map me-1"></i>${distance}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    console.log('Desktop home adapter loaded');
})();
