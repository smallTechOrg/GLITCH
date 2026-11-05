// m1g1 · Train the Model — component tests against createTestGameApi (frame semantics).
// Tap-to-select and keyboard share one path on RN: Enter/Space on a role=button fires onPress
// (RN Web), so a press IS the keyboard activation; the real Tab/Enter run is e2e/module1.spec.ts.
import React from 'react';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import type { HeroId } from '@/contracts/ids';
import { TrainTheModel } from '@/games/m1g1/Game';
import { STEP1_DONE_LINE, STEP1_WRONG, STEP2_WRONG, WIN_SUMMARY } from '@/games/m1g1/data';
import { createTestGameApi, renderWithProviders } from '@/testing/renderWithProviders';
import { NOTHING_TO_USE, type TestGameApi } from '@/testing/testGameApi';

const STEP1: ReadonlyArray<readonly [string, string]> = [['e1', 'spam'], ['e2', 'ok'], ['e3', 'spam'], ['e4', 'ok'], ['e5', 'spam'], ['e6', 'ok']];
const STEP2: ReadonlyArray<readonly [string, string]> = [['t1', 'wrong'], ['t2', 'right'], ['t3', 'right'], ['t4', 'wrong']];

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

async function setup(opts: { hero?: HeroId; hearts?: number; shield?: boolean } = {}): Promise<TestGameApi> {
  const api = createTestGameApi(opts);
  await renderWithProviders(<TrainTheModel api={api} />);
  return api;
}

async function place(item: string, zone: string): Promise<void> {
  await fireEvent.press(screen.getByTestId(`dnd-item-${item}`));
  await fireEvent.press(screen.getByTestId(`dnd-zone-${zone}`));
}

async function sortAll(pairs: ReadonlyArray<readonly [string, string]>): Promise<void> {
  for (const [i, z] of pairs) await place(i, z);
}

