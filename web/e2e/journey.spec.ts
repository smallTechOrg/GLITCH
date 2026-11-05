// The whole course on ONE fresh device, no seeding, in course order: nickname → Prompt Forge →
// Training Lab → Neon City → The Newsroom → COURSE COMPLETE + Graduate badge. Prompt Forge's
// FREE WRITE round is played for real against the backend: a weak prompt costs a heart, a
// network failure shows the OFFLINE banner and scores with the offline check, a strong prompt
// passes, and AI energy falls only on successful evaluations.
//
// GLITCH_E2E_EXPECT_PROVIDER=fake asserts the demo provider's exact verdict; =openrouter
// asserts structure (n/5, DEMO tag absent) — "plants" must still fail and the 5/5 fixture pass.
import type { Page } from '@playwright/test';
import type { HeroId } from '../src/contracts/ids';
import { STATE_STORAGE_KEY } from '../src/contracts/state';
import { test, expect, waitForApp, EXPECTED_PROVIDER } from './helpers/fixtures';
import { expectWin, onboard, pickLines, playTrainTheModel, setSlider, skipStory, sortByKeyboard, sortByTap } from './helpers/flows';

const FAKE = EXPECTED_PROVIDER === 'fake';
const NICK = 'ADA';
const AI_WAIT = { timeout: 15_000 };
const STRONG =
  'Act as a friendly science teacher. Explain photosynthesis to my 10-year-old brother, who loves plants. Use 3 short bullet points. Keep it under 80 words.';
const WEAK = 'plants';

type Pair = readonly [string, string];
const FORGE: readonly Pair[] = [['b1', 'task'], ['b2', 'ctx'], ['b3', 'role'], ['b4', 'fmt'], ['b5', 'lim']];
const M4G1: readonly Pair[] = [['c1', 'keep'], ['c2', 'cut'], ['c3', 'keep'], ['c4', 'cut'], ['c5', 'keep']];
const M4G2: readonly Pair[] = [['a1', 'trust'], ['a2', 'verify'], ['a3', 'verify'], ['a4', 'trust'], ['a5', 'verify'], ['a6', 'trust']];

const hearts = (page: Page, n: number) => expect(page.getByTestId('hearts')).toHaveAttribute('aria-label', new RegExp(`^Hearts ${n} of 3`));
const energy = (page: Page, r: number) => expect(page.getByTestId('fw-energy')).toHaveAttribute('aria-label', `AI energy ${r} of 10`);

/** Hero select → enter → skip the story → the module's first game is on screen. */
async function heroAndStory(page: Page, hero: HeroId, firstGame: string): Promise<void> {
  await page.getByTestId(`hero-card-${hero}`).click();
  await page.getByTestId('hero-enter').click();
  await expect(page.getByTestId('story-root')).toBeVisible();
  await skipStory(page);
  await expect(page.getByTestId('game-title')).toContainText(firstGame);
}

async function next(page: Page, title: string): Promise<void> {
  await page.getByTestId('win-continue').click();
  await expect(page.getByTestId('game-title')).toContainText(title);
}

async function moduleComplete(page: Page, n: number): Promise<void> {
  await page.getByTestId('win-continue').click();
  await expect(page.getByTestId('complete-screen')).toBeVisible();
  await expect(page.getByTestId('complete-screen')).toContainText(`MODULE ${n} COMPLETE`);
  await expect(page.getByTestId('complete-xp-tag')).toBeVisible();
}

async function trainingLab(page: Page): Promise<void> {
  await page.getByTestId('complete-next').click();
  await heroAndStory(page, 'scout', 'Train the Model');
  await playTrainTheModel(page);
  await page.getByTestId('m1g1-finish').click();
  await expectWin(page, 3);
  await next(page, 'Fact or Glitch');
  await pickLines(page, [1, 3, 5]);
  await expectWin(page, 3);
  await moduleComplete(page, 2);
  await expect(page.getByTestId('complete-screen')).toContainText('Module 3 is unlocked');
}

