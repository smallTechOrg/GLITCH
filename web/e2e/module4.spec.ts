// Module 4 · The Newsroom E2E (slice C2): Source Detective, Confidence Court and Design the
// Companion walked to LEVEL CLEAR with the expected star count, one Out-of-hearts run per
// game, a keyboard-only game, hero powers, and the full Module 4 run → COURSE COMPLETE →
// Graduate badge. Runs at the Phase 1 gate. Each test is a fresh browser context (= fresh
// device), seeded with Modules 1–3 finished, the Module 4 hero chosen + story seen, and every
// earlier Module 4 game done (a step is startable only when all earlier steps are done).
import type { Page } from '@playwright/test';
import { STATE_STORAGE_KEY } from '../src/contracts/state';
import type { HeroId } from '../src/contracts/ids';
import { test, expect, waitForApp } from './helpers/fixtures';
import { expectWin, quickDragTo, sortByKeyboard, sortByTap } from './helpers/flows';

type Pair = readonly [string, string];
const M4G1: readonly Pair[] = [['c1', 'keep'], ['c2', 'cut'], ['c3', 'keep'], ['c4', 'cut'], ['c5', 'keep']];
const M4G2: readonly Pair[] = [['a1', 'trust'], ['a2', 'verify'], ['a3', 'verify'], ['a4', 'trust'], ['a5', 'verify'], ['a6', 'trust']];
const TOGGLES = ['R', 'H', 'A'] as const;

const DONE_1_TO_3 = {
  m1h: true, m1s: true, m1g1: true, m1g2: true,
  m2h: true, m2s: true, m2g1: true, m2g2: true,
  m3h: true, m3s: true, m3g1: true, m3g2: true,
};

type Module4Game = 'm4g1' | 'm4g2' | 'm4g3';

/** Earlier Module 4 games that must be done before `game` is startable (course-shell: step gating). */
const EARLIER_M4: Record<Module4Game, readonly Module4Game[]> = { m4g1: [], m4g2: ['m4g1'], m4g3: ['m4g1', 'm4g2'] };

/**
 * Seed a device that has finished Modules 1–3 and entered Module 4 (once per context).
 * A step is startable only when every earlier step is done, so opening m4g2 also marks m4g1
 * done (with stars), and m4g3 marks m4g1 + m4g2 done.
 */
