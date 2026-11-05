// m4g1 · Source Detective component: one source on show at a time, tap-to-select / keyboard sort,
// CHECK lookups, Ask NOVA, hearts, powers, screen-reader labels. (Enter/Space on role=button IS onPress on RN Web.)
import React from 'react';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import type { HeroId } from '@/contracts/ids';
import game from '@/games/m4g1';
import { ASK_MISS, CITATIONS, EXCERPT_LABEL, ITEMS, NOVA_REPLY, SUMMARY, WRONG } from '@/games/m4g1/data';
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

async function show(item: string): Promise<void> {
  const tab = screen.queryByTestId(`deck-tab-${item}`);
  if (tab) await fireEvent.press(tab);
}

async function place(item: string, zone: string): Promise<void> {
  await show(item);
  await fireEvent.press(screen.getByTestId(`dnd-item-${item}`));
  await fireEvent.press(screen.getByTestId(`dnd-zone-${zone}`));
}

async function check(item: string): Promise<void> {
  await show(item);
  await fireEvent.press(screen.getByTestId(`m4g1-check-${item}`));
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
  it('renders the heading, 3 lookups, KEEP/CUT zones, a tab per source and only the first source', async () => {
    await setup();
    expect(screen.getByText("NOVA'S BIBLIOGRAPHY")).toBeTruthy();
    expect(screen.getByText('LOOKUPS LEFT: 3')).toBeTruthy();
    expect(screen.getByTestId('dnd-zone-keep')).toBeTruthy();
    expect(screen.getByTestId('dnd-zone-cut')).toBeTruthy();
    const pool = screen.getByTestId('dnd-pool');
    for (const it of ITEMS) expect(within(pool).getByTestId(`deck-tab-${it.id}`)).toBeTruthy();
    expect(within(pool).getByTestId('dnd-item-c1')).toBeTruthy();
    expect(within(pool).getByText(ITEMS[0]!.text)).toBeTruthy();
    for (const id of ['c2', 'c3', 'c4', 'c5']) expect(within(pool).queryByTestId(`dnd-item-${id}`)).toBeNull();
  });

  it.each(CITATIONS.map((c) => [c[0], c[1], c[3]] as const))('%s shows its citation and what it says', async (id, text, excerpt) => {
    await setup();
    await show(id);
    expect(screen.getByTestId(`m4g1-citation-${id}`)).toHaveTextContent(text);
    expect(screen.getByTestId(`m4g1-excerpt-${id}`)).toHaveTextContent(excerpt);
    expect(screen.getByText(EXCERPT_LABEL)).toBeTruthy();
    expect(screen.getByTestId(`m4g1-check-${id}`)).toBeTruthy();
  });

  it('tapping a zone drops the source on show, then the next one comes up', async () => {
    const api = await setup();
    await fireEvent.press(screen.getByTestId('dnd-zone-keep'));
    expect(within(screen.getByTestId('dnd-zone-keep')).getByTestId('dnd-item-c1')).toBeTruthy();
    expect(within(screen.getByTestId('dnd-pool')).getByTestId('dnd-item-c2')).toBeTruthy();
    expect(screen.queryByTestId('deck-tab-c1')).toBeNull();
    expect(api.calls.miss).toHaveLength(0);
  });

  it('a wrong zone tap costs a heart and keeps the source on show', async () => {
    const api = await setup();
    await fireEvent.press(screen.getByTestId('dnd-zone-cut'));
    expect(api.calls.miss).toEqual([WRONG]);
    expect(within(screen.getByTestId('dnd-pool')).getByTestId('dnd-item-c1')).toBeTruthy();
  });

  it('switching tabs drops any selection, so a zone tap acts on what is on show', async () => {
    await setup();
    await fireEvent.press(screen.getByTestId('dnd-item-c1'));
    await show('c3');
    await fireEvent.press(screen.getByTestId('dnd-zone-keep'));
    expect(within(screen.getByTestId('dnd-zone-keep')).getByTestId('dnd-item-c3')).toBeTruthy();
    expect(within(screen.getByTestId('dnd-zone-keep')).queryByTestId('dnd-item-c1')).toBeNull();
  });

  it('is won with 3 hearts, 350 ms after the last placement, with the v3 summary', async () => {
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
    await show('c3');
    const item = screen.getByTestId('dnd-item-c3');
    expect(item.props.accessibilityRole).toBe('button');
    expect(screen.getByTestId('dnd-zone-keep').props.accessibilityRole).toBe('button');
    await fireEvent(item, 'press');
    expect(screen.getByTestId('dnd-item-c3').props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent(screen.getByTestId('dnd-zone-keep'), 'press');
    expect(within(screen.getByTestId('dnd-zone-keep')).getByTestId('dnd-item-c3')).toBeTruthy();
    expect(api.calls.miss).toHaveLength(0);
  });

  it('shows the short label once a citation is placed', async () => {
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
    await check('c1');
    expect(screen.getByTestId('m4g1-result-c1')).toBeTruthy();
    expect(within(screen.getByTestId('m4g1-result-c1')).getByText('FOUND')).toBeTruthy();
    expect(api.lastSay()).toEqual({ text: 'Found in the catalogue.', mood: 'good' });
    expect(screen.getByText('LOOKUPS LEFT: 2')).toBeTruthy();
    expect(screen.getByTestId('dnd-item-c1').props.accessibilityState).toMatchObject({ selected: false });
    expect(screen.getByTestId('m4g1-check-c1').props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByTestId('m4g1-check-c1').props.accessibilityLabel).toBe('UNESCO: FOUND');

    await check('c4');
    expect(within(screen.getByTestId('m4g1-result-c4')).getByText('NOT FOUND')).toBeTruthy();
    expect(api.lastSay()).toEqual({ text: 'Not in any catalogue. Invented!', mood: 'bad' });
    expect(screen.getByTestId('m4g1-lookups').props.accessibilityLabel).toBe('Catalogue lookups left: 1');
    expect(api.hearts).toBe(3);
  });

  it('a check result is still there after switching away and back', async () => {
    await setup();
    await check('c1');
    await show('c2');
    expect(screen.queryByTestId('m4g1-result-c1')).toBeNull();
    await show('c1');
    expect(within(screen.getByTestId('m4g1-result-c1')).getByText('FOUND')).toBeTruthy();
  });

  it('pressing an already-checked CHECK spends no lookup', async () => {
    await setup();
    await check('c2');
    await check('c2');
    expect(screen.getByText('LOOKUPS LEFT: 2')).toBeTruthy();
  });

  it('the 4th CHECK says "No lookups left…" and costs no heart', async () => {
    const api = await setup();
    for (const id of ['c1', 'c2', 'c3']) await check(id);
    expect(screen.getByText('LOOKUPS LEFT: 0')).toBeTruthy();
    await check('c4');
    expect(api.lastSay()).toEqual({ text: 'No lookups left. Use the clues instead.', mood: 'bad' });
    expect(screen.queryByTestId('m4g1-result-c4')).toBeNull();
    expect(api.hearts).toBe(3);
    expect(api.calls.miss).toHaveLength(0);
  });

  it('"Ask NOVA" swaps the button for NOVA\'s claim and costs exactly one heart', async () => {
    const api = await setup();
    expect(screen.queryByTestId('m4g1-nova-reply')).toBeNull();
    await fireEvent.press(screen.getByTestId('m4g1-ask-nova'));
    expect(within(screen.getByTestId('m4g1-nova-reply')).getByText(NOVA_REPLY)).toBeTruthy();
    expect(api.calls.miss).toEqual([ASK_MISS]);
    expect(api.hearts).toBe(2);
    expect(screen.queryByTestId('m4g1-ask-nova')).toBeNull();
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
    await check('c3');
    expect(screen.getByText('LOOKUPS LEFT: 3')).toBeTruthy();
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

  it('FOCUS (ORACLE) flashes the first pair and brings that source up', async () => {
    const api = await setup({ hero: 'oracle' });
    await show('c3');
    await act(async () => {
      expect(api.usePower()).toBe(true);
    });
    expect(api.lastSay()).toEqual({ text: 'FOCUS: look at the glowing pair.', mood: 'good' });
    expect(within(screen.getByTestId('dnd-pool')).getByTestId('dnd-item-c1')).toBeTruthy();
    await flush(2200);
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
    expect(screen.getByTestId('m4g1-lookups').props.accessibilityLabel).toBe('Catalogue lookups left: 3');
    expect(screen.getByTestId('dnd-zone-keep').props.accessibilityLabel).toBe('KEEP zone, 0 placed');
    expect(screen.getByTestId('dnd-zone-keep').props.accessibilityHint).toBe('Drop the selected item here');
    expect(screen.getByTestId('deck-tab-c5').props.accessibilityLabel).toBe('Item 5 of 5: OECD');
    await show('c5');
    expect(screen.getByTestId('m4g1-check-c5').props.accessibilityLabel).toBe('Check OECD in the catalogue');
    expect(screen.getByTestId('dnd-item-c5').props.accessibilityLabel).toBe(ITEMS[4]!.text);
  });

  it('unmounting before the win delay cancels the win (no stale timer fires)', async () => {
    const api = await setup();
    await solveAll();
    await flush(100);
    await screen.unmount();
    await flush(1000);
    expect(api.calls.win).toHaveLength(0);
  });
});
