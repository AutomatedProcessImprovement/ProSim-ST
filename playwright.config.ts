import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
    testDir: './e2e',
    timeout: 30_000,
    expect: { timeout: 10_000 },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
        },
    ],
    use: {
        baseURL: 'http://localhost:3000',
        headless: true,
        viewport: { width: 1280, height: 1200 },
    },
    webServer: {
        // In CI, test the production build (what actually ships). Locally use
        // dev for fast iteration. All /api/* calls are mocked, so no backend
        // is needed in either mode.
        command: isCI ? 'npm run build && npm run start' : 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !isCI,
        timeout: isCI ? 240_000 : 120_000,
    },
});
