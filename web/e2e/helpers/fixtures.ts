// Shared Playwright fixtures. Every test gets a fresh browser context (= a fresh device:
// empty localStorage, new device id) — Playwright's default, made explicit here.
import { test as base, expect, type Page } from '@playwright/test';

export const API_URL = (process.env.EXPO_PUBLIC_GLITCH_API_URL ?? 'http://127.0.0.1:8787').replace(/\/+$/, '');
export const EXPECTED_PROVIDER = process.env.GLITCH_E2E_EXPECT_PROVIDER ?? 'fake';
export const PIXEL_FONT = 'PressStart2P_400Regular';

export interface GlitchFixtures {
  /** Uncaught page errors collected during the test; asserted empty after each test. */
  pageErrors: string[];
  apiUrl: string;
  expectedProvider: string;
}

export const test = base.extend<GlitchFixtures>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await use(errors);
      expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
    },
    { auto: true },
  ],
  apiUrl: async ({}, use) => use(API_URL),
  expectedProvider: async ({}, use) => use(EXPECTED_PROVIDER),
});

export { expect };

/** Wait until the app has hydrated (loading screen gone). */
export async function waitForApp(page: Page): Promise<void> {
  await expect(page.getByTestId('app-loading')).toHaveCount(0, { timeout: 20_000 });
}
