// Module 3 · Neon City E2E (slice C1): Proxy Hunt + Fairness Lab walked to LEVEL CLEAR with
// the expected star count, one Out-of-hearts run per game, a keyboard-only game and a power.
// Runs at the Phase 1 gate. Each test is a fresh browser context (= fresh device), seeded
// with Modules 1–2 finished and the Module 3 hero chosen so the games are reachable.
import type { Page } from '@playwright/test';
import { STATE_STORAGE_KEY } from '../src/contracts/state';
import type { HeroId } from '../src/contracts/ids';
import { test, expect, waitForApp } from './helpers/fixtures';
import { expectWin, pickLines } from './helpers/flows';

const PROXIES = [2, 3, 4, 5, 6] as const; // v3 lines 3–7
const REAL = [7, 8, 9, 10] as const; // v3 lines 8–11
const PROXY_TOGGLES = ['col', 'cap', 'brk', 'pc'] as const;

type Module3Game = 'm3g1' | 'm3g2';

/**
 * Seed a device that has finished Modules 1–2 and picked a Module 3 hero (once per context).
 * A step is startable only when every earlier step is done, so opening m3g2 also marks m3g1 done.
 */
async function seedModule3(page: Page, game: Module3Game, hero: HeroId = 'scout'): Promise<void> {
  const now = new Date().toISOString();
  const steps: Record<string, true> = {};
  const extra = game === 'm3g2' ? ['m3g1'] : [];
  for (const s of ['m1h', 'm1s', 'm1g1', 'm1g2', 'm2h', 'm2s', 'm2g1', 'm2g2', 'm3h', 'm3s', ...extra]) steps[s] = true;
  const stars: Record<string, number> = game === 'm3g2' ? { m3g1: 3 } : {};
  const state = {
    version: 1,
    profile: { nickname: 'E2E', onboarded: true, createdAt: now },
    settings: { readableFont: false },
    xp: 0,
    streak: { current: 0, best: 0, lastPlayDay: null },
    steps,
    stars,
    heroByModule: { 1: hero, 2: hero, 3: hero },
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

async function openGame(page: Page, game: Module3Game, hero: HeroId = 'scout'): Promise<void> {
  await seedModule3(page, game, hero);
  await page.goto(`./module/3/game/${game}`);
  await waitForApp(page);
  await expect(page.getByTestId('game-body')).toBeVisible();
}

test.describe('m3g1 · Proxy Hunt', () => {
  test('tapping the 5 proxies reaches LEVEL CLEAR with 3 stars and +30 XP', async ({ page }) => {
    await openGame(page, 'm3g1');
    await expect(page.getByTestId('game-title')).toContainText('Proxy Hunt');
    await expect(page.getByTestId('pick-found')).toHaveText('PROXIES FOUND: 0/5');
    await expect(page.getByTestId('pick-line-0')).toContainText('NAME: ▮▮▮▮▮▮ REMOVED');
    await pickLines(page, PROXIES);
    await expect(page.getByTestId('pick-found')).toHaveText('PROXIES FOUND: 5/5');
    await expectWin(page, 3);
    await expect(page.getByTestId('win-screen')).toContainText('Deleting the trait does not delete the proxy');
    await expect(page.getByTestId('win-xp-tag')).toBeVisible();
    await expect(page.getByTestId('win-flawless-tag')).toBeVisible();
  });

  test('one real-skill tap costs a heart with the v3 message and the win has 2 stars', async ({ page }) => {
    await openGame(page, 'm3g1');
    await pickLines(page, [REAL[0]]);
    await expect(page.getByTestId('pick-line-7')).toContainText('OK');
    await expect(page.getByTestId('say-bubble')).toContainText('That line measures ability, not who she is.');
    await expect(page.getByTestId('hearts')).toHaveAttribute('aria-label', /Hearts 2 of 3/);
    await pickLines(page, PROXIES);
    await expectWin(page, 2);
  });

  test('three real-skill taps run out of hearts; Try again starts a fresh hunt', async ({ page }) => {
    await openGame(page, 'm3g1');
    await pickLines(page, [REAL[0], REAL[1], REAL[2]]);
    await expect(page.getByTestId('fail-screen')).toBeVisible();
    await expect(page.getByTestId('fail-screen')).toContainText('OUT OF HEARTS');
    await page.getByTestId('fail-retry').click();
    await expect(page.getByTestId('pick-found')).toHaveText('PROXIES FOUND: 0/5');
    await expect(page.getByTestId('hearts')).toHaveAttribute('aria-label', /Hearts 3 of 3/);
  });

  test('X-RAY (SCOUT) catches the next proxy and uses one power', async ({ page }) => {
    await openGame(page, 'm3g1', 'scout');
    await page.getByTestId('power-button').click();
    await expect(page.getByTestId('pick-found')).toHaveText('PROXIES FOUND: 1/5');
    await expect(page.getByTestId('pick-line-2')).toContainText('PROXY');
    await expect(page.getByTestId('say-bubble')).toContainText('Proxy found! Stands in for gender.');
    await pickLines(page, [3, 4, 5, 6]);
    await expectWin(page, 3);
  });
});

test.describe('m3g2 · Fairness Lab', () => {
  test('keyboard only: switch every proxy off, run the audit, LEVEL CLEAR with 3 stars', async ({ page }) => {
    await openGame(page, 'm3g2');
    await expect(page.getByTestId('game-title')).toContainText('Fairness Lab');
    await expect(page.getByTestId('metric-gap')).toHaveAttribute('aria-label', 'GAP 31%, goal ≤6, not met');
    await expect(page.getByTestId('metric-accuracy')).toHaveAttribute('aria-label', 'ACCURACY 94%, goal ≥80, met');
    for (const id of PROXY_TOGGLES) {
      await page.getByTestId(`toggle-${id}`).focus();
      await page.keyboard.press('Enter');
      await expect(page.getByTestId(`toggle-${id}`)).toHaveAttribute('aria-checked', 'false');
    }
    await expect(page.getByTestId('metric-gap')).toHaveAttribute('aria-label', 'GAP 2%, goal ≤6, met');
    await expect(page.getByTestId('metric-accuracy')).toHaveAttribute('aria-label', 'ACCURACY 86%, goal ≥80, met');
    await expect(page.getByTestId('m3g2-women')).toContainText('46%');
    await page.getByTestId('m3g2-audit').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('say-bubble')).toContainText('Audit passed. Fair and accurate.');
    await expectWin(page, 3);
    await expect(page.getByTestId('win-screen')).toContainText('Removing the sensitive column is not enough.');
  });

  test('a failed audit costs a heart with the gap message; fixing it wins with 2 stars', async ({ page }) => {
    await openGame(page, 'm3g2');
    await page.getByTestId('m3g2-audit').click();
    await expect(page.getByTestId('say-bubble')).toContainText('The gap is still 31 points. Some proxies are still switched on.');
    for (const id of PROXY_TOGGLES) await page.getByTestId(`toggle-${id}`).click();
    await page.getByTestId('m3g2-audit').click();
    await expectWin(page, 2);
  });

  test('switching a skill off fails on accuracy', async ({ page }) => {
    await openGame(page, 'm3g2');
    for (const id of [...PROXY_TOGGLES, 'gpa']) await page.getByTestId(`toggle-${id}`).click();
    await page.getByTestId('m3g2-audit').click();
    await expect(page.getByTestId('say-bubble')).toContainText('Accuracy fell to 76%. Keep the skill features on.');
  });

  test('three failed audits run out of hearts', async ({ page }) => {
    await openGame(page, 'm3g2');
    for (let k = 0; k < 3; k++) await page.getByTestId('m3g2-audit').click();
    await expect(page.getByTestId('fail-screen')).toBeVisible();
    await expect(page.getByTestId('fail-home')).toBeVisible();
  });

  test('FOCUS (ORACLE) names the first proxy still on, at no heart cost', async ({ page }) => {
    await openGame(page, 'm3g2', 'oracle');
    await page.getByTestId('power-button').click();
    await expect(page.getByTestId('say-bubble')).toContainText("FOCUS: Women's college is still on, and it can stand in for gender.");
    await expect(page.getByTestId('hearts')).toHaveAttribute('aria-label', /Hearts 3 of 3/);
    await expect(page.getByTestId('toggle-col')).toHaveAttribute('aria-checked', 'true');
  });
});
