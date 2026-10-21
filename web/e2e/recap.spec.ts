// Phase 3 · mistake recap + mistake memory (mistake-recap.md, mistake-memory.md; spec/ui.md →
// Recap / REVIEW test IDs). Runs at the phase gate with the fake provider. Every `/v1/**`
// request is aborted: the recap and REVIEW are device-only (zero tokens), and replays of a
// cleared content game fall back to the classic case file, which keeps line indices fixed.
import type { Page } from '@playwright/test';
import { STATE_STORAGE_KEY } from '../src/contracts/state';
import type { HeroId } from '../src/contracts/ids';
import { test, expect, waitForApp } from './helpers/fixtures';
import { expectWin, pickLines } from './helpers/flows';

const PROXIES = [2, 3, 4, 5, 6] as const; // m3g1 v3 lines 3–7
const REAL = [7, 8, 9, 10] as const; // m3g1 v3 lines 8–11

/** Seed a device (once per context) with the given steps done and a hero for every module. */
async function seed(page: Page, steps: readonly string[], hero: HeroId): Promise<void> {
  const now = new Date().toISOString();
  const state = {
    version: 1,
    profile: { nickname: 'E2E', onboarded: true, createdAt: now },
    settings: { readableFont: false },
    xp: 0,
    streak: { current: 0, best: 0, lastPlayDay: null },
    steps: Object.fromEntries(steps.map((s) => [s, true])),
    stars: {},
    heroByModule: { 1: hero, 2: hero, 3: hero, 4: hero },
    lastHero: hero,
    heroesPlayed: {},
    powersUsed: {},
    badges: {},
    onceBonuses: {},
    promptHistory: [],
  };
  await page.addInitScript(
    ([key, value]) => {
      if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, value);
    },
    [STATE_STORAGE_KEY, JSON.stringify(state)] as const,
  );
}

/** The server is unreachable for the whole test; count what the app tried to send. */
async function offline(page: Page, apiUrl: string): Promise<string[]> {
  const tried: string[] = [];
  await page.route(`${apiUrl}/v1/**`, (r) => {
    tried.push(r.request().url());
    return r.abort();
  });
  return tried;
}

async function openGame(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await waitForApp(page);
  await expect(page.getByTestId('game-body')).toBeVisible();
}

test.describe('Mistake recap', () => {
  test('three wrong drops in Train the Model → fail screen recap with three rows and the right zone labels (server unreachable)', async ({ page, apiUrl }) => {
    const tried = await offline(page, apiUrl);
    await seed(page, ['m1h', 'm1s'], 'scout');
    await openGame(page, './module/1/game/m1g1');
    for (const [item, zone] of [['e1', 'ok'], ['e2', 'spam'], ['e3', 'ok']] as const) {
      await page.getByTestId(`dnd-item-${item}`).click();
      await page.getByTestId(`dnd-zone-${zone}`).click();
    }
    await expect(page.getByTestId('fail-screen')).toBeVisible();
    const recap = page.getByTestId('recap');
    await expect(recap).toContainText('MISTAKE RECAP');
    await expect(page.getByTestId('recap-item-0')).toHaveText('WIN a FREE prize!!! Click now');
    await expect(page.getByTestId('recap-said-0')).toHaveText('YOU SAID: NOT SPAM');
    await expect(page.getByTestId('recap-was-0')).toHaveText('IT WAS: SPAM');
    await expect(page.getByTestId('recap-said-1')).toHaveText('YOU SAID: SPAM');
    await expect(page.getByTestId('recap-was-1')).toHaveText('IT WAS: NOT SPAM');
    await expect(page.getByTestId('recap-was-2')).toHaveText('IT WAS: SPAM');
    await expect(page.getByTestId('recap-why-0')).toContainText('Look at the features');
    await expect(page.getByTestId('recap-row-0')).toHaveAttribute('aria-label', /^WIN a FREE prize!!! Click now\. You said NOT SPAM\. It was SPAM\. /);
    await expect(page.getByTestId('recap-row-3')).toHaveCount(0);
    await expect(page.getByTestId('recap-more')).toHaveCount(0);
    await expect(page.getByTestId('recap-clean')).toHaveCount(0);
    expect(tried.filter((u) => u.includes('/v1/explain'))).toEqual([]);

    // Retry starts a new session with an empty recap.
    await page.getByTestId('fail-retry').click();
    await expect(page.getByTestId('fail-screen')).toHaveCount(0);
    await expect(page.getByTestId('recap')).toHaveCount(0);
  });
});

