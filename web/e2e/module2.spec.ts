// Module 2 · Prompt Forge — E2E for m2g1 Tune the Sorter and m2g2 Prompt Forge (forges 1–2 +
// hand-off to FORGE 3 · FREE WRITE). Authored against spec/ui.md → Test IDs; runs at the
// Phase 1 gate (needs A1's Game Frame and E's free-write round).
//
// Each test is a fresh device seeded (once, before the app boots) with Module 1 finished and
// Module 2's hero + story done, so the deep link to the game is unlocked.
import type { Page } from '@playwright/test';
import { test, expect, waitForApp } from './helpers/fixtures';
import { dragTo, expectWin, sortByKeyboard, sortByTap } from './helpers/flows';

type Hero = 'scout' | 'chrono' | 'guard' | 'oracle';

async function seedModule2(page: Page, hero: Hero, extraSteps: string[] = []): Promise<void> {
  const now = new Date().toISOString();
  const steps: Record<string, true> = {};
  for (const s of ['m1h', 'm1s', 'm1g1', 'm1g2', 'm2h', 'm2s', ...extraSteps]) steps[s] = true;
  const state = {
    version: 1,
    profile: { nickname: 'TESTER', onboarded: true, createdAt: now },
    settings: { readableFont: false },
    xp: 0,
    streak: { current: 0, best: 0, lastPlayDay: null },
    steps,
    // Every seeded-done game carries stars too (a done game always has a star record).
    stars: { m1g1: 3, m1g2: 3, ...Object.fromEntries(extraSteps.filter((x) => /^m\dg\d$/.test(x)).map((x) => [x, 3])) },
    heroByModule: { 1: hero, 2: hero },
    lastHero: hero,
    heroesPlayed: {},
    powersUsed: {},
    badges: {},
    onceBonuses: {},
    promptHistory: [],
  };
  await page.addInitScript((s: string) => {
    if (!window.localStorage.getItem('glitch.v1.state')) window.localStorage.setItem('glitch.v1.state', s);
  }, JSON.stringify(state));
}

async function openGame(page: Page, id: 'm2g1' | 'm2g2'): Promise<void> {
  await page.goto(`./module/2/game/${id}`);
  await waitForApp(page);
  await expect(page.getByTestId('game-title')).toContainText(id === 'm2g1' ? 'Tune the Sorter' : 'Prompt Forge');
}

const hearts = (page: Page, n: number) => expect(page.getByTestId('hearts')).toHaveAttribute('aria-label', new RegExp(`^Hearts ${n} of 3`));

// v3 forge answers: [itemId, slotId] (decoys b0, b6, b7 in both forges).
const FORGE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['b1', 'task'],
  ['b2', 'ctx'],
  ['b3', 'role'],
  ['b4', 'fmt'],
  ['b5', 'lim'],
];

const STRONG_PROMPT =
  'Act as a friendly science teacher. Explain photosynthesis to my 10-year-old brother, who loves plants. Use 3 short bullet points. Keep it under 80 words.';

test.describe('m2g1 · Tune the Sorter', () => {
  test('keyboard-only sliders walk both rounds to LEVEL CLEAR with 3 stars', async ({ page }) => {
    await seedModule2(page, 'scout');
    await openGame(page, 'm2g1');
    await expect(page.getByTestId('m2g1-round-title')).toHaveText('ROUND 1 · EMERGENCY INBOX');
    await expect(page.getByTestId('slider-th-value')).toHaveText('50');
    await expect(page.getByTestId('slider-wc-value')).toHaveText('30');

    const th = page.getByTestId('slider-th');
    await th.focus();
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('slider-th-value')).toHaveText('55');
    await expect(th).toHaveAttribute('aria-valuenow', '55');
    await page.getByTestId('m2g1-lock').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('say-bubble')).toContainText('Round clear!');

    await expect(page.getByTestId('m2g1-round-title')).toHaveText('ROUND 2 · SPAM FOLDER');
    await expect(page.getByTestId('slider-th-value')).toHaveText('50'); // reset each round
    await th.focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('slider-th-value')).toHaveText('47');
    await page.getByTestId('m2g1-lock').click();
    await expectWin(page, 3);
    await expect(page.getByTestId('win-screen')).toContainText('A threshold is a trade-off.');
  });

  test('PageUp/PageDown/Home/End move the sliders; a bad lock costs a heart; win with 2 stars', async ({ page }) => {
    await seedModule2(page, 'scout');
    await openGame(page, 'm2g1');
    const th = page.getByTestId('slider-th');
    await th.focus();
    await page.keyboard.press('PageUp');
    await expect(page.getByTestId('slider-th-value')).toHaveText('60');
    await page.keyboard.press('End');
    await expect(page.getByTestId('slider-th-value')).toHaveText('100');
    await expect(page.getByTestId('metric-a')).toHaveAttribute('aria-label', /^EMERGENCIES MISSED 4, goal at most 0, not met/);
    await page.getByTestId('m2g1-lock').click();
    await expect(page.getByTestId('say-bubble')).toContainText('A real emergency was missed. Lower the threshold.');
    await hearts(page, 2);

    await th.focus();
    await page.keyboard.press('Home');
    await expect(page.getByTestId('slider-th-value')).toHaveText('0');
    for (let i = 0; i < 5; i++) await page.keyboard.press('PageUp');
    await expect(page.getByTestId('slider-th-value')).toHaveText('50');
    await page.getByTestId('slider-wc-dec').click();
    await expect(page.getByTestId('slider-wc-value')).toHaveText('29');
    await page.getByTestId('slider-wc-inc').click();
    await page.getByTestId('m2g1-lock').click();
    await expect(page.getByTestId('m2g1-round-title')).toHaveText('ROUND 2 · SPAM FOLDER');
    await page.getByTestId('m2g1-lock').click();
    await expectWin(page, 2);
  });

  test('X-RAY sets the sliders to the round solution', async ({ page }) => {
    await seedModule2(page, 'scout');
    await openGame(page, 'm2g1');
    await page.getByTestId('slider-th').focus();
    await page.keyboard.press('Home');
    await page.getByTestId('power-button').click();
    await expect(page.getByTestId('slider-th-value')).toHaveText('55');
    await expect(page.getByTestId('say-bubble')).toContainText('X-RAY: the sliders are set to a good answer. Lock it in.');
    await expect(page.getByTestId('power-button')).toHaveAttribute('aria-label', /1 use/);
  });
});