/** Free write: weak (AI) → weak (network down, offline check) → strong (AI) → Finish. */
async function freeWrite(page: Page): Promise<void> {
  await expect(page.getByText('FORGE 3 · FREE WRITE')).toBeVisible();
  await expect(page.getByTestId('fw-goal')).toHaveText('YOUR GOAL: Explain photosynthesis to a 10-year-old.');
  await energy(page, 10);

  // 1. A weak prompt via the AI costs a heart, keeps the text, uses one energy.
  await page.getByTestId('fw-input').fill(WEAK);
  await page.getByTestId('fw-send').click();
  await expect(page.getByTestId('fw-result')).toBeVisible(AI_WAIT);
  await expect(page.getByTestId('fw-offline-banner')).toHaveCount(0);
  await expect(page.getByTestId('fw-score')).toHaveText(FAKE ? '0/5 LEVERS' : /^[0-3]\/5 LEVERS$/);
  await expect(page.getByTestId('fw-demo-tag')).toHaveCount(FAKE ? 1 : 0);
  await expect(page.getByTestId('fw-tip')).toHaveCount(1);
  await expect(page.getByTestId('say-bubble')).toContainText('NOVA had to guess.');
  await hearts(page, 2);
  await energy(page, 9);
  await expect(page.getByTestId('fw-input')).toHaveValue(WEAK);

  // 2. Network failure → in-world OFFLINE banner, offline check, no energy used.
  await page.route('**/v1/freewrite/**', (r) => r.abort());
  await page.getByTestId('fw-input').fill('Tell me about plants');
  await page.getByTestId('fw-send').click();
  await expect(page.getByTestId('fw-offline-banner')).toHaveText("NOVA'S OFFLINE — HERE'S THE CLASSIC CHECKLIST");
  await expect(page.getByText('CLASSIC ANSWER')).toBeVisible();
  await expect(page.getByTestId('fw-score')).toHaveText('0/5 LEVERS');
  await hearts(page, 1);
  await energy(page, 9);
  await page.unroute('**/v1/freewrite/**');

  // 3. The strong prompt passes via the AI; energy falls again.
  await page.getByTestId('fw-input').fill(STRONG);
  await page.getByTestId('fw-send').click();
  await expect(page.getByTestId('fw-finish')).toBeVisible(AI_WAIT);
  await expect(page.getByTestId('fw-offline-banner')).toHaveCount(0);
  await expect(page.getByTestId('fw-score')).toHaveText(FAKE ? '5/5 LEVERS' : /^[45]\/5 LEVERS$/);
  for (const id of ['task', 'context', 'role', 'format', 'limit']) await expect(page.getByTestId(`fw-lever-${id}`)).toHaveCount(1);
  await expect(page.getByTestId('say-bubble')).toContainText('Strong prompt! NOVA knew exactly what you wanted.');
  await energy(page, 8);
  await hearts(page, 1);

  await page.getByTestId('fw-history-toggle').click();
  await expect(page.getByTestId('fw-history-entry-0')).toContainText(FAKE ? 'DEMO' : 'NOVA');
  await expect(page.getByTestId('fw-history-entry-1')).toContainText('OFFLINE');
  await expect(page.getByTestId('fw-history-entry-2')).toContainText(FAKE ? 'DEMO' : 'NOVA');

  await page.getByTestId('fw-finish').click();
  await expectWin(page, 1);
}

