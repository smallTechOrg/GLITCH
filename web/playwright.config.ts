import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { API_LOG, ARTEFACT_DIR, BLOB_CACHE_DIR, DEFAULT_E2E_API_PORT, E2E_API_PORT, E2E_HOST, E2E_WEB_PORT, EXPECTED_PROVIDER, REUSE_SERVERS, WEB_DIST_ENV, WEB_ORIGIN, WEB_URL, API_URL } from './e2e/helpers/config';

/**
 * E2E against the static export (web/dist) served under /GLITCH/ exactly like GitHub Pages,
 * plus the real backend. Ports/dirs come from e2e/helpers/config.ts (GLITCH_E2E_API_PORT,
 * default 8787; GLITCH_WEB_PORT, default 8090; GLITCH_WEB_DIST, default `dist`). Requires a
 * prior export whose baked API URL matches the E2E API port, e.g.
 *   cd web && EXPO_PUBLIC_GLITCH_API_URL=http://127.0.0.1:8787 npx expo export --platform web
 * (globalSetup fails loudly on a mismatch).
 *
 * GLITCH_E2E_EXPECT_PROVIDER (default `fake`) selects the backend provider; the global setup
 * asserts /healthz reports it. Servers are never reused (unless GLITCH_E2E_REUSE_SERVERS=1)
 * so a port already taken fails the run instead of silently testing someone else's server.
 * Backend JSON logs go to web/test-results/api.log (read by check_logs) on the default API
 * port 8787, and to web/test-results/<apiPort>/api.log on any other port — likewise the blob
 * cache and Playwright output — so concurrent runs on different ports never wipe each other.
 */
const provider = EXPECTED_PROVIDER;
const apiLog = API_LOG;
// Phase 2: the E2E backend gets its OWN local blob store (scenario cache), fresh per run, so a
// run never reads or writes the cache of a dev server (default api/.cache) and every run starts
// with an empty cache (first replay = generation, later devices = cache hits).
const blobCache = BLOB_CACHE_DIR;
mkdirSync(ARTEFACT_DIR, { recursive: true });
// Fresh api.log per run so check_logs judges only the latest run. The config is evaluated by
// the runner BEFORE the webServers start (globalSetup runs after them, too late), and again in
// every worker process — the env flag (inherited by workers) makes only the first load truncate.
// The flag is per API port so a nested/other-port run in the same env still truncates its own.
const truncatedFlag = `GLITCH_E2E_LOG_TRUNCATED_${E2E_API_PORT}`;
if (!process.env[truncatedFlag]) {
  writeFileSync(apiLog, '');
  rmSync(blobCache, { recursive: true, force: true });
  mkdirSync(blobCache, { recursive: true });
  process.env[truncatedFlag] = '1';
}

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  globalSetup: './e2e/helpers/globalSetup.ts',
  // Playwright wipes outputDir on start; keep it below the artefact dir so api.log survives.
  outputDir: `./${relative(__dirname, resolve(ARTEFACT_DIR, 'playwright'))}`,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // The HTML report is per port too (default: playwright-report; else playwright-report/<apiPort>).
  reporter: [['list'], ['html', { outputFolder: E2E_API_PORT === DEFAULT_E2E_API_PORT ? 'playwright-report' : `playwright-report/${E2E_API_PORT}`, open: 'never' }]],
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', testIgnore: '**/mobile.spec.ts', use: { ...devices['Desktop Chrome'] } },
    // spec/ui.md → Responsive: no horizontal scroll at 320 px; mobile-first, touch.
    {
      name: 'mobile-320',
      testMatch: '**/mobile.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
    },
    {
      name: 'mobile-360',
      testMatch: '**/mobile.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
    },
  ],
  webServer: [
    {
      command: 'cd ../api && uv run python -m glitch_api',
      url: `${API_URL}/healthz`,
      reuseExistingServer: REUSE_SERVERS,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
      env: {
        GLITCH_ENV: 'dev',
        GLITCH_HOST: E2E_HOST,
        GLITCH_PORT: String(E2E_API_PORT),
        // The page origin must be allowed by CORS whatever the web port is.
        GLITCH_CORS_ORIGINS: `${WEB_ORIGIN},http://localhost:${E2E_WEB_PORT}`,
        GLITCH_LLM_PROVIDER: provider,
        GLITCH_LOG_FILE: apiLog,
        GLITCH_BLOB_BACKEND: 'local',
        GLITCH_CACHE_DIR: blobCache,
        GLITCH_BLOB_PREFIX: '',
      },
    },
    {
      command: 'node scripts/serve-export.mjs',
      url: WEB_URL,
      reuseExistingServer: REUSE_SERVERS,
      timeout: 30_000,
      stdout: 'ignore',
      stderr: 'pipe',
      env: { GLITCH_WEB_PORT: String(E2E_WEB_PORT), GLITCH_WEB_HOST: E2E_HOST, GLITCH_WEB_DIST: WEB_DIST_ENV },
    },
  ],
});
