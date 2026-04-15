/**
 * ProgramWeekGrid
 * Editable Mon-Sun × N-weeks grid for assigning workouts to scheduled slots.
 *
 * Usage:
 *   const grid = new ProgramWeekGrid({
 *     host: document.getElementById('host'),
 *     workouts: [...],                 // full workout list (for display names)
 *     weeksInCycle: 1,
 *     schedule: [{ workout_id, week_number, day_of_week, custom_name }],
 *     onSlotClick: (week_number, day_of_week, existingEntry) => {...},
 *     onChange: (scheduleArray) => {...},
 *   });
 *   grid.render();
 */
(function() {
    'use strict';

    const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    function escapeHtml(s) {
        if (!s) return '';
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    class ProgramWeekGrid {
        constructor(config) {
            this.host = config.host;
            this.workouts = config.workouts || [];
            this.weeksInCycle = Math.max(1, config.weeksInCycle || 1);
            this.schedule = Array.isArray(config.schedule) ? [...config.schedule] : [];
            this.onSlotClick = config.onSlotClick || null;
            this.onChange = config.onChange || null;
        }

        setWorkouts(workouts) {
            this.workouts = workouts || [];
        }

        setWeeksInCycle(n) {
            this.weeksInCycle = Math.max(1, n || 1);
            // Drop entries from dropped weeks
            this.schedule = this.schedule.filter(e => e.week_number <= this.weeksInCycle);
            this._emitChange();
        }

        setSchedule(schedule) {
            this.schedule = Array.isArray(schedule) ? [...schedule] : [];
        }

        getSchedule() {
            return [...this.schedule];
        }

        addEntry(week_number, day_of_week, workout_id, custom_name = null) {
            // Replace existing entry in the same slot
            this.schedule = this.schedule.filter(
                e => !(e.week_number === week_number && e.day_of_week === day_of_week)
            );
            this.schedule.push({
                workout_id,
                week_number,
                day_of_week,
                custom_name: custom_name || null,
                notes: null
            });
            this._emitChange();
            this.render();
        }

        removeEntry(week_number, day_of_week) {
            this.schedule = this.schedule.filter(
                e => !(e.week_number === week_number && e.day_of_week === day_of_week)
            );
            this._emitChange();
            this.render();
        }

        _getEntry(week_number, day_of_week) {
            return this.schedule.find(
                e => e.week_number === week_number && e.day_of_week === day_of_week
            );
        }

        _getWorkoutName(workout_id) {
            const w = this.workouts.find(x => x.id === workout_id);
            return w ? w.name : workout_id;
        }

        _emitChange() {
            if (this.onChange) this.onChange(this.getSchedule());
        }

        render() {
            if (!this.host) return;

            let html = '<div class="pwg-root">';

            for (let wk = 1; wk <= this.weeksInCycle; wk++) {
                html += `
                    <div class="pwg-week">
                        <div class="pwg-week-header">
                            <span class="pwg-week-label">Week ${wk}</span>
                        </div>
                        <div class="pwg-days">`;

                for (let day = 0; day < 7; day++) {
                    const entry = this._getEntry(wk, day);
                    const filled = !!entry;
                    const label = filled
                        ? escapeHtml(entry.custom_name || this._getWorkoutName(entry.workout_id))
                        : '';

                    html += `
                        <div class="pwg-day ${filled ? 'pwg-day--filled' : 'pwg-day--empty'}"
                             data-week="${wk}"
                             data-day="${day}"
                             role="button"
                             tabindex="0"
                             aria-label="Week ${wk} ${DAY_LABELS[day]}${filled ? ': ' + label : ': empty'}">
                            <div class="pwg-day-label">${DAY_LABELS[day]}</div>
                            <div class="pwg-day-body">
                                ${filled
                                    ? `<span class="pwg-chip" title="${label}">${label}</span>
                                       <button class="pwg-remove" data-week="${wk}" data-day="${day}" aria-label="Remove">
                                           <i class="bx bx-x"></i>
                                       </button>`
                                    : `<i class="bx bx-plus pwg-plus"></i>`
                                }
                            </div>
                        </div>`;
                }

                html += `</div></div>`;
            }

            html += '</div>';
            this.host.innerHTML = html;

            this._attachEventListeners();
        }

        _attachEventListeners() {
            const slots = this.host.querySelectorAll('.pwg-day');
            slots.forEach(slot => {
                slot.addEventListener('click', (e) => {
                    // If the remove button was clicked, handle separately
                    if (e.target.closest('.pwg-remove')) return;
                    const wk = parseInt(slot.dataset.week, 10);
                    const day = parseInt(slot.dataset.day, 10);
                    const existing = this._getEntry(wk, day);
                    if (this.onSlotClick) this.onSlotClick(wk, day, existing);
                });
            });

            const removes = this.host.querySelectorAll('.pwg-remove');
            removes.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const wk = parseInt(btn.dataset.week, 10);
                    const day = parseInt(btn.dataset.day, 10);
                    this.removeEntry(wk, day);
                });
            });
        }
    }

    window.ProgramWeekGrid = ProgramWeekGrid;
})();