async function promptForge(page: Page): Promise<void> {
  await page.getByTestId('home-quest-button').click();
  await heroAndStory(page, 'chrono', 'Prompt Forge');
  await expect(page.getByText('FORGE 1 · STUDY PLAN')).toBeVisible();
  await sortByTap(page, FORGE);
  await expect(page.getByText('PROMPT BUILT')).toBeVisible();
  await page.getByTestId('m2g2-next-forge').click();
  await expect(page.getByText('FORGE 2 · EMAIL TO A TEACHER')).toBeVisible();
  await sortByKeyboard(page, FORGE);
  await expect(page.getByText('PROMPT BUILT')).toBeVisible();
  await page.getByTestId('m2g2-next-forge').click();
  await freeWrite(page);

  await next(page, 'Inbox Filter');
  await setSlider(page, 'th', 55);
  await setSlider(page, 'wc', 30);
  await page.getByTestId('m2g1-lock').click();
  await expect(page.getByTestId('m2g1-round-title')).toHaveText('ROUND 2 · SPAM FOLDER');
  await setSlider(page, 'th', 47);
  await setSlider(page, 'wc', 30);
  await page.getByTestId('m2g1-lock').click();
  await expectWin(page, 3);
  await moduleComplete(page, 1);
  await expect(page.getByTestId('complete-screen')).toContainText('Module 2 is unlocked: Training Lab.');
}

async function neonCity(page: Page): Promise<void> {
  await page.getByTestId('complete-next').click();
  await heroAndStory(page, 'oracle', 'Proxy Hunt');
  await pickLines(page, [2, 3, 4, 5, 6]);
  await expectWin(page, 3);
  await next(page, 'Fairness Lab');
  for (const id of ['code', 'gpa', 'int']) await page.getByTestId(`toggle-${id}`).click();
  await page.getByTestId('m3g2-audit').click();
  await page.getByTestId('m3g2-option-b').click();
  await expectWin(page, 3);
  await moduleComplete(page, 3);
}

async function newsroom(page: Page): Promise<void> {
  await page.getByTestId('complete-next').click();
  await heroAndStory(page, 'guard', 'Source Detective');
  await sortByTap(page, M4G1);
  await expectWin(page, 3);
  await next(page, 'Confidence Court');
  await sortByTap(page, M4G2);
  await expectWin(page, 3);
  await next(page, 'Design the Companion');
  for (const id of ['en', 'da']) await setSlider(page, id, 30);
  for (const id of ['R', 'H', 'A']) await page.getByTestId(`toggle-${id}`).click();
  await page.getByTestId('m4g3-ship').click();
  await expectWin(page, 3);
  await page.getByTestId('win-continue').click();
  await expect(page.getByTestId('complete-screen')).toBeVisible();
  await expect(page.getByTestId('complete-screen')).toContainText('COURSE COMPLETE!');
  await expect(page.getByTestId('complete-screen')).toContainText('YOU FINISHED GLITCH');
  await expect(page.getByTestId('complete-next')).toHaveCount(0);
}

test('fresh device → all four modules → COURSE COMPLETE with the Graduate badge', async ({ page }) => {
  test.setTimeout(300_000);
  await onboard(page, NICK);
  await expect(page.getByTestId('home-greeting')).toContainText(NICK);
  await expect(page.getByTestId('module-status-1')).toContainText('LOCKED');
  await expect(page.getByTestId('badge-grad')).toHaveAttribute('aria-label', 'Graduate, locked');

  await promptForge(page);
  await trainingLab(page);
  await neonCity(page);
  await newsroom(page);

  await page.getByTestId('complete-home').click();
  await expect(page.getByTestId('home-greeting')).toContainText(NICK);
  await expect(page.getByTestId('home-quest')).toContainText('COURSE COMPLETE');
  for (const n of [1, 2, 3, 4]) await expect(page.getByTestId(`module-status-${n}`)).not.toContainText('LOCKED');
  await expect(page.getByTestId('module-status-2')).toContainText('4/4 STEPS');
  await expect(page.getByTestId('module-status-4')).toContainText('5/5 STEPS');
  await expect(page.getByTestId('badge-grad')).toHaveAttribute('aria-label', 'Graduate, unlocked');

  // The prompt log survives a reload of the finished course (device-only history).
  await page.reload();
  await waitForApp(page);
  await expect(page.getByTestId('home-quest')).toContainText('COURSE COMPLETE');
  const historyLen = await page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw ? ((JSON.parse(raw) as { promptHistory?: unknown[] }).promptHistory?.length ?? 0) : 0;
  }, STATE_STORAGE_KEY);
  expect(historyLen).toBe(3);
});
