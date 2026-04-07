// @ts-check
const { test, expect } = require('playwright/test');

const BASE = 'http://localhost:8001';

test.describe('Exercise Fuzzy Matching & Add PR', () => {

    test.describe('Fuzzy matching logic (client-side)', () => {

        test('EXERCISE_NAME_ALIASES maps common names', async ({ page }) => {
            await page.goto(`${BASE}/workout-history.html`);

            const aliases = await page.evaluate(() => {
                if (!window.EXERCISE_NAME_ALIASES) return null;
                return {
                    squat: window.EXERCISE_NAME_ALIASES['squat'],
                    bench: window.EXERCISE_NAME_ALIASES['bench'],
                    rdl: window.EXERCISE_NAME_ALIASES['rdl'],
                    deadlift: window.EXERCISE_NAME_ALIASES['deadlift'],
                    ohp: window.EXERCISE_NAME_ALIASES['ohp'],
                };
            });

            expect(aliases).not.toBeNull();
            expect(aliases.squat).toBe('Barbell Full Squat');
            expect(aliases.bench).toBe('Barbell Bench Press - Medium Grip');
            expect(aliases.rdl).toBe('Barbell Romanian Deadlift');
            expect(aliases.deadlift).toBe('Barbell Deadlift');
            expect(aliases.ohp).toBe('Barbell Standing Military Press');
        });

        test('resolveCanonicalBaseName uses aliases', async ({ page }) => {
            await page.goto(`${BASE}/workout-history.html`);

            const results = await page.evaluate(() => {
                if (!window.resolveCanonicalBaseName) return null;
                return [
                    window.resolveCanonicalBaseName('Squat'),
                    window.resolveCanonicalBaseName('RDL'),
                    window.resolveCanonicalBaseName('OHP'),
                ];
            });

            expect(results).not.toBeNull();
            // "Squat" should resolve via alias to the baseName of "Barbell Full Squat" = "Full Squat"
            expect(results[0].wasNormalized).toBe(true);
            expect(results[0].original).toBe('Squat');
            // "RDL" should resolve via alias
            expect(results[1].wasNormalized).toBe(true);
            expect(results[1].original).toBe('RDL');
            // "OHP" should resolve via alias
            expect(results[2].wasNormalized).toBe(true);
            expect(results[2].original).toBe('OHP');
        });

        test('aggregateExercisesFromSessions merges aliased exercises', async ({ page }) => {
            await page.goto(`${BASE}/workout-history.html`);

            const result = await page.evaluate(() => {
                if (!window.aggregateExercisesFromSessions) return null;

                // Simulate two sessions with different names for same exercise
                const sessions = [
                    {
                        id: 'test-1',
                        completed_at: '2026-03-01T10:00:00Z',
                        exercises_performed: [
                            { exercise_name: 'Bench Press', weight: '135', weight_unit: 'lbs', target_reps: '8' }
                        ]
                    },
                    {
                        id: 'test-2',
                        completed_at: '2026-03-08T10:00:00Z',
                        exercises_performed: [
                            { exercise_name: 'Barbell Bench Press', weight: '155', weight_unit: 'lbs', target_reps: '8' }
                        ]
                    }
                ];

                const groups = window.aggregateExercisesFromSessions(sessions);
                // Both should be merged under the same canonical base name
                const benchGroups = groups.filter(g =>
                    g.baseName.toLowerCase().includes('bench press')
                );
                return {
                    totalGroups: groups.length,
                    benchGroupCount: benchGroups.length,
                    benchGroup: benchGroups[0] ? {
                        baseName: benchGroups[0].baseName,
                        totalSessions: benchGroups[0].totalSessions,
                        mergedNamesSize: benchGroups[0].mergedNames ? benchGroups[0].mergedNames.size : 0,
                        mergedNames: benchGroups[0].mergedNames ? Array.from(benchGroups[0].mergedNames) : []
                    } : null
                };
            });

            expect(result).not.toBeNull();
            // Both "Bench Press" and "Barbell Bench Press" should merge into one group
            expect(result.benchGroupCount).toBe(1);
            expect(result.benchGroup).not.toBeNull();
            expect(result.benchGroup.totalSessions).toBe(2);
        });
    });

    test.describe('Add PR UI', () => {

        test('PR section container exists on history page', async ({ page }) => {
            await page.goto(`${BASE}/workout-history.html`);
            const prContainer = page.locator('#prSectionContainer');
            await expect(prContainer).toBeAttached();
        });

        test('showAddPRModal function is exported', async ({ page }) => {
            await page.goto(`${BASE}/workout-history.html`);
            const exists = await page.evaluate(() => typeof window.showAddPRModal === 'function');
            expect(exists).toBe(true);
        });
    });
});
