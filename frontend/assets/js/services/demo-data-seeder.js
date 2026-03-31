/**
 * Demo Data Seeder
 * Seeds localStorage with sample workout data for anonymous (not logged in) visitors.
 * Gives first-time visitors a preview of what the app looks like with real data.
 *
 * Demo data is:
 * - Seeded on first visit (detected via ffn_demo_seeded flag)
 * - Clearly labeled with "[Sample]" prefix
 * - Automatically cleared when user signs in for real
 */

(function () {
    'use strict';

    const DEMO_SEEDED_KEY = 'ffn_demo_seeded';
    const WORKOUTS_KEY = 'gym_workouts';
    const PROGRAMS_KEY = 'gym_programs';
    const SESSIONS_KEY = 'ffn_completed_sessions';
    const ACTIVE_PROGRAM_KEY = 'ffn_active_program_id';

    // --- Helpers ---

    function generateId(prefix) {
        return `${prefix}-demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }

    function daysAgo(n) {
        const d = new Date();
        d.setDate(d.getDate() - n);
        d.setHours(7 + Math.floor(Math.random() * 4), Math.floor(Math.random() * 60), 0, 0);
        return d.toISOString();
    }

    function makeGroup(exerciseName, sets, reps, rest, weight) {
        return {
            group_id: generateId('group'),
            exercises: { a: exerciseName },
            sets: sets,
            reps: reps,
            rest: rest,
            default_weight: weight || null,
            default_weight_unit: 'lbs',
            group_type: 'standard',
            group_name: null,
            block_id: null,
            cardio_config: null,
            interval_config: null,
        };
    }

    // --- Demo Workout Templates ---

    function buildDemoWorkouts() {
        const now = new Date().toISOString();
        const workouts = [];

        // 1. Push Day
        const pushId = generateId('workout');
        workouts.push({
            id: pushId,
            name: '[Sample] Push Day',
            description: 'Chest, shoulders, and triceps. A classic push session with compound-first ordering.',
            exercise_groups: [
                makeGroup('Barbell Bench Press', '4', '6-8', '2min', '155'),
                makeGroup('Dumbbell Incline Bench Press', '3', '8-10', '90s', '50'),
                makeGroup('Dumbbell Fly', '3', '10-12', '60s', '30'),
                makeGroup('Dumbbell Lateral Raise', '3', '12-15', '60s', '20'),
                makeGroup('Cable One Arm Tricep Pushdown', '3', '10-12', '60s', '25'),
            ],
            sections: null,
            template_notes: [],
            is_template: true,
            tags: ['push', 'chest', 'shoulders'],
            created_date: now,
            modified_date: now,
            is_favorite: true,
            is_archived: false,
        });

        // 2. Pull Day
        const pullId = generateId('workout');
        workouts.push({
            id: pullId,
            name: '[Sample] Pull Day',
            description: 'Back and biceps. Heavy pulls followed by isolation work.',
            exercise_groups: [
                makeGroup('Barbell Deadlift', '3', '5', '3min', '275'),
                makeGroup('Barbell Bent Over Row', '4', '6-8', '2min', '155'),
                makeGroup('Cable Pulldown (Pro Lat Bar)', '3', '8-12', '90s', '120'),
                makeGroup('Dumbbell Hammer Curl', '3', '10-12', '60s', '30'),
                makeGroup('Dumbbell Rear Lateral Raise', '3', '12-15', '60s', '15'),
            ],
            sections: null,
            template_notes: [],
            is_template: true,
            tags: ['pull', 'back', 'biceps'],
            created_date: now,
            modified_date: now,
            is_favorite: false,
            is_archived: false,
        });

        // 3. Leg Day
        const legId = generateId('workout');
        workouts.push({
            id: legId,
            name: '[Sample] Leg Day',
            description: 'Quads, glutes, and hamstrings. Squat-dominant with posterior chain balance.',
            exercise_groups: [
                makeGroup('Barbell Full Squat', '4', '6-8', '3min', '225'),
                makeGroup('Barbell Romanian Deadlift', '3', '8-10', '2min', '185'),
                makeGroup('Sled 45\u00b0 Leg Press (Back Pov)', '3', '10-12', '90s', '270'),
                makeGroup('Lever Leg Extension', '3', '12-15', '60s', '90'),
                makeGroup('Lever Seated Leg Curl', '3', '10-12', '60s', '80'),
            ],
            sections: null,
            template_notes: [],
            is_template: true,
            tags: ['legs', 'quads', 'glutes'],
            created_date: now,
            modified_date: now,
            is_favorite: false,
            is_archived: false,
        });

        return { workouts, pushId, pullId, legId };
    }

    // --- Demo Program ---

    function buildDemoProgram(pushId, pullId, legId) {
        const now = new Date().toISOString();
        const sixWeeksAgo = new Date();
        sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 42);

        const programId = generateId('program');
        const program = {
            id: programId,
            name: '[Sample] PPL Strength Builder',
            description: '3-day push/pull/legs rotation focused on progressive overload.',
            workouts: [
                { workout_id: pushId, order_index: 0, custom_name: null, custom_date: null },
                { workout_id: pullId, order_index: 1, custom_name: null, custom_date: null },
                { workout_id: legId, order_index: 2, custom_name: null, custom_date: null },
            ],
            duration_weeks: 8,
            difficulty_level: 'intermediate',
            tags: ['ppl', 'strength', 'intermediate'],
            created_date: sixWeeksAgo.toISOString(),
            modified_date: now,
            tracker_enabled: true,
            tracker_goal: '3/week',
            started_at: sixWeeksAgo.toISOString(),
            is_active: true,
        };

        return { program, programId };
    }

    // --- Demo Completed Sessions ---

    function buildDemoSessions(workouts, programId) {
        const sessions = [];
        const workoutCycle = [workouts[0], workouts[1], workouts[2]]; // Push, Pull, Legs rotation

        // Weight progressions per exercise (starting -> weekly increment)
        const weightProgression = {
            'Barbell Bench Press': { start: 155, inc: 5 },
            'Dumbbell Incline Bench Press': { start: 50, inc: 2.5 },
            'Dumbbell Fly': { start: 30, inc: 0 },
            'Dumbbell Lateral Raise': { start: 20, inc: 0 },
            'Cable One Arm Tricep Pushdown': { start: 25, inc: 2.5 },
            'Barbell Deadlift': { start: 275, inc: 10 },
            'Barbell Bent Over Row': { start: 155, inc: 5 },
            'Cable Pulldown (Pro Lat Bar)': { start: 120, inc: 5 },
            'Dumbbell Hammer Curl': { start: 30, inc: 2.5 },
            'Dumbbell Rear Lateral Raise': { start: 15, inc: 0 },
            'Barbell Full Squat': { start: 225, inc: 10 },
            'Barbell Romanian Deadlift': { start: 185, inc: 5 },
            'Sled 45\u00b0 Leg Press (Back Pov)': { start: 270, inc: 10 },
            'Lever Leg Extension': { start: 90, inc: 5 },
            'Lever Seated Leg Curl': { start: 80, inc: 5 },
        };

        // Generate training days: Mon/Wed/Fri over 6 weeks, skip a few
        const trainingDays = [];
        for (let week = 5; week >= 0; week--) {
            for (const dayOffset of [1, 3, 5]) { // Mon, Wed, Fri
                trainingDays.push(week * 7 + (7 - dayOffset));
            }
        }

        // Skip 2-3 random sessions for realism
        const skipIndices = new Set();
        while (skipIndices.size < 2) {
            skipIndices.add(Math.floor(Math.random() * trainingDays.length));
        }

        const sessionNotes = [
            'Felt strong today. Good energy.',
            'Slightly fatigued from poor sleep.',
            'Hit a PR on the main lift!',
            'Quick session, kept rest times tight.',
            'Great pump today.',
        ];

        let cycleIndex = 0;
        trainingDays.forEach((daysBack, i) => {
            if (skipIndices.has(i)) {
                cycleIndex++;
                return;
            }

            const workout = workoutCycle[cycleIndex % 3];
            cycleIndex++;

            const weekNum = Math.floor(i / 3);
            const duration = 35 + Math.floor(Math.random() * 30);
            const startTime = daysAgo(daysBack);
            const endTime = new Date(new Date(startTime).getTime() + duration * 60000).toISOString();
            const sessionId = generateId('session');

            const exercises = workout.exercise_groups.map((group, idx) => {
                const name = group.exercises.a;
                const prog = weightProgression[name] || { start: 50, inc: 0 };
                const weight = prog.start + Math.floor(weekNum / 2) * prog.inc;
                const targetSets = parseInt(group.sets) || 3;

                return {
                    exercise_name: name,
                    exercise_id: null,
                    group_id: group.group_id,
                    sets_completed: targetSets,
                    target_sets: group.sets,
                    target_reps: group.reps,
                    weight: String(weight),
                    weight_unit: 'lbs',
                    weight_notes: null,
                    set_details: [],
                    previous_weight: weekNum > 0 ? String(weight - prog.inc) : null,
                    weight_change: weekNum > 0 && prog.inc > 0 ? `+${prog.inc}` : null,
                    is_modified: false,
                    modified_at: null,
                    is_skipped: false,
                    skip_reason: null,
                    next_weight_direction: prog.inc > 0 ? 'up' : null,
                    original_weight: null,
                    original_sets: null,
                    original_reps: null,
                    calories_burned: null,
                    notes: null,
                    order_index: idx,
                };
            });

            sessions.push({
                id: sessionId,
                workout_id: workout.id,
                workout_name: workout.name,
                started_at: startTime,
                completed_at: endTime,
                duration_minutes: duration,
                exercises_performed: exercises,
                notes: Math.random() < 0.3 ? sessionNotes[Math.floor(Math.random() * sessionNotes.length)] : null,
                session_notes: [],
                exercise_order: null,
                program_id: programId,
                status: 'completed',
                session_mode: Math.random() < 0.8 ? 'timed' : 'quick_log',
                created_at: startTime,
                version: 1,
                sync_status: 'local',
            });
        });

        return sessions;
    }

    // --- Seed / Clear ---

    function seedDemoData() {
        if (localStorage.getItem(DEMO_SEEDED_KEY)) return false;

        console.log('[DemoSeeder] Seeding demo data for anonymous visitor...');

        const { workouts, pushId, pullId, legId } = buildDemoWorkouts();
        const { program, programId } = buildDemoProgram(pushId, pullId, legId);
        const sessions = buildDemoSessions(workouts, programId);

        localStorage.setItem(WORKOUTS_KEY, JSON.stringify(workouts));
        localStorage.setItem(PROGRAMS_KEY, JSON.stringify([program]));
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
        localStorage.setItem(ACTIVE_PROGRAM_KEY, programId);
        localStorage.setItem(DEMO_SEEDED_KEY, 'true');

        console.log(`[DemoSeeder] Seeded: ${workouts.length} workouts, 1 program, ${sessions.length} sessions`);
        return true;
    }

    function clearDemoData() {
        if (!localStorage.getItem(DEMO_SEEDED_KEY)) return false;

        console.log('[DemoSeeder] Clearing demo data (user signed in)...');

        // Only clear if the data is still demo data (check for [Sample] prefix)
        const workouts = JSON.parse(localStorage.getItem(WORKOUTS_KEY) || '[]');
        const hasDemoWorkouts = workouts.some(w => w.name?.startsWith('[Sample]'));

        if (hasDemoWorkouts) {
            // Remove only demo workouts, keep any user-created ones
            const userWorkouts = workouts.filter(w => !w.name?.startsWith('[Sample]'));
            if (userWorkouts.length > 0) {
                localStorage.setItem(WORKOUTS_KEY, JSON.stringify(userWorkouts));
            } else {
                localStorage.removeItem(WORKOUTS_KEY);
            }
        }

        const programs = JSON.parse(localStorage.getItem(PROGRAMS_KEY) || '[]');
        const hasDemoPrograms = programs.some(p => p.name?.startsWith('[Sample]'));
        if (hasDemoPrograms) {
            const userPrograms = programs.filter(p => !p.name?.startsWith('[Sample]'));
            if (userPrograms.length > 0) {
                localStorage.setItem(PROGRAMS_KEY, JSON.stringify(userPrograms));
            } else {
                localStorage.removeItem(PROGRAMS_KEY);
            }
        }

        localStorage.removeItem(SESSIONS_KEY);
        localStorage.removeItem(ACTIVE_PROGRAM_KEY);
        localStorage.removeItem(DEMO_SEEDED_KEY);

        console.log('[DemoSeeder] Demo data cleared.');
        return true;
    }

    function hasDemoData() {
        return localStorage.getItem(DEMO_SEEDED_KEY) === 'true';
    }

    // --- Auto-run ---

    function initDemoSeeder() {
        // Seed SYNCHRONOUSLY on script load — localStorage doesn't need Firebase.
        // Only seed if no user is currently signed in (no Firebase auth yet = anonymous).
        // If they turn out to be signed in once Firebase resolves, clearDemoData will clean up.
        seedDemoData();

        // Clear demo data when user signs in
        const setupClearOnAuth = () => {
            window.firebaseAuth?.onAuthStateChanged((user) => {
                if (user && hasDemoData()) {
                    clearDemoData();
                }
            });
        };

        if (window.firebaseAuth) {
            setupClearOnAuth();
        } else {
            window.addEventListener('firebaseReady', setupClearOnAuth, { once: true });
        }
    }

    // Expose API
    window.DemoDataSeeder = {
        seed: seedDemoData,
        clear: clearDemoData,
        hasDemoData: hasDemoData,
        init: initDemoSeeder,
    };

    // Auto-initialize
    initDemoSeeder();

})();
