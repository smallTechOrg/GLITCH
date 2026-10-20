// Phase 2 · Fresh case files on replay (scenario-variations.md, spec/roadmap.md → P2-W1).
// Real backend (fake provider by default): GET /v1/scenarios/{gameId}/next generates once and
// caches. Fact or Fib is the journey the user tests: clear it, replay → NEW CASE FILE with six
// different lines (three fibs); replay again → a different one; backend down → the classic v3
// case file with the in-world note; a fresh device's first play is always v3 (no request).
import type { Page, Response } from '@playwright/test';
import { test, expect, waitForApp } from './helpers/fixtures';
import { expectWin, pickLines } from './helpers/flows';

const V3_LINE0 = '1. Machine learning finds patterns in training data.';
const V3_FIBS = [1, 3, 5];
const NEW_TAG = 'NEW CASE FILE';
const OFFLINE_NOTE = "NOVA'S OFFLINE — HERE'S A CLASSIC CASE FILE";

interface ServedSentence {
  text: string;
  fib: boolean;
}
interface ServedScenario {
  ok: boolean;
  data?: { variationId: string; gameId: string; cached: boolean; data: { sentences: ServedSentence[] } };
}

/** Seed (once, before boot) a device with Module 1 open up to Fact or Fib. v1 = a Phase-1 save. */
async function seed(page: Page, opts: { m1g2Done?: boolean; version?: 1 | 2; seen?: string[] } = {}): Promise<void> {
  const now = new Date().toISOString();
  const steps: Record<string, true> = { m1h: true, m1s: true, m1g1: true };
  if (opts.m1g2Done) steps.m1g2 = true;
  const state: Record<string, unknown> = {
    version: opts.version ?? 1,
    profile: { nickname: 'TESTER', onboarded: true, createdAt: now },
    settings: { readableFont: false },
    xp: 30,
    streak: { current: 0, best: 0, lastPlayDay: null },
    steps,
    stars: { m1g1: 3, ...(opts.m1g2Done ? { m1g2: 3 } : {}) },
    heroByModule: { 1: 'guard' },
    lastHero: 'guard',
    heroesPlayed: {},
    powersUsed: {},
    badges: {},
    onceBonuses: { gm1g1: true, ...(opts.m1g2Done ? { gm1g2: true } : {}) },
    promptHistory: [],
  };
  if ((opts.version ?? 1) === 2) state.seenScenarios = opts.seen ? { m1g2: opts.seen } : {};
  await page.addInitScript((s: string) => {
    if (!window.localStorage.getItem('glitch.v1.state')) window.localStorage.setItem('glitch.v1.state', s);
  }, JSON.stringify(state));
}

/** Every scenario request the page makes. */
function trackScenarioRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/v1/scenarios/')) urls.push(r.url());
  });
  return urls;
}

const isNext = (r: Response): boolean => r.url().includes('/v1/scenarios/m1g2/next') && r.request().method() === 'GET';

async function openFactOrFib(page: Page): Promise<void> {
  await page.goto('./module/1/game/m1g2');
  await waitForApp(page);
  await expect(page.getByTestId('game-title')).toContainText('Fact or Fib');
}

async function lineLabels(page: Page): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < 6; i++) out.push((await page.getByTestId(`pick-line-${i}`).getAttribute('aria-label')) ?? '');
  return out;
}

/** Wait for the served variation, assert the NEW CASE FILE view, return it. */
async function expectNewCaseFile(page: Page, served: Promise<Response>): Promise<NonNullable<ServedScenario['data']>> {
  const res = await served;
  const body = (await res.json()) as ServedScenario;
  expect(body.ok, `scenario request failed: ${JSON.stringify(body)}`).toBe(true);
  const v = body.data!;
  expect(v.gameId).toBe('m1g2');
  expect(v.data.sentences).toHaveLength(6);
  expect(v.data.sentences.filter((s) => s.fib)).toHaveLength(3);
  await expect(page.getByTestId('case-file-tag')).toHaveText(NEW_TAG);
  await expect(page.getByTestId('case-file-offline')).toHaveCount(0);
  await expect(page.getByTestId('pick-line-0')).toHaveAttribute('aria-label', `1. ${v.data.sentences[0]!.text}`);
  return v;
}

