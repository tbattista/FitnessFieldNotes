/**
 * Calendar View Component
 * Renders a monthly calendar grid with workout indicators
 *
 * @version 1.0.0
 * @date 2026-01-24
 */

class CalendarView {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.currentMonth = options.startMonth || new Date();
        this.sessions = [];
        this.onDayClick = options.onDayClick || (() => {});
        this.onRangeSelect = options.onRangeSelect || (() => {});
        this.monthLabelId = options.monthLabelId || 'currentMonth';
        this.prevButtonId = options.prevButtonId || 'prevMonth';
        this.nextButtonId = options.nextButtonId || 'nextMonth';

        // Selection state
        this.selectedDate = null;      // Single-day selection (YYYY-MM-DD)
        this.rangeMode = false;        // Whether range selection is active
        this.selectedStart = null;     // Range start (YYYY-MM-DD)
        this.selectedEnd = null;       // Range end (YYYY-MM-DD)

        this.init();
    }

    init() {
        // Set up navigation button listeners
        const prevBtn = document.getElementById(this.prevButtonId);
        const nextBtn = document.getElementById(this.nextButtonId);

        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.prevMonth());
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.nextMonth());
        }

        this.updateMonthLabel();
    }

    /**
     * Set session data for calendar dots
     * @param {Array} sessions - Array of workout sessions with completed_at dates
     */
    setSessionData(sessions) {
        console.log(`📅 CalendarView.setSessionData() called with ${sessions?.length || 0} sessions`);
        this.sessions = sessions || [];
        if (this.sessions.length > 0) {
            console.log('📅 First session sample:', {
                workout_name: this.sessions[0].workout_name,
                started_at: this.sessions[0].started_at,
                completed_at: this.sessions[0].completed_at,
                status: this.sessions[0].status
            });
        }
        this.render();
    }

    /**
     * Navigate to previous month
     */
    prevMonth() {
        this.currentMonth = new Date(
            this.currentMonth.getFullYear(),
            this.currentMonth.getMonth() - 1,
            1
        );
        this.updateMonthLabel();
        this.render();
    }

    /**
     * Navigate to next month
     */
    nextMonth() {
        this.currentMonth = new Date(
            this.currentMonth.getFullYear(),
            this.currentMonth.getMonth() + 1,
            1
        );
        this.updateMonthLabel();
        this.render();
    }

    /**
     * Update the month label display
     */
    updateMonthLabel() {
        const label = document.getElementById(this.monthLabelId);
        if (label) {
            const options = { month: 'long', year: 'numeric' };
            label.textContent = this.currentMonth.toLocaleDateString('en-US', options);
        }
    }

    /**
     * Render the calendar grid
     */
    render() {
        if (!this.container) {
            console.warn('📅 render() - container not found!');
            return;
        }

        const year = this.currentMonth.getFullYear();
        const month = this.currentMonth.getMonth();
        console.log(`📅 render() - Rendering ${year}-${String(month + 1).padStart(2, '0')} with ${this.sessions.length} sessions`);

        // Get calendar data
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDayOfWeek = firstDay.getDay();
        const totalDays = lastDay.getDate();

        // Build session map
        const sessionMap = this.buildSessionMap();

        // Count how many days in current month have workouts
        let workoutDaysInMonth = 0;
        for (let day = 1; day <= totalDays; day++) {
            const dateKey = this.formatDateKey(year, month, day);
            if (sessionMap.has(dateKey)) {
                workoutDaysInMonth++;
            }
        }
        console.log(`📅 ${workoutDaysInMonth} days in this month have workouts`);

        // Generate HTML
        let html = `
            <div class="calendar-header-row">
                <div class="calendar-header-cell">Su</div>
                <div class="calendar-header-cell">Mo</div>
                <div class="calendar-header-cell">Tu</div>
                <div class="calendar-header-cell">We</div>
                <div class="calendar-header-cell">Th</div>
                <div class="calendar-header-cell">Fr</div>
                <div class="calendar-header-cell">Sa</div>
            </div>
            <div class="calendar-body">
        `;

        // Empty cells for days before month starts
        for (let i = 0; i < startDayOfWeek; i++) {
            html += '<div class="calendar-cell empty"></div>';
        }

        // Day cells
        const today = new Date();
        for (let day = 1; day <= totalDays; day++) {
            const dateKey = this.formatDateKey(year, month, day);
            const daySessions = sessionMap.get(dateKey) || [];
            const hasWorkout = daySessions.length > 0;
            const isToday = this.isToday(year, month, day, today);

            // Selection state
            const isSelected = this.selectedDate === dateKey;
            const isRangeStart = this.selectedStart === dateKey && this.selectedEnd;
            const isRangeEnd = this.selectedEnd === dateKey;
            const isInRange = this.isInRange(dateKey);

            const completedCount = daySessions.filter(s => s.status === 'completed').length;
            const partialCount = daySessions.length - completedCount;

            const cellClasses = [
                'calendar-cell',
                isToday ? 'today' : '',
                hasWorkout ? 'has-workout' : '',
                isSelected ? 'selected' : '',
                isRangeStart ? 'range-start' : '',
                isRangeEnd ? 'range-end' : '',
                isInRange ? 'in-range' : ''
            ].filter(Boolean).join(' ');

            html += `
                <div class="${cellClasses}"
                     data-date="${dateKey}"
                     onclick="window.calendarView.handleDayClick('${dateKey}')">
                    <span class="day-number">${day}</span>
                    ${hasWorkout ? this.renderDots(completedCount, partialCount) : ''}
                </div>
            `;
        }

        // Fill remaining cells to complete the grid
        const totalCells = startDayOfWeek + totalDays;
        const remainingCells = (7 - (totalCells % 7)) % 7;
        for (let i = 0; i < remainingCells; i++) {
            html += '<div class="calendar-cell empty"></div>';
        }

        html += '</div>';
        this.container.innerHTML = html;
    }

    /**
     * Render workout indicator dots
     */
    renderDots(completedCount, partialCount) {
        const dots = [];

        // Add completed dots (green)
        for (let i = 0; i < Math.min(completedCount, 2); i++) {
            dots.push('<span class="workout-dot completed"></span>');
        }

        // Add partial dots (orange)
        for (let i = 0; i < Math.min(partialCount, 2 - dots.length); i++) {
            dots.push('<span class="workout-dot partial"></span>');
        }

        // If more than 2 workouts, show indicator
        const total = completedCount + partialCount;
        if (total > 2) {
            return `<div class="workout-dots">${dots.join('')}<span class="workout-dot-more">+${total - 2}</span></div>`;
        }

        return `<div class="workout-dots">${dots.join('')}</div>`;
    }

    /**
     * Build a map of date -> sessions
     */
    buildSessionMap() {
        const map = new Map();
        console.log(`📅 buildSessionMap() - processing ${this.sessions.length} sessions`);

        this.sessions.forEach((session, index) => {
            // Handle both completed_at and started_at
            const dateStr = session.completed_at || session.started_at;
            if (!dateStr) {
                console.warn(`📅 Session ${index} "${session.workout_name}" has no date`);
                return;
            }

            const date = new Date(dateStr);
            if (isNaN(date.getTime())) {
                console.warn(`📅 Session ${index} has invalid date: ${dateStr}`);
                return;
            }

            const key = this.formatDateKey(date.getFullYear(), date.getMonth(), date.getDate());

            if (!map.has(key)) {
                map.set(key, []);
            }
            map.get(key).push(session);
        });

        console.log(`📅 Session map built: ${map.size} unique days with workouts`);
        if (map.size > 0) {
            console.log('📅 Days with workouts:', Array.from(map.keys()).join(', '));
        }

        return map;
    }

    /**
     * Format date as YYYY-MM-DD key
     */
    formatDateKey(year, month, day) {
        return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    /**
     * Check if a date is today
     */
    isToday(year, month, day, today) {
        return year === today.getFullYear() &&
               month === today.getMonth() &&
               day === today.getDate();
    }

    /**
     * Handle day click - supports single-day and range selection
     */
    handleDayClick(dateKey) {
        const daySessions = this.getSessionsForDate(dateKey);

        if (this.rangeMode) {
            // Range selection mode
            if (!this.selectedStart || (this.selectedStart && this.selectedEnd)) {
                // First click or reset: set start
                this.selectedStart = dateKey;
                this.selectedEnd = null;
                this.selectedDate = null;
                this.render();
            } else {
                // Second click: set end
                let start = this.selectedStart;
                let end = dateKey;
                // Swap if end < start
                if (end < start) {
                    [start, end] = [end, start];
                }
                this.selectedStart = start;
                this.selectedEnd = end;
                this.selectedDate = null;
                this.render();
                // Notify with all sessions in range
                const rangeSessions = this.getSessionsInRange(start, end);
                this.onRangeSelect(start, end, rangeSessions);
            }
        } else {
            // Single-day selection
            this.selectedDate = dateKey;
            this.selectedStart = null;
            this.selectedEnd = null;
            this.render();
            this.onDayClick(dateKey, daySessions);
        }
    }

    /**
     * Check if a date key falls within the selected range (exclusive of endpoints)
     */
    isInRange(dateKey) {
        if (!this.selectedStart || !this.selectedEnd) return false;
        return dateKey > this.selectedStart && dateKey < this.selectedEnd;
    }

    /**
     * Programmatically set a date range selection
     */
    setSelection(start, end) {
        this.selectedDate = null;
        this.selectedStart = start;
        this.selectedEnd = end;
        this.render();
    }

    /**
     * Clear all selection state
     */
    clearSelection() {
        this.selectedDate = null;
        this.selectedStart = null;
        this.selectedEnd = null;
        this.render();
    }

    /**
     * Set range mode on/off
     */
    setRangeMode(enabled) {
        this.rangeMode = enabled;
        if (!enabled) {
            this.selectedStart = null;
            this.selectedEnd = null;
        }
        this.render();
    }

    /**
     * Get sessions for a specific date
     */
    getSessionsForDate(dateKey) {
        return this.sessions.filter(s => {
            const dateStr = s.completed_at || s.started_at;
            if (!dateStr) return false;
            const date = new Date(dateStr);
            return this.formatDateKey(date.getFullYear(), date.getMonth(), date.getDate()) === dateKey;
        });
    }

    /**
     * Get all sessions within a date range (inclusive)
     */
    getSessionsInRange(start, end) {
        return this.sessions.filter(s => {
            const dateStr = s.completed_at || s.started_at;
            if (!dateStr) return false;
            const date = new Date(dateStr);
            const key = this.formatDateKey(date.getFullYear(), date.getMonth(), date.getDate());
            return key >= start && key <= end;
        });
    }

    /**
     * Navigate to the month containing a given date key
     */
    navigateToDate(dateKey) {
        const [year, month] = dateKey.split('-').map(Number);
        this.currentMonth = new Date(year, month - 1, 1);
        this.updateMonthLabel();
        this.render();
    }

    /**
     * Get sessions for current month (for external use)
     */
    getCurrentMonthSessions() {
        const year = this.currentMonth.getFullYear();
        const month = this.currentMonth.getMonth();

        return this.sessions.filter(s => {
            const dateStr = s.completed_at || s.started_at;
            if (!dateStr) return false;
            const date = new Date(dateStr);
            return date.getFullYear() === year && date.getMonth() === month;
        });
    }
}

// Global instance for event handlers
let calendarView = null;

// Make class available globally
window.CalendarView = CalendarView;
