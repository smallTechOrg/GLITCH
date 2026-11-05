// Phase 3 · Ask NOVA why (ask-nova-why.md, spec/roadmap.md → P3-W1 / Phase 3 gate step 6–7).
// Real backend: POST /v1/explain looks up the global cache, then makes ONE provider call on a
// miss (1 device energy). Fact or Fib is the journey the user tests: a wrong tap on a TRUE line
// → "ASK NOVA WHY" → the explanation + one tip under NOVA's bubble. A second, fresh device asking
// the same mistake gets it from the cache for free (energy unchanged). With /v1/explain aborted
// the panel shows the in-world offline line + the game's canned miss message within 8 s.
// Demo-mode tests run only when the expected provider is `fake`; the `@live` test only when it is
// `openrouter` (1 provider call).
import type { Browser, Page, Response } from '@playwright/test';
import { WEB_URL } from './helpers/config';
import { test, expect, waitForApp, API_URL, EXPECTED_PROVIDER } from './helpers/fixtures';

const FAKE = EXPECTED_PROVIDER === 'fake';
const LIVE = EXPECTED_PROVIDER === 'openrouter';
const TRUE_MISS = 'That one is actually true. Look for something that sounds too sure.';
const DEMO_TIP = 'TIP: Slow down: find the clue first, then make the call.';
const OFFLINE = "NOVA'S OFFLINE — here's the short version:";
const COST_FREE = 'FREE · NOVA ALREADY KNEW THIS';
const COST_PAID = '−1 AI ENERGY';
const ASK_WINDOW_MS = 10_000;

interface ExplainBody {
  ok: boolean;
  data?: { text: string; tip: string; cached: boolean; provider: 'fake' | 'openrouter' };
  error?: { code: string };
  energy?: { remaining: number; limit: number };
}

/** Seed (once, before boot) a device with Module 1 open up to Fact or Fib (a v1 save; migrates). */
async function seed(page: Page): Promise<void> {
  const state = {
    version: 1,
    profile: { nickname: 'TESTER', onboarded: true, createdAt: new Date().toISOString() },
    settings: { readableFont: false },
    xp: 30,
    streak: { current: 0, best: 0, lastPlayDay: null },
    steps: { m1h: true, m1s: true, m1g1: true },
    stars: { m1g1: 3 },
    heroByModule: { 1: 'guard' },
    lastHero: 'guard',
    heroesPlayed: {},
    powersUsed: {},
    badges: {},
    onceBonuses: { gm1g1: true },
    promptHistory: [],
  };
  await page.addInitScript((s: string) => {
    if (!window.localStorage.getItem('glitch.v1.state')) window.localStorage.setItem('glitch.v1.state', s);
  }, JSON.stringify(state));
}

async function energyOf(device: string): Promise<number> {
  const res = await fetch(`${API_URL}/v1/energy`, { headers: { 'X-Glitch-Device': device } });
  const body = (await res.json()) as ExplainBody;
  expect(body.energy, `no energy in ${JSON.stringify(body)}`).toBeDefined();
  return body.energy!.remaining;
}

const isExplain = (r: Response): boolean => r.url().endsWith('/v1/explain') && r.request().method() === 'POST';

/** Open Fact or Fib and tap line 0 (a TRUE line) → a miss with the chip under the bubble. */
async function missLineZero(page: Page): Promise<void> {
  await page.goto('./module/1/game/m1g2');
  await waitForApp(page);
  await expect(page.getByTestId('game-title')).toContainText('Fact or Fib');
  await page.getByTestId('pick-line-0').click();
  await expect(page.getByTestId('ask-nova-why')).toBeVisible();
  await expect(page.getByTestId('ask-nova-why')).toHaveText('ASK NOVA WHY');
}

/** Tap the chip; return the device id, the response body and how many explain requests went out. */
async function ask(page: Page): Promise<{ device: string; body: ExplainBody; requests: () => number }> {
  let n = 0;
  page.on('request', (r) => {
    if (r.url().endsWith('/v1/explain')) n += 1;
  });
  const served = page.waitForResponse(isExplain);
  await page.getByTestId('ask-nova-why').click();
  const res = await served;
  const device = res.request().headers()['x-glitch-device'] ?? '';
  expect(device, 'no device id sent').toMatch(/^[0-9a-f-]{36}$/);
  expect(Object.keys(res.request().postDataJSON() as object).sort()).toEqual(['answer', 'gameId', 'itemId', 'variationId']);
  expect(res.request().postDataJSON()).toEqual({ gameId: 'm1g2', variationId: 'v3', itemId: 's0', answer: 'fib' });
  const body = (await res.json()) as ExplainBody;
  expect(body.ok, `explain failed: ${JSON.stringify(body)}`).toBe(true);
  return { device, body, requests: () => n };
}

const words = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;