const fibsOf = (v: NonNullable<ServedScenario['data']>): number[] => v.data.sentences.flatMap((s, i) => (s.fib ? [i] : []));

test.describe('Fresh case files · Fact or Fib', () => {
  test('a fresh device: first play is always the v3 case file and asks the server for nothing', async ({ page }) => {
    const requests = trackScenarioRequests(page);
    await seed(page);
    await openFactOrFib(page);
    await expect(page.getByTestId('pick-line-0')).toHaveAttribute('aria-label', V3_LINE0);
    await expect(page.getByTestId('case-file-tag')).toHaveCount(0);
    await expect(page.getByTestId('case-file-offline')).toHaveCount(0);
    await pickLines(page, V3_FIBS);
    await expectWin(page, 3);
    // The Phase-1 strip no longer advertises fresh case files (they are live now).
    await expect(page.getByTestId('win-soon-strip')).toContainText('COMING SOON: Mistake recap');
    await expect(page.getByTestId('win-soon-strip')).not.toContainText('Fresh case files');
    expect(requests).toEqual([]);
  });

  test('clear it, replay → NEW CASE FILE with different lines; replay again → a different one; no repeats after reload', async ({ page }) => {
    const requests = trackScenarioRequests(page);
    await seed(page); // a Phase-1 (v1) save: migrates to v2 on boot
    await openFactOrFib(page);
    await pickLines(page, V3_FIBS);
    await expectWin(page, 3);

    // Replay #1 → NOVA thinking, then a fresh case file.
    let served = page.waitForResponse(isNext);
    await page.getByTestId('win-replay').click();
    const first = await expectNewCaseFile(page, served);
    const firstLines = await lineLabels(page);
    expect(firstLines[0]).not.toBe(V3_LINE0);
    expect(requests).toHaveLength(1);
    expect(new URL(requests[0]!).searchParams.get('seen')).toBe('');

    // It is scored against its own answer key: the served fibs win with 3 stars.
    await pickLines(page, fibsOf(first));
    await expectWin(page, 3);
    await expect(page.getByTestId('win-xp-tag')).toHaveCount(0); // game-clear XP is once per game

    // Replay #2 → a different variation, never the one already seen.
    served = page.waitForResponse(isNext);
    await page.getByTestId('win-replay').click();
    const second = await expectNewCaseFile(page, served);
    expect(second.variationId).not.toBe(first.variationId);
    expect(new URL(requests[1]!).searchParams.get('seen')).toBe(first.variationId);
    const secondLines = await lineLabels(page);
    expect(secondLines).not.toEqual(firstLines);

    // The seen list is on the device: after a reload, opening the cleared game is a replay
    // that sends both ids and gets a third, unseen case file.
    const saved = await page.evaluate(() => JSON.parse(window.localStorage.getItem('glitch.v1.state') ?? '{}') as { version: number; seenScenarios: Record<string, string[]> });
    expect(saved.version).toBe(2);
    expect(saved.seenScenarios.m1g2).toEqual([first.variationId, second.variationId]);
    served = page.waitForResponse(isNext);
    await page.reload();
    await waitForApp(page);
    const third = await expectNewCaseFile(page, served);
    expect([first.variationId, second.variationId]).not.toContain(third.variationId);
    expect(new URL(requests[2]!).searchParams.get('seen')?.split(',').sort()).toEqual([first.variationId, second.variationId].sort());
  });

  test('backend down on replay → the classic v3 case file with the in-world note', async ({ page }) => {
    await page.route('**/v1/scenarios/**', (route) => route.abort('connectionrefused'));
    await seed(page, { m1g2Done: true, version: 2 });
    await openFactOrFib(page);
    await expect(page.getByTestId('case-file-offline')).toHaveText(OFFLINE_NOTE);
    await expect(page.getByTestId('case-file-tag')).toHaveCount(0);
    await expect(page.getByTestId('pick-line-0')).toHaveAttribute('aria-label', V3_LINE0);
    // The classic case still plays to a win.
    await pickLines(page, V3_FIBS);
    await expectWin(page, 3);
    const saved = await page.evaluate(() => JSON.parse(window.localStorage.getItem('glitch.v1.state') ?? '{}') as { seenScenarios: Record<string, string[]> });
    expect(saved.seenScenarios).toEqual({});
  });
});
