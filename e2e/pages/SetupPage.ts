import { type Page, type Locator, expect } from '@playwright/test';
import { join } from 'path';

export class SetupPage {
    private readonly page: Page;

    readonly csvFileInput: Locator;
    readonly submitBtn: Locator;
    readonly nextBtn: Locator;
    readonly prevBtn: Locator;
    readonly runBtn: Locator;
    readonly toast: Locator;

    constructor(page: Page) {
        this.page = page;
        this.csvFileInput = page.locator('#file-input');
        this.submitBtn = page.getByRole('button', { name: /Configure & Run/i });
        this.nextBtn = page.getByRole('button', { name: /^Next$/i });
        this.prevBtn = page.getByRole('button', { name: /^Previous$/i });
        this.runBtn = page.getByRole('button', { name: /^Run$/i });
        this.toast = page.locator('[data-sonner-toast]');
    }

    async gotoHome() {
        await this.page.goto('/');
    }

    async uploadCsvFile(filename = 'sample.csv') {
        const filePath = join(__dirname, '..', 'fixtures', filename);
        await this.csvFileInput.setInputFiles(filePath);
    }

    async submitCsvForm() {
        await this.submitBtn.click();
    }

    async waitForSetupPage() {
        await this.page.waitForURL('**/setup', { timeout: 10_000 });
    }

    async clickNext() {
        await this.nextBtn.click();
    }

    async clickRun() {
        await this.runBtn.click();
    }

    async uploadBpmnFile(filename = 'sample.bpmn') {
        const filePath = join(__dirname, '..', 'fixtures', filename);
        await this.page.locator('input[accept*=".bpmn"]').setInputFiles(filePath);
    }

    async uploadJsonFile(filename = 'sample.json') {
        const filePath = join(__dirname, '..', 'fixtures', filename);
        await this.page.locator('input[accept*=".json"]').setInputFiles(filePath);
    }

    async openMappingListbox(currentValue: string) {
        // HeadlessUI Field sets aria-labelledby on the button; match by text content instead
        await this.page.locator('button').filter({ hasText: currentValue }).click();
    }

    async selectMappingOption(optionText: string) {
        await this.page.getByRole('option', { name: optionText, exact: true }).click();
    }

    async getToastText(): Promise<string> {
        await this.toast.first().waitFor({ timeout: 5_000 });
        return (await this.toast.first().textContent()) ?? '';
    }

    async expectToastContaining(text: string) {
        await expect(this.toast.first()).toContainText(text, { timeout: 5_000 });
    }

    async isOnStep(stepLabel: string) {
        // Use .first() to avoid strict mode violation: both the stepper button span
        // and the form h1 may contain the label text simultaneously
        await expect(this.page.getByText(stepLabel, { exact: false }).first()).toBeVisible();
    }
}
