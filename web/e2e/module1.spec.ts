// Module 1 · Training Lab — Train the Model (m1g1) and Fact or Fib (m1g2), end to end.
// Covers: tap-to-select, a real pointer drag, a keyboard-only game, star counts, a hero
// power, and Out of hearts via three wrong moves (spec/capabilities/v3-games.md → Success).
import type { Page } from '@playwright/test';
import { test, expect } from './helpers/fixtures';
import { dragTo, expectWin, onboard, pickLines, skipStory, sortByKeyboard, sortByTap } from './helpers/flows';

type Pair = readonly [string, string];
const STEP1: readonly Pair[] = [['e1', 'spam'], ['e2', 'ok'], ['e3', 'spam'], ['e4', 'ok'], ['e5', 'spam'], ['e6', 'ok']];
const STEP2: readonly Pair[] = [['t1', 'wrong'], ['t2', 'right'], ['t3', 'right'], ['t4', 'wrong']];
const FIBS = [1, 3, 5] as const;

/** Fresh device → Module 1 hero select → (hero) → story skipped → Train the Model. */
async function startModule1(page: Page, hero: 'scout' | 'oracle' | 'chrono' | 'guard' = 'scout'): Promise<void> {
  await onboard(page);
  await page.getByTestId('home-quest-button').click();
  await page.getByTestId(`hero-card-${hero}`).click();
  await page.getByTestId('hero-enter').click();
  await skipStory(page);
  await expect(page.getByTestId('game-title')).toContainText('Train the Model');
  await expect(page.getByTestId('game-goal')).toContainText('SORT · DRAG THE EXAMPLES');
  await expect(page.getByTestId('dnd-item-e1')).toBeVisible();
}

async function expectStep2(page: Page): Promise<void> {
  await expect(page.getByText('STEP 2 · TEST ON NEW EMAILS')).toBeVisible();
  await expect(page.getByTestId('say-bubble')).toContainText('Labels done. The model learned the pattern.');
  await expect(page.getByTestId('dnd-item-t1')).toContainText('MODEL SAYS: SPAM');
}

async function expectResult(page: Page): Promise<void> {
  await expect(page.getByText('TRAINING VS TESTING')).toBeVisible();
  await expect(page.getByTestId('m1g1-result-train')).toContainText('6/6');
  await expect(page.getByTestId('m1g1-result-train')).toContainText('100% correct');
  await expect(page.getByTestId('m1g1-result-test')).toContainText('2/4');
  await expect(page.getByTestId('m1g1-result-test')).toContainText('50% correct');
}

/** Win Train the Model by tap-to-select, then continue to Fact or Fib. */
async function clearM1g1(page: Page): Promise<void> {
  await sortByTap(page, STEP1);
  await expectStep2(page);
  await sortByTap(page, STEP2);
  await expectResult(page);
  await page.getByTestId('m1g1-finish').click();
  await expectWin(page, 3);
  await page.getByTestId('win-continue').click();
  await expect(page.getByTestId('game-title')).toContainText('Fact or Fib');
}

