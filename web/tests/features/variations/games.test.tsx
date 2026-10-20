// Each content game renders an injected NOVA variation (same shape as its v3 data) and scores
// against THE VARIATION's answer key — never v3's.
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { ScenarioGame, parseScenario, type GameScenario } from '@/features/variations';
import type { ContentGameId } from '@/features/variations';
import { STEP1_WRONG, WIN_SUMMARY as M1G1_WIN } from '@/games/m1g1/data';
import { TRUE_MISS, WIN_SUMMARY as M1G2_WIN } from '@/games/m1g2/data';
import { MISS_MESSAGE, WIN_SUMMARY as M3G1_WIN } from '@/games/m3g1/data';
import { NOT_FOUND_LINE, SUMMARY as M4G1_WIN, WRONG as M4G1_WRONG } from '@/games/m4g1/data';
import { SUMMARY as M4G2_WIN, WRONG as M4G2_WRONG } from '@/games/m4g2/data';
import { createTestGameApi, renderWithProviders } from '@/testing/renderWithProviders';
import type { TestGameApi } from '@/testing/testGameApi';
import { WIRE } from './fixtures';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

function scenario(g: ContentGameId): GameScenario {
  const s = parseScenario(g, WIRE[g]);
  if (!s) throw new Error(`fixture ${g} does not parse`);
  return s;
}

async function setup(g: ContentGameId): Promise<TestGameApi> {
  const api = createTestGameApi();
  await renderWithProviders(<ScenarioGame game={scenario(g)} api={api} />);
  return api;
}
const press = async (id: string): Promise<void> => {
  await fireEvent.press(screen.getByTestId(id));
};
async function place(item: string, zone: string): Promise<void> {
  await press(`dnd-item-${item}`);
  await press(`dnd-zone-${zone}`);
}
async function tick(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

describe('m1g1 Train the Model with a variation', () => {
  const STEP1 = [['e1', 'spam'], ['e2', 'ok'], ['e3', 'spam'], ['e4', 'ok'], ['e5', 'spam'], ['e6', 'ok']] as const;
  // Variation: t1 model right, t2 wrong, t3 wrong, t4 right (v3 is wrong/right/right/wrong).
  const STEP2 = [['t1', 'right'], ['t2', 'wrong'], ['t3', 'wrong'], ['t4', 'right']] as const;

  it("shows the variation's emails and wins only with the variation's labels", async () => {
    const api = await setup('m1g1');
    expect(screen.getByTestId('dnd-item-e1')).toHaveTextContent(/URGENT: claim your lottery cash today/);
    expect(screen.queryByText(/WIN a FREE prize/)).toBeNull();
    for (const [i, z] of STEP1) await place(i, z);
    await tick(1000);
    expect(screen.getByTestId('dnd-item-t2')).toHaveTextContent(/MODEL SAYS: NOT SPAM/);
    for (const [i, z] of STEP2) await place(i, z);
    await tick(1000);
    await press('m1g1-finish');
    expect(api.calls.win).toEqual([M1G1_WIN]);
    expect(api.lost).toBe(0);
  });

  it("a v3-correct but variation-wrong placement costs a heart (e2 is NOT spam here)", async () => {
    const api = await setup('m1g1');
    await place('e2', 'spam');
    expect(api.calls.miss).toEqual([STEP1_WRONG]);
    expect(api.hearts).toBe(2);
  });
});

describe('m1g2 Fact or Fib with a variation', () => {
  it("renders the variation's six lines and wins on its three fibs", async () => {
    const api = await setup('m1g2');
    expect(screen.getByTestId('pick-line-0').props.accessibilityLabel).toBe('1. A spam filter learns from emails that people have labelled.');
    expect(screen.getByTestId('pick-found')).toHaveTextContent('FIBS FOUND: 0/3');
    await press('pick-line-1');
    expect(api.lastSay()?.text).toBe('Fib caught! Models match patterns in data; they do not understand like people.');
    await press('pick-line-3');
    await press('pick-line-5');
    await tick(700);
    expect(api.calls.win).toEqual([M1G2_WIN]);
    expect(api.lost).toBe(0);
  });

  it('a true line of the variation costs a heart', async () => {
    const api = await setup('m1g2');
    await press('pick-line-2');
    expect(api.calls.miss).toEqual([TRUE_MISS]);
    expect(screen.getByTestId('pick-found')).toHaveTextContent('FIBS FOUND: 0/3');
  });
});

describe('m3g1 Proxy Hunt with a variation', () => {
  it("wins on the variation's five proxies; a real signal costs a heart", async () => {
    const api = await setup('m3g1');
    expect(screen.getByTestId('pick-line-2').props.accessibilityLabel).toMatch(/Member, Girls' Coding Club/);
    expect(screen.getByText('MAYA · RESUME · SCREENED BY AI')).toBeTruthy();
    await press('pick-line-7');
    expect(api.calls.miss).toEqual([MISS_MESSAGE]);
    for (const i of [2, 3, 4, 5, 6]) await press(`pick-line-${i}`);
    expect(screen.getByTestId('pick-found')).toHaveTextContent('PROXIES FOUND: 5/5');
    await tick(700);
    expect(api.calls.win).toEqual([M3G1_WIN]);
  });
});

describe('m4g1 Source Detective with a variation', () => {
  it("catalogue lookups answer from the variation (c1 is invented here) and the sort wins on its key", async () => {
    const api = await setup('m4g1');
    expect(screen.getByTestId('dnd-item-c1')).toHaveTextContent(/Robots That Dream/);
    await press('m4g1-check-c1');
    expect(screen.getByTestId('m4g1-result-c1')).toHaveTextContent('NOT FOUND');
    expect(api.lastSay()?.text).toBe(NOT_FOUND_LINE);
    await place('c1', 'keep');
    expect(api.calls.miss).toEqual([M4G1_WRONG]);
    for (const [i, z] of [['c1', 'cut'], ['c2', 'keep'], ['c3', 'keep'], ['c4', 'cut'], ['c5', 'keep']] as const) await place(i, z);
    await tick(1000);
    expect(api.calls.win).toEqual([M4G1_WIN]);
  });
});

describe('m4g2 Confidence Court with a variation', () => {
  it("shows the variation's verdict lines and wins on its TRUST/VERIFY key", async () => {
    const api = await setup('m4g2');
    expect(screen.getByTestId('dnd-item-a6')).toHaveTextContent(/CONFIDENCE 71% · EVIDENCE: Matches NASA website/);
    await place('a2', 'trust');
    expect(api.calls.miss).toEqual([M4G2_WRONG]);
    for (const [i, z] of [['a1', 'trust'], ['a2', 'verify'], ['a3', 'verify'], ['a4', 'trust'], ['a5', 'verify'], ['a6', 'trust']] as const) await place(i, z);
    await tick(1000);
    expect(api.calls.win).toEqual([M4G2_WIN]);
  });
});
