// m4g1 · Source Detective component: tap-to-select / keyboard sort, CHECK lookups, Ask NOVA,
// hearts, powers, screen-reader labels. (Enter/Space on role=button IS onPress on RN Web.)
import React from 'react';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import type { HeroId } from '@/contracts/ids';
import game from '@/games/m4g1';
import { ASK_MISS, ITEMS, NOVA_REPLY, SUMMARY, WRONG } from '@/games/m4g1/data';
import { createTestGameApi, renderWithProviders } from '@/testing/renderWithProviders';
import type { TestGameApiOptions } from '@/testing/testGameApi';

const Game = game.Component;

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

async function setup(o: TestGameApiOptions & { hero?: HeroId } = {}) {
  const api = createTestGameApi(o);
  await renderWithProviders(<Game api={api} />);
  return api;
}

async function place(item: string, zone: string): Promise<void> {
  await fireEvent.press(screen.getByTestId(`dnd-item-${item}`));
  await fireEvent.press(screen.getByTestId(`dnd-zone-${zone}`));
}

async function solveAll(): Promise<void> {
  for (const it of ITEMS) await place(it.id, it.answer as string);
}

async function flush(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

describe('m4g1 Source Detective', () => {
  it('renders the bibliography heading, 3 lookups, KEEP/CUT zones and all 5 citations', async () => {
    await setup();
    expect(screen.getByText("NOVA'S BIBLIOGRAPHY")).toBeTruthy();
    expect(screen.getByText('CATALOGUE LOOKUPS LEFT: 3')).toBeTruthy();
    expect(screen.getByTestId('dnd-zone-keep')).toBeTruthy();
    expect(screen.getByTestId('dnd-zone-cut')).toBeTruthy();
    const pool = screen.getByTestId('dnd-pool');
    for (const it of ITEMS) {
      expect(within(pool).getByTestId(`dnd-item-${it.id}`)).toBeTruthy();
      expect(within(pool).getByText(it.text)).toBeTruthy();
      expect(screen.getByTestId(`m4g1-check-${it.id}`)).toBeTruthy();
    }
  });

  it('is won by tap-to-select with 3 hearts, 350 ms after the last placement, with the v3 summary', async () => {
    const api = await setup();
    await solveAll();
    await flush(349);
    expect(api.calls.win).toHaveLength(0);
    await flush(1);
    expect(api.calls.win).toEqual([SUMMARY]);
    expect(api.hearts).toBe(3);
    expect(api.lost).toBe(0);
  });

  it('is playable by keyboard activation (Enter/Space → press) on items and zones', async () => {
    const api = await setup();
    const item = screen.getByTestId('dnd-item-c3');
    expect(item.props.accessibilityRole).toBe('button');
    expect(screen.getByTestId('dnd-zone-keep').props.accessibilityRole).toBe('button');
    await fireEvent(item, 'press');
    expect(screen.getByTestId('dnd-item-c3').props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent(screen.getByTestId('dnd-zone-keep'), 'press');
    expect(within(screen.getByTestId('dnd-zone-keep')).getByTestId('dnd-item-c3')).toBeTruthy();
    expect(api.calls.miss).toHaveLength(0);
  });

  it('shows the short label once a citation is placed (zones on top)', async () => {
    await setup();
    await place('c2', 'cut');
    const zone = screen.getByTestId('dnd-zone-cut');
    expect(within(zone).getByText('Dr. Elena Marsh')).toBeTruthy();
    expect(within(zone).getByTestId('dnd-item-c2').props.accessibilityLabel).toBe(`${ITEMS[1]!.text}, placed in CUT`);
    expect(screen.queryByTestId('m4g1-check-c2')).toBeNull();
  });

  it('a wrong drop costs a heart with the clue message and leaves the item in the pool', async () => {
    const api = await setup();
    await place('c4', 'keep');
    expect(api.calls.miss).toEqual([WRONG]);
    expect(api.hearts).toBe(2);
    expect(within(screen.getByTestId('dnd-pool')).getByTestId('dnd-item-c4')).toBeTruthy();
  });

  it('CHECK reveals FOUND / NOT FOUND, spends lookups, and never selects the item', async () => {
    const api = await setup();
    await fireEvent.press(screen.getByTestId('m4g1-check-c1'));
    expect(screen.getByTestId('m4g1-result-c1')).toBeTruthy();
    expect(within(screen.getByTestId('m4g1-result-c1')).getByText('FOUND')).toBeTruthy();
    expect(api.lastSay()).toEqual({ text: 'Found in the catalogue.', mood: 'good' });
    expect(screen.getByText('CATALOGUE LOOKUPS LEFT: 2')).toBeTruthy();
    expect(screen.getByTestId('dnd-item-c1').props.accessibilityState).toMatchObject({ selected: false });
    expect(screen.getByTestId('m4g1-check-c1').props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByTestId('m4g1-check-c1').props.accessibilityLabel).toBe('UNESCO: FOUND');

    await fireEvent.press(screen.getByTestId('m4g1-check-c4'));
    expect(within(screen.getByTestId('m4g1-result-c4')).getByText('NOT FOUND')).toBeTruthy();
    expect(api.lastSay()).toEqual({ text: 'Not in any catalogue. Invented!', mood: 'bad' });
    expect(screen.getByTestId('m4g1-lookups').props.accessibilityLabel).toBe('Catalogue lookups left: 1');
    expect(api.hearts).toBe(3);
  });

  it('pressing an already-checked CHECK spends no lookup', async () => {
    await setup();
    await fireEvent.press(screen.getByTestId('m4g1-check-c2'));
    await fireEvent.press(screen.getByTestId('m4g1-check-c2'));
    expect(screen.getByText('CATALOGUE LOOKUPS LEFT: 2')).toBeTruthy();
  });

  it('the 4th CHECK says "No lookups left…" and costs no heart', async () => {
    const api = await setup();
    for (const id of ['c1', 'c2', 'c3']) await fireEvent.press(screen.getByTestId(`m4g1-check-${id}`));
    expect(screen.getByText('CATALOGUE LOOKUPS LEFT: 0')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('m4g1-check-c4'));
    expect(api.lastSay()).toEqual({ text: 'No lookups left. Use the clues instead.', mood: 'bad' });
    expect(screen.queryByTestId('m4g1-result-c4')).toBeNull();
    expect(api.hearts).toBe(3);
    expect(api.calls.miss).toHaveLength(0);
  });

  it('"Ask NOVA" shows NOVA\'s claim, disables itself and costs exactly one heart', async () => {
    const api = await setup();
    expect(screen.queryByTestId('m4g1-nova-reply')).toBeNull();
    await fireEvent.press(screen.getByTestId('m4g1-ask-nova'));
    expect(within(screen.getByTestId('m4g1-nova-reply')).getByText(NOVA_REPLY)).toBeTruthy();
    expect(api.calls.miss).toEqual([ASK_MISS]);
    expect(api.hearts).toBe(2);
    expect(screen.getByTestId('m4g1-ask-nova').props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByTestId('m4g1-ask-nova'));
    expect(api.calls.miss).toHaveLength(1);
    expect(api.hearts).toBe(2);
  });

  it('"Ask NOVA" with the shield up costs zero hearts and drops the shield', async () => {
    const api = await setup({ shield: true });
    await fireEvent.press(screen.getByTestId('m4g1-ask-nova'));
    expect(api.hearts).toBe(3);
    expect(api.lost).toBe(0);
    expect(api.shield).toBe(false);
    expect(api.lastSay()?.text).toBe(`SHIELDED! ${ASK_MISS}`);
  });

  it('a win after asking NOVA keeps 2 hearts (→ 2 stars)', async () => {
    const api = await setup();
    await fireEvent.press(screen.getByTestId('m4g1-ask-nova'));
    await solveAll();
    await flush(350);
    expect(api.calls.win).toEqual([SUMMARY]);
    expect(api.hearts).toBe(2);
  });

  it('runs out of hearts after three wrong moves and then ignores input', async () => {
    const api = await setup();
    await fireEvent.press(screen.getByTestId('m4g1-ask-nova'));
    await place('c2', 'keep');
    await place('c1', 'cut');
    expect(api.status).toBe('failed');
    await fireEvent.press(screen.getByTestId('m4g1-check-c3'));
    expect(screen.getByText('CATALOGUE LOOKUPS LEFT: 3')).toBeTruthy();
    await place('c3', 'keep');
    expect(within(screen.getByTestId('dnd-pool')).getByTestId('dnd-item-c3')).toBeTruthy();
  });

  it('X-RAY (SCOUT) places c1 in KEEP', async () => {
    const api = await setup({ hero: 'scout' });
    await act(async () => {
      expect(api.usePower()).toBe(true);
    });
    expect(within(screen.getByTestId('dnd-zone-keep')).getByTestId('dnd-item-c1')).toBeTruthy();
    expect(api.lastSay()).toEqual({ text: 'X-RAY: that one goes in KEEP.', mood: 'good' });
  });

  it('FOCUS (ORACLE) flashes the first pair (no decoys to dim)', async () => {
    const api = await setup({ hero: 'oracle' });
    await act(async () => {
      expect(api.usePower()).toBe(true);
    });
    expect(api.lastSay()).toEqual({ text: 'FOCUS: look at the glowing pair.', mood: 'good' });
  });

  it('REWIND (CHRONO) restores the heart NOVA cost', async () => {
    const api = await setup({ hero: 'chrono' });
    await fireEvent.press(screen.getByTestId('m4g1-ask-nova'));
    await act(async () => {
      expect(api.usePower()).toBe(true);
    });
    expect(api.hearts).toBe(3);
    expect(api.lost).toBe(1);
  });

  it('SHIELD (GUARDIAN) blocks the Ask NOVA heart cost', async () => {
    const api = await setup({ hero: 'guard' });
    await act(async () => {
      expect(api.usePower()).toBe(true);
    });
    await fireEvent.press(screen.getByTestId('m4g1-ask-nova'));
    expect(api.hearts).toBe(3);
    expect(api.shield).toBe(false);
  });

  it('labels every control for screen readers', async () => {
    await setup();
    expect(screen.getByTestId('m4g1-ask-nova').props.accessibilityLabel).toBe('Ask NOVA: are these real?');
    expect(screen.getByTestId('m4g1-check-c5').props.accessibilityLabel).toBe('Check OECD in the catalogue');
    expect(screen.getByTestId('m4g1-lookups').props.accessibilityLabel).toBe('Catalogue lookups left: 3');
    expect(screen.getByTestId('dnd-item-c5').props.accessibilityLabel).toBe(ITEMS[4]!.text);
    expect(screen.getByTestId('dnd-zone-keep').props.accessibilityLabel).toBe('KEEP zone, 0 placed');
  });
});
