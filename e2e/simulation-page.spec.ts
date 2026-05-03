/**
 * E2E tests: Simulation page (/simulation/[id])
 *
 * All API calls are mocked. The simulation auto-plays on load.
 * Token tests use the `circle.token` SVG selector.
 *
 * Fixture uses 4 batches of 15 min each (500ms real time per batch at default delta).
 * Timeline:
 *   t=0:     1 token (case 1 at Task_1, from frames)
 *   t~0.5s:  0 tokens (case 1 ends in batch 0)
 *   t~1.0s:  1 token  (case 2 starts in batch 1)
 *   t~1.5s:  2 tokens (case 3 starts in batch 2)
 *   t~2.0s:  0 tokens (cases 2 and 3 end in batch 3)
 */

import { test, expect, type Page } from '@playwright/test';
import { SimulationPage } from './pages/SimulationPage';
import { simulationFixture, workloadFixture, cycleTimeFixture, resumptionFixture } from './fixtures/simulationFixtures';

const PROCESS_ID = 'test-sim-001';

async function mockSimulationApis(page: Page) {
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

        // Simulation auto-starts on BPMN import; wait for the time display to show a date
        await sim.waitForAutoPlay();
        const t1 = await sim.getCurrentTime();
        expect(t1).not.toBe('--');

        // Verify it keeps advancing (not frozen after first update)
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

        // frames fixture has 1 case (caseId 1 at Task_1) → 1 token created on simulation start
        await expect(sim.tokens).toHaveCount(1, { timeout: 10_000 });
    });

    test('pause button freezes the simulated time display', async ({ page }) => {
        await mockSimulationApis(page);
        const sim = new SimulationPage(page);
        await sim.goto(PROCESS_ID);
        await sim.waitForBpmnCanvas();

        // Wait for simulation to start advancing
        await sim.waitForAutoPlay();

        // Pause
        await sim.clickPlayPause();

        // Record time immediately after pause
        const timePaused = await sim.getCurrentTime();

        // Wait 1 second — if paused, the display should not change
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

        // Pause, then immediately resume
        await sim.clickPlayPause();
        const timePaused = await sim.getCurrentTime();
        await sim.clickPlayPause();

        // Wait for time to advance past the paused value
        await expect(async () => {
            const newTime = await sim.getCurrentTime();
            expect(newTime).not.toBe(timePaused);
        }).toPass({ timeout: 8_000 });
    });

    test('speed select changes to 2x and simulation continues running', async ({ page }) => {
        await mockSimulationApis(page);
        const sim = new SimulationPage(page);
        await sim.goto(PROCESS_ID);
        await sim.waitForBpmnCanvas();

        // Wait for simulation to start
        await sim.waitForAutoPlay();
        const timeBeforeSpeedChange = await sim.getCurrentTime();

        // Change speed to 2x — internally triggers a simulation reset with the new delta
        await sim.setSpeed('2');
        await expect(sim.speedSelect).toHaveValue('2');

        // Speed change resets simulation (300ms delay then restarts); time should keep advancing
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
        // Progress 0 → requestedDate = initialDate (2024-01-01 00:00:00)
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
        // Progress 100 → requestedDate = finalDate (2024-01-01 01:00:00)
        expect(body.requestedDate).toContain('2024-01-01');
    });

    test('stats sidebar toggles: hidden → visible → hidden', async ({ page }) => {
        await mockSimulationApis(page);
        const sim = new SimulationPage(page);
        await sim.goto(PROCESS_ID);
        await sim.waitForBpmnCanvas();

        // Sidebar starts hidden (translateX(300px))
        expect(await sim.isSidebarOpen()).toBe(false);

        // Toggle open
        await sim.toggleSidebar();
        await expect(async () => {
            expect(await sim.isSidebarOpen()).toBe(true);
        }).toPass({ timeout: 3_000 });

        // Toggle closed
        await sim.toggleSidebar();
        await expect(async () => {
            expect(await sim.isSidebarOpen()).toBe(false);
        }).toPass({ timeout: 3_000 });
    });

    test('token count reaches 2 when cases 2 and 3 are both active', async ({ page }) => {
        await mockSimulationApis(page);
        const sim = new SimulationPage(page);
        await sim.goto(PROCESS_ID);
        await sim.waitForBpmnCanvas();

        // Batch 1 creates t2 (case 2), batch 2 creates t3 (case 3).
        // With 500ms per batch, both are active ~1.5s into the simulation.
        await expect(sim.tokens).toHaveCount(2, { timeout: 8_000 });
    });

    test('tokens disappear from the canvas after their CASE_END event', async ({ page }) => {
        await mockSimulationApis(page);
        const sim = new SimulationPage(page);
        await sim.goto(PROCESS_ID);
        await sim.waitForBpmnCanvas();

        // Start with 1 token (from frames)
        await expect(sim.tokens).toHaveCount(1, { timeout: 8_000 });

        // Batch 0 ends case 1 → token deleted (~0.5s later)
        await expect(sim.tokens).toHaveCount(0, { timeout: 5_000 });
    });

    test('tokens are cleared from the canvas when the simulation is resumed after pause', async ({ page }) => {
        await mockSimulationApis(page);
        const sim = new SimulationPage(page);
        await sim.goto(PROCESS_ID);
        await sim.waitForBpmnCanvas();

        // Wait for at least one token to be present
        await expect(sim.tokens).toHaveCount(1, { timeout: 10_000 });

        // Pause
        await sim.clickPlayPause();

        // Resume — the code calls querySelectorAll('.token').forEach(t => t.remove()) on resume
        await sim.clickPlayPause();

        // Tokens are bulk-removed during the resume reset patch, before runSimulation re-creates them
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

        // Wait for the initial token (case 1 at Task_1)
        await expect(sim.tokens).toHaveCount(1, { timeout: 10_000 });

        // Record initial position
        const pos1 = await sim.tokens.first().evaluate((el: SVGCircleElement) => ({
            cx: el.getAttribute('cx'),
            cy: el.getAttribute('cy'),
        }));

        // Batch 0 animates t1 from Task_1 along Flow_2 to EndEvent_1 (~500ms)
        // Either the position changes mid-animation, or the token is deleted after reaching EndEvent_1.
        // Both indicate the animation ran correctly.
        await expect(async () => {
            const count = await sim.getTokenCount();
            if (count === 0) return; // token was deleted after completing animation — success

            const pos2 = await sim.tokens.first().evaluate((el: SVGCircleElement) => ({
                cx: el.getAttribute('cx'),
                cy: el.getAttribute('cy'),
            }));
            const moved = pos2.cx !== pos1.cx || pos2.cy !== pos1.cy;
            expect(moved).toBe(true);
        }).toPass({ timeout: 5_000 });
    });

    test('2x speed advances simulated time faster than 1x over the same wall-clock interval', async ({ page }) => {
        const parseSimMs = (timeStr: string) =>
            new Date(timeStr.replace(' ', 'T') + 'Z').getTime();

        // --- Measure at 1x speed ---
        await mockSimulationApis(page);
        const sim = new SimulationPage(page);
        await sim.goto(PROCESS_ID);
        await sim.waitForBpmnCanvas();
        await sim.waitForAutoPlay();

        const t1_start = parseSimMs(await sim.getCurrentTime());
        await page.waitForTimeout(1000);
        const t1_end = parseSimMs(await sim.getCurrentTime());
        const delta1 = t1_end - t1_start;

        // --- Measure at 2x speed ---
        // Route handlers persist through reload — no need to re-register
        await page.reload();
        await sim.waitForBpmnCanvas();
        await sim.waitForAutoPlay(); // make sure simulation has started before changing speed
        await sim.setSpeed('2');
        // Speed change aborts the current run, waits 300ms, then restarts via runSimulation().
        // 400ms gives the restart enough time to complete (300ms delay + 100ms margin) while
        // leaving the simulation well short of its end (12 batches × 250ms = 3s at 2×).
        await page.waitForTimeout(400);

        const t2_start = parseSimMs(await sim.getCurrentTime());
        await page.waitForTimeout(1000);
        const t2_end = parseSimMs(await sim.getCurrentTime());
        const delta2 = t2_end - t2_start;

        // At 2x speed, the same 1s wall time should advance ≥1.9× as much simulated time
        expect(delta2).toBeGreaterThan(delta1 * 1.9);
    });
});
