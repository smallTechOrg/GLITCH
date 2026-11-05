// m1g1 · Train the Model — component tests against createTestGameApi (frame semantics).
// Tap-to-select and keyboard share one path on RN: Enter/Space on a role=button fires onPress
// (RN Web), so a press IS the keyboard activation; the real Tab/Enter run is e2e/module1.spec.ts.
import React from 'react';
import type * as RN from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';
import type { HeroId } from '@/contracts/ids';
import { TrainTheModel } from '@/games/m1g1/Game';
import { ALL_RIGHT_LINE, ROUND1_DONE_LINE, ROUND1_HEAD, ROUND1_WRONG, ROUND2_HEAD, ROUND2_WRONG, WIN_SUMMARY, modelSaid, modelSaidShort } from '@/games/m1g1/data';
import { createTestGameApi, renderWithProviders } from '@/testing/renderWithProviders';
import { NOTHING_TO_USE, type TestGameApi } from '@/testing/testGameApi';

const ROUND1: ReadonlyArray<readonly [string, string]> = [['e1', 'spam'], ['e2', 'ok'], ['e3', 'spam'], ['e4', 'ok'], ['e5', 'spam'], ['e6', 'ok']];
const ROUND2: ReadonlyArray<readonly [string, string]> = [['t1', 'ok'], ['t2', 'spam'], ['t3', 'ok'], ['t4', 'spam']];

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

async function setup(opts: { hero?: HeroId; hearts?: number; shield?: boolean } = {}): Promise<TestGameApi> {
  const api = createTestGameApi(opts);
  await renderWithProviders(<TrainTheModel api={api} />);
  return api;
}

const press = async (id: string): Promise<void> => {
  await fireEvent.press(screen.getByTestId(id));
};

async function call(item: string, zone: string): Promise<void> {
  await press(`dnd-item-${item}`);
  await press(`dnd-zone-${zone}`);
}

