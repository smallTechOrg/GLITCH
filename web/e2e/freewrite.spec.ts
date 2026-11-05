// FORGE 3 · FREE WRITE E2E (slice E) against the real backend. Each test is a fresh device
// seeded with Module 1 + m2g1 done, opens Prompt Forge, clears forges 1–2 by tap and lands on
// the free-write round (spec/capabilities/freewrite-forge.md → Success Criteria).
//
// GLITCH_E2E_EXPECT_PROVIDER=fake (default) asserts the demo provider's exact verdicts and the
// DEMO NOVA tag; =openrouter asserts structure only (non-empty reply, 5 chips, n/5, one tip,
// no demo tag) — the 5/5 fixture must still pass and "plants" must still fail.
import type { Page, Route } from '@playwright/test';
import { STATE_STORAGE_KEY } from '../src/contracts/state';
import type { HeroId } from '../src/contracts/ids';
import { test, expect, waitForApp, EXPECTED_PROVIDER } from './helpers/fixtures';
import { expectWin, sortByTap } from './helpers/flows';

const FAKE = EXPECTED_PROVIDER === 'fake';
const LEVERS = ['task', 'context', 'role', 'format', 'limit'] as const;
const LEVER_NAME = { task: 'Task', context: 'Context', role: 'Role', format: 'Format', limit: 'Limit' } as const;
const STRONG =
  'Act as a friendly science teacher. Explain photosynthesis to my 10-year-old brother, who loves plants. Use 3 short bullet points. Keep it under 80 words.';
const WEAK = 'plants';
const OFFLINE_BANNER = "NOVA'S OFFLINE — HERE'S THE CLASSIC CHECKLIST";
const AI_WAIT = { timeout: 15_000 }; // 8 s client abort + render headroom
const FORGE_PAIRS: ReadonlyArray<readonly [string, string]> = [['b1', 'task'], ['b2', 'ctx'], ['b3', 'role'], ['b4', 'fmt'], ['b5', 'lim']];

