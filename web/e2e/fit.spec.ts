// "No scrolling, everything on one screen": every screen and game must fit these viewports.
// Fails on any element that actually scrolls, and on anything pushed below the fold.
import { expect, test } from './helpers/fixtures';
import type { Page } from '@playwright/test';
import { GAME_IDS, moduleOfGame, type GameId } from '../src/contracts/ids';
import { stepsOf } from '../src/content/modules';

// The pixel font is wide, so on phones smaller than 390×844 the game body scrolls as a last resort.
const VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
];

const SHOTS = process.env.GLITCH_FIT_SHOTS;

async function overflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    if (document.documentElement.scrollHeight > vh + 1) out.push(`document ${document.documentElement.scrollHeight}>${vh}`);
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') continue;
      if (el.tagName === 'TEXTAREA') continue; // a long prompt scrolls inside its own box, like any editor
      const id = el.getAttribute('data-testid') ?? el.tagName;
      if ((st.overflowY === 'auto' || st.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1) {
        out.push(`scrolls: ${id} ${el.scrollHeight}>${el.clientHeight}`);
      }
      if ((st.overflowX === 'auto' || st.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) {
        out.push(`scrolls sideways: ${id} ${el.scrollWidth}>${el.clientWidth}`);
      }
      const testId = el.getAttribute('data-testid');
      if (testId) {
        const r = el.getBoundingClientRect();
        if (r.height > 0 && (r.bottom > vh + 1 || r.right > vw + 1)) out.push(`off-screen: ${testId} bottom=${Math.round(r.bottom)} right=${Math.round(r.right)}`);
      }
    }
    return out;
  });
}

async function check(page: Page, name: string): Promise<void> {
  // Let the screen wipe and any layout-driven resizes settle.
  await page.waitForTimeout(450);
  if (SHOTS) {
    const size = page.viewportSize();
    await page.screenshot({ path: `${SHOTS}/${size?.width}x${size?.height}-${name}.png` });
  }
  expect.soft(await overflow(page), name).toEqual([]);
}

/** A saved game with every step done except the given ones, opening any game as a first play. */
async function seed(page: Page, undone: readonly string[], overrides: Record<string, unknown> = {}): Promise<void> {
  const steps: Record<string, true> = {};
  for (const m of [1, 2, 3, 4] as const) for (const s of stepsOf(m)) if (!undone.includes(s.id)) steps[s.id] = true;
  const state = {
    version: 4,
    profile: { nickname: 'ROBIN', onboarded: true, createdAt: '2026-01-01T00:00:00.000Z' },
    settings: { readableFont: process.env.GLITCH_FIT_READABLE === '1', help: 'auto' },
    xp: 120,
    streak: { current: 3, best: 4, lastPlayDay: '2026-11-02' },
    steps,
    stars: {},
    heroByModule: { 1: 'scout', 2: 'scout', 3: 'scout', 4: 'scout' },
    lastHero: 'scout',
    heroesPlayed: {},
    powersUsed: {},
    badges: {},
    onceBonuses: {},
    promptHistory: [],
    seenScenarios: {},
    mistakes: [],
    fairnessCases: 0,
    ...overrides,
  };
  await page.addInitScript((s) => {
    if (!localStorage.getItem('glitch.v1.state')) localStorage.setItem('glitch.v1.state', JSON.stringify(s));
  }, state);
}

async function openGame(page: Page, id: GameId): Promise<void> {
  await seed(page, [id]);
  await page.goto(`./module/${moduleOfGame(id)}/game/${id}`);
  await expect(page.getByTestId('brief')).toBeVisible({ timeout: 20_000 });
}

