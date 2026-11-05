// Scaffold smoke (spec/roadmap.md → Scaffold Gate 4): the export loads under /GLITCH/, shows
// the GLITCH title in the pixel font, deep links render, and the backend answers the page
// origin through CORS — including the X-Glitch-Device preflight the real client sends.
import { test, expect, waitForApp, PIXEL_FONT } from './helpers/fixtures';

test('loads /GLITCH/ on a fresh device and shows the GLITCH title', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveTitle(/GLITCH/);
  await waitForApp(page);
  await expect(page).toHaveURL(/\/GLITCH\/welcome$/);
  await expect(page.getByText('GLITCH', { exact: true }).first()).toBeVisible();
});

test('applies the bundled Press Start 2P pixel font', async ({ page }) => {
  await page.goto('./');
  await waitForApp(page);
  const title = page.getByText('GLITCH', { exact: true }).first();
  await expect(title).toBeVisible();
  const family = await title.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(family).toContain(PIXEL_FONT);
  const loaded = await page.evaluate(async (font) => {
    await document.fonts.ready;
    return document.fonts.check(`16px "${font}"`) && [...document.fonts].some((f) => f.family.replace(/"/g, '') === font && f.status === 'loaded');
  }, PIXEL_FONT);
  expect(loaded).toBe(true);
});

test('serves deep links (static HTML per route) without crashing', async ({ page }) => {
  const res = await page.goto('./module/1/game/m1g1');
  expect(res?.status()).toBe(200);
  await waitForApp(page);
  await expect(page.getByText('GLITCH', { exact: true }).first()).toBeVisible();
});

test('reaches GET /healthz on the backend from the page origin (CORS)', async ({ page, apiUrl, expectedProvider }) => {
  await page.goto('./');
  const r = await page.evaluate(async (url) => {
    const res = await fetch(`${url}/healthz`);
    return { status: res.status, body: (await res.json()) as { ok: boolean; data: { status: string; provider: string } } };
  }, apiUrl);
  expect(r.status).toBe(200);
  expect(r.body.ok).toBe(true);
  expect(r.body.data.status).toBe('ok');
  expect(r.body.data.provider).toBe(expectedProvider);
});

test('passes the CORS preflight for the X-Glitch-Device header', async ({ page, apiUrl }) => {
  await page.goto('./');
  const r = await page.evaluate(async (url) => {
    const res = await fetch(`${url}/v1/energy`, { headers: { 'X-Glitch-Device': crypto.randomUUID() } });
    const body = (await res.json()) as { ok: boolean };
    return { status: res.status, hasOk: typeof body.ok === 'boolean' };
  }, apiUrl);
  expect(r.hasOk).toBe(true); // envelope readable cross-origin (stub or real energy)
});