async function seed(page: Page, hero: HeroId): Promise<void> {
  const now = new Date().toISOString();
  const steps: Record<string, true> = {};
  for (const s of ['m1h', 'm1s', 'm1g1', 'm1g2', 'm2h', 'm2s', 'm2g1']) steps[s] = true;
  const state = {
    version: 1,
    profile: { nickname: 'FW', onboarded: true, createdAt: now },
    settings: { readableFont: false },
    xp: 0,
    streak: { current: 0, best: 0, lastPlayDay: null },
    steps,
    stars: { m1g1: 3, m1g2: 3, m2g1: 3 },
    heroByModule: { 1: hero, 2: hero },
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

/** Prompt Forge → forges 1–2 by tap → FORGE 3 · FREE WRITE with energy read. */
async function toFreeWrite(page: Page): Promise<void> {
  await page.goto('./module/2/game/m2g2');
  await waitForApp(page);
  await expect(page.getByTestId('game-title')).toContainText('Prompt Forge');
  for (let forge = 0; forge < 2; forge++) {
    await sortByTap(page, FORGE_PAIRS);
    await expect(page.getByText('PROMPT BUILT')).toBeVisible();
    await page.getByTestId('m2g2-next-forge').click();
  }
  await expect(page.getByText('FORGE 3 · FREE WRITE')).toBeVisible();
  await expect(page.getByTestId('say-bubble')).toContainText("Your turn. Write a prompt NOVA can't misread.");
  await expect(page.getByTestId('fw-energy')).not.toHaveAttribute('aria-label', 'AI energy loading');
}

async function open(page: Page, hero: HeroId = 'scout'): Promise<void> {
  await seed(page, hero);
  await toFreeWrite(page);
}

async function sendPrompt(page: Page, text: string): Promise<void> {
  await page.getByTestId('fw-input').fill(text);
  await page.getByTestId('fw-send').click();
}

const hearts = (page: Page, n: number) => expect(page.getByTestId('hearts')).toHaveAttribute('aria-label', new RegExp(`^Hearts ${n} of 3`));
const energy = (page: Page, r: number) => expect(page.getByTestId('fw-energy')).toHaveAttribute('aria-label', `AI energy ${r} of 10`);

/** The result block is rendered once: one reply, five chips, one score, one tip. */
async function expectResultShape(page: Page): Promise<void> {
  await expect(page.getByTestId('fw-reply')).toHaveCount(1);
  await expect(page.getByTestId('fw-reply-text')).not.toBeEmpty();
  for (const id of LEVERS) await expect(page.getByTestId(`fw-lever-${id}`)).toHaveAttribute('aria-label', new RegExp(`^${LEVER_NAME[id]}: (hit|missed)$`));
  await expect(page.getByTestId('fw-score')).toHaveCount(1);
  await expect(page.getByTestId('fw-score')).toHaveText(/^[0-5]\/5 LEVERS$/);
  await expect(page.getByTestId('fw-tip')).toHaveCount(1);
  await expect(page.getByTestId('fw-tip')).toContainText("NOVA'S TIP");
}

async function stalledEvaluate(route: Route): Promise<void> {
  // Never answer: the client's 8 s abort must kick in.
  void route;
}

test.describe('FORGE 3 · FREE WRITE', () => {
  test('first screen: goal, energy, empty editor with counter, send disabled', async ({ page }) => {
    await open(page);
    await expect(page.getByText('Now write your own. Use the five levers: task, context, role, format, limit.')).toBeVisible();
    await expect(page.getByTestId('fw-goal')).toHaveText('YOUR GOAL: Explain photosynthesis to a 10-year-old.');
    await energy(page, 10);
    await expect(page.getByTestId('fw-input')).toHaveAttribute('placeholder', 'e.g. Act as…');
    await expect(page.getByTestId('fw-input')).toHaveAttribute('aria-label', 'Your prompt');
    await expect(page.getByTestId('fw-count')).toHaveText('0/600');
    await expect(page.getByTestId('fw-send')).toBeDisabled();
    await page.getByTestId('fw-input').fill('x'.repeat(650));
    await expect(page.getByTestId('fw-count')).toHaveText('600/600');
    await expect(page.getByTestId('fw-send')).toBeEnabled();
  });

  test('a strong prompt passes: reply, 5 levers, one tip, energy −1, Finish → LEVEL CLEAR 3 stars', async ({ page }) => {
    await open(page);
    await sendPrompt(page, STRONG);
    await expect(page.getByTestId('fw-finish')).toBeVisible(AI_WAIT);
    await expectResultShape(page);
    await expect(page.getByTestId('fw-offline-banner')).toHaveCount(0);
    await expect(page.getByText('NOVA REPLIES')).toBeVisible();
    if (FAKE) {
      await expect(page.getByTestId('fw-demo-tag')).toHaveText('DEMO NOVA');
      await expect(page.getByTestId('fw-reply-text')).toContainText("[DEMO NOVA] Here's my answer to your prompt about: Explain photosynthesis");
      await expect(page.getByTestId('fw-score')).toHaveText('5/5 LEVERS');
      for (const id of LEVERS) await expect(page.getByTestId(`fw-lever-${id}`)).toHaveAttribute('aria-label', `${LEVER_NAME[id]}: hit`);
      await expect(page.getByTestId('fw-tip')).toContainText("All five levers. That's a prompt NOVA can't misread.");
    } else {
      await expect(page.getByTestId('fw-demo-tag')).toHaveCount(0);
      await expect(page.getByTestId('fw-score')).toHaveText(/^[45]\/5 LEVERS$/);
    }
    await expect(page.getByTestId('say-bubble')).toContainText('Strong prompt! NOVA knew exactly what you wanted.');
    await energy(page, 9);
    await hearts(page, 3);

    await page.getByTestId('fw-history-toggle').click();
    await expect(page.getByTestId('fw-history-entry-0')).toContainText(FAKE ? 'DEMO' : 'NOVA');

    await page.getByTestId('fw-finish').click();
    await expectWin(page, 3);
    await expect(page.getByTestId('win-screen')).toContainText('A strong prompt is specific');
  });

  test('a weak prompt costs one heart and keeps the text; editing and resending passes (2 stars)', async ({ page }) => {
    await open(page);
    await sendPrompt(page, WEAK);
    await expect(page.getByTestId('fw-result')).toBeVisible(AI_WAIT);
    await expectResultShape(page);
    await expect(page.getByTestId('fw-finish')).toHaveCount(0);
    await expect(page.getByTestId('say-bubble')).toContainText('NOVA had to guess. Add the levers you missed and try again.');
    await hearts(page, 2);
    await expect(page.getByTestId('fw-input')).toHaveValue(WEAK);
    await expect(page.getByTestId('fw-send')).toHaveText(/EDIT AND RESEND/);
    if (FAKE) {
      await expect(page.getByTestId('fw-score')).toHaveText('0/5 LEVERS');
      for (const id of LEVERS) await expect(page.getByTestId(`fw-lever-${id}`)).toHaveAttribute('aria-label', `${LEVER_NAME[id]}: missed`);
    } else {
      await expect(page.getByTestId('fw-score')).toHaveText(/^[0-3]\/5 LEVERS$/);
    }
    await energy(page, 9);

    await sendPrompt(page, STRONG);
    await expect(page.getByTestId('fw-finish')).toBeVisible(AI_WAIT);
    await energy(page, 8);
    await hearts(page, 2);
    await page.getByTestId('fw-finish').click();
    await expectWin(page, 2);
  });

  test('SHIELD (GUARDIAN) blocks the weak-prompt heart loss', async ({ page }) => {
    await open(page, 'guard');
    await page.getByTestId('power-button').click();
    await expect(page.getByTestId('shield-indicator')).toBeVisible();
    await sendPrompt(page, WEAK);
    await expect(page.getByTestId('fw-result')).toBeVisible(AI_WAIT);
    await expect(page.getByTestId('say-bubble')).toContainText('SHIELDED!');
    await hearts(page, 3);
  });

  test('network failure → OFFLINE banner, classic answer, offline check scores; energy unchanged', async ({ page }) => {
    await open(page);
    await page.route('**/v1/freewrite/**', (r) => r.abort());
    await sendPrompt(page, WEAK);
    await expect(page.getByTestId('fw-offline-banner')).toHaveText(OFFLINE_BANNER);
    await expect(page.getByText('CLASSIC ANSWER')).toBeVisible();
    await expect(page.getByTestId('fw-reply-text')).toContainText('Plants make their own food!');
    await expect(page.getByTestId('fw-demo-tag')).toHaveCount(0);
    await expect(page.getByTestId('fw-score')).toHaveText('0/5 LEVERS');
    await expect(page.getByTestId('fw-tip')).toContainText("Start with a clear action, like 'Explain…' or 'Write…'");
    await hearts(page, 2);
    await energy(page, 10);

    // Still offline: the strong prompt passes on the offline check alone.
    await sendPrompt(page, STRONG);
    await expect(page.getByTestId('fw-score')).toHaveText('5/5 LEVERS');
    await expect(page.getByTestId('fw-tip')).toContainText("All five levers. That's a prompt NOVA can't misread.");
    await energy(page, 10);
    await page.getByTestId('fw-history-toggle').click();
    await expect(page.getByTestId('fw-history-entry-0')).toContainText('OFFLINE');
    await expect(page.getByTestId('fw-history-entry-1')).toContainText('OFFLINE');
    await page.getByTestId('fw-finish').click();
    await expectWin(page, 2);
  });

  test('no answer within 8 s → NOVA thinking, then the OFFLINE banner', async ({ page }) => {
    await open(page);
    await page.route('**/v1/freewrite/**', stalledEvaluate);
    const t0 = Date.now();
    await sendPrompt(page, STRONG);
    await expect(page.getByTestId('fw-thinking')).toBeVisible();
    await expect(page.getByTestId('fw-thinking')).toHaveAttribute('aria-label', 'NOVA IS THINKING…');
    await expect(page.getByTestId('fw-input')).not.toBeEditable();
    await expect(page.getByTestId('fw-offline-banner')).toHaveText(OFFLINE_BANNER, AI_WAIT);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(7_500);
    await expect(page.getByTestId('fw-score')).toHaveText('5/5 LEVERS');
    await expect(page.getByTestId('fw-finish')).toBeVisible();
  });

  test('flat battery: offline button and banner, scoring without calling the evaluate endpoint', async ({ page }) => {
    let evaluateCalls = 0;
    const resetsAt = new Date(Date.now() + 3 * 3_600_000 - 60_000).toISOString();
    await page.route('**/v1/energy', (r) => {
      if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
      return r.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ ok: true, data: {}, energy: { remaining: 0, limit: 10, resetsAt } }),
      });
    });
    await page.route('**/v1/freewrite/**', (r) => {
      evaluateCalls += 1;
      return r.continue();
    });
    await open(page);
    await energy(page, 0);
    await expect(page.getByTestId('fw-offline-banner')).toHaveText("NOVA'S BATTERY IS FLAT FOR TODAY. RECHARGES IN 3H.");
    await expect(page.getByTestId('fw-send')).toHaveText(/CHECK MY PROMPT \(OFFLINE\)/);
    await sendPrompt(page, STRONG);
    await expect(page.getByTestId('fw-score')).toHaveText('5/5 LEVERS');
    await expect(page.getByText('CLASSIC ANSWER')).toBeVisible();
    expect(evaluateCalls).toBe(0);
  });

  test('X-RAY on an empty draft is not consumed; on a draft it previews the levers', async ({ page }) => {
    await open(page, 'scout');
    await expect(page.getByTestId('power-button')).toHaveAttribute('aria-label', /2 uses left/);
    await page.getByTestId('power-button').click();
    await expect(page.getByTestId('toast')).toContainText('NOTHING TO USE IT ON YET');
    await expect(page.getByTestId('power-button')).toHaveAttribute('aria-label', /2 uses left/);
    await page.getByTestId('fw-input').fill('Act as a coach and explain offside to me');
    await page.getByTestId('power-button').click();
    await expect(page.getByTestId('say-bubble')).toContainText('X-RAY: your draft has TASK, ROLE. Missing: CONTEXT, FORMAT, LIMIT.');
    await expect(page.getByTestId('fw-preview-task')).toHaveAttribute('aria-label', 'Task: hit (X-RAY preview)');
    await expect(page.getByTestId('power-button')).toHaveAttribute('aria-label', /1 use/);
  });

  test('FOCUS (ORACLE) names the first missed lever with the goal example', async ({ page }) => {
    await open(page, 'oracle');
    await page.getByTestId('fw-input').fill('Act as a teacher and explain plants to me please');
    await page.getByTestId('power-button').click();
    await expect(page.getByTestId('say-bubble')).toContainText("FOCUS: add a CONTEXT, e.g. 'to my 10-year-old brother who loves plants'");
  });

  test('history stays on the device across reloads (next goal is the first unattempted) and Reset clears it', async ({ page }) => {
    await open(page);
    await page.route('**/v1/freewrite/**', (r) => r.abort()); // offline: no AI spend needed here
    await sendPrompt(page, WEAK);
    await expect(page.getByTestId('fw-result')).toBeVisible();
    await expect
      .poll(() => page.evaluate((k) => (JSON.parse(localStorage.getItem(k) ?? '{}') as { promptHistory?: unknown[] }).promptHistory?.length ?? 0, STATE_STORAGE_KEY))
      .toBe(1);

    await page.reload();
    await toFreeWrite(page);
    await expect(page.getByTestId('fw-goal')).toHaveText('YOUR GOAL: Plan a 3-day revision timetable for your science test.');
    await page.getByTestId('fw-history-toggle').click();
    const entry = page.getByTestId('fw-history-entry-0');
    await expect(entry).toContainText('Explain photosynthesis to a 10-year-old.');
    await expect(entry).toContainText('0/5');
    await expect(entry).toContainText('OFFLINE');
    await entry.click();
    await expect(page.getByTestId('fw-history-text-0')).toHaveText(WEAK);

    await page.goto('./settings');
    await waitForApp(page);
    await page.getByTestId('settings-reset').click();
    await page.getByTestId('settings-reset').click();
    await expect(page.getByTestId('settings-reset-done')).toBeVisible();
    await expect
      .poll(() => page.evaluate((k) => (JSON.parse(localStorage.getItem(k) ?? '{}') as { promptHistory?: unknown[] }).promptHistory?.length ?? -1, STATE_STORAGE_KEY))
      .toBe(0);
  });
});
