// Shared Playwright fixtures. Every test gets a fresh browser context (= a fresh device:
// empty localStorage, new device id) — Playwright's default, made explicit here.
import { test as base, expect, type Page } from '@playwright/test';
import { API_URL, EXPECTED_PROVIDER } from './config';

export { API_URL, EXPECTED_PROVIDER };
export const PIXEL_FONT = 'PressStart2P_400Regular';

export interface GlitchFixtures {
  /** Uncaught page errors collected during the test; asserted empty after each test. */
  pageErrors: string[];
  apiUrl: string;
  expectedProvider: string;
}

/** Click the mission brief away whenever it opens, before the next action or assertion. */
export async function autoDismissBrief(page: Page): Promise<void> {
  await page.addLocatorHandler(page.getByTestId('brief-start'), async (btn) => {
    await btn.click();
  });
}

export const test = base.extend<GlitchFixtures>({
  // Most specs play games, so the brief that opens a first play is dismissed for them. Specs about
  // the brief itself are tagged @keepBrief; fit.spec.ts measures it, so it opens it by hand.
  page: async ({ page }, use, testInfo) => {
    // Specs rely on the authored order of answer choices unless tagged @shuffle.
    if (!testInfo.tags.includes('@shuffle')) {
      await page.addInitScript(() => {
        (globalThis as { __GLITCH_NO_SHUFFLE__?: boolean }).__GLITCH_NO_SHUFFLE__ = true;
      });
    }
    if (!testInfo.tags.includes('@keepBrief') && !testInfo.file.includes('fit.spec')) await autoDismissBrief(page);
    await use(page);
  },
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
