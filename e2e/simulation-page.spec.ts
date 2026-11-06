import { test, expect, type Page } from '@playwright/test';
import { SimulationPage } from './pages/SimulationPage';
import { simulationFixture, workloadFixture, cycleTimeFixture, resumptionFixture } from './fixtures/simulationFixtures';

const PROCESS_ID = 'test-sim-001';

async function mockSimulationApis(page: Page) {
    await page.addInitScript(() => localStorage.setItem('prosim-help-seen', '1'));
    await page.route(`**/api/simulation/${PROCESS_ID}`, async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(simulationFixture),
        });
    });
    await page.route(`**/api/simulation/${PROCESS_ID}/workload`, async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(workloadFixture),
        });
    });
    await page.route(`**/api/simulation/${PROCESS_ID}/cycle-time`, async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(cycleTimeFixture),
        });
    });
    await page.route(`**/api/simulation/${PROCESS_ID}/polling**`, async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ batches: [], pointer: -1 }),
        });
    });
    await page.route(`**/api/simulation/${PROCESS_ID}/resumption`, async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(resumptionFixture),
        });
    });
}

test.describe('Simulation page', () => {
    test('opens the resources and what-if panels, one at a time', async ({ page }) => {
        await mockSimulationApis(page);
        await page.route(`**/api/simulation/${PROCESS_ID}/resources`, route => route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({
                startDate: '2024-01-01T08:00:00+00:00',
                endDate: '2024-01-01T10:00:00+00:00',
                stepMs: 3600000,
                calendarsKnown: true,
                pools: [{ id: 'c', name: 'Clerk', size: 3, utilization: 0.5, busy: [1, 2, 0], idle: [2, 1, 0], resources: [] }],
            }),
        }));
        await page.route(`**/api/simulation/${PROCESS_ID}/what-if`, route => route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({
                baseProcessId: PROCESS_ID,
                supported: true,
                editablePools: true,
                pools: [{ id: 'c', name: 'Clerk', size: 3 }],
                tasks: [{ id: 't', name: 'Check' }],
                scenarios: [],
            }),
        }));
        const sim = new SimulationPage(page);
        await sim.goto(PROCESS_ID);
        await sim.waitForBpmnCanvas();

        await page.getByRole('button', { name: 'Resources' }).click();
        await expect(page.getByRole('complementary', { name: 'Resources' }).getByText('50% busy')).toBeVisible();

        await page.getByRole('button', { name: 'What-if' }).click();
        await expect(page.getByRole('complementary', { name: 'Resources' })).toHaveCount(0);
        const panel = page.getByRole('complementary', { name: 'What-if' });
        await expect(panel.getByRole('button', { name: 'Run what-if' })).toBeDisabled();
        await panel.getByRole('button', { name: 'More Clerk resources' }).click();
        await expect(panel.getByRole('button', { name: 'Run what-if' })).toBeEnabled();

        await page.keyboard.press('Escape');
        await expect(panel).toHaveCount(0);
    });

    test('page loads, renders BPMN diagram, and all controls are present', async ({ page }) => {
        await mockSimulationApis(page);
        const sim = new SimulationPage(page);
        await sim.goto(PROCESS_ID);
        await sim.waitForBpmnCanvas();

        await expect(sim.simulatedTimeBox).toBeVisible();
        await expect(sim.playPauseBtn).toBeVisible();
        await expect(sim.goToStartBtn).toBeVisible();
        await expect(sim.goToEndBtn).toBeVisible();
        await expect(sim.speedSelect).toBeVisible();
    });

    test('simulation auto-plays: simulated time advances without any user interaction', async ({ page }) => {
        await mockSimulationApis(page);
        const sim = new SimulationPage(page);
        await sim.goto(PROCESS_ID);
        await sim.waitForBpmnCanvas();

        await sim.waitForAutoPlay();
        const t1 = await sim.getCurrentTime();
        expect(t1).not.toBe('--');

        await expect(async () => {
            const t2 = await sim.getCurrentTime();
            expect(t2).not.toBe(t1);
        }).toPass({ timeout: 5_000 });
    });

    test('initial tokens from frames appear on the canvas when simulation starts', async ({ page }) => {
        await mockSimulationApis(page);
        const sim = new SimulationPage(page);
        await sim.goto(PROCESS_ID);
        await sim.waitForBpmnCanvas();

        await expect(sim.tokens).toHaveCount(1, { timeout: 10_000 });
    });

    test('pause button freezes the simulated time display', async ({ page }) => {
        await mockSimulationApis(page);
        const sim = new SimulationPage(page);
        await sim.goto(PROCESS_ID);
        await sim.waitForBpmnCanvas();

        await sim.waitForAutoPlay();

        await sim.clickPlayPause();

        const timePaused = await sim.getCurrentTime();

        await page.waitForTimeout(1000);

        const timeAfterWait = await sim.getCurrentTime();
        expect(timeAfterWait).toBe(timePaused);
    });

    test('resume after pause continues advancing the simulated time', async ({ page }) => {
        await mockSimulationApis(page);
        const sim = new SimulationPage(page);
        await sim.goto(PROCESS_ID);
        await sim.waitForBpmnCanvas();

        await sim.waitForAutoPlay();

        await sim.clickPlayPause();
        const timePaused = await sim.getCurrentTime();
        await sim.clickPlayPause();

        await expect(async () => {
            const newTime = await sim.getCurrentTime();
            expect(newTime).not.toBe(timePaused);
        }).toPass({ timeout: 8_000 });
    });

    test('changing the speed keeps the simulation running', async ({ page }) => {
        await mockSimulationApis(page);
        const sim = new SimulationPage(page);
        await sim.goto(PROCESS_ID);
        await sim.waitForBpmnCanvas();

        await sim.waitForAutoPlay();
        const timeBeforeSpeedChange = await sim.getCurrentTime();

        await sim.setSpeed('0.5');
        await expect(sim.speedSelect).toHaveValue('0.5');

        await expect(async () => {
            const newTime = await sim.getCurrentTime();
            expect(newTime).not.toBe(timeBeforeSpeedChange);
        }).toPass({ timeout: 8_000 });
    });

    test('go-to-start triggers resumption API with the simulation start date', async ({ page }) => {
        await mockSimulationApis(page);
        const sim = new SimulationPage(page);
        await sim.goto(PROCESS_ID);
        await sim.waitForBpmnCanvas();
        await sim.waitForAutoPlay();

        const [resumptionRequest] = await Promise.all([
            page.waitForRequest(req =>
                req.url().includes('/resumption') && req.method() === 'POST'
            ),
            sim.clickGoToStart(),
        ]);

        const body = resumptionRequest.postDataJSON();
        expect(body.requestedDate).toContain('2024-01-01');
    });

    test('go-to-end triggers resumption API with the simulation end date', async ({ page }) => {
        await mockSimulationApis(page);
        const sim = new SimulationPage(page);
        await sim.goto(PROCESS_ID);
        await sim.waitForBpmnCanvas();
        await sim.waitForAutoPlay();

        const [resumptionRequest] = await Promise.all([
            page.waitForRequest(req =>
                req.url().includes('/resumption') && req.method() === 'POST'
            ),
            sim.clickGoToEnd(),
        ]);

        const body = resumptionRequest.postDataJSON();
        expect(body.requestedDate).toContain('2024-01-01');
    });

    test('stats sidebar toggles: visible → hidden → visible', async ({ page }) => {
        await mockSimulationApis(page);
        const sim = new SimulationPage(page);
        await sim.goto(PROCESS_ID);
        await sim.waitForBpmnCanvas();

        expect(await sim.isSidebarOpen()).toBe(true);

        await sim.toggleSidebar();
        await expect(async () => {
            expect(await sim.isSidebarOpen()).toBe(false);
        }).toPass({ timeout: 3_000 });

        await sim.toggleSidebar();
        await expect(async () => {
            expect(await sim.isSidebarOpen()).toBe(true);
        }).toPass({ timeout: 3_000 });
    });

    test('token count reaches 2 when cases 2 and 3 are both active', async ({ page }) => {
        await mockSimulationApis(page);
        const sim = new SimulationPage(page);
        await sim.goto(PROCESS_ID);
        await sim.waitForBpmnCanvas();

        await expect(sim.tokens).toHaveCount(2, { timeout: 8_000 });
    });

    test('tokens disappear from the canvas after their CASE_END event', async ({ page }) => {
        await mockSimulationApis(page);
        const sim = new SimulationPage(page);
        await sim.goto(PROCESS_ID);
        await sim.waitForBpmnCanvas();

        await expect(sim.tokens).toHaveCount(1, { timeout: 8_000 });

        await expect(sim.tokens).toHaveCount(0, { timeout: 5_000 });
    });

    test('tokens are cleared from the canvas when the simulation is resumed after pause', async ({ page }) => {
        await mockSimulationApis(page);
        const sim = new SimulationPage(page);
        await sim.goto(PROCESS_ID);
        await sim.waitForBpmnCanvas();

        await expect(sim.tokens).toHaveCount(1, { timeout: 10_000 });

        await sim.clickPlayPause();

        await sim.clickPlayPause();

        await expect(async () => {
            const count = await sim.getTokenCount();
            expect(count).toBe(0);
        }).toPass({ timeout: 3_000 });
    });

    test('token position changes as the simulation animates along the BPMN flow', async ({ page }) => {
        await mockSimulationApis(page);
        const sim = new SimulationPage(page);
        await sim.goto(PROCESS_ID);
        await sim.waitForBpmnCanvas();

        await expect(sim.tokens).toHaveCount(1, { timeout: 10_000 });

        const pos1 = await sim.tokens.first().evaluate((el: SVGCircleElement) => ({
            cx: el.getAttribute('cx'),
            cy: el.getAttribute('cy'),
        }));

        await expect(async () => {
            const count = await sim.getTokenCount();
            if (count === 0) return;

            const pos2 = await sim.tokens.first().evaluate((el: SVGCircleElement) => ({
                cx: el.getAttribute('cx'),
                cy: el.getAttribute('cy'),
            }));
            const moved = pos2.cx !== pos1.cx || pos2.cy !== pos1.cy;
            expect(moved).toBe(true);
        }).toPass({ timeout: 5_000 });
    });

    test('a slower speed advances simulated time more slowly over the same wall-clock interval', async ({ page }) => {
        const parseSimMs = (timeStr: string) =>
            new Date(timeStr.split(' UTC')[0] + ' UTC').getTime();

        await mockSimulationApis(page);
        const sim = new SimulationPage(page);
        await sim.goto(PROCESS_ID);
        await sim.waitForBpmnCanvas();
        await sim.waitForAutoPlay();

        const t1_start = parseSimMs(await sim.getCurrentTime());
        await page.waitForTimeout(1000);
        const t1_end = parseSimMs(await sim.getCurrentTime());
        const delta1 = t1_end - t1_start;

        await page.reload();
        await sim.waitForBpmnCanvas();
        await sim.waitForAutoPlay();
        await sim.setSpeed('0.5');
        await page.waitForTimeout(400);

        const t2_start = parseSimMs(await sim.getCurrentTime());
        await page.waitForTimeout(1000);
        const t2_end = parseSimMs(await sim.getCurrentTime());
        const delta2 = t2_end - t2_start;

        expect(delta2).toBeLessThan(delta1 * 0.7);
    });

    test('a first-time visitor gets the explanation once', async ({ page }) => {
        await mockSimulationApis(page);
        await page.addInitScript(() => {
            if (!sessionStorage.getItem('visited')) localStorage.removeItem('prosim-help-seen');
            sessionStorage.setItem('visited', '1');
        });
        const sim = new SimulationPage(page);
        await sim.goto(PROCESS_ID);
        await sim.waitForBpmnCanvas();

        await page.getByRole('button', { name: 'Got it' }).click();
        await expect(page.getByRole('complementary', { name: 'How to read this' })).toHaveCount(0);

        await page.reload();
        await sim.waitForBpmnCanvas();
        await expect(page.getByRole('complementary', { name: 'How to read this' })).toHaveCount(0);
    });

    test('a shared link opens paused at the same moment, speed and colouring', async ({ page }) => {
        await mockSimulationApis(page);
        const sim = new SimulationPage(page);
        await page.goto(`/simulation/${PROCESS_ID}?t=2024-01-01T01:00:00Z&speed=3&colour=age`);
        await sim.waitForBpmnCanvas();

        await expect(sim.simulatedTimeBox).toContainText('1 Jan 2024, 01:00');
        await expect(sim.speedSelect).toHaveValue('3');
        await expect(page.getByRole('button', { name: 'Case age' })).toHaveAttribute('aria-pressed', 'true');

        await page.waitForTimeout(600);
        await expect(sim.simulatedTimeBox).toContainText('1 Jan 2024, 01:00');
    });

    test('clicking an activity in the statistics selects it on the diagram', async ({ page }) => {
        await mockSimulationApis(page);
        const sim = new SimulationPage(page);
        await sim.goto(PROCESS_ID);
        await sim.waitForBpmnCanvas();

        await page.locator('.wtpt-empty summary').click();
        await page.locator('.wtpt-row').first().click();

        await expect(page.locator('.task-panel')).toBeVisible();
        await expect(page.locator('.djs-element.selected-task')).toHaveCount(1);
    });

    test('the page fits a phone without sideways scrolling', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await mockSimulationApis(page);
        const sim = new SimulationPage(page);
        await sim.goto(PROCESS_ID);
        await sim.waitForBpmnCanvas();

        expect(await sim.isSidebarOpen()).toBe(false);
        await expect(sim.playPauseBtn).toBeVisible();
        const widths = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
        expect(widths[0]).toBe(widths[1]);
    });
});