async function seedModule4(page: Page, game: Module4Game, hero: HeroId = 'scout'): Promise<void> {
  const now = new Date().toISOString();
  const earlier = EARLIER_M4[game];
  const extraSteps = Object.fromEntries(earlier.map((g) => [g, true] as const));
  const extraStars = Object.fromEntries(earlier.map((g) => [g, 3] as const));
  const state = {
    version: 1,
    profile: { nickname: 'E2E', onboarded: true, createdAt: now },
    settings: { readableFont: false },
    xp: 0,
    streak: { current: 0, best: 0, lastPlayDay: null },
    steps: { ...DONE_1_TO_3, m4h: true, m4s: true, ...extraSteps },
    stars: { m1g1: 3, m1g2: 3, m2g1: 3, m2g2: 3, m3g1: 3, m3g2: 3, ...extraStars },
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

async function openGame(page: Page, game: Module4Game, hero: HeroId = 'scout'): Promise<void> {
  await seedModule4(page, game, hero);
  await page.goto(`./module/4/game/${game}`);
  await waitForApp(page);
  await expect(page.getByTestId('game-body')).toBeVisible();
}

/** Hand-balance the companion: PageDown ×5 on both sliders (80 → 30), all safeguards on. */
async function balanceCompanion(page: Page): Promise<void> {
  for (const id of ['en', 'da']) {
    await page.getByTestId(`slider-${id}`).focus();
    for (let k = 0; k < 5; k++) await page.keyboard.press('PageDown');
    await expect(page.getByTestId(`slider-${id}-value`)).toHaveText('30');
  }
  for (const id of TOGGLES) await page.getByTestId(`toggle-${id}`).click();
}

test.describe('m4g1 · Source Detective', () => {
  test('tap-to-select KEEP / CUT reaches LEVEL CLEAR with 3 stars and +30 XP', async ({ page }) => {
    await openGame(page, 'm4g1');
    await expect(page.getByTestId('game-title')).toContainText('Source Detective');
    await expect(page.getByTestId('m4g1-lookups')).toHaveAttribute('aria-label', 'Catalogue lookups left: 3');
    await sortByTap(page, M4G1);
    await expectWin(page, 3);
    await expect(page.getByTestId('win-screen')).toContainText('A source is only real if you verify it outside the AI.');
    await expect(page.getByTestId('win-xp-tag')).toBeVisible();
  });

  test('CHECK reveals FOUND / NOT FOUND; the 4th lookup says "No lookups left" at no heart cost', async ({ page }) => {
    await openGame(page, 'm4g1');
    await page.getByTestId('m4g1-check-c1').click();
    await expect(page.getByTestId('say-bubble')).toContainText('Found in the catalogue.');
    await page.getByTestId('m4g1-check-c2').click();
    await expect(page.getByTestId('say-bubble')).toContainText('Not in any catalogue. Invented!');
    await page.getByTestId('m4g1-check-c3').click();
    await expect(page.getByTestId('m4g1-lookups')).toHaveAttribute('aria-label', 'Catalogue lookups left: 0');
    await page.getByTestId('m4g1-check-c4').click();
    await expect(page.getByTestId('say-bubble')).toContainText('No lookups left. Use the clues instead.');
    await expect(page.getByTestId('hearts')).toHaveAttribute('aria-label', /Hearts 3 of 3/);
  });

  test('a CHECK press released off the button does not block dragging afterwards', async ({ page }) => {
    await openGame(page, 'm4g1');
    const check = page.getByTestId('m4g1-check-c2');
    await check.scrollIntoViewIfNeeded();
    const c = (await check.boundingBox())!;
    await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
    await page.mouse.down();
    await page.mouse.move(c.x + c.width + 40, c.y + c.height + 30, { steps: 5 });
    await page.mouse.up();
    await quickDragTo(page, 'c1', 'keep', 8);
    await expect(page.getByTestId('dnd-zone-keep').getByTestId('dnd-item-c1')).toBeVisible();
  });

  test('Ask NOVA costs exactly one heart, disables itself, and the win has 2 stars', async ({ page }) => {
    await openGame(page, 'm4g1');
    await page.getByTestId('m4g1-ask-nova').click();
    await expect(page.getByText('Yes! All 5 are real and verified. I am 100% confident.')).toBeVisible();
    await expect(page.getByTestId('say-bubble')).toContainText('Asking the same AI is not verification.');
    await expect(page.getByTestId('hearts')).toHaveAttribute('aria-label', /Hearts 2 of 3/);
    await expect(page.getByTestId('m4g1-ask-nova')).toBeDisabled();
    await sortByTap(page, M4G1);
    await expectWin(page, 2);
  });

  test('SHIELD (GUARDIAN) blocks the Ask NOVA heart', async ({ page }) => {
    await openGame(page, 'm4g1', 'guard');
    await page.getByTestId('power-button').click();
    await expect(page.getByTestId('shield-indicator')).toBeVisible();
    await page.getByTestId('m4g1-ask-nova').click();
    await expect(page.getByTestId('say-bubble')).toContainText('SHIELDED!');
    await expect(page.getByTestId('hearts')).toHaveAttribute('aria-label', /Hearts 3 of 3/);
  });

  test('three wrong drops run out of hearts', async ({ page }) => {
    await openGame(page, 'm4g1');
    for (const [item, zone] of [['c2', 'keep'], ['c4', 'keep'], ['c1', 'cut']] as const) {
      await page.getByTestId(`dnd-item-${item}`).click();
      await page.getByTestId(`dnd-zone-${zone}`).click();
    }
    await expect(page.getByTestId('fail-screen')).toBeVisible();
    await expect(page.getByTestId('fail-screen')).toContainText('OUT OF HEARTS');
  });
});

test.describe('m4g2 · Confidence Court', () => {
  test('keyboard only: TRUST / VERIFY by evidence reaches LEVEL CLEAR with 3 stars', async ({ page }) => {
    await openGame(page, 'm4g2');
    await expect(page.getByTestId('game-title')).toContainText('Confidence Court');
    await expect(page.getByTestId('dnd-item-a6')).toContainText('CONFIDENCE 76%');
    await sortByKeyboard(page, M4G2);
    await expectWin(page, 3);
    await expect(page.getByTestId('win-screen')).toContainText('Confidence is how strongly a pattern fits, not proof.');
  });

  test('trusting the confident medicine answer costs a heart; the win has 2 stars', async ({ page }) => {
    await openGame(page, 'm4g2');
    await page.getByTestId('dnd-item-a5').click();
    await page.getByTestId('dnd-zone-trust').click();
    await expect(page.getByTestId('say-bubble')).toContainText('Read the evidence, not the confidence number.');
    await sortByTap(page, M4G2);
    await expectWin(page, 2);
  });

  test('three wrong verdicts run out of hearts', async ({ page }) => {
    await openGame(page, 'm4g2');
    for (const [item, zone] of [['a1', 'verify'], ['a2', 'trust'], ['a6', 'verify']] as const) {
      await page.getByTestId(`dnd-item-${item}`).click();
      await page.getByTestId(`dnd-zone-${zone}`).click();
    }
    await expect(page.getByTestId('fail-screen')).toBeVisible();
  });
});

test.describe('m4g3 · Design the Companion', () => {
  test('keyboard sliders + safeguards → SHIP IT → LEVEL CLEAR with 3 stars', async ({ page }) => {
    await openGame(page, 'm4g3');
    await expect(page.getByTestId('game-title')).toContainText('Design the Companion');
    await expect(page.getByTestId('metric-k2')).toHaveAttribute('aria-label', 'WELLBEING 23%, goal ≥65, not met');
    await balanceCompanion(page);
    await expect(page.getByTestId('metric-k2')).toHaveAttribute('aria-label', 'WELLBEING 86%, goal ≥65, met');
    await expect(page.getByTestId('metric-k4')).toHaveAttribute('aria-label', 'PRIVACY RISK 19%, goal ≤35, met');
    await page.getByTestId('m4g3-ship').click();
    await expect(page.getByTestId('say-bubble')).toContainText('Shipped. You balanced every trade-off.');
    await expectWin(page, 3);
    await expect(page.getByTestId('win-screen')).toContainText('Optimizing one number, like engagement');
  });

  test('shipping the start design costs a heart: "Not yet: wellbeing is too low."', async ({ page }) => {
    await openGame(page, 'm4g3');
    await page.getByTestId('m4g3-ship').click();
    await expect(page.getByTestId('say-bubble')).toContainText('Not yet: wellbeing is too low.');
    await expect(page.getByTestId('hearts')).toHaveAttribute('aria-label', /Hearts 2 of 3/);
  });

  test('three failed ships run out of hearts', async ({ page }) => {
    await openGame(page, 'm4g3');
    for (let k = 0; k < 3; k++) await page.getByTestId('m4g3-ship').click();
    await expect(page.getByTestId('fail-screen')).toBeVisible();
  });

  test('X-RAY (SCOUT) sets the balanced design and it ships', async ({ page }) => {
    await openGame(page, 'm4g3', 'scout');
    await page.getByTestId('power-button').click();
    await expect(page.getByTestId('say-bubble')).toContainText('X-RAY: here is a balanced design. Ship it.');
    await expect(page.getByTestId('slider-en-value')).toHaveText('30');
    for (const id of TOGGLES) await expect(page.getByTestId(`toggle-${id}`)).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('m4g3-ship').click();
    await expectWin(page, 3);
  });
});

test.describe('Module 4 → COURSE COMPLETE', () => {
  test('all three games in a row → COURSE COMPLETE! → Home shows COURSE COMPLETE and the Graduate badge', async ({ page }) => {
    await openGame(page, 'm4g1');
    await sortByTap(page, M4G1);
    await expectWin(page, 3);
    await page.getByTestId('win-continue').click();

    await expect(page.getByTestId('game-title')).toContainText('Confidence Court');
    await sortByTap(page, M4G2);
    await expectWin(page, 3);
    await page.getByTestId('win-continue').click();

    await expect(page.getByTestId('game-title')).toContainText('Design the Companion');
    await balanceCompanion(page);
    await page.getByTestId('m4g3-ship').click();
    await expectWin(page, 3);
    await page.getByTestId('win-continue').click();

    await expect(page.getByTestId('complete-screen')).toBeVisible();
    await expect(page.getByTestId('complete-screen')).toContainText('COURSE COMPLETE!');
    await expect(page.getByTestId('complete-screen')).toContainText('YOU FINISHED GLITCH');
    await expect(page.getByTestId('complete-xp-tag')).toBeVisible();
    await expect(page.getByTestId('complete-next')).toHaveCount(0);

    await page.getByTestId('complete-home').click();
    await expect(page.getByTestId('home-quest')).toContainText('COURSE COMPLETE');
    await expect(page.getByTestId('module-status-4')).toContainText('5/5 STEPS');
    await expect(page.getByTestId('badge-grad')).toHaveAttribute('aria-label', 'Graduate, unlocked');
  });
});
