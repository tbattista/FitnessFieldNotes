/**
 * Garmin Session Bridge
 * Opens a Garmin activity in the session screen, pre-filled with what the
 * watch recorded, so it is reviewed and edited with the normal exercise cards
 * and saved as a normal session that is also marked as a Garmin import.
 *
 * Flow:
 *   Garmin page -> POST /api/v3/garmin/import/prepare-session -> prefill
 *   -> garminSessionBridge.open(prefill) stores it and goes to
 *      workout-mode.html?id=<workout>&garmin=1
 *   -> on load: clears any stale in-progress session
 *   -> session start: applyToSession() fills each exercise card
 *   -> Finish: completionFields() adds source/external_id/import_meta/HR,
 *      onCompleted() marks the Garmin activity imported.
 *
 * Loaded by workout-mode.html before the session services. Prefill lives in
 * sessionStorage (this tab only) and only applies to the session it started.
 * @version 1.0.0
 */
(function () {
    'use strict';

    const KEY = 'ffn_garmin_session_prefill';

    function read() {
        try {
            return JSON.parse(sessionStorage.getItem(KEY) || 'null');
        } catch (e) {
            return null;
        }
    }

    function write(prefill) {
        try {
            if (prefill) sessionStorage.setItem(KEY, JSON.stringify(prefill));
            else sessionStorage.removeItem(KEY);
        } catch (e) { /* storage unavailable: pre-fill just won't apply */ }
    }

    const params = new URLSearchParams(window.location.search);
    const urlWorkoutId = params.get('id');
    const opening = params.get('garmin') === '1';

    function normalize(name) {
        return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    }

    function fmtWeight(w) {
        if (w == null) return null;
        return Number.isInteger(w) ? String(w) : String(Math.round(w * 2) / 2);
    }

    /** "From Garmin: 8×165, 9×165, 7×215 lbs · avg HR 128 (max 145)" */
    function noteFor(p) {
        const sets = (p.set_details || []).map(d => {
            const reps = d.reps_completed ? d.reps_completed : (d.duration_s ? `${Math.round(d.duration_s)}s` : '?');
            return d.weight != null ? `${reps}×${fmtWeight(d.weight)}` : `${reps}`;
        });
        const parts = [];
        if (sets.length) {
            const hasWeight = (p.set_details || []).some(d => d.weight != null);
            parts.push(sets.join(', ') + (hasWeight ? ` ${p.weight_unit || 'lbs'}` : ''));
        }
        if (p.avg_heart_rate) parts.push(`avg HR ${p.avg_heart_rate}${p.max_heart_rate ? ` (max ${p.max_heart_rate})` : ''}`);
        return parts.length ? `From Garmin: ${parts.join(' · ')}` : '';
    }

    /** Find which workout exercise a Garmin performance belongs to. */
    function targetName(p, exercises, workout) {
        const groups = (workout && workout.exercise_groups) || [];
        const byGroup = groups.find(g => g.group_id === p.group_id);
        if (byGroup && byGroup.exercises && byGroup.exercises.a && exercises[byGroup.exercises.a]) {
            return byGroup.exercises.a;
        }
        for (const section of (workout && workout.sections) || []) {
            const ex = (section.exercises || []).find(e => e.exercise_id === p.group_id);
            if (ex && exercises[ex.name]) return ex.name;
        }
        const wanted = normalize(p.exercise_name);
        return Object.keys(exercises).find(n => normalize(n) === wanted) || null;
    }

    const bridge = {
        KEY,

        /** Called from the Garmin page: store the prefill and open the session screen. */
        open(prefill) {
            write({ ...prefill, session_id: null });
            window.location.href = `workout-mode.html?id=${encodeURIComponent(prefill.workout_id)}&garmin=1`;
        },

        /** The prefill for this tab, if any. */
        current() {
            return read();
        },

        /** True while the session screen is opening a Garmin activity (before it is applied). */
        isOpening() {
            const p = read();
            return !!(opening && p && p.workout_id === urlWorkoutId && !p.session_id);
        },

        /** Prefill bound to the given in-progress session, or null. */
        forSession(session) {
            const p = read();
            if (!p || !session || !p.session_id) return null;
            // The id can change if saving falls back to create-and-complete; the tag on the object doesn't.
            const tagged = session.garmin && session.garmin.prefill_session_id === p.session_id;
            return p.session_id === session.id || tagged ? p : null;
        },

        /**
         * Fill the new session's exercises from Garmin (called right after the
         * session is built from the workout template).
         */
        applyToSession(session, workout) {
            if (!this.isOpening() || !session) return;
            const p = read();
            const exercises = session.exercises || {};
            const unmatched = [];
            (p.exercises || []).forEach(perf => {
                const name = targetName(perf, exercises, workout);
                if (!name) {
                    unmatched.push(perf);
                    return;
                }
                Object.assign(exercises[name], {
                    weight: perf.weight,
                    weight_unit: perf.weight_unit || exercises[name].weight_unit,
                    target_sets: perf.target_sets,
                    target_reps: perf.target_reps,
                    notes: noteFor(perf) || exercises[name].notes || null,
                    set_details: perf.set_details || [],
                    avg_heart_rate: perf.avg_heart_rate || null,
                    max_heart_rate: perf.max_heart_rate || null,
                    is_modified: true,
                    modified_at: new Date().toISOString(),
                });
            });
            p.session_id = session.id;
            p.unmatched = unmatched.map(u => ({ name: u.exercise_name, note: noteFor(u) }));
            write(p);
            session.garmin = { activity_name: p.activity_name, prefill_session_id: session.id };
            if (unmatched.length) {
                const names = unmatched.map(u => u.exercise_name).join(', ');
                setTimeout(() => {
                    const msg = `Garmin also recorded ${names}, which isn't in this workout. It's kept in the session notes.`;
                    if (window.showToast) window.showToast({ message: msg, type: 'info', delay: 6000 });
                }, 1200);
            }
            // Reloading should resume this session, not open the activity again.
            params.delete('garmin');
            const qs = params.toString();
            window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
        },

        /** Extra fields for the completion request of a Garmin session. */
        completionFields(session) {
            const p = this.forSession(session);
            if (!p) return {};
            return {
                source: 'garmin',
                external_id: p.external_id,
                import_meta: p.import_meta,
                avg_heart_rate: p.avg_heart_rate || null,
                max_heart_rate: p.max_heart_rate || null,
                started_at: p.started_at,
                completed_at: p.completed_at,
                ...(this.unmatchedNote(session) ? { notes: this.unmatchedNote(session).slice(0, 500) } : {}),
            };
        },

        /** Duration and calories to pre-fill in the Finish panel. */
        finishDefaults(session) {
            const p = this.forSession(session);
            return p ? { minutes: p.duration_minutes, calories: p.calories } : null;
        },

        /** Session note listing Garmin exercises that aren't in this workout. */
        unmatchedNote(session) {
            const p = this.forSession(session);
            if (!p || !p.unmatched || !p.unmatched.length) return null;
            return 'Also recorded by Garmin: ' + p.unmatched.map(u => `${u.name}${u.note ? ` (${u.note.replace('From Garmin: ', '')})` : ''}`).join('; ');
        },

        /** After a successful save: mark the Garmin activity imported and forget the prefill. */
        async onCompleted(session, completed) {
            const p = this.forSession(session);
            if (!p) return;
            write(null);
            if (!p.pending_id || !completed || !completed.id) return;
            try {
                const headers = { 'Content-Type': 'application/json' };
                if (window.authService && window.authService.getIdToken) {
                    const token = await window.authService.getIdToken();
                    if (token) headers.Authorization = `Bearer ${token}`;
                }
                await fetch(`/api/v3/garmin/activities/${encodeURIComponent(p.pending_id)}/mark-imported`, {
                    method: 'POST', headers,
                    body: JSON.stringify({ session_id: completed.id, session_type: 'workout',
                                           action: p.import_meta && p.import_meta.workout_id ? 'new' : 'attach' }),
                });
            } catch (e) {
                console.warn('Garmin: could not mark the activity imported', e);
            }
        },
    };

    // Opening a Garmin activity: a stale in-progress session must not take over.
    // (The session runs on a normal timer; the watch's start and end times are
    // applied when it is saved, via completionFields.)
    if (bridge.isOpening()) {
        try {
            localStorage.removeItem('ffn_active_workout_session');
        } catch (e) { /* storage unavailable */ }
    }

    window.garminSessionBridge = bridge;
    bridge._noteFor = noteFor;   // exported for tests
})();