async function tick(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

async function power(api: TestGameApi): Promise<boolean> {
  let r = false;
  await act(async () => {
    r = api.usePower();
  });
  return r;
}

describe('<TrainTheModel> step 1', () => {
  it('shows the step-1 heading, six emails in the pool and the SPAM / NOT SPAM zones', async () => {
    await setup();
    expect(screen.getByText('STEP 1 · LABEL THE TRAINING DATA')).toBeTruthy();
    const pool = screen.getByTestId('dnd-pool');
    for (const id of ['e1', 'e2', 'e3', 'e4', 'e5', 'e6']) expect(within(pool).getByTestId(`dnd-item-${id}`)).toBeTruthy();
    expect(screen.getByTestId('dnd-zone-spam')).toHaveTextContent(/SPAM/);
    expect(screen.getByTestId('dnd-zone-ok')).toHaveTextContent(/NOT SPAM/);
  });

  it('exposes screen-reader labels and button roles on items and zones', async () => {
    await setup();
    const e1 = screen.getByTestId('dnd-item-e1');
    expect(e1.props.accessibilityRole).toBe('button');
    expect(e1.props.accessibilityLabel).toBe('WIN a FREE prize!!! Click now');
    expect(screen.getByTestId('dnd-zone-spam').props.accessibilityLabel).toBe('SPAM zone, 0 placed');
    await fireEvent.press(e1);
    expect(screen.getByTestId('dnd-item-e1').props.accessibilityLabel).toBe('WIN a FREE prize!!! Click now, selected');
    await fireEvent.press(screen.getByTestId('dnd-zone-spam'));
    expect(screen.getByTestId('dnd-item-e1').props.accessibilityLabel).toBe('WIN a FREE prize!!! Click now, placed in SPAM');
    expect(screen.getByTestId('dnd-zone-spam').props.accessibilityLabel).toBe('SPAM zone, 1 placed');
  });

  it('a wrong drop costs a heart with the v3 features message and leaves the email in the pool', async () => {
    const api = await setup();
    await place('e1', 'ok');
    expect(api.calls.miss).toEqual([STEP1_WRONG]);
    expect(api.hearts).toBe(2);
    expect(api.lastSay()).toEqual({ text: STEP1_WRONG, mood: 'bad' });
    expect(within(screen.getByTestId('dnd-pool')).getByTestId('dnd-item-e1')).toBeTruthy();
  });

  it('a placed email is inert: pressing it again and dropping elsewhere does nothing', async () => {
    const api = await setup();
    await place('e1', 'spam');
    await place('e1', 'ok');
    expect(api.calls.miss).toHaveLength(0);
    expect(within(screen.getByTestId('dnd-zone-spam')).getByTestId('dnd-item-e1')).toBeTruthy();
  });

  it('pressing a zone with nothing selected is ignored (no heart cost)', async () => {
    const api = await setup();
    await fireEvent.press(screen.getByTestId('dnd-zone-spam'));
    expect(api.calls.miss).toHaveLength(0);
    expect(api.hearts).toBe(3);
  });

  it('after the sixth label it says the done line 350 ms later and moves to step 2', async () => {
    const api = await setup();
    await sortAll(STEP1);
    await tick(349);
    expect(screen.queryByText('STEP 2 · TEST ON NEW EMAILS')).toBeNull();
    await tick(1);
    expect(api.calls.say).toContainEqual({ text: STEP1_DONE_LINE, mood: 'good' });
    expect(screen.getByText('STEP 2 · TEST ON NEW EMAILS')).toBeTruthy();
    expect(screen.getByText('The model says what is in the tag. Was it RIGHT or WRONG?')).toBeTruthy();
  });
});

describe('<TrainTheModel> step 2 and result', () => {
  async function toStep2(opts: { hero?: HeroId; hearts?: number; shield?: boolean } = {}): Promise<TestGameApi> {
    const api = await setup(opts);
    await sortAll(STEP1);
    await tick(350);
    return api;
  }

  it('shows each test email with its MODEL SAYS tag and a label that includes the verdict', async () => {
    await toStep2();
    expect(screen.getByTestId('dnd-item-t1')).toHaveTextContent(/Meeting moved to 3pm/);
    expect(screen.getByTestId('dnd-item-t1')).toHaveTextContent(/MODEL SAYS: SPAM/);
    expect(screen.getByTestId('dnd-item-t3')).toHaveTextContent(/MODEL SAYS: NOT SPAM/);
    expect(screen.getByTestId('dnd-item-t1').props.accessibilityLabel).toBe('Meeting moved to 3pm. MODEL SAYS: SPAM');
    expect(screen.getByTestId('dnd-zone-right').props.accessibilityLabel).toBe('RIGHT zone, 0 placed');
    expect(screen.getByTestId('dnd-zone-wrong').props.accessibilityLabel).toBe('WRONG zone, 0 placed');
  });

  it('a wrong verdict costs a heart with the v3 compare message', async () => {
    const api = await toStep2();
    await place('t1', 'right');
    expect(api.calls.miss).toEqual([STEP2_WRONG]);
    expect(api.hearts).toBe(2);
  });

  it('after the fourth verdict shows TRAINING VS TESTING with fixed 6/6 and 2/4, and Finish wins with the summary', async () => {
    const api = await toStep2();
    await sortAll(STEP2);
    await tick(349);
    expect(screen.queryByTestId('m1g1-result')).toBeNull();
    await tick(1);
    expect(screen.getByText('TRAINING VS TESTING')).toBeTruthy();
    expect(screen.getByTestId('m1g1-result-train').props.accessibilityLabel).toBe('TRAINING DATA: 6/6, 100% correct');
    expect(screen.getByTestId('m1g1-result-test').props.accessibilityLabel).toBe('NEW TEST DATA: 2/4, 50% correct');
    expect(screen.getByText('The model aced what it studied but stumbled on new emails. It memorized instead of generalizing.')).toBeTruthy();
    const fin = screen.getByTestId('m1g1-finish');
    expect(fin.props.accessibilityRole).toBe('button');
    expect(fin).toHaveTextContent('Finish ▶');
    expect(api.calls.win).toHaveLength(0);
    await fireEvent.press(fin);
    expect(api.calls.win).toEqual([WIN_SUMMARY]);
    expect(api.status).toBe('won');
    expect(api.hearts).toBe(3); // frame → 3 stars, flawless
    expect(api.lost).toBe(0);
  });

  it('the result screen does not change with mistakes made earlier (fixed copy), and hearts carry over', async () => {
    const api = await setup();
    await place('e2', 'spam');
    await sortAll(STEP1);
    await tick(350);
    await place('t2', 'wrong');
    await sortAll(STEP2);
    await tick(350);
    expect(api.hearts).toBe(1);
    expect(screen.getByTestId('m1g1-result-train').props.accessibilityLabel).toBe('TRAINING DATA: 6/6, 100% correct');
    await fireEvent.press(screen.getByTestId('m1g1-finish'));
    expect(api.status).toBe('won');
    expect(api.hearts).toBe(1); // frame → 1 star
  });
});

describe('<TrainTheModel> hearts and powers', () => {
  it('three wrong drops end the session (out of hearts) and later input is ignored', async () => {
    const api = await setup();
    await place('e1', 'ok');
    await place('e2', 'spam');
    await place('e3', 'ok');
    expect(api.status).toBe('failed');
    expect(api.hearts).toBe(0);
    await place('e1', 'spam');
    expect(within(screen.getByTestId('dnd-pool')).getByTestId('dnd-item-e1')).toBeTruthy();
    expect(api.calls.miss).toHaveLength(3);
  });

  it('X-RAY (SCOUT) places e1 in SPAM; on step 2 it acts on the new board (t1 → WRONG)', async () => {
    const api = await setup({ hero: 'scout' });
    expect(await power(api)).toBe(true);
    expect(api.lastSay()).toEqual({ text: 'X-RAY: that one goes in SPAM.', mood: 'good' });
    expect(within(screen.getByTestId('dnd-zone-spam')).getByTestId('dnd-item-e1')).toBeTruthy();
    await sortAll(STEP1.slice(1));
    await tick(350);
    expect(await power(api)).toBe(true);
    expect(api.lastSay()).toEqual({ text: 'X-RAY: that one goes in WRONG.', mood: 'good' });
    expect(within(screen.getByTestId('dnd-zone-wrong')).getByTestId('dnd-item-t1')).toBeTruthy();
    expect(api.powerUses).toBe(0);
  });

  it('X-RAY on the last item completes the step', async () => {
    const api = await setup({ hero: 'scout' });
    await sortAll(STEP1.slice(0, 5));
    expect(await power(api)).toBe(true);
    await tick(350);
    expect(screen.getByText('STEP 2 · TEST ON NEW EMAILS')).toBeTruthy();
  });

  it('X-RAY on the result screen is not consumed and toasts NOTHING TO USE IT ON YET', async () => {
    const api = await setup({ hero: 'scout' });
    await sortAll(STEP1);
    await tick(350);
    await sortAll(STEP2);
    await tick(350);
    expect(await power(api)).toBe(false);
    expect(api.powerUses).toBe(2);
    expect(api.calls.toast).toEqual([NOTHING_TO_USE]);
  });

  it('FOCUS (ORACLE) has no decoys, so it flashes the first pair; the flash clears after 2.2 s', async () => {
    const api = await setup({ hero: 'oracle' });
    expect(await power(api)).toBe(true);
    expect(api.lastSay()).toEqual({ text: 'FOCUS: look at the glowing pair.', mood: 'good' });
    expect(api.calls.say.some((s) => s.text === 'FOCUS: that one is not an answer. Skip it.')).toBe(false);
    await tick(2200);
    expect(api.powerUses).toBe(1);
    // the pair is still sortable normally
    await place('e1', 'spam');
    expect(within(screen.getByTestId('dnd-zone-spam')).getByTestId('dnd-item-e1')).toBeTruthy();
  });

  it('SHIELD (GUARDIAN) blocks the next wrong drop: no heart lost, bubble starts SHIELDED!', async () => {
    const api = await setup({ hero: 'guard' });
    expect(await power(api)).toBe(true);
    expect(await power(api)).toBe(false); // already up → not consumed
    await place('e1', 'ok');
    expect(api.hearts).toBe(3);
    expect(api.lost).toBe(0);
    expect(api.lastSay()).toEqual({ text: `SHIELDED! ${STEP1_WRONG}`, mood: 'good' });
    await place('e1', 'ok');
    expect(api.hearts).toBe(2);
  });

  it('REWIND (CHRONO) restores a heart after a mistake but the game state is untouched', async () => {
    const api = await setup({ hero: 'chrono' });
    expect(await power(api)).toBe(false); // full hearts
    await place('e1', 'ok');
    expect(api.hearts).toBe(2);
    expect(await power(api)).toBe(true);
    expect(api.hearts).toBe(3);
    expect(api.lost).toBe(1); // not flawless
    expect(within(screen.getByTestId('dnd-pool')).getByTestId('dnd-item-e1')).toBeTruthy();
  });
});
