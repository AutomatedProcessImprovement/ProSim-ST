import { type Page, type Locator, expect } from '@playwright/test';

export class SimulationPage {
    private readonly page: Page;

    readonly bpmnViewport: Locator;
    readonly simulatedTimeBox: Locator;
    readonly playPauseBtn: Locator;
    readonly goToStartBtn: Locator;
    readonly goToEndBtn: Locator;
    readonly speedSelect: Locator;
    readonly statsToggleBtn: Locator;
    readonly statsSidebar: Locator;
    readonly tokens: Locator;

    constructor(page: Page) {
        this.page = page;
        this.bpmnViewport = page.locator('svg g[data-element-id]').first();
        this.simulatedTimeBox = page.locator('#simulated-time-box');
        this.playPauseBtn = page.locator('#play-pause-btn');
        this.goToStartBtn = page.locator('#go-to-start-btn');
        this.goToEndBtn = page.locator('#go-to-end-btn');
        this.speedSelect = page.locator('#speed-select');
        this.statsToggleBtn = page.locator('.stats-toggle-btn');
        this.statsSidebar = page.locator('.stats-sidebar');
        this.tokens = page.locator('circle.token');
    }

    async goto(processId: string) {
        await this.page.goto(`/simulation/${processId}`);
    }

    async waitForBpmnCanvas() {
        await this.bpmnViewport.waitFor({ state: 'visible', timeout: 15_000 });
    }

    async waitForAutoPlay() {
        await expect(this.simulatedTimeBox).not.toHaveText('--', { timeout: 15_000 });
    }

    async waitForTokens(minCount = 1) {
        await expect(this.tokens).toHaveCount(minCount, { timeout: 10_000 });
    }

    async clickPlayPause() {
        await this.playPauseBtn.click();
    }

    async clickGoToStart() {
        await this.goToStartBtn.click();
    }

    async clickGoToEnd() {
        await this.goToEndBtn.click();
    }

    async setSpeed(value: string) {
        await this.speedSelect.selectOption(value);
    }

    async toggleSidebar() {
        await this.statsToggleBtn.click();
    }

    async getCurrentTime(): Promise<string> {
        return (await this.simulatedTimeBox.textContent()) ?? '';
    }

    async getTokenCount(): Promise<number> {
        return this.tokens.count();
    }

    async isSidebarOpen(): Promise<boolean> {
        const transform = await this.statsSidebar.evaluate(
            (el: HTMLElement) => el.style.transform
        );
        return transform === 'translateX(0px)' || transform === 'translateX(0)';
    }
}
