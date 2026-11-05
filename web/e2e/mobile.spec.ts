// Mobile layout E2E (spec/ui.md → Responsive: "No horizontal scroll at 320 px width").
// Runs only in the `mobile-320` / `mobile-360` projects (touch, isMobile; see playwright.config.ts).
// Every key screen is opened on a fresh seeded device and checked two ways:
//   1. the document does not scroll sideways (scrollWidth <= clientWidth), and
//   2. no visible element's box pokes past the viewport's left/right edge — this catches
//      content that is clipped inside an overflow-hidden scroll container rather than
//      widening the document (e.g. a sort item wider than the screen).
import type { Page } from '@playwright/test';
import { STATE_STORAGE_KEY } from '../src/contracts/state';
import { test, expect, waitForApp } from './helpers/fixtures';
import { sortByTap } from './helpers/flows';

const isoNow = (): string => new Date().toISOString();

async function seed(page: Page, steps: readonly string[], heroModules: readonly number[] = [1]): Promise<void> {
  const done: Record<string, true> = {};
  for (const s of steps) done[s] = true;
  const stars = Object.fromEntries(steps.filter((s) => /^m\dg\d$/.test(s)).map((s) => [s, 3]));
  const state = {
    version: 1,
    profile: { nickname: 'MOBILE', onboarded: true, createdAt: isoNow() },
    settings: { readableFont: false },
    xp: 0,
    streak: { current: 0, best: 0, lastPlayDay: null },
    steps: done,
    stars,
    heroByModule: Object.fromEntries(heroModules.map((m) => [m, 'scout'])),
    lastHero: 'scout',
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

interface Overflow {
  scrollWidth: number;
  clientWidth: number;
  offenders: string[];
}

/** Measure horizontal overflow of the document and of every visible element. */
async function measure(page: Page): Promise<Overflow> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const vw = doc.clientWidth;
    const offenders: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (r.right <= vw + 1 && r.left >= -1) continue;
      const id = el.closest('[data-testid]')?.getAttribute('data-testid') ?? '';
      const text = (el.textContent ?? '').trim().slice(0, 40);
      offenders.push(`<${el.tagName.toLowerCase()}> in [${id}] x=${Math.round(r.left)}..${Math.round(r.right)} "${text}"`);
    }
    return { scrollWidth: doc.scrollWidth, clientWidth: vw, offenders: offenders.slice(0, 12) };
  });
}

async function expectNoHorizontalOverflow(page: Page, where: string): Promise<void> {
  await page.waitForTimeout(250); // let stepped entrance animations settle
  const m = await measure(page);
  expect(m.scrollWidth, `${where}: document scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth}`).toBeLessThanOrEqual(m.clientWidth);
  expect(m.offenders, `${where}: elements past the ${m.clientWidth}px viewport`).toEqual([]);
}

async function open(page: Page, path: string, ready: string): Promise<void> {
  await page.goto(path);
  await waitForApp(page);
  await expect(page.getByTestId(ready)).toBeVisible();
}

const M1 = ['m1h', 'm1s', 'm1g1', 'm1g2'];
const M2 = ['m2h', 'm2s', 'm2g1', 'm2g2'];

