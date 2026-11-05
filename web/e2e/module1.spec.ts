// Training Lab (course Module 2) — Train the Model (m1g1) and Fact or Glitch (m1g2), end to end.
// Covers: calling emails by tap, sideways pointer drags, a keyboard-only game, verifying beside
// each email, star counts, hero powers, the heartbreak, and Out of hearts.
import type { Page } from '@playwright/test';
import { test, expect } from './helpers/fixtures';
import { FIRST_MODULE_STEPS, M1G1_ROUND1, M1G1_ROUND2, callByTap, expectWin, pickLines, playTrainTheModel, quickDragTo, seedSteps, skipStory } from './helpers/flows';

const GLITCHES = [1, 3, 5] as const;
const ROUND1_HEAD = 'ROUND 1 · TRAIN IT: MAKE YOUR CALLS';
const ROUND2_HEAD = 'ROUND 2 · TEST IT: NEW EMAILS';
const ROUND1_WRONG = 'Look at the features: shouting, prizes, passwords. Those go with SPAM.';

const hearts = (page: Page, n: number) => expect(page.getByTestId('hearts')).toHaveAttribute('aria-label', new RegExp(`^Hearts ${n} of 3`));

/** Prompt Forge finished → Home's quest opens the Training Lab → hero → story skipped → Train the Model. */
async function startTrainingLab(page: Page, hero: 'scout' | 'oracle' | 'chrono' | 'guard' = 'scout'): Promise<void> {
  await seedSteps(page, FIRST_MODULE_STEPS, 'scout', { heroByModule: { 2: 'scout' } });
  await page.goto('./');
  await page.getByTestId('home-quest-button').click();
  await page.getByTestId(`hero-card-${hero}`).click();
  await page.getByTestId('hero-enter').click();
  await skipStory(page);
  await expect(page.getByTestId('game-title')).toContainText('Train the Model');
  await expect(page.getByTestId('game-goal')).toContainText('Call every email SPAM or NOT SPAM, then verify your calls');
  await expect(page.getByTestId('dnd-item-e1')).toBeVisible();
}

async function expectResult(page: Page): Promise<void> {
  await expect(page.getByText('TRAINING VS TESTING')).toBeVisible();
  await expect(page.getByTestId('m1g1-result-train')).toContainText('6/6');
  await expect(page.getByTestId('m1g1-result-train')).toContainText('100% correct');
  await expect(page.getByTestId('m1g1-result-test')).toContainText('2/4');
  await expect(page.getByTestId('m1g1-result-test')).toContainText('50% correct');
}

/** Win Train the Model by tap-to-select, then continue to Fact or Glitch. */
async function clearM1g1(page: Page): Promise<void> {
  await playTrainTheModel(page);
  await expectResult(page);
  await page.getByTestId('m1g1-finish').click();
  await expectWin(page, 3);
  await page.getByTestId('win-continue').click();
  await expect(page.getByTestId('game-title')).toContainText('Fact or Glitch');
}

/** Drag straight sideways from the email's row into a bin at the same height. */
async function dragSideways(page: Page, item: string, zone: string): Promise<void> {
  const a = (await page.getByTestId(`dnd-item-${item}`).boundingBox())!;
  const b = (await page.getByTestId(`dnd-zone-${zone}`).boundingBox())!;
  const y = a.y + a.height / 2;
  expect(y, 'the bin must span the row, so the drag can stay horizontal').toBeGreaterThan(b.y);
  expect(y).toBeLessThan(b.y + b.height);
  await page.mouse.move(a.x + a.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, y, { steps: 12 });
  await page.mouse.up();
}