test.describe('Module 1 games', () => {
  test('Train the Model by tap-to-select reaches LEVEL CLEAR with 3 stars, then Fact or Fib with 3 stars', async ({ page }) => {
    await startModule1(page);
    await sortByTap(page, STEP1);
    await expectStep2(page);
    await sortByTap(page, STEP2);
    await expectResult(page);
    await page.getByTestId('m1g1-finish').click();
    await expectWin(page, 3);
    await expect(page.getByTestId('win-screen')).toContainText('LEVEL CLEAR');
    await expect(page.getByTestId('win-screen')).toContainText('A model must generalize');
    await expect(page.getByTestId('win-xp-tag')).toBeVisible();
    await expect(page.getByTestId('win-flawless-tag')).toBeVisible();

    await page.getByTestId('win-continue').click();
    await expect(page.getByTestId('game-title')).toContainText('Fact or Fib');
    await expect(page.getByText('NOVA · DRAFT ESSAY')).toBeVisible();
    await expect(page.getByTestId('pick-found')).toHaveText('FIBS FOUND: 0/3');
    await pickLines(page, [FIBS[0]]);
    await expect(page.getByTestId('pick-line-1')).toContainText('FIB');
    await expect(page.getByTestId('say-bubble')).toContainText('Fib caught! Memorizing is not generalizing.');
    await pickLines(page, FIBS.slice(1));
    await expect(page.getByTestId('pick-found')).toHaveText('FIBS FOUND: 3/3');
    await expectWin(page, 3);
    await expect(page.getByTestId('win-screen')).toContainText('memorizing training data is not the same as generalizing');
  });

  test('Train the Model by real pointer drag', async ({ page }) => {
    await startModule1(page);
    for (const [item, zone] of STEP1) {
      await dragTo(page, item, zone);
      await expect(page.getByTestId(`dnd-zone-${zone}`).getByTestId(`dnd-item-${item}`)).toBeVisible();
    }
    await expectStep2(page);
    for (const [item, zone] of STEP2) {
      await dragTo(page, item, zone);
      await expect(page.getByTestId(`dnd-zone-${zone}`).getByTestId(`dnd-item-${item}`)).toBeVisible();
    }
    await expectResult(page);
    await page.getByTestId('m1g1-finish').click();
    await expectWin(page, 3);
  });

  test('Train the Model keyboard-only (Tab/Enter), with a wrong drop → 2 stars', async ({ page }) => {
    await startModule1(page);
    // One wrong keyboard drop first: costs a heart with the v3 message.
    await sortByKeyboard(page, [['e1', 'ok']]);
    await expect(page.getByTestId('say-bubble')).toContainText('Look at the features: shouting, prizes, passwords. Those go with SPAM.');
    await expect(page.getByTestId('hearts')).toHaveAttribute('aria-label', /Hearts 2 of 3/);
    await sortByKeyboard(page, STEP1);
    await expectStep2(page);
    await sortByKeyboard(page, STEP2);
    await expectResult(page);
    await page.getByTestId('m1g1-finish').focus();
    await page.keyboard.press('Enter');
    await expectWin(page, 2);
  });

  test('Train the Model: three wrong moves → Out of hearts, Try again starts a fresh session', async ({ page }) => {
    await startModule1(page);
    await page.getByTestId('dnd-item-e1').click();
    await page.getByTestId('dnd-zone-ok').click();
    await page.getByTestId('dnd-item-e2').click();
    await page.getByTestId('dnd-zone-spam').click();
    await expect(page.getByTestId('hearts')).toHaveAttribute('aria-label', /Hearts 1 of 3/);
    await page.getByTestId('dnd-item-e3').click();
    await page.getByTestId('dnd-zone-ok').click();
    await expect(page.getByTestId('fail-screen')).toBeVisible();
    await expect(page.getByTestId('fail-screen')).toContainText('OUT OF HEARTS');
    await page.getByTestId('fail-retry').click();
    await expect(page.getByTestId('hearts')).toHaveAttribute('aria-label', /Hearts 3 of 3/);
    await expect(page.getByTestId('dnd-pool').getByTestId('dnd-item-e1')).toBeVisible();
    await expect(page.getByText('STEP 1 · LABEL THE TRAINING DATA')).toBeVisible();
  });

  test('Fact or Fib: a true line costs a heart → LEVEL CLEAR with 2 stars', async ({ page }) => {
    await startModule1(page);
    await clearM1g1(page);
    await pickLines(page, [0]);
    await expect(page.getByTestId('pick-line-0')).toContainText('TRUE');
    await expect(page.getByTestId('say-bubble')).toContainText('That one is actually true. Look for something that sounds too sure.');
    await expect(page.getByTestId('hearts')).toHaveAttribute('aria-label', /Hearts 2 of 3/);
    await pickLines(page, FIBS);
    await expectWin(page, 2);
  });

  test('Fact or Fib: three true lines → Out of hearts', async ({ page }) => {
    await startModule1(page);
    await clearM1g1(page);
    await pickLines(page, [0, 2, 4]);
    await expect(page.getByTestId('fail-screen')).toBeVisible();
  });

  test('Fact or Fib keyboard-only with X-RAY (SCOUT) catching a fib', async ({ page }) => {
    await startModule1(page, 'scout');
    await clearM1g1(page);
    await expect(page.getByTestId('power-button')).toHaveAttribute('aria-label', /X-RAY power, 2 uses left/);
    await page.getByTestId('power-button').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('pick-line-1')).toContainText('FIB');
    await expect(page.getByTestId('power-button')).toHaveAttribute('aria-label', /X-RAY power, 1 uses? left/);
    for (const i of [3, 5]) {
      await page.getByTestId(`pick-line-${i}`).focus();
      await page.keyboard.press('Enter');
    }
    await expectWin(page, 3);
  });

  test('Train the Model with SHIELD (GUARDIAN): the blocked mistake keeps 3 stars', async ({ page }) => {
    await startModule1(page, 'guard');
    await page.getByTestId('power-button').click();
    await expect(page.getByTestId('shield-indicator')).toBeVisible();
    await page.getByTestId('dnd-item-e1').click();
    await page.getByTestId('dnd-zone-ok').click();
    await expect(page.getByTestId('say-bubble')).toContainText('SHIELDED! Look at the features');
    await expect(page.getByTestId('hearts')).toHaveAttribute('aria-label', /Hearts 3 of 3/);
    await sortByTap(page, STEP1);
    await expectStep2(page);
    await sortByTap(page, STEP2);
    await page.getByTestId('m1g1-finish').click();
    await expectWin(page, 3);
  });
});
