/**
 * Program Progress Component
 * Renders progress stats, workout checklist, and activity tracker for a program.
 * Reuses ActivityBlockChart for the habit-style daily tracker.
 */

(function() {
    'use strict';

    class ProgramProgress {
        /**
         * @param {string} containerId - DOM element ID to render into
         * @param {Object} options
         * @param {boolean} [options.compact=false] - Compact mode for dashboard cards
         * @param {boolean} [options.showChecklist=true] - Show workout completion checklist
         * @param {boolean} [options.showTracker=true] - Show activity block tracker
         * @param {number} [options.trackerDays=45] - Days to show in tracker
         */
        constructor(containerId, options = {}) {
            this.container = document.getElementById(containerId);
            this.compact = options.compact || false;
            this.showChecklist = options.showChecklist !== false;
            this.showTracker = options.showTracker !== false;
            this.trackerDays = options.trackerDays || 45;

            this.progress = null;
            this.program = null;
            this.workoutNames = {};
        }

        /**
         * Load and display progress for a program
         * @param {Object} program - Program object with id, name, workouts, tracker_enabled, tracker_goal
         * @param {Object} [workoutDetailsMap] - Map of workout_id -> workout name for display
         */
        async loadProgress(program, workoutDetailsMap = {}) {
            this.program = program;
            this.workoutNames = workoutDetailsMap;

            if (!this.container) return;

            this.container.innerHTML = this._renderLoading();

            try {
                const progress = await this._fetchProgress(program.id);
                this.progress = progress;
                this.render();
            } catch (error) {
                console.error('Failed to load program progress:', error);
                this.container.innerHTML = this._renderError();
            }
        }

        /**
         * Set progress data directly (skip API fetch)
         */
        setProgressData(progress, program, workoutDetailsMap = {}) {
            this.progress = progress;
            this.program = program;
            this.workoutNames = workoutDetailsMap;
            this.render();
        }

        render() {
            if (!this.container || !this.progress) return;

            const html = this.compact ? this._renderCompact() : this._renderFull();
            this.container.innerHTML = html;

            // Initialize activity block chart if tracker is enabled
            if (this.showTracker && this.program?.tracker_enabled) {
                this._renderActivityTracker();
            }
        }

        // --- Compact rendering (for dashboard card) ---
        _renderCompact() {
            const p = this.progress;
            const goalText = this._formatGoalProgress();

            return `
                <div class="program-progress-compact">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="fw-semibold small">${this._escapeHtml(this.program?.name || 'Program')}</span>
                        ${p.current_streak > 0 ? `<span class="badge bg-label-warning"><i class="bx bx-flame me-1"></i>${p.current_streak} day streak</span>` : ''}
                    </div>
                    ${this._renderProgressBar(p.completion_percentage)}
                    <div class="d-flex justify-content-between mt-1">
                        <small class="text-muted">${p.unique_workouts_completed}/${p.total_workouts_in_program} workouts</small>
                        <small class="text-muted">${p.total_sessions} sessions</small>
                    </div>
                    ${goalText ? `<div class="mt-1"><small class="text-primary fw-semibold">${goalText}</small></div>` : ''}
                    ${this.showTracker && this.program?.tracker_enabled ? `<div id="programTrackerCompact" class="mt-2"></div>` : ''}
                </div>
            `;
        }

        // --- Full rendering (for program detail) ---
        _renderFull() {
            const p = this.progress;

            let html = `<div class="program-progress-full">`;

            // Stats row
            html += this._renderStatsRow(p);

            // Progress bar
            html += `<div class="mb-3">${this._renderProgressBar(p.completion_percentage)}</div>`;

            // Goal progress
            const goalText = this._formatGoalProgress();
            if (goalText) {
                html += `<div class="mb-3"><span class="badge bg-label-primary">${goalText}</span></div>`;
            }

            // Activity tracker
            if (this.showTracker && this.program?.tracker_enabled) {
                html += `
                    <div class="mb-3">
                        <h6 class="fw-semibold small text-uppercase text-muted mb-2">Activity</h6>
                        <div id="programTrackerFull"></div>
                    </div>
                `;
            }

            // Workout checklist
            if (this.showChecklist) {
                html += this._renderWorkoutChecklist(p);
            }

            // Date info
            if (p.first_session_date) {
                html += `
                    <div class="text-muted small mt-3">
                        <i class="bx bx-calendar me-1"></i>
                        Started ${this._formatDate(p.first_session_date)}
                        ${p.last_session_date ? ` · Last session ${this._formatDate(p.last_session_date)}` : ''}
                    </div>
                `;
            }

            html += `</div>`;
            return html;
        }

        _renderStatsRow(p) {
            return `
                <div class="row g-2 mb-3">
                    <div class="col-4 text-center">
                        <div class="fw-bold fs-5">${p.total_sessions}</div>
                        <small class="text-muted">Sessions</small>
                    </div>
                    <div class="col-4 text-center">
                        <div class="fw-bold fs-5">${p.current_streak}</div>
                        <small class="text-muted">Day Streak</small>
                    </div>
                    <div class="col-4 text-center">
                        <div class="fw-bold fs-5">${this._formatDuration(p.total_duration_minutes)}</div>
                        <small class="text-muted">Total Time</small>
                    </div>
                </div>
            `;
        }

        _renderProgressBar(percentage) {
            const pct = Math.round(percentage);
            const color = pct >= 100 ? 'success' : pct >= 50 ? 'primary' : 'warning';
            return `
                <div class="progress" style="height: 6px;">
                    <div class="progress-bar bg-${color}" role="progressbar" style="width: ${pct}%" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"></div>
                </div>
            `;
        }

        _renderWorkoutChecklist(p) {
            if (!this.program?.workouts?.length) return '';

            let html = `<h6 class="fw-semibold small text-uppercase text-muted mb-2">Workouts</h6><ul class="list-unstyled mb-0">`;

            for (const pw of this.program.workouts) {
                const count = p.workouts_completed[pw.workout_id] || 0;
                const completed = count > 0;
                const name = pw.custom_name || this.workoutNames[pw.workout_id] || pw.workout_id;

                html += `
                    <li class="d-flex align-items-center py-1 ${completed ? '' : 'text-muted'}">
                        <i class="bx ${completed ? 'bx-check-circle text-success' : 'bx-circle'} me-2"></i>
                        <span class="small">${this._escapeHtml(name)}</span>
                        ${count > 1 ? `<span class="badge bg-label-secondary ms-auto">${count}x</span>` : ''}
                    </li>
                `;
            }

            html += `</ul>`;
            return html;
        }

        _renderActivityTracker() {
            // Build fake session data from daily_activity for the ActivityBlockChart
            const chartContainerId = this.compact ? 'programTrackerCompact' : 'programTrackerFull';
            const container = document.getElementById(chartContainerId);
            if (!container || !window.ActivityBlockChart) return;

            const chart = new window.ActivityBlockChart(chartContainerId, {
                daysToShow: this.trackerDays
            });

            // Convert daily_activity map to session-like objects for the chart
            const fakeSessions = [];
            if (this.progress?.daily_activity) {
                for (const [dateStr, count] of Object.entries(this.progress.daily_activity)) {
                    for (let i = 0; i < count; i++) {
                        fakeSessions.push({ completed_at: dateStr + 'T12:00:00' });
                    }
                }
            }

            chart.setSessionData(fakeSessions);
        }

        _renderLoading() {
            return `<div class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary" role="status"></div></div>`;
        }

        _renderError() {
            return `<div class="text-muted small py-2">Unable to load progress data.</div>`;
        }

        async _fetchProgress(programId) {
            if (!window.authService?.isUserAuthenticated()) {
                return this._emptyProgress(programId);
            }

            const token = await window.authService.getIdToken();
            if (!token) return this._emptyProgress(programId);

            const url = window.config.api.getUrl(`/api/v3/firebase/programs/${programId}/progress`);
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch progress: ${response.status}`);
            }

            return await response.json();
        }

        _emptyProgress(programId) {
            return {
                program_id: programId,
                program_name: this.program?.name || '',
                total_sessions: 0,
                workouts_completed: {},
                unique_workouts_completed: 0,
                total_workouts_in_program: this.program?.workouts?.length || 0,
                completion_percentage: 0,
                total_duration_minutes: 0,
                first_session_date: null,
                last_session_date: null,
                current_streak: 0,
                best_streak: 0,
                daily_activity: {},
                weekly_summary: {}
            };
        }

        _formatGoalProgress() {
            if (!this.program?.tracker_goal || !this.progress) return '';

            const goal = this.program.tracker_goal;
            const match = goal.match(/^(\d+)\/(\w+)$/);
            if (!match) return '';

            const target = parseInt(match[1]);
            const period = match[2];

            if (period === 'day') {
                const today = new Date().toISOString().slice(0, 10);
                const todayCount = this.progress.daily_activity[today] || 0;
                return `${todayCount}/${target} today`;
            } else if (period === 'week') {
                // Count sessions this week (Mon-Sun)
                const now = new Date();
                const dayOfWeek = now.getDay() || 7; // Monday = 1
                const monday = new Date(now);
                monday.setDate(now.getDate() - dayOfWeek + 1);
                monday.setHours(0, 0, 0, 0);

                let weekCount = 0;
                for (const [dateStr, count] of Object.entries(this.progress.daily_activity)) {
                    const d = new Date(dateStr + 'T00:00:00');
                    if (d >= monday && d <= now) {
                        weekCount += count;
                    }
                }
                return `${weekCount}/${target} this week`;
            }

            return '';
        }

        _formatDuration(minutes) {
            if (!minutes) return '0m';
            if (minutes < 60) return `${minutes}m`;
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;
            return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
        }

        _formatDate(dateStr) {
            if (!dateStr) return '';
            try {
                const d = new Date(dateStr + 'T00:00:00');
                return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            } catch {
                return dateStr;
            }
        }

        _escapeHtml(str) {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }
    }

    window.ProgramProgress = ProgramProgress;
})();