test.describe('no horizontal overflow on a phone', () => {
  test('Welcome', async ({ page }) => {
    await open(page, './', 'welcome-nickname-input');
    await expectNoHorizontalOverflow(page, 'Welcome');
  });

  test('Home (fresh and with progress)', async ({ page }) => {
    await seed(page, [...M1, 'm2h']);
    await open(page, './', 'home-greeting');
    await expect(page.getByTestId('topbar-settings')).toBeVisible();
    await expect(page.getByTestId('topbar-settings')).toHaveAttribute('aria-label', 'SETTINGS');
    await expectNoHorizontalOverflow(page, 'Home');
  });

  test('Hero select', async ({ page }) => {
    await seed(page, []);
    await open(page, './module/1/hero', 'hero-screen');
    await expectNoHorizontalOverflow(page, 'Hero select');
  });

  test('Story', async ({ page }) => {
    await seed(page, ['m1h']);
    await open(page, './module/1/story', 'story-root');
    await expectNoHorizontalOverflow(page, 'Story slide 1');
    await page.getByTestId('story-root').click();
    await page.getByTestId('story-root').click();
    await expectNoHorizontalOverflow(page, 'Story slide 2');
  });

  test('sort game (m1g1), before and after placing items', async ({ page }) => {
    await seed(page, ['m1h', 'm1s']);
    await open(page, './module/1/game/m1g1', 'game-body');
    await expectNoHorizontalOverflow(page, 'm1g1');
    const first = page.locator('[data-testid^="dnd-item-"]').first();
    await first.click();
    await page.locator('[data-testid^="dnd-zone-"]').first().click();
    await expectNoHorizontalOverflow(page, 'm1g1 after a placement');
  });

  test('pick game (m1g2)', async ({ page }) => {
    await seed(page, ['m1h', 'm1s', 'm1g1']);
    await open(page, './module/1/game/m1g2', 'game-body');
    await expectNoHorizontalOverflow(page, 'm1g2');
  });

  test('sliders (m2g1)', async ({ page }) => {
    await seed(page, [...M1, 'm2h', 'm2s'], [1, 2]);
    await open(page, './module/2/game/m2g1', 'm2g1-list');
    await expectNoHorizontalOverflow(page, 'm2g1');
  });

  test('Prompt Forge free-write (m2g2) incl. NOVA reply', async ({ page }) => {
    await seed(page, [...M1, 'm2h', 'm2s', 'm2g1'], [1, 2]);
    await open(page, './module/2/game/m2g2', 'game-body');
    await expectNoHorizontalOverflow(page, 'm2g2 forge 1');
    const pairs = [['b1', 'task'], ['b2', 'ctx'], ['b3', 'role'], ['b4', 'fmt'], ['b5', 'lim']] as const;
    for (let forge = 0; forge < 2; forge++) {
      await sortByTap(page, pairs);
      await expect(page.getByText('PROMPT BUILT')).toBeVisible();
      await expectNoHorizontalOverflow(page, `m2g2 prompt built ${forge + 1}`);
      await page.getByTestId('m2g2-next-forge').click();
    }
    await expect(page.getByText('FORGE 3 · FREE WRITE')).toBeVisible();
    await expect(page.getByTestId('fw-energy')).not.toHaveAttribute('aria-label', 'AI energy loading');
    await expectNoHorizontalOverflow(page, 'free-write');
    await page.getByTestId('fw-input').fill('Act as a friendly science teacher. Explain photosynthesis to my 10-year-old brother, who loves plants. Use 3 short bullet points. Keep it under 80 words.');
    await page.getByTestId('fw-send').click();
    await expect(page.getByTestId('fw-result')).toBeVisible({ timeout: 15_000 });
    await expectNoHorizontalOverflow(page, 'free-write result');
  });

  test('Fairness Lab (m3g2)', async ({ page }) => {
    await seed(page, [...M1, ...M2, 'm3h', 'm3s', 'm3g1'], [1, 2, 3]);
    await open(page, './module/3/game/m3g2', 'game-body');
    await expectNoHorizontalOverflow(page, 'm3g2');
  });

  // The remaining games share the same kit (pick lines, toggles, sliders); cover them too.
  const M3 = ['m3h', 'm3s', 'm3g1', 'm3g2'];
  const OTHER_GAMES: ReadonlyArray<readonly [string, string, readonly string[], readonly number[]]> = [
    ['m3g1', './module/3/game/m3g1', [...M1, ...M2, 'm3h', 'm3s'], [1, 2, 3]],
    ['m4g1', './module/4/game/m4g1', [...M1, ...M2, ...M3, 'm4h', 'm4s'], [1, 2, 3, 4]],
    ['m4g2', './module/4/game/m4g2', [...M1, ...M2, ...M3, 'm4h', 'm4s', 'm4g1'], [1, 2, 3, 4]],
    ['m4g3', './module/4/game/m4g3', [...M1, ...M2, ...M3, 'm4h', 'm4s', 'm4g1', 'm4g2'], [1, 2, 3, 4]],
  ];
  for (const [game, path, steps, mods] of OTHER_GAMES) {
    test(`game ${game}`, async ({ page }) => {
      await seed(page, steps, mods);
      await open(page, path, 'game-body');
      await expectNoHorizontalOverflow(page, game);
    });
  }

  test('Module complete', async ({ page }) => {
    await seed(page, M1);
    await open(page, './module/1/complete', 'complete-screen');
    await expectNoHorizontalOverflow(page, 'Module complete');
  });

  test('Settings', async ({ page }) => {
    await seed(page, M1);
    await open(page, './settings', 'settings-screen');
    await expectNoHorizontalOverflow(page, 'Settings');
  });
});
