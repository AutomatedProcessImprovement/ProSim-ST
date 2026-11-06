import { test, expect } from '@playwright/test';

const RUN_ID = 'to-be-001';
const HOUR = 3600000;

const summary = (waitMs: number, queue: number[]) => ({
    startDate: '2025-03-03T08:00:00+00:00',
    endDate: '2025-03-10T08:00:00+00:00',
    stepMs: HOUR,
    arrived: 100,
    finished: 80,
    openAtEnd: 20,
    cycleMs: 48 * HOUR,
    waitMs,
    queueAverage: 10,
    queuePeak: Math.max(...queue),
    waitingAtEnd: 5,
    queue,
    tasks: { Check: { count: 3, waitMs, queueAverage: 10, queuePeak: Math.max(...queue), queue } },
});

const comparison = {
    processId: RUN_ID,
    baseProcessId: 'as-is-001',
    label: 'Clerk 9 → 11 · Arrivals +20%',
    edits: { pools: { c: 11 }, arrivalPercent: 20, tasks: {} },
    utcOffset: '+00:00',
    comparison: {
        asIs: summary(5 * HOUR, [10, 20, 5]),
        toBe: summary(2 * HOUR, [4, 8, 2]),
        poolsAsIs: [{ id: 'c', name: 'Clerk', size: 9, utilization: 0.95 }],
        poolsToBe: [{ id: 'c', name: 'Clerk', size: 11, utilization: 0.8 }],
        repeats: {
            seeds: 9,
            changes: {
                waitMs: { mean: -3 * HOUR, low: -4 * HOUR, high: -2 * HOUR },
                queueAverage: { mean: -1, low: -2, high: 1 },
                cycleMs: { mean: -3 * HOUR, low: -4 * HOUR, high: -2 * HOUR },
                finished: { mean: 5, low: 2, high: 8 },
            },
            tasks: { Check: { waitMs: { mean: -1, low: -2, high: -1 }, queueAverage: { mean: -1, low: -2, high: -1 } } },
        },
    },
};

test.describe('What-if comparison', () => {
    test('shows both runs, says what can be trusted and focuses a task', async ({ page }) => {
        await page.route(`**/api/simulation/${RUN_ID}/comparison`, route => route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify(comparison),
        }));

        await page.goto(`/simulation/${RUN_ID}/compare`);

        await expect(page.getByText('Clerk 9 → 11 · Arrivals +20%')).toBeVisible();
        const waiting = page.getByRole('row', { name: /^Average waiting/ });
        await expect(waiting.getByText('−3 h', { exact: true })).toBeVisible();
        await expect(waiting.getByText('Clearly better')).toBeVisible();
        await expect(page.getByRole('row', { name: /^Cases waiting on average/ }).getByText('Could be chance')).toBeVisible();

        await page.getByRole('button', { name: 'Check' }).click();
        await expect(page.getByRole('button', { name: 'Check' })).toHaveAttribute('aria-pressed', 'true');

        await expect(page.getByRole('link', { name: 'Open to-be' })).toHaveAttribute('href', `/simulation/${RUN_ID}`);
        await expect(page.getByRole('link', { name: '← As-is simulation' })).toHaveAttribute('href', '/simulation/as-is-001');
    });

    test('explains a link that no longer works', async ({ page }) => {
        await page.route(`**/api/simulation/${RUN_ID}/comparison`, route => route.fulfill({ status: 404, body: '{}' }));

        await page.goto(`/simulation/${RUN_ID}/compare`);

        await expect(page.getByText('Comparison not found or expired')).toBeVisible();
    });
});
