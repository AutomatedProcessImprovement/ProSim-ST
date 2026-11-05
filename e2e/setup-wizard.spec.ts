import { test, expect } from '@playwright/test';
import { SetupPage } from './pages/SetupPage';

const PROCESS_ID = 'test-sim-001';

test.describe('Setup wizard', () => {
    test('golden path: upload CSV → map columns → configure → upload BPMN/JSON → run', async ({ page }) => {
        await page.route('**/api/simulation', async route => {
            if (route.request().method() === 'POST') {
                await route.fulfill({
                    status: 202,
                    contentType: 'application/json',
                    body: JSON.stringify({ id: PROCESS_ID }),
                });
            } else {
                await route.continue();
            }
        });
        await page.route(`**/api/simulation/${PROCESS_ID}/status`, route => route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({ stage: 'done', durations: {} }),
        }));

        await page.route(`**/api/simulation/${PROCESS_ID}`, async route => {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ error: 'not needed' }) });
        });
        await page.route(`**/api/simulation/${PROCESS_ID}/workload`, route => route.fulfill({ body: '[]' }));
        await page.route(`**/api/simulation/${PROCESS_ID}/cycle-time`, route => route.fulfill({ body: '[]' }));

        const setup = new SetupPage(page);

        await setup.gotoHome();
        await expect(setup.submitBtn).toBeDisabled();

        await setup.uploadCsvFile();
        await expect(setup.submitBtn).toBeEnabled({ timeout: 5_000 });

        await setup.submitCsvForm();
        await setup.waitForSetupPage();

        await setup.isOnStep('Setup the log mapping');
        await expect(page.locator('button').filter({ hasText: 'activity' })).toBeVisible({ timeout: 5_000 });
        await setup.clickNext();

        await setup.isOnStep('Setup your experiment');
        await setup.clickNext();

        await setup.isOnStep('Upload the BPMN model and JSON file');
        await setup.uploadBpmnFile();
        await setup.uploadJsonFile();
        await setup.clickNext();

        await setup.isOnStep('Validate configuration');
        await expect(page.getByText('Files', { exact: true })).toBeVisible();
        await expect(page.getByText('Mapping', { exact: true })).toBeVisible();
        await expect(page.getByText('Setup', { exact: true })).toBeVisible();

        const [postRequest] = await Promise.all([
            page.waitForRequest(req => req.url().includes('/api/simulation') && req.method() === 'POST'),
            setup.clickRun(),
        ]);
        expect(postRequest.method()).toBe('POST');
        await page.waitForURL(`**/simulation/${PROCESS_ID}`, { timeout: 10_000 });
    });

    test('duplicate column mapping shows toast and blocks advance', async ({ page }) => {
        await page.route('**/api/simulation', route => route.continue());

        const setup = new SetupPage(page);
        await setup.gotoHome();
        await setup.uploadCsvFile();
        await expect(setup.submitBtn).toBeEnabled({ timeout: 5_000 });
        await setup.submitCsvForm();
        await setup.waitForSetupPage();

        await setup.openMappingListbox('case_id');
        await setup.selectMappingOption('activity');

        await setup.clickNext();

        await setup.expectToastContaining('Invalid mapping');

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

        await setup.clickNext();

        await setup.isOnStep('Setup your experiment');
        await setup.clickNext();

        await setup.isOnStep('Upload the BPMN model and JSON file');
        await setup.uploadJsonFile();

        await setup.clickNext();

        await setup.expectToastContaining('Invalid BPMN');

        await setup.isOnStep('Upload the BPMN model and JSON file');
    });

    test('API failure on Run shows toast and stays on review page', async ({ page }) => {
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

        await setup.clickNext();
        await setup.isOnStep('Setup your experiment');
        await setup.clickNext();
        await setup.isOnStep('Upload the BPMN model and JSON file');
        await setup.uploadBpmnFile();
        await setup.uploadJsonFile();
        await setup.clickNext();

        await setup.isOnStep('Validate configuration');
        await setup.clickRun();

        await setup.expectToastContaining('The simulation could not be started');

        expect(page.url()).toContain('/setup');
    });
});