async function callAll(pairs: ReadonlyArray<readonly [string, string]>): Promise<void> {
  for (const [i, z] of pairs) await call(i, z);
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

async function toRound2(opts: { hero?: HeroId; hearts?: number; shield?: boolean } = {}): Promise<TestGameApi> {
  const api = await setup(opts);
  await callAll(ROUND1);
  await press('m1g1-verify');
  await press('m1g1-next');
  return api;
}

describe('<TrainTheModel> round 1', () => {
  it('shows the heading, the six emails one per row, both bins and a disabled VERIFY', async () => {
    await setup();
    expect(screen.getByText(ROUND1_HEAD)).toBeTruthy();
    expect(screen.getByTestId('m1g1-step-train')).toBeTruthy();
    for (const id of ['e1', 'e2', 'e3', 'e4', 'e5', 'e6']) expect(screen.getByTestId(`dnd-item-${id}`)).toBeTruthy();
    expect(screen.getByTestId('dnd-zone-spam')).toHaveTextContent(/SPAM/);
    expect(screen.getByTestId('dnd-zone-ok')).toHaveTextContent(/NOT SPAM/);
    expect(screen.getByTestId('m1g1-called')).toHaveTextContent(/0\/6 CALLED/);
    expect(screen.getByTestId('m1g1-verify').props.accessibilityState?.disabled).toBe(true);
  });

  it('exposes screen-reader labels and button roles on rows and bins', async () => {
    await setup();
    const e1 = screen.getByTestId('dnd-item-e1');
    expect(e1.props.accessibilityRole).toBe('button');
    expect(e1.props.accessibilityLabel).toBe('WIN a FREE prize!!! Click now');
    expect(screen.getByTestId('dnd-zone-spam').props.accessibilityLabel).toBe('SPAM bin, 0 called');
    await fireEvent.press(e1);
    expect(screen.getByTestId('dnd-item-e1').props.accessibilityLabel).toBe('WIN a FREE prize!!! Click now, selected');
    await press('dnd-zone-spam');
    expect(screen.getByTestId('dnd-item-e1').props.accessibilityLabel).toBe('WIN a FREE prize!!! Click now, called SPAM');
    expect(screen.getByTestId('dnd-zone-spam').props.accessibilityLabel).toBe('SPAM bin, 1 called');
  });

  it('a call stays unjudged until VERIFY: a wrong one costs nothing yet, and the email stays in the list', async () => {
    const api = await setup();
    await call('e1', 'ok');
    expect(api.calls.miss).toHaveLength(0);
    expect(api.hearts).toBe(3);
    expect(screen.getByTestId('m1g1-call-e1')).toHaveTextContent('NOT SPAM?');
    expect(screen.getByTestId('dnd-item-e1')).toBeTruthy();
    expect(screen.getByTestId('m1g1-count-ok')).toHaveTextContent('1');
  });

  it('a call can be changed before VERIFY', async () => {
    const api = await setup();
    await call('e1', 'ok');
    await call('e1', 'spam');
    expect(screen.getByTestId('m1g1-call-e1')).toHaveTextContent('SPAM?');
    expect(screen.getByTestId('m1g1-count-ok')).toHaveTextContent('0');
    expect(screen.getByTestId('m1g1-count-spam')).toHaveTextContent('1');
    expect(api.calls.miss).toHaveLength(0);
  });

  it('pressing a bin with nothing selected is ignored', async () => {
    const api = await setup();
    await press('dnd-zone-spam');
    expect(screen.getByTestId('m1g1-count-spam')).toHaveTextContent('0');
    expect(api.calls.miss).toHaveLength(0);
  });

  it('VERIFY stays disabled until every email is called', async () => {
    const api = await setup();
    await callAll(ROUND1.slice(0, 5));
    await press('m1g1-verify');
    expect(screen.queryByTestId('m1g1-next')).toBeNull();
    expect(api.calls.say).toHaveLength(0);
    await call('e6', 'ok');
    expect(screen.getByTestId('m1g1-verify').props.accessibilityState?.disabled).toBe(false);
  });

  it('all right: VERIFY marks every row, praises, costs nothing and offers the next round', async () => {
    const api = await setup();
    await callAll(ROUND1);
    await press('m1g1-verify');
    expect(api.lastSay()).toEqual({ text: ALL_RIGHT_LINE, mood: 'good' });
    expect(api.calls.miss).toHaveLength(0);
    expect(screen.getByTestId('m1g1-verify-e1')).toHaveTextContent("✓ IT'S SPAM");
    expect(screen.getByTestId('m1g1-verify-e2')).toHaveTextContent("✓ IT'S NOT SPAM");
    expect(screen.getByTestId('dnd-item-e1').props.accessibilityLabel).toBe('WIN a FREE prize!!! Click now, called SPAM, Correct, it is SPAM');
    expect(screen.getByTestId('m1g1-next')).toHaveTextContent('Next round ▶');
    expect(screen.queryByTestId('m1g1-verify')).toBeNull();
  });

  it('VERIFY costs one heart per wrong call and shows the truth beside each wrong row', async () => {
    const api = await setup();
    await callAll([['e1', 'ok'], ['e2', 'spam'], ['e3', 'spam'], ['e4', 'ok'], ['e5', 'spam'], ['e6', 'ok']]);
    await press('m1g1-verify');
    expect(api.calls.miss).toEqual([ROUND1_WRONG, ROUND1_WRONG]);
    expect(api.hearts).toBe(1);
    expect(screen.getByTestId('m1g1-verify-e1')).toHaveTextContent("✗ IT'S SPAM");
    expect(screen.getByTestId('m1g1-verify-e3')).toHaveTextContent("✓ IT'S SPAM");
    expect(screen.getByTestId('dnd-item-e1').props.accessibilityLabel).toBe('WIN a FREE prize!!! Click now, called NOT SPAM, Wrong, it is SPAM');
  });

  it('verified rows are locked: pressing them and the bins changes nothing', async () => {
    const api = await setup();
    await callAll(ROUND1);
    await press('m1g1-verify');
    await call('e1', 'ok');
    expect(screen.getByTestId('m1g1-count-spam')).toHaveTextContent('3');
    expect(api.calls.miss).toHaveLength(0);
  });

  it('NEXT says the done line and moves to round 2 with no timer', async () => {
    const api = await setup();
    await callAll(ROUND1);
    await press('m1g1-verify');
    expect(screen.queryByText(ROUND2_HEAD)).toBeNull();
    await press('m1g1-next');
    expect(api.calls.say).toContainEqual({ text: ROUND1_DONE_LINE, mood: 'good' });
    expect(screen.getByText(ROUND2_HEAD)).toBeTruthy();
    expect(screen.getByTestId('m1g1-step-test')).toBeTruthy();
  });
});

describe('<TrainTheModel> round 2 and result', () => {
  it('shows the four new emails without revealing the model until VERIFY', async () => {
    await toRound2();
    expect(screen.getByTestId('dnd-item-t1')).toHaveTextContent(/Meeting moved to 3pm/);
    expect(screen.queryByTestId('m1g1-model-t1')).toBeNull();
    expect(screen.getByTestId('m1g1-called')).toHaveTextContent(/0\/4 CALLED/);
  });

  it('VERIFY reveals the truth and how the model did on each email', async () => {
    await toRound2();
    await callAll(ROUND2);
    await press('m1g1-verify');
    expect(screen.getByTestId('m1g1-verify-t1')).toHaveTextContent(/IT'S NOT SPAM/);
    expect(screen.getByTestId('m1g1-model-t1')).toHaveTextContent('MODEL: SPAM ✗');
    expect(screen.getByTestId('m1g1-model-t2')).toHaveTextContent('MODEL: SPAM ✓');
    expect(screen.getByTestId('m1g1-model-t3')).toHaveTextContent('MODEL: NOT SPAM ✓');
    expect(screen.getByTestId('m1g1-model-t4')).toHaveTextContent('MODEL: NOT SPAM ✗');
    expect(screen.getByTestId('m1g1-next')).toHaveTextContent('See results ▶');
  });

  it('on a phone the verify column is short, with the full model line kept for screen readers', async () => {
    const spy = jest.spyOn(require('react-native') as typeof RN, 'useWindowDimensions').mockReturnValue({ width: 390, height: 844, scale: 2, fontScale: 1 });
    try {
      await toRound2();
      await callAll(ROUND2);
      await press('m1g1-verify');
      expect(screen.getByTestId('m1g1-verify-t1')).toHaveTextContent(/✓ NOT SPAM/);
      expect(screen.getByTestId('m1g1-verify-t1')).not.toHaveTextContent(/IT'S/);
      expect(screen.getByTestId('m1g1-model-t1')).toHaveTextContent(modelSaidShort(false));
      expect(screen.getByTestId('m1g1-model-t2')).toHaveTextContent(modelSaidShort(true));
      expect(screen.getByTestId('m1g1-model-t1').props.accessibilityLabel).toBe(modelSaid('SPAM', false));
    } finally {
      spy.mockRestore();
    }
  });

  it('a wrong call in round 2 uses the round-2 message', async () => {
    const api = await toRound2();
    await callAll([['t1', 'spam'], ['t2', 'spam'], ['t3', 'ok'], ['t4', 'spam']]);
    await press('m1g1-verify');
    expect(api.calls.miss).toEqual([ROUND2_WRONG]);
    expect(api.hearts).toBe(2);
  });

  it('then TRAINING VS TESTING with fixed 6/6 and 2/4, and Finish wins with the summary', async () => {
    const api = await toRound2();
    await callAll(ROUND2);
    await press('m1g1-verify');
    expect(screen.queryByTestId('m1g1-result')).toBeNull();
    await press('m1g1-next');
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
    expect(api.hearts).toBe(3);
    expect(api.lost).toBe(0);
  });

  it('the result copy is fixed whatever the player got wrong, and hearts carry over', async () => {
    const api = await setup();
    await callAll([['e1', 'spam'], ['e2', 'spam'], ['e3', 'spam'], ['e4', 'ok'], ['e5', 'spam'], ['e6', 'ok']]);
    await press('m1g1-verify');
    await press('m1g1-next');
    await callAll([['t1', 'ok'], ['t2', 'ok'], ['t3', 'ok'], ['t4', 'spam']]);
    await press('m1g1-verify');
    await press('m1g1-next');
    expect(api.hearts).toBe(1);
    expect(screen.getByTestId('m1g1-result-train').props.accessibilityLabel).toBe('TRAINING DATA: 6/6, 100% correct');
    await press('m1g1-finish');
    expect(api.status).toBe('won');
    expect(api.hearts).toBe(1);
  });
});

describe('<TrainTheModel> hearts and powers', () => {
  it('three wrong calls on one VERIFY end the session; further wrong rows and input are ignored', async () => {
    const api = await setup();
    await callAll([['e1', 'ok'], ['e2', 'spam'], ['e3', 'ok'], ['e4', 'spam'], ['e5', 'spam'], ['e6', 'ok']]);
    await press('m1g1-verify');
    expect(api.status).toBe('failed');
    expect(api.hearts).toBe(0);
    expect(api.lost).toBe(3);
    expect(screen.getByTestId('m1g1-next').props.accessibilityState?.disabled).toBe(true);
    await press('m1g1-next');
    expect(screen.queryByText(ROUND2_HEAD)).toBeNull();
  });

  it('input is ignored once the session is over', async () => {
    const api = await setup({ hearts: 1 });
    await callAll([['e1', 'ok'], ['e2', 'ok'], ['e3', 'spam'], ['e4', 'ok'], ['e5', 'spam'], ['e6', 'ok']]);
    await press('m1g1-verify');
    expect(api.status).toBe('failed');
    await call('e2', 'spam');
    expect(screen.getByTestId('m1g1-count-spam')).toHaveTextContent('2');
  });

  it('X-RAY (SCOUT) makes the next correct call; in round 2 it acts on the new emails', async () => {
    const api = await setup({ hero: 'scout' });
    expect(await power(api)).toBe(true);
    expect(api.lastSay()).toEqual({ text: 'X-RAY: that one is SPAM.', mood: 'good' });
    expect(screen.getByTestId('m1g1-call-e1')).toHaveTextContent('SPAM?');
    await callAll(ROUND1.slice(1));
    await press('m1g1-verify');
    await press('m1g1-next');
    expect(await power(api)).toBe(true);
    expect(api.lastSay()).toEqual({ text: 'X-RAY: that one is NOT SPAM.', mood: 'good' });
    expect(screen.getByTestId('m1g1-call-t1')).toHaveTextContent('NOT SPAM?');
    expect(api.powerUses).toBe(0);
  });

  it('X-RAY with everything called, after VERIFY and on the result screen is not consumed', async () => {
    const api = await setup({ hero: 'scout' });
    await callAll(ROUND1);
    expect(await power(api)).toBe(false);
    await press('m1g1-verify');
    expect(await power(api)).toBe(false);
    await press('m1g1-next');
    await callAll(ROUND2);
    await press('m1g1-verify');
    await press('m1g1-next');
    expect(await power(api)).toBe(false);
    expect(api.powerUses).toBe(2);
    expect(api.calls.toast).toEqual([NOTHING_TO_USE, NOTHING_TO_USE, NOTHING_TO_USE]);
  });

  it('FOCUS (ORACLE) glows the next email and its bin without calling it; the glow clears after 2.2 s', async () => {
    const api = await setup({ hero: 'oracle' });
    expect(await power(api)).toBe(true);
    expect(api.lastSay()).toEqual({ text: 'FOCUS: look at the glowing pair.', mood: 'good' });
    expect(screen.queryByTestId('m1g1-call-e1')).toBeNull();
    await tick(2200);
    expect(api.powerUses).toBe(1);
    await call('e1', 'spam');
    expect(screen.getByTestId('m1g1-call-e1')).toHaveTextContent('SPAM?');
  });

  it('SHIELD (GUARDIAN) blocks only the first wrong call of a VERIFY', async () => {
    const api = await setup({ hero: 'guard' });
    expect(await power(api)).toBe(true);
    expect(await power(api)).toBe(false);
    await callAll([['e1', 'ok'], ['e2', 'spam'], ['e3', 'spam'], ['e4', 'ok'], ['e5', 'spam'], ['e6', 'ok']]);
    await press('m1g1-verify');
    expect(api.hearts).toBe(2);
    expect(api.lost).toBe(1);
    expect(api.calls.say).toContainEqual({ text: `SHIELDED! ${ROUND1_WRONG}`, mood: 'good' });
  });

  it('REWIND (CHRONO) restores a heart after a wrong call; the verified rows stay as they are', async () => {
    const api = await setup({ hero: 'chrono' });
    expect(await power(api)).toBe(false);
    await callAll([['e1', 'ok'], ['e2', 'ok'], ['e3', 'spam'], ['e4', 'ok'], ['e5', 'spam'], ['e6', 'ok']]);
    await press('m1g1-verify');
    expect(api.hearts).toBe(2);
    expect(await power(api)).toBe(true);
    expect(api.hearts).toBe(3);
    expect(api.lost).toBe(1);
    expect(screen.getByTestId('m1g1-verify-e1')).toHaveTextContent("✗ IT'S SPAM");
  });
});
