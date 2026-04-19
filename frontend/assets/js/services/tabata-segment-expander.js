/**
 * Tabata Segment Expander
 *
 * Converts a user-built tabata workout (sections array with tabata config)
 * into the same segment-array shape the Tabata Kettlebell runner expects
 * for AI-generated plans. Reused by the runner so we don't duplicate timing math.
 *
 * Expected tabata section.config:
 *   {
 *     work_seconds:            number (e.g. 20),
 *     rest_seconds:            number (e.g. 10),
 *     rounds:                  number (e.g. 8),
 *     set_rest_after_seconds:  number (append rest after this section; ignored on last),
 *     exercise_mode:           'rotation' | 'circuit'
 *   }
 *
 * Rotation: one exercise per round, cycling through the section's exercises.
 * Circuit:  every round runs all exercises back-to-back (each = one work+rest).
 */
(function () {
    'use strict';

    const DEFAULTS = {
        work_seconds: 20,
        rest_seconds: 10,
        rounds: 8,
        set_rest_after_seconds: 60,
        exercise_mode: 'rotation',
    };

    function toPosInt(value, fallback) {
        const n = parseInt(value, 10);
        return Number.isFinite(n) && n > 0 ? n : fallback;
    }

    function toNonNegInt(value, fallback) {
        const n = parseInt(value, 10);
        return Number.isFinite(n) && n >= 0 ? n : fallback;
    }

    function coerceConfig(raw) {
        const cfg = raw || {};
        return {
            work_seconds: toPosInt(cfg.work_seconds, DEFAULTS.work_seconds),
            rest_seconds: toNonNegInt(cfg.rest_seconds, DEFAULTS.rest_seconds),
            rounds: toPosInt(cfg.rounds, DEFAULTS.rounds),
            set_rest_after_seconds: toNonNegInt(cfg.set_rest_after_seconds, DEFAULTS.set_rest_after_seconds),
            exercise_mode: cfg.exercise_mode === 'circuit' ? 'circuit' : 'rotation',
        };
    }

    function exerciseNameAt(exercises, i) {
        const ex = exercises[i];
        return (ex && (ex.name || '')) || 'Exercise';
    }

    /**
     * Expand a single tabata section into segments.
     *
     * @param {Object} section   workout section (type must be 'tabata')
     * @param {number} setIndex  1-based set index (among tabata sections)
     * @param {boolean} isLast   whether this is the last tabata section in the workout
     * @returns {Array} segments
     */
    function expandSection(section, setIndex, isLast) {
        const cfg = coerceConfig(section.config);
        const exercises = Array.isArray(section.exercises) ? section.exercises : [];
        if (exercises.length === 0) return [];

        const segs = [];
        const sectionName = section.name || `Section ${setIndex}`;

        for (let r = 0; r < cfg.rounds; r++) {
            if (cfg.exercise_mode === 'circuit') {
                // Every round: one work+rest pair per exercise.
                for (let e = 0; e < exercises.length; e++) {
                    const name = exerciseNameAt(exercises, e);
                    segs.push({
                        name: name,
                        exercise: name,
                        segment_type: 'work',
                        duration_seconds: cfg.work_seconds,
                        set_index: setIndex,
                        round_index: r,
                        section_name: sectionName,
                        section_rounds: cfg.rounds,
                    });
                    if (cfg.rest_seconds > 0) {
                        segs.push({
                            name: 'Rest',
                            segment_type: 'rest',
                            duration_seconds: cfg.rest_seconds,
                            set_index: setIndex,
                            round_index: r,
                            section_name: sectionName,
                            section_rounds: cfg.rounds,
                        });
                    }
                }
            } else {
                // rotation: one exercise per round, cycling.
                const name = exerciseNameAt(exercises, r % exercises.length);
                segs.push({
                    name: name,
                    exercise: name,
                    segment_type: 'work',
                    duration_seconds: cfg.work_seconds,
                    set_index: setIndex,
                    round_index: r,
                    section_name: sectionName,
                    section_rounds: cfg.rounds,
                });
                if (cfg.rest_seconds > 0) {
                    segs.push({
                        name: 'Rest',
                        segment_type: 'rest',
                        duration_seconds: cfg.rest_seconds,
                        set_index: setIndex,
                        round_index: r,
                        section_name: sectionName,
                        section_rounds: cfg.rounds,
                    });
                }
            }
        }

        if (!isLast && cfg.set_rest_after_seconds > 0) {
            segs.push({
                name: 'Set Rest',
                segment_type: 'set_rest',
                duration_seconds: cfg.set_rest_after_seconds,
                set_index: setIndex,
                section_name: sectionName,
                section_rounds: cfg.rounds,
            });
        }

        return segs;
    }

    /**
     * Expand a saved workout (with sections) into a runner-compatible plan.
     * Only tabata sections contribute segments; other types are skipped.
     *
     * @returns {Object} { segments, total_seconds, sets, rounds_per_set, title, ... }
     */
    function expandWorkoutToSegments(workout) {
        const sections = Array.isArray(workout?.sections) ? workout.sections : [];
        const tabataSections = sections.filter((s) => s && s.type === 'tabata');

        const segments = [];
        let setIndex = 0;
        tabataSections.forEach((section, i) => {
            setIndex += 1;
            const isLast = i === tabataSections.length - 1;
            const segs = expandSection(section, setIndex, isLast);
            for (const s of segs) segments.push(s);
        });

        const total = segments.reduce((acc, s) => acc + (s.duration_seconds || 0), 0);
        const maxRounds = tabataSections.reduce((acc, s) => {
            const cfg = coerceConfig(s.config);
            return Math.max(acc, cfg.rounds);
        }, 0);

        return {
            title: workout?.name || 'Tabata Workout',
            workout_type: 'tabata',
            is_user_built: true,
            total_seconds: total,
            sets: tabataSections.length,
            rounds_per_set: maxRounds,
            protocol: '',
            focus_areas: [],
            segments,
        };
    }

    window.TabataSegmentExpander = {
        expandWorkoutToSegments,
        expandSection,
        _coerceConfig: coerceConfig,
        DEFAULTS,
    };

    console.log('📦 TabataSegmentExpander loaded');
})();
