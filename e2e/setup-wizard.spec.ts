/**
 * E2E tests: Setup wizard (home page → 4-step configuration → run)
 *
 * All /api/* calls are intercepted by page.route() so no real backend is needed.
 */

import { test, expect } from '@playwright/test';
import { SetupPage } from './pages/SetupPage';

const PROCESS_ID = 'test-sim-001';

test.describe('Setup wizard', () => {
    test('golden path: upload CSV → map columns → configure → upload BPMN/JSON → run', async ({ page }) => {
        // Mock the create endpoint
        await page.route('**/api/simulation', async route => {
            if (route.request().method() === 'POST') {
                await route.fulfill({
                    status: 201,
                    contentType: 'application/json',
                    body: JSON.stringify({ id: PROCESS_ID }),
                });
            } else {
                await route.continue();
            }
        });

        // Mock the simulation retrieval so the page can load after navigation
        await page.route(`**/api/simulation/${PROCESS_ID}`, async route => {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ error: 'not needed' }) });
        });
        await page.route(`**/api/simulation/${PROCESS_ID}/workload`, route => route.fulfill({ body: '[]' }));
        await page.route(`**/api/simulation/${PROCESS_ID}/cycle-time`, route => route.fulfill({ body: '[]' }));

        const setup = new SetupPage(page);

        // Step 0: Home page — upload CSV
        await setup.gotoHome();
        await expect(setup.submitBtn).toBeDisabled();

        await setup.uploadCsvFile();
        await expect(setup.submitBtn).toBeEnabled({ timeout: 5_000 });

        await setup.submitCsvForm();
        await setup.waitForSetupPage();

        // Step 1: Mapping — auto-mapping should populate fields; just advance
        await setup.isOnStep('Setup the log mapping');
        // Verify at least one field has been auto-mapped (activity → activity exact match)
        await expect(page.locator('button').filter({ hasText: 'activity' })).toBeVisible({ timeout: 5_000 });
        await setup.clickNext();

        // Step 2: Configuration — default values are set; just advance
        await setup.isOnStep('Setup your experiment');
        await setup.clickNext();

        // Step 3: BPMN + JSON upload
        await setup.isOnStep('Upload the BPMN model and JSON file');
        await setup.uploadBpmnFile();
        await setup.uploadJsonFile();
        await setup.clickNext();

        // Step 4: Review — all three preview panels visible
        await setup.isOnStep('Validate configuration');
        await expect(page.getByText('Files', { exact: true })).toBeVisible();
        await expect(page.getByText('Mapping', { exact: true })).toBeVisible();
        await expect(page.getByText('Setup', { exact: true })).toBeVisible();

        // Run — triggers POST /api/simulation and navigates to simulation page
        const [postRequest] = await Promise.all([
            page.waitForRequest(req => req.url().includes('/api/simulation') && req.method() === 'POST'),
            setup.clickRun(),
        ]);
        expect(postRequest.method()).toBe('POST');
        await page.waitForURL(`**/simulation/${PROCESS_ID}`, { timeout: 10_000 });
    });

    test('duplicate column mapping shows toast and blocks advance', async ({ page }) => {
        // Set up the mock so POST simulation would succeed if validation passed
        await page.route('**/api/simulation', route => route.continue());

        const setup = new SetupPage(page);
        await setup.gotoHome();
        await setup.uploadCsvFile();
        await expect(setup.submitBtn).toBeEnabled({ timeout: 5_000 });
        await setup.submitCsvForm();
        await setup.waitForSetupPage();

        // Auto-mapping: "activity" field → "activity" column (exact match)
        // "case" field → "case_id" column
        // Open the "case_id" listbox and re-select "activity" to create duplicate
        await setup.openMappingListbox('case_id');
        await setup.selectMappingOption('activity');

        // Click Next — should fail validation because both "case" and "activity" fields now map to "activity"
        await setup.clickNext();

        // Toast error should appear
        await setup.expectToastContaining('Invalid mapping');

        // Still on step 1 (label still visible)
        await setup.isOnStep('Setup the log mapping');
    });

    test('missing BPMN file on step 3 shows toast and blocks advance', async ({ page }) => {
        await page.route('**/api/simulation', route => route.continue());

        const setup = new SetupPage(page);
        await setup.gotoHome();
        await setup.uploadCsvFile();
        await expect(setup.submitBtn).toBeEnabled({ timeout: 5_000 });
        await setup.submitCsvForm();
        await setup.waitForSetupPage();

        // Complete step 1 (auto-mapping is valid)
        await setup.clickNext();

        // Complete step 2
        await setup.isOnStep('Setup your experiment');
        await setup.clickNext();

        // Step 3: only upload JSON, leave BPMN empty
        await setup.isOnStep('Upload the BPMN model and JSON file');
        await setup.uploadJsonFile();

        await setup.clickNext();

        // Toast error about BPMN
        await setup.expectToastContaining('Invalid BPMN');

        // Still on step 3
        await setup.isOnStep('Upload the BPMN model and JSON file');
    });

    test('API failure on Run shows toast and stays on review page', async ({ page }) => {
        // Override to return 500
        await page.route('**/api/simulation', async route => {
            if (route.request().method() === 'POST') {
                await route.fulfill({
                    status: 500,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: 'Internal server error' }),
                });
            } else {
                await route.continue();
            }
        });

        const setup = new SetupPage(page);
        await setup.gotoHome();
        await setup.uploadCsvFile();
        await expect(setup.submitBtn).toBeEnabled({ timeout: 5_000 });
        await setup.submitCsvForm();
        await setup.waitForSetupPage();

        // Complete steps 1-3
        await setup.clickNext();
        await setup.isOnStep('Setup your experiment');
        await setup.clickNext();
        await setup.isOnStep('Upload the BPMN model and JSON file');
        await setup.uploadBpmnFile();
        await setup.uploadJsonFile();
        await setup.clickNext();

        // Click Run
        await setup.isOnStep('Validate configuration');
        await setup.clickRun();

        // Error toast should appear
        await setup.expectToastContaining('Error occurred!');

        // Should NOT have navigated away from /setup
        expect(page.url()).toContain('/setup');
    });
});