test.describe('Train the Model', () => {
  test('emails sit one per line to the right of the bins', async ({ page }) => {
    await startTrainingLab(page);
    const bin = (await page.getByTestId('dnd-zone-spam').boundingBox())!;
    const rows = await Promise.all(M1G1_ROUND1.map(([id]) => page.getByTestId(`dnd-item-${id}`).boundingBox()));
    for (const [i, r] of rows.entries()) {
      expect(r!.x, 'email is right of the bins').toBeGreaterThanOrEqual(bin.x + bin.width);
      if (i > 0) expect(r!.y, 'one line after the other').toBeGreaterThanOrEqual(rows[i - 1]!.y + rows[i - 1]!.height);
    }
  });

  test('tap every call, verify beside each email, round 2 reveals the model → 3 stars, then Fact or Glitch with 3 stars', async ({ page }) => {
    await startTrainingLab(page);
    await expect(page.getByText(ROUND1_HEAD)).toBeVisible();
    await expect(page.getByTestId('m1g1-verify')).toHaveAttribute('aria-disabled', 'true');
    await callByTap(page, M1G1_ROUND1);
    await expect(page.getByTestId('m1g1-called')).toContainText('6/6 CALLED');
    await page.getByTestId('m1g1-verify').click();
    await expect(page.getByTestId('say-bubble')).toContainText('All correct. Nice calls!');
    await expect(page.getByTestId('m1g1-verify-e1')).toContainText("✓ IT'S SPAM");
    await expect(page.getByTestId('m1g1-verify-e2')).toContainText("✓ IT'S NOT SPAM");
    await page.getByTestId('m1g1-next').click();

    await expect(page.getByText(ROUND2_HEAD)).toBeVisible();
    await expect(page.getByTestId('say-bubble')).toContainText('Your labels trained the model. Now test it.');
    await callByTap(page, M1G1_ROUND2);
    await page.getByTestId('m1g1-verify').click();
    await expect(page.getByTestId('m1g1-model-t1')).toHaveText('MODEL: SPAM ✗');
    await expect(page.getByTestId('m1g1-model-t2')).toHaveText('MODEL: SPAM ✓');
    await page.getByTestId('m1g1-next').click();
    await expectResult(page);
    await page.getByTestId('m1g1-finish').click();
    await expectWin(page, 3);
    await expect(page.getByTestId('win-screen')).toContainText('LEVEL CLEAR');
    await expect(page.getByTestId('win-screen')).toContainText('A model must generalize');
    await expect(page.getByTestId('win-xp-tag')).toBeVisible();
    await expect(page.getByTestId('win-flawless-tag')).toBeVisible();

    await page.getByTestId('win-continue').click();
    await expect(page.getByTestId('game-title')).toContainText('Fact or Glitch');
    await expect(page.getByText('NOVA · DRAFT ESSAY')).toBeVisible();
    await expect(page.getByTestId('pick-found')).toHaveText('GLITCHES FOUND: 0/3');
    await pickLines(page, [GLITCHES[0]]);
    await expect(page.getByTestId('pick-line-1')).toContainText('GLITCH');
    await expect(page.getByTestId('say-bubble')).toContainText('Glitch caught! Memorizing is not generalizing.');
    await pickLines(page, GLITCHES.slice(1));
    await expect(page.getByTestId('pick-found')).toHaveText('GLITCHES FOUND: 3/3');
    await expectWin(page, 3);
    await expect(page.getByTestId('win-screen')).toContainText('memorizing training data is not the same as generalizing');
  });

  test('a real pointer drag straight sideways calls the email; a second drag changes the call', async ({ page }) => {
    await startTrainingLab(page);
    await dragSideways(page, 'e1', 'spam');
    await expect(page.getByTestId('m1g1-call-e1')).toHaveText('SPAM?');
    await expect(page.getByTestId('m1g1-count-spam')).toHaveText('1');
    await dragSideways(page, 'e6', 'ok');
    await expect(page.getByTestId('m1g1-call-e6')).toHaveText('NOT SPAM?');
    await expect(page.getByTestId('m1g1-count-ok')).toHaveText('1');
    // The email stays in its line, and a call can change until VERIFY.
    await quickDragTo(page, 'e1', 'ok', 8);
    await expect(page.getByTestId('m1g1-call-e1')).toHaveText('NOT SPAM?');
    await expect(page.getByTestId('m1g1-count-spam')).toHaveText('0');
    await expect(page.getByTestId('m1g1-count-ok')).toHaveText('2');
  });

  test('quick flicks work (the first move already leaves the row)', async ({ page }) => {
    await startTrainingLab(page);
    for (const [item, zone] of M1G1_ROUND1) {
      await quickDragTo(page, item, zone);
      await expect(page.getByTestId(`m1g1-call-${item}`)).toHaveText(zone === 'spam' ? 'SPAM?' : 'NOT SPAM?');
    }
    await page.getByTestId('m1g1-verify').click();
    await expect(page.getByTestId('say-bubble')).toContainText('All correct. Nice calls!');
  });

  test('a drag dropped on empty space makes no call and selects nothing', async ({ page }) => {
    await startTrainingLab(page);
    const item = page.getByTestId('dnd-item-e1');
    const a = (await item.boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2 + 30, a.y + a.height / 2 + 20, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByTestId('m1g1-call-e1')).toHaveCount(0);
    await expect(item).not.toHaveAttribute('aria-selected', 'true');
  });

  test('keyboard-only (Tab/Enter), with one wrong call → 2 stars', async ({ page }) => {
    await startTrainingLab(page);
    const call = async (pairs: ReadonlyArray<readonly [string, string]>): Promise<void> => {
      for (const [item, zone] of pairs) {
        await page.getByTestId(`dnd-item-${item}`).focus();
        await page.keyboard.press('Enter');
        await page.getByTestId(`dnd-zone-${zone}`).focus();
        await page.keyboard.press('Enter');
      }
    };
    const press = async (id: string): Promise<void> => {
      await page.getByTestId(id).focus();
      await page.keyboard.press('Enter');
    };
    await call([['e1', 'ok'], ...M1G1_ROUND1.slice(1)]);
    await press('m1g1-verify');
    await expect(page.getByTestId('say-bubble')).toContainText(ROUND1_WRONG);
    await expect(page.getByTestId('m1g1-verify-e1')).toContainText("✗ IT'S SPAM");
    await hearts(page, 2);
    await press('m1g1-next');
    await expect(page.getByText(ROUND2_HEAD)).toBeVisible();
    await call(M1G1_ROUND2);
    await press('m1g1-verify');
    await press('m1g1-next');
    await expectResult(page);
    await press('m1g1-finish');
    await expectWin(page, 2);
  });

  test('three wrong calls → Out of hearts; Try again starts a fresh session with no calls', async ({ page }) => {
    await startTrainingLab(page);
    await callByTap(page, [['e1', 'ok'], ['e2', 'spam'], ['e3', 'ok'], ['e4', 'ok'], ['e5', 'spam'], ['e6', 'ok']]);
    await page.getByTestId('m1g1-verify').click();
    await expect(page.getByTestId('fail-screen')).toBeVisible();
    await expect(page.getByTestId('fail-screen')).toContainText('OUT OF HEARTS');
    await page.getByTestId('fail-retry').click();
    await hearts(page, 3);
    await expect(page.getByText(ROUND1_HEAD)).toBeVisible();
    await expect(page.getByTestId('dnd-item-e1')).toBeVisible();
    await expect(page.getByTestId('m1g1-call-e1')).toHaveCount(0);
  });

  test('SHIELD (GUARDIAN): the blocked mistake keeps 3 stars and breaks no heart', async ({ page }) => {
    await startTrainingLab(page, 'guard');
    await page.getByTestId('power-button').click();
    await expect(page.getByTestId('shield-indicator')).toBeVisible();
    await callByTap(page, [['e1', 'ok'], ...M1G1_ROUND1.slice(1)]);
    await page.getByTestId('m1g1-verify').click();
    await expect(page.getByTestId('say-bubble')).toContainText('SHIELDED! Look at the features');
    await hearts(page, 3);
    await expect(page.getByTestId('heartbreak')).toHaveCount(0);
    await page.getByTestId('m1g1-next').click();
    await callByTap(page, M1G1_ROUND2);
    await page.getByTestId('m1g1-verify').click();
    await page.getByTestId('m1g1-next').click();
    await page.getByTestId('m1g1-finish').click();
    await expectWin(page, 3);
  });

  test('X-RAY (SCOUT) makes the next right call and uses one power', async ({ page }) => {
    await startTrainingLab(page, 'scout');
    await page.getByTestId('power-button').click();
    await expect(page.getByTestId('m1g1-call-e1')).toHaveText('SPAM?');
    await expect(page.getByTestId('say-bubble')).toContainText('X-RAY: that one is SPAM.');
    await expect(page.getByTestId('power-button')).toHaveAttribute('aria-label', /X-RAY power, 1 use left/);
  });
});

