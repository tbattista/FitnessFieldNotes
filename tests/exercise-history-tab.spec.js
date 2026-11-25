// @ts-check
const { test, expect } = require('playwright/test');

const BASE = 'http://localhost:8001';

test.describe('Exercise History Tab', () => {

    test.describe('Page structure', () => {

        test('Exercises tab button exists on history page', async ({ page }) => {
            await page.goto(`${BASE}/workout-history.html`);
            const exercisesTab = page.locator('#exercises-tab');
            await expect(exercisesTab).toBeAttached();
            await expect(exercisesTab).toHaveText(/Exercise Stats/);
        });

        test('Exercises tab pane container exists', async ({ page }) => {
            await page.goto(`${BASE}/workout-history.html`);
            const pane = page.locator('#exercisesTabPane');
            await expect(pane).toBeAttached();
            const container = page.locator('#exerciseTabContainer');
            await expect(container).toBeAttached();
        });

        test('Two tabs exist: History, Exercise Stats', async ({ page }) => {
            await page.goto(`${BASE}/workout-history.html`);
            // The page has separate mobile and desktop tab bars; the active one
            // carries the #historyTabs id (desktop swaps IDs at load time).
            const tabs = page.locator('#historyTabs .nav-link');
            // The calendar now lives inside the History pane, not its own tab.
            await expect(tabs).toHaveCount(2);
            await expect(tabs.nth(0)).toHaveText(/History/);
            await expect(tabs.nth(1)).toHaveText(/Exercise Stats/);
            await expect(page.locator('#historyCalendarCard')).toBeAttached();
        });
    });

    test.describe('Exercise aggregator logic (client-side)', () => {

        test('parseExerciseName strips equipment prefixes correctly', async ({ page }) => {
            await page.goto(`${BASE}/workout-history.html`);

            const results = await page.evaluate(() => {
                // Wait for the function to be available
                if (!window.parseExerciseName) return null;
                return [
                    window.parseExerciseName('Barbell Bench Press'),
                    window.parseExerciseName('Dumbbell Bench Press'),
                    window.parseExerciseName('Cable Fly'),
                    window.parseExerciseName('Push-up'),
                    window.parseExerciseName('Smith Machine Squat'),
                    window.parseExerciseName('EZ-Bar Curl'),
                    window.parseExerciseName('Body Weight Squat'),
                ];
            });

            expect(results).not.toBeNull();
            // Barbell Bench Press -> baseName: "Bench Press", equipment: "Barbell"
            expect(results[0]).toEqual({ baseName: 'Bench Press', equipment: 'Barbell' });
            // Dumbbell Bench Press -> baseName: "Bench Press", equipment: "Dumbbell"
            expect(results[1]).toEqual({ baseName: 'Bench Press', equipment: 'Dumbbell' });
            // Cable Fly -> baseName: "Fly", equipment: "Cable"
            expect(results[2]).toEqual({ baseName: 'Fly', equipment: 'Cable' });
            // Push-up -> no prefix match
            expect(results[3]).toEqual({ baseName: 'Push-up', equipment: null });
            // Smith Machine Squat -> baseName: "Squat", equipment: "Smith Machine"
            expect(results[4]).toEqual({ baseName: 'Squat', equipment: 'Smith Machine' });
            // EZ-Bar Curl
            expect(results[5]).toEqual({ baseName: 'Curl', equipment: 'EZ-Bar' });
            // Body Weight Squat -> normalized to "Bodyweight"
            expect(results[6]).toEqual({ baseName: 'Squat', equipment: 'Bodyweight' });
        });

        test('aggregateExercisesFromSessions groups exercises correctly', async ({ page }) => {
            await page.goto(`${BASE}/workout-history.html`);

            let result = await page.evaluate(() => {
                if (!window.aggregateExercisesFromSessions) return null;

                const mockSessions = [
                    {
                        id: 'session-1',
                        completed_at: '2026-03-01T10:00:00Z',
                        exercises_performed: [
                            { exercise_name: 'Barbell Bench Press', weight: '135', weight_unit: 'lbs', sets_completed: 3, target_reps: '10' },
                            { exercise_name: 'Dumbbell Bench Press', weight: '50', weight_unit: 'lbs', sets_completed: 3, target_reps: '12' },
                            { exercise_name: 'Push-up', weight: null, weight_unit: 'lbs', sets_completed: 3, target_reps: '15' },
                        ]
                    },
                    {
                        id: 'session-2',
                        completed_at: '2026-02-25T10:00:00Z',
                        exercises_performed: [
                            { exercise_name: 'Barbell Bench Press', weight: '130', weight_unit: 'lbs', sets_completed: 3, target_reps: '10' },
                            { exercise_name: 'Barbell Squat', weight: '185', weight_unit: 'lbs', sets_completed: 4, target_reps: '8' },
                        ]
                    },
                ];

                const groups = window.aggregateExercisesFromSessions(mockSessions);
                // Base names resolve to canonical DB names (alias map / fuzzy match),
                // so look up the expected canonical names rather than hardcoding them.
                const canon = n => window.resolveCanonicalBaseName(n).canonical;
                return {
                  names: { bench: canon('Bench Press'), pushup: canon('Push-up'), squat: canon('Squat') },
                  groups: groups.map(g => ({
                    baseName: g.baseName,
                    totalSessions: g.totalSessions,
                    variantCount: g.variants.length,
                    variants: g.variants.map(v => ({
                        equipment: v.equipment,
                        totalSessions: v.totalSessions,
                        lastWeight: v.lastWeight
                    }))
                  }))
                };
            });

            expect(result).not.toBeNull();
            const { names } = result;
            result = result.groups;

            // Should have 3 groups: Bench Press (2 variants), Push-up, Squat
            expect(result.length).toBe(3);

            // Bench Press group (most sessions = 3 total: 2 barbell + 1 dumbbell)
            const benchGroup = result.find(g => g.baseName === names.bench);
            expect(benchGroup).toBeDefined();
            expect(benchGroup.variantCount).toBe(2);
            expect(benchGroup.totalSessions).toBe(3);

            // Barbell variant has 2 sessions
            const barbellVariant = benchGroup.variants.find(v => v.equipment === 'Barbell');
            expect(barbellVariant.totalSessions).toBe(2);
            expect(barbellVariant.lastWeight).toBe('135');

            // Dumbbell variant has 1 session
            const dbVariant = benchGroup.variants.find(v => v.equipment === 'Dumbbell');
            expect(dbVariant.totalSessions).toBe(1);
            expect(dbVariant.lastWeight).toBe('50');

            // Push-up is ungrouped (no equipment prefix)
            const pushup = result.find(g => g.baseName === names.pushup);
            expect(pushup).toBeDefined();
            expect(pushup.variantCount).toBe(1);

            // Squat group
            const squat = result.find(g => g.baseName === names.squat);
            expect(squat).toBeDefined();
            expect(squat.variants[0].equipment).toBe('Barbell');
        });

        test('aggregator skips skipped exercises', async ({ page }) => {
            await page.goto(`${BASE}/workout-history.html`);

            const result = await page.evaluate(() => {
                if (!window.aggregateExercisesFromSessions) return null;

                const mockSessions = [{
                    id: 'session-1',
                    completed_at: '2026-03-01T10:00:00Z',
                    exercises_performed: [
                        { exercise_name: 'Barbell Bench Press', weight: '135', weight_unit: 'lbs', is_skipped: true },
                        { exercise_name: 'Barbell Squat', weight: '185', weight_unit: 'lbs', sets_completed: 4, target_reps: '8' },
                    ]
                }];

                return window.aggregateExercisesFromSessions(mockSessions).length;
            });

            // Only Squat should be included (Bench Press was skipped)
            expect(result).toBe(1);
        });
    });

    test.describe('Tab interaction (mobile viewport)', () => {

        // Helper: open page at mobile size and reveal the history content
        // (content is hidden until auth/data loads, so we force-show it for tab tests)
        async function openMobileHistory(browser) {
            const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
            const page = await context.newPage();
            await page.goto(`${BASE}/workout-history.html`);
            // Force-show the history content area (normally shown after data loads)
            await page.evaluate(() => {
                const content = document.getElementById('historyContent');
                if (content) content.style.display = 'block';
                // Also init tab visibility listener
                if (window.initExerciseTabVisibility) window.initExerciseTabVisibility();
            });
            return { page, context };
        }

        test('Clicking Exercises tab shows the exercises pane', async ({ browser }) => {
            const { page, context } = await openMobileHistory(browser);

            await page.locator('#exercises-tab').click();

            const pane = page.locator('#exercisesTabPane');
            await expect(pane).toHaveClass(/active/);
            await expect(pane).toHaveClass(/show/);
            await context.close();
        });

        test('Clicking Exercises tab hides session container', async ({ browser }) => {
            const { page, context } = await openMobileHistory(browser);

            await page.locator('#exercises-tab').click();
            await page.waitForTimeout(400);

            const sessionContainer = page.locator('#sessionHistoryContainer');
            const display = await sessionContainer.evaluate(el => el.style.display);
            expect(display).toBe('none');
            await context.close();
        });

        test('Switching back to History tab shows session container', async ({ browser }) => {
            const { page, context } = await openMobileHistory(browser);

            await page.locator('#exercises-tab').click();
            await page.waitForTimeout(400);
            await page.locator('#history-tab').click();
            await page.waitForTimeout(400);

            const sessionContainer = page.locator('#sessionHistoryContainer');
            const display = await sessionContainer.evaluate(el => el.style.display);
            expect(display).not.toBe('none');
            await context.close();
        });
    });

    test.describe('Render with mock data', () => {

        test('renderExerciseTab renders groups from mock data', async ({ page }) => {
            await page.goto(`${BASE}/workout-history.html`);

            const groupCount = await page.evaluate(() => {
                if (!window.renderExerciseTab || !window.ffn) return -1;

                // Set up mock aggregated data
                window.ffn.workoutHistory.allExerciseGroups = [
                    {
                        baseName: 'Bench Press',
                        totalSessions: 10,
                        lastDate: '2026-03-01T10:00:00Z',
                        variants: [
                            {
                                fullName: 'Barbell Bench Press',
                                equipment: 'Barbell',
                                entries: [{ date: '2026-03-01', weight: '135', weightUnit: 'lbs', reps: '10' }],
                                totalSessions: 8,
                                lastWeight: '135',
                                lastWeightUnit: 'lbs',
                                lastReps: '10',
                                lastDate: '2026-03-01',
                                bestWeight: 135
                            },
                            {
                                fullName: 'Dumbbell Bench Press',
                                equipment: 'Dumbbell',
                                entries: [{ date: '2026-02-28', weight: '50', weightUnit: 'lbs', reps: '12' }],
                                totalSessions: 2,
                                lastWeight: '50',
                                lastWeightUnit: 'lbs',
                                lastReps: '12',
                                lastDate: '2026-02-28',
                                bestWeight: 50
                            }
                        ]
                    },
                    {
                        baseName: 'Squat',
                        totalSessions: 5,
                        lastDate: '2026-03-01T10:00:00Z',
                        variants: [{
                            fullName: 'Barbell Squat',
                            equipment: 'Barbell',
                            entries: [{ date: '2026-03-01', weight: '185', weightUnit: 'lbs', reps: '8' }],
                            totalSessions: 5,
                            lastWeight: '185',
                            lastWeightUnit: 'lbs',
                            lastReps: '8',
                            lastDate: '2026-03-01',
                            bestWeight: 185
                        }]
                    }
                ];

                window.renderExerciseTab();

                const container = document.getElementById('exerciseTabContainer');
                return container ? container.querySelectorAll('.exercise-group-item').length : -1;
            });

            expect(groupCount).toBe(2);
        });

        test('Search filters exercise groups', async ({ page }) => {
            await page.goto(`${BASE}/workout-history.html`);

            const result = await page.evaluate(() => {
                if (!window.renderExerciseTab || !window.ffn) return null;

                window.ffn.workoutHistory.allExerciseGroups = [
                    {
                        baseName: 'Bench Press',
                        totalSessions: 10,
                        lastDate: '2026-03-01',
                        variants: [{
                            fullName: 'Barbell Bench Press', equipment: 'Barbell',
                            entries: [], totalSessions: 10, lastWeight: '135',
                            lastWeightUnit: 'lbs', lastReps: '10', lastDate: '2026-03-01', bestWeight: 135
                        }]
                    },
                    {
                        baseName: 'Squat',
                        totalSessions: 5,
                        lastDate: '2026-03-01',
                        variants: [{
                            fullName: 'Barbell Squat', equipment: 'Barbell',
                            entries: [], totalSessions: 5, lastWeight: '185',
                            lastWeightUnit: 'lbs', lastReps: '8', lastDate: '2026-03-01', bestWeight: 185
                        }]
                    }
                ];

                // Render with search for "bench"
                window.ffn.workoutHistory.exerciseTabSearch = 'bench';
                window.renderExerciseTab();

                const container = document.getElementById('exerciseTabContainer');
                return container ? container.querySelectorAll('.exercise-group-item').length : -1;
            });

            expect(result).toBe(1);
        });

        test('Multi-variant group shows variant count badge', async ({ page }) => {
            await page.goto(`${BASE}/workout-history.html`);

            const hasVariantBadge = await page.evaluate(() => {
                if (!window.renderExerciseTab || !window.ffn) return null;

                window.ffn.workoutHistory.allExerciseGroups = [{
                    baseName: 'Bench Press',
                    totalSessions: 10,
                    lastDate: '2026-03-01',
                    variants: [
                        { fullName: 'Barbell Bench Press', equipment: 'Barbell', entries: [], totalSessions: 8, lastWeight: '135', lastWeightUnit: 'lbs', lastReps: '10', lastDate: '2026-03-01', bestWeight: 135 },
                        { fullName: 'Dumbbell Bench Press', equipment: 'Dumbbell', entries: [], totalSessions: 2, lastWeight: '50', lastWeightUnit: 'lbs', lastReps: '12', lastDate: '2026-02-28', bestWeight: 50 }
                    ]
                }];

                window.ffn.workoutHistory.exerciseTabSearch = '';
                window.renderExerciseTab();

                const badge = document.querySelector('.exercise-group-variant-count');
                return badge ? badge.textContent.trim() : null;
            });

            expect(hasVariantBadge).toBe('2 variants');
        });

        test('Expanding group shows variant equipment headers', async ({ page }) => {
            await page.goto(`${BASE}/workout-history.html`);

            const equipmentLabels = await page.evaluate(() => {
                if (!window.renderExerciseTab || !window.ffn) return null;

                window.ffn.workoutHistory.allExerciseGroups = [{
                    baseName: 'Bench Press',
                    totalSessions: 10,
                    lastDate: '2026-03-01',
                    variants: [
                        { fullName: 'Barbell Bench Press', equipment: 'Barbell', entries: [{ date: '2026-03-01', weight: '135', weightUnit: 'lbs', reps: '10' }], totalSessions: 8, lastWeight: '135', lastWeightUnit: 'lbs', lastReps: '10', lastDate: '2026-03-01', bestWeight: 135 },
                        { fullName: 'Dumbbell Bench Press', equipment: 'Dumbbell', entries: [{ date: '2026-02-28', weight: '50', weightUnit: 'lbs', reps: '12' }], totalSessions: 2, lastWeight: '50', lastWeightUnit: 'lbs', lastReps: '12', lastDate: '2026-02-28', bestWeight: 50 }
                    ]
                }];

                window.ffn.workoutHistory.exerciseTabSearch = '';
                window.renderExerciseTab();

                // Expand the group
                window.toggleExerciseGroup('Bench Press');

                const labels = Array.from(document.querySelectorAll('.variant-equipment')).map(el => el.textContent.trim());
                return labels;
            });

            expect(equipmentLabels).toEqual(['Barbell', 'Dumbbell']);
        });
    });
});