test.describe('m2g2 · Prompt Forge', () => {
  test('forge 1 by drag + tap, forge 2 by keyboard, then FREE WRITE → LEVEL CLEAR (2 stars, heart lost in forge 1)', async ({ page }) => {
    await seedModule2(page, 'guard', ['m2g1']);
    await openGame(page, 'm2g2');
    await expect(page.getByText('FORGE 1 · STUDY PLAN')).toBeVisible();

    // A decoy in a slot costs a heart.
    await page.getByTestId('dnd-item-b0').click();
    await page.getByTestId('dnd-zone-task').click();
    await expect(page.getByTestId('say-bubble')).toContainText('That block is too vague. Look for a specific one.');
    await hearts(page, 2);

    // One real pointer drag, then tap-to-select for the rest.
    await dragTo(page, 'b1', 'task');
    await expect(page.getByTestId('dnd-zone-task').getByTestId('dnd-item-b1')).toBeVisible();
    await sortByTap(page, FORGE_PAIRS.slice(1));
    await expect(page.getByText('PROMPT BUILT')).toBeVisible();
    await expect(page.getByTestId('m2g2-your-prompt')).toContainText(
      "Make a 3-day study plan for my Maths test. I have 3 hours a day and I'm weak at algebra. Act as a patient Maths tutor for a 14-year-old. Give it as a table: Day, Topic, Time. Keep it under 120 words.",
    );
    await expect(page.getByTestId('m2g2-nova-replies')).toContainText('DAY 1 · Algebra basics');

    await page.getByTestId('m2g2-next-forge').click();
    await expect(page.getByTestId('say-bubble')).toContainText('Another forge. Same levers.');
    await expect(page.getByText('FORGE 2 · EMAIL TO A TEACHER')).toBeVisible();
    await hearts(page, 2); // hearts carry across forges
    await sortByKeyboard(page, FORGE_PAIRS);
    await expect(page.getByText('PROMPT BUILT')).toBeVisible();
    await expect(page.getByTestId('m2g2-nova-replies')).toContainText('Subject: Extension request');

    await page.getByTestId('m2g2-next-forge').click();
    await expect(page.getByText('FORGE 3 · FREE WRITE')).toBeVisible();
    await expect(page.getByTestId('fw-goal')).toBeVisible();
    await page.getByTestId('fw-input').fill(STRONG_PROMPT);
    await page.getByTestId('fw-send').click();
    await expect(page.getByTestId('fw-finish')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('fw-finish').click();
    await expectWin(page, 2);
    await expect(page.getByTestId('win-screen')).toContainText('A strong prompt is specific');
  });

  test('Module 2 out of hearts: three decoys in three slots → OUT OF HEARTS; retry starts a fresh forge 1', async ({ page }) => {
    await seedModule2(page, 'scout', ['m2g1']);
    await openGame(page, 'm2g2');
    for (const [item, zone] of [['b0', 'task'], ['b6', 'fmt'], ['b7', 'lim']] as const) {
      await page.getByTestId(`dnd-item-${item}`).click();
      await page.getByTestId(`dnd-zone-${zone}`).click();
    }
    await expect(page.getByTestId('fail-screen')).toBeVisible();
    await expect(page.getByTestId('fail-screen')).toContainText('OUT OF HEARTS');
    await page.getByTestId('fail-retry').click();
    await expect(page.getByText('FORGE 1 · STUDY PLAN')).toBeVisible();
    await hearts(page, 3);
  });
});