async function expectExplained(page: Page, body: ExplainBody): Promise<void> {
  const d = body.data!;
  await expect(page.getByTestId('nova-why-panel')).toBeVisible();
  await expect(page.getByTestId('nova-why-text')).toHaveText(d.text);
  await expect(page.getByTestId('nova-why-tip')).toHaveText(`TIP: ${d.tip}`);
  await expect(page.getByTestId('nova-why-cost')).toHaveText(d.cached ? COST_FREE : COST_PAID);
  expect(words(d.text)).toBeLessThanOrEqual(60);
  expect(words(d.tip)).toBeLessThanOrEqual(25);
  await expect(page.getByTestId('nova-why-offline')).toHaveCount(0);
}

/** Device B: a fresh context (new device id) asking the same mistake → a free cache hit. */
async function askOnSecondDevice(browser: Browser, expected: ExplainBody): Promise<void> {
  const ctx = await browser.newContext({ baseURL: WEB_URL });
  const errors: string[] = [];
  try {
    const pageB = await ctx.newPage();
    pageB.on('pageerror', (e) => errors.push(e.message));
    await seed(pageB);
    await missLineZero(pageB);
    const { device, body } = await ask(pageB);
    expect(device).not.toBe('');
    expect(body.data!.cached).toBe(true);
    expect(body.data!.text).toBe(expected.data!.text);
    expect(body.data!.tip).toBe(expected.data!.tip);
    expect(body.energy?.remaining).toBe(body.energy?.limit); // a fresh device, nothing charged
    await expectExplained(pageB, body);
    await expect(pageB.getByTestId('nova-why-cost')).toHaveText(COST_FREE);
    expect(await energyOf(device)).toBe(body.energy!.limit);
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
  }
}

test.describe('ASK NOVA WHY · demo NOVA', () => {
  test.skip(!FAKE, 'demo-mode checks need GLITCH_E2E_EXPECT_PROVIDER=fake');

  test('a wrong tap in Fact or Fib → ASK NOVA WHY → explanation + tip + DEMO tag; a second device gets it from the cache for free', async ({ page, browser }) => {
    await seed(page);
    await missLineZero(page);
    const { device, body, requests } = await ask(page);
    const d = body.data!;
    expect(d.provider).toBe('fake');
    expect(d.text).toContain(TRUE_MISS); // the deterministic demo text carries the canned message
    await expectExplained(page, body);
    await expect(page.getByTestId('nova-why-tip')).toHaveText(DEMO_TIP);
    await expect(page.getByTestId('nova-why-demo-tag')).toHaveText('DEMO');
    // A miss costs 1 energy; a hit (e.g. a re-run on a warm cache) costs nothing.
    expect(await energyOf(device)).toBe(body.energy!.limit - (d.cached ? 0 : 1));
    expect(body.energy!.remaining).toBe(await energyOf(device));
    // One request per mistake: the chip is gone, the panel stays (the game keeps going).
    await expect(page.getByTestId('ask-nova-why')).toHaveCount(0);
    expect(requests()).toBe(1);
    await expect(page.getByTestId('pick-line-1')).toBeVisible();

    // CLOSE → the panel is gone.
    await page.getByTestId('nova-why-close').click();
    await expect(page.getByTestId('nova-why-panel')).toHaveCount(0);

    await askOnSecondDevice(browser, body);
  });

  test('the chip is gone after 10 s', async ({ page }) => {
    await seed(page);
    await missLineZero(page);
    await page.waitForTimeout(ASK_WINDOW_MS + 500);
    await expect(page.getByTestId('ask-nova-why')).toHaveCount(0);
  });

  test('API unreachable → NOVA\'S OFFLINE line + the canned miss message within 8 s', async ({ page }) => {
    await page.route('**/v1/explain', (r) => r.abort());
    await seed(page);
    await missLineZero(page);
    await page.getByTestId('ask-nova-why').click();
    const offline = page.getByTestId('nova-why-offline');
    await expect(offline).toBeVisible({ timeout: 8_000 });
    await expect(offline).toContainText(OFFLINE);
    await expect(offline).toContainText(TRUE_MISS);
    await expect(page.getByTestId('nova-why-text')).toHaveCount(0);
    // The game is never blocked.
    await page.getByTestId('pick-line-1').click();
    await expect(page.getByTestId('pick-found')).toContainText('1/3');
  });
});

test.describe('ASK NOVA WHY · real NOVA', () => {
  test.skip(!LIVE, 'live check needs GLITCH_E2E_EXPECT_PROVIDER=openrouter');

  test('@live one real explanation ≤ 60 words; a second device gets a free cache hit (1 provider call)', async ({ page, browser }) => {
    test.setTimeout(90_000);
    await seed(page);
    await missLineZero(page);
    const { device, body } = await ask(page);
    expect(body.data!.provider).toBe('openrouter');
    await expectExplained(page, body);
    await expect(page.getByTestId('nova-why-demo-tag')).toHaveCount(0);
    expect(await energyOf(device)).toBe(body.energy!.limit - (body.data!.cached ? 0 : 1));
    await askOnSecondDevice(browser, body);
  });
});