test.describe('Mistake memory · REVIEW', () => {
  test('two Proxy Hunt misses + 2-star win → REVIEW "Proxy variables · 2 misses" survives reload; a 3-star clear removes it', async ({ page, apiUrl }) => {
    await offline(page, apiUrl);
    await seed(page, ['m1h', 'm1s', 'm1g1', 'm1g2', 'm2h', 'm2s', 'm2g1', 'm2g2', 'm3h', 'm3s'], 'guard');

    // Fresh device: no records → no REVIEW panel.
    await page.goto('./');
    await waitForApp(page);
    await expect(page.getByTestId('home-energy')).toBeVisible();
    await expect(page.getByTestId('home-review')).toHaveCount(0);

    // Shield absorbs the first miss, the second costs a heart → 2 hearts → 2 stars.
    await openGame(page, './module/3/game/m3g1');
    await page.getByTestId('power-button').click();
    await expect(page.getByTestId('shield-indicator')).toBeVisible();
    await pickLines(page, [REAL[0]]);
    await expect(page.getByTestId('hearts')).toHaveAttribute('aria-label', /Hearts 3 of 3/);
    await pickLines(page, [REAL[1]]);
    await expect(page.getByTestId('hearts')).toHaveAttribute('aria-label', /Hearts 2 of 3/);
    await pickLines(page, PROXIES);
    await expectWin(page, 2);
    await expect(page.getByTestId('recap-row-1')).toBeVisible();
    await expect(page.getByTestId('recap-row-2')).toHaveCount(0);
    await expect(page.getByTestId('recap-shielded-0')).toHaveText('SHIELDED');
    await expect(page.getByTestId('recap-shielded-1')).toHaveCount(0);
    await expect(page.getByTestId('recap-was-0')).toContainText('IT WAS:');

    await page.goto('./');
    await waitForApp(page);
    const row = page.getByTestId('review-concept-proxy-variables');
    await expect(page.getByTestId('home-review')).toContainText('REVIEW · IDEAS TO PRACTISE');
    await expect(row).toContainText('Proxy variables · 2 misses');
    await expect(page.getByTestId('review-replay-proxy-variables')).toHaveText('Replay Proxy Hunt');

    // Survives reload (device storage).
    await page.reload();
    await waitForApp(page);
    await expect(row).toContainText('Proxy variables · 2 misses');

    // Replay → Proxy Hunt; a clean 3-star clear masters the concept.
    await page.getByTestId('review-replay-proxy-variables').click();
    await expect(page).toHaveURL(/\/module\/3\/game\/m3g1$/);
    await expect(page.getByTestId('game-title')).toContainText('Proxy Hunt');
    await expect(page.getByTestId('pick-line-0')).toContainText('NAME: ▮▮▮▮▮▮ REMOVED');
    await pickLines(page, PROXIES);
    await expectWin(page, 3);
    await expect(page.getByTestId('recap-clean')).toHaveText('No mistakes. Clean run!');

    await page.goto('./');
    await waitForApp(page);
    await expect(page.getByTestId('home-energy')).toBeVisible();
    await expect(page.getByTestId('home-review')).toHaveCount(0);
    await page.reload();
    await waitForApp(page);
    await expect(page.getByTestId('home-energy')).toBeVisible();
    await expect(page.getByTestId('home-review')).toHaveCount(0);
  });
});
