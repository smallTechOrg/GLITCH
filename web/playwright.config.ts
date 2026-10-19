import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * E2E against the static export (web/dist) served under /GLITCH/ exactly like GitHub Pages,
 * plus the real backend. Requires a prior export built with
 *   cd web && EXPO_PUBLIC_GLITCH_API_URL=http://127.0.0.1:8787 npx expo export --platform web
 *
 * GLITCH_E2E_EXPECT_PROVIDER (default `fake`) selects the backend provider; the global setup
 * asserts /healthz reports it. Servers are never reused so the mode is always the one under
 * test. Backend JSON logs go to web/test-results/api.log (read by check_logs).
 */
const provider = process.env.GLITCH_E2E_EXPECT_PROVIDER ?? 'fake';
const webPort = Number(process.env.GLITCH_WEB_PORT ?? 8090);
const apiLog = resolve(__dirname, 'test-results', 'api.log');
mkdirSync(resolve(__dirname, 'test-results'), { recursive: true });

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  globalSetup: './e2e/helpers/globalSetup.ts',
  // Playwright wipes outputDir on start; keep it below test-results so api.log survives.
  outputDir: './test-results/playwright',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${webPort}/GLITCH/`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'cd ../api && uv run python -m glitch_api',
      url: 'http://127.0.0.1:8787/healthz',
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
      env: {
        GLITCH_ENV: 'dev',
        GLITCH_HOST: '127.0.0.1',
        GLITCH_PORT: '8787',
        GLITCH_LLM_PROVIDER: provider,
        GLITCH_LOG_FILE: apiLog,
      },
    },
    {
      command: 'node scripts/serve-export.mjs',
      url: `http://127.0.0.1:${webPort}/GLITCH/`,
      reuseExistingServer: false,
      timeout: 30_000,
      stdout: 'ignore',
      stderr: 'pipe',
      env: { GLITCH_WEB_PORT: String(webPort), GLITCH_WEB_HOST: '127.0.0.1' },
    },
  ],
});