for (const viewport of VIEWPORTS) {
  test.describe(`fits ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    for (const id of GAME_IDS) {
      test(`${id}: brief and game`, async ({ page }) => {
        await openGame(page, id);
        await check(page, `${id}-brief`);
        await page.getByTestId('brief-start').click();
        await check(page, `${id}-play`);
      });
    }

    test('m1g1: verified round', async ({ page }) => {
      await openGame(page, 'm1g1');
      await page.getByTestId('brief-start').click();
      for (const [item, zone] of [['e1', 'spam'], ['e2', 'ok'], ['e3', 'spam'], ['e4', 'ok'], ['e5', 'spam'], ['e6', 'ok']] as const) {
        await page.getByTestId(`dnd-item-${item}`).click();
        await page.getByTestId(`dnd-zone-${zone}`).click();
      }
      await page.getByTestId('m1g1-verify').click();
      await check(page, 'm1g1-verified');
    });

    test('m1g1: round 2 verified with wrong calls, then results', async ({ page }) => {
      await openGame(page, 'm1g1');
      await page.getByTestId('brief-start').click();
      for (const [item, zone] of [['e1', 'spam'], ['e2', 'ok'], ['e3', 'spam'], ['e4', 'ok'], ['e5', 'spam'], ['e6', 'ok']] as const) {
        await page.getByTestId(`dnd-item-${item}`).click();
        await page.getByTestId(`dnd-zone-${zone}`).click();
      }
      await page.getByTestId('m1g1-verify').click();
      await page.getByTestId('m1g1-next').click();
      for (const [item, zone] of [['t1', 'spam'], ['t2', 'spam'], ['t3', 'ok'], ['t4', 'spam']] as const) {
        await page.getByTestId(`dnd-item-${item}`).click();
        await page.getByTestId(`dnd-zone-${zone}`).click();
      }
      await page.getByTestId('m1g1-verify').click();
      await check(page, 'm1g1-round2');
      await page.getByTestId('m1g1-next').click();
      await check(page, 'm1g1-result');
    });

    test('m2g2: a full forge, the built prompt, the free-write result', async ({ page }) => {
      await openGame(page, 'm2g2');
      await page.getByTestId('brief-start').click();
      for (const k of [0, 1]) {
        for (const [item, zone] of [['b1', 'task'], ['b2', 'ctx'], ['b3', 'role'], ['b4', 'fmt'], ['b5', 'lim']] as const) {
          if (await page.getByTestId(`deck-tab-${item}`).count()) await page.getByTestId(`deck-tab-${item}`).click();
          await page.getByTestId(`dnd-item-${item}`).click();
          await page.getByTestId(`dnd-zone-${zone}`).click();
          if (item === 'b4') await check(page, `m2g2-forge-${k}-nearly-full`);
        }
        await expect(page.getByTestId(`m2g2-built-${k + 1}`)).toBeVisible();
        await check(page, `m2g2-built-${k}`);
        await page.getByTestId('m2g2-next-forge').click();
      }
      await page.getByTestId('fw-input').fill('Act as a patient tutor. I have a test on Friday and I am weak at fractions. Make a 3-day plan as a table, under 100 words.');
      await page.getByTestId('fw-send').click();
      await expect(page.getByTestId('fw-result')).toBeVisible({ timeout: 20_000 });
      await check(page, 'm2g2-freewrite-result');
    });

    test('m4g1: asked NOVA, checked, sources placed', async ({ page }) => {
      await openGame(page, 'm4g1');
      await page.getByTestId('brief-start').click();
      await page.getByTestId('m4g1-ask-nova').click();
      await page.getByTestId('m4g1-check-c1').click();
      await check(page, 'm4g1-asked');
      await page.getByTestId('dnd-zone-keep').click();
      await page.getByTestId('dnd-zone-cut').click();
      await page.getByTestId('dnd-zone-keep').click();
      await page.getByTestId('dnd-zone-cut').click();
      await check(page, 'm4g1-nearly-done');
    });

    test('m4g2: answers placed', async ({ page }) => {
      await openGame(page, 'm4g2');
      await page.getByTestId('brief-start').click();
      for (const z of ['trust', 'verify', 'verify', 'trust', 'verify']) await page.getByTestId(`dnd-zone-${z}`).click();
      await check(page, 'm4g2-nearly-done');
    });

    test('win screen with a mistake recap, then module complete', async ({ page }) => {
      await openGame(page, 'm4g3');
      await page.getByTestId('brief-start').click();
      await page.getByTestId('m4g3-ship').click();
      await page.getByTestId('power-button').click();
      await page.getByTestId('m4g3-ship').click();
      await expect(page.getByTestId('win-screen')).toBeVisible();
      await check(page, 'win-recap');
      await page.getByTestId('win-continue').click();
      await expect(page.getByTestId('complete-screen')).toBeVisible();
      await check(page, 'complete');
    });

    test('a long mistake on the fail screen', async ({ page }) => {
      await openGame(page, 'm4g1');
      await page.getByTestId('brief-start').click();
      await page.getByTestId('m4g1-ask-nova').click();
      await page.getByTestId('dnd-zone-cut').click();
      await page.getByTestId('deck-tab-c3').click();
      await page.getByTestId('dnd-zone-cut').click();
      await expect(page.getByTestId('fail-screen')).toBeVisible();
      await check(page, 'fail-recap');
    });

    test('m3g2: the ethics question', async ({ page }) => {
      await openGame(page, 'm3g2');
      await page.getByTestId('brief-start').click();
      for (const t of ['code', 'gpa', 'int']) await page.getByTestId(`toggle-${t}`).click();
      await check(page, 'm3g2-audit');
      await page.getByTestId('m3g2-audit').click();
      await expect(page.getByTestId('m3g2-decide')).toBeVisible();
      await check(page, 'm3g2-decide');
    });

    test('win and fail screens', async ({ page }) => {
      await openGame(page, 'm1g2');
      await page.getByTestId('brief-start').click();
      await page.getByTestId('pick-line-0').click();
      await page.getByTestId('pick-line-2').click();
      await page.getByTestId('pick-line-4').click();
      await expect(page.getByTestId('fail-screen')).toBeVisible();
      await check(page, 'fail');
      await page.getByTestId('fail-retry').click();
      await page.getByTestId('pick-line-0').click();
      for (const i of [1, 3, 5]) await page.getByTestId(`pick-line-${i}`).click();
      await expect(page.getByTestId('win-screen')).toBeVisible();
      await check(page, 'win');
    });

    // Home is the original long course page and scrolls by design, so it is not checked here.
    test('hero, settings', async ({ page }) => {
      await seed(page, ['m2h', 'm2s', 'm2g1', 'm2g2', 'm1h', 'm1s', 'm1g1', 'm1g2', 'm3h', 'm3s', 'm3g1', 'm3g2', 'm4h', 'm4s', 'm4g1', 'm4g2', 'm4g3']);
      await page.goto('./');
      await expect(page.getByTestId('home-greeting')).toBeVisible({ timeout: 20_000 });
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${viewport.width}x${viewport.height}-home.png`, fullPage: true });
      await page.getByTestId('topbar-settings').click();
      await expect(page.getByTestId('settings-screen')).toBeVisible();
      await check(page, 'settings');
      await page.goto('./module/2/hero');
      await expect(page.getByTestId('hero-screen')).toBeVisible();
      await check(page, 'hero');
    });

    test('storytime slides', async ({ page }) => {
      await seed(page, ['m2s', 'm2g1', 'm2g2']);
      await page.goto('./module/2/story');
      await expect(page.getByTestId('story-root')).toBeVisible({ timeout: 20_000 });
      for (let i = 0; i < 7; i++) {
        await check(page, `story-${i}`);
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('ArrowRight');
      }
    });

    test('welcome', async ({ page }) => {
      await page.goto('./');
      await expect(page.getByTestId('welcome-nickname-input')).toBeVisible({ timeout: 20_000 });
      await check(page, 'welcome');
    });
  });
}