test.describe('Fact or Glitch', () => {
  test('a true line breaks a heart, with the heartbreak animation → LEVEL CLEAR with 2 stars', async ({ page }) => {
    await startTrainingLab(page);
    await clearM1g1(page);
    await pickLines(page, [0]);
    await expect(page.getByTestId('heartbreak')).toBeVisible();
    await expect(page.getByTestId('pick-line-0')).toContainText('TRUE');
    await expect(page.getByTestId('say-bubble')).toContainText('That one is actually true. Look for something that sounds too sure.');
    await hearts(page, 2);
    await expect(page.getByTestId('heartbreak')).toHaveCount(0);
    await pickLines(page, GLITCHES);
    await expectWin(page, 2);
  });

  test('three true lines → Out of hearts', async ({ page }) => {
    await startTrainingLab(page);
    await clearM1g1(page);
    await pickLines(page, [0, 2, 4]);
    await expect(page.getByTestId('fail-screen')).toBeVisible();
  });

  test('keyboard-only with X-RAY (SCOUT) catching a glitch', async ({ page }) => {
    await startTrainingLab(page, 'scout');
    await clearM1g1(page);
    await expect(page.getByTestId('power-button')).toHaveAttribute('aria-label', /X-RAY power, 2 uses left/);
    await page.getByTestId('power-button').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('pick-line-1')).toContainText('GLITCH');
    await expect(page.getByTestId('power-button')).toHaveAttribute('aria-label', /X-RAY power, 1 uses? left/);
    for (const i of [3, 5]) {
      await page.getByTestId(`pick-line-${i}`).focus();
      await page.keyboard.press('Enter');
    }
    await expectWin(page, 3);
  });
});
