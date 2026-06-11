// @ts-check
/**
 * Workout-mode card: collapsed history stack
 *
 * The exercise card was reorganised so the recent weight history (Last
 * + up to 3 previous sessions, each with a date) appears in the
 * COLLAPSED header instead of being buried in the expanded body. The
 * date format is "today / yesterday / N days ago" up to 10 days and a
 * short calendar date ("Jan 5") past that — verifies the new
 * _formatHistoryDate threshold.
 */
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:8001';

/** Build an ISO date string for N days ago at noon (avoids TZ flake). */
function daysAgoISO(n) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - n);
    return d.toISOString();
}

test.describe('Workout-mode card — collapsed history stack', () => {
    /**
     * Loads workout-mode.html just to get the ExerciseCardRenderer
     * class on window, then renders a card with a stubbed
     * sessionService that returns a known history fixture. Lets us
     * assert on the produced HTML string without standing up a full
     * session.
     */
    async function renderCardHtml(page, history) {
        await page.goto(`${BASE}/workout-mode.html`);
        await page.waitForLoadState('domcontentloaded');
        return page.evaluate((hist) => {
            const stubSvc = {
                isSessionActive: () => false,
                getExerciseWeight: () => null,
                getExerciseHistory: () => hist,
                getLastWeightDirection: () => null,
                getWeightDirection: () => null,
                isPreSessionSkipped: () => false,
                getPreSessionEdits: () => ({}),
                getPreSessionEdit: () => null,
                getPreSessionSkipReason: () => '',
                getSessionNotes: () => [],
                getExerciseNotes: () => '',
            };
            const renderer = new window.ExerciseCardRenderer(stubSvc);
            const group = {
                exercises: { a: 'Bench Press' },
                sets: '3', reps: '8-12', rest: '60s',
                default_weight: '', default_weight_unit: 'lbs',
            };
            return renderer.renderCard(group, 0, 1);
        }, history);
    }

    test('collapsed header shows Last + 3 previous, each with a date', async ({ page }) => {
        const html = await renderCardHtml(page, {
            last_weight: '135', last_weight_unit: 'lbs',
            last_session_date: daysAgoISO(2),
            recent_sessions: [
                { weight: '135', weight_unit: 'lbs', date: daysAgoISO(2) },
                { weight: '130', weight_unit: 'lbs', date: daysAgoISO(5) },
                { weight: '125', weight_unit: 'lbs', date: daysAgoISO(9) },
                { weight: '120', weight_unit: 'lbs', date: daysAgoISO(15) },
            ],
        });
        // Stack is present
        expect(html).toContain('workout-history-stack');
        // Primary Last row with date
        expect(html).toMatch(/workout-history-primary-row[\s\S]*Last:[\s\S]*135 lbs[\s\S]*2 days ago/);
        // 3 previous rows
        const prevMatches = html.match(/workout-history-prev-row/g) || [];
        expect(prevMatches.length).toBe(3);
        // Tree connectors — last item uses '└─', earlier items use '├─'
        const elbows = html.match(/└─/g) || [];
        const tees = html.match(/├─/g) || [];
        expect(elbows.length).toBeGreaterThanOrEqual(1);
        expect(tees.length).toBeGreaterThanOrEqual(1);
    });

    test('date format: 2-10 days ago → "N days ago"; >10 → calendar date', async ({ page }) => {
        const html = await renderCardHtml(page, {
            last_weight: '100', last_weight_unit: 'lbs',
            last_session_date: daysAgoISO(0),
            recent_sessions: [
                { weight: '100', weight_unit: 'lbs', date: daysAgoISO(0) },
                { weight: '95', weight_unit: 'lbs', date: daysAgoISO(1) },
                { weight: '90', weight_unit: 'lbs', date: daysAgoISO(10) },
                { weight: '85', weight_unit: 'lbs', date: daysAgoISO(15) },
            ],
        });
        // Day 0 → "today"
        expect(html).toContain('today');
        // Day 1 → "yesterday"
        expect(html).toContain('yesterday');
        // Day 10 → still "10 days ago" (inclusive boundary)
        expect(html).toContain('10 days ago');
        // Day 15 → calendar date (no "ago", no "on " prefix). The exact
        // month/day depends on test wall-clock, so we only assert the
        // "N days ago" phrasing doesn't sneak in for the >10 row.
        const fifteenDaysAgo = new Date();
        fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
        const monthShort = fifteenDaysAgo.toLocaleDateString('en-US', { month: 'short' });
        expect(html).toContain(monthShort);
        expect(html).not.toContain('15 days ago');
    });

    test('expanded body no longer carries a separate Weight History section', async ({ page }) => {
        const html = await renderCardHtml(page, {
            last_weight: '135', last_weight_unit: 'lbs',
            last_session_date: daysAgoISO(3),
            recent_sessions: [
                { weight: '135', weight_unit: 'lbs', date: daysAgoISO(3) },
                { weight: '130', weight_unit: 'lbs', date: daysAgoISO(6) },
            ],
        });
        // The old expanded-body label is gone (history moved up to the
        // collapsed header).
        expect(html).not.toMatch(/Weight History<\/div>/);
        // But the stack class is present
        expect(html).toContain('workout-history-stack');
    });

    test('no history → stack is omitted entirely', async ({ page }) => {
        const html = await renderCardHtml(page, {
            last_weight: '', last_weight_unit: '',
            last_session_date: null, recent_sessions: [],
        });
        expect(html).not.toContain('workout-history-stack');
    });
});
