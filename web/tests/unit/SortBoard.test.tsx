// <SortBoard>: tap-to-select + keyboard path (RN Web maps Enter/Space on role=button to
// onPress, so a press IS the keyboard activation), wrong drops, 350 ms done, powers.
import React from 'react';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { SortBoard } from '@/dnd/SortBoard';
import type { SortConfig } from '@/dnd/sortEngine';
import { createTestGameApi, renderWithProviders } from '@/testing/renderWithProviders';

const cfg: SortConfig = {
  items: [
    { id: 'e1', answer: 'spam', text: 'WIN a FREE prize!!! Click now', icon: 'envelope' },
    { id: 'e2', answer: 'ok', text: "Lunch at 1? I'm outside", icon: 'envelope' },
    { id: 'd1', answer: null, text: 'Decoy block' },
  ],
  zones: [
    { id: 'spam', label: 'SPAM', icon: 'warning', color: '#ff5d73' },
    { id: 'ok', label: 'NOT SPAM', icon: 'check', color: '#3ee98a' },
  ],
  wrong: () => 'Look at the features: shouting, prizes, passwords. Those go with SPAM.',
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

async function setup(hero: 'scout' | 'oracle' = 'scout') {
  const api = createTestGameApi({ hero });
  const onDone = jest.fn();
  await renderWithProviders(<SortBoard cfg={cfg} api={api} onDone={onDone} />);
  return { api, onDone };
}

describe('<SortBoard>', () => {
  it('renders every item in the pool and every zone as an accessible button', async () => {
    await setup();
    const pool = screen.getByTestId('dnd-pool');
    for (const id of ['e1', 'e2', 'd1']) expect(within(pool).getByTestId(`dnd-item-${id}`)).toBeTruthy();
    expect(screen.getByTestId('dnd-zone-spam').props.accessibilityRole).toBe('button');
    expect(screen.getByTestId('dnd-item-e1').props.accessibilityRole).toBe('button');
  });

  it('places an item by tap-to-select then tapping its zone', async () => {
    await setup();
    await fireEvent.press(screen.getByTestId('dnd-item-e1'));
    expect(screen.getByTestId('dnd-item-e1').props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(screen.getByTestId('dnd-zone-spam'));
    expect(within(screen.getByTestId('dnd-zone-spam')).getByTestId('dnd-item-e1')).toBeTruthy();
    expect(within(screen.getByTestId('dnd-pool')).queryByTestId('dnd-item-e1')).toBeNull();
  });

  it('deselects on a second press and ignores zone presses without a selection', async () => {
    const { api } = await setup();
    await fireEvent.press(screen.getByTestId('dnd-item-e1'));
    await fireEvent.press(screen.getByTestId('dnd-item-e1'));
    await fireEvent.press(screen.getByTestId('dnd-zone-spam'));
    expect(within(screen.getByTestId('dnd-pool')).getByTestId('dnd-item-e1')).toBeTruthy();
    expect(api.calls.miss).toHaveLength(0);
  });

  it('a wrong drop calls api.miss with the game message and costs a heart', async () => {
    const { api } = await setup();
    await fireEvent.press(screen.getByTestId('dnd-item-e2'));
    await fireEvent.press(screen.getByTestId('dnd-zone-spam'));
    expect(api.calls.miss).toEqual(['Look at the features: shouting, prizes, passwords. Those go with SPAM.']);
    expect(api.hearts).toBe(2);
    expect(within(screen.getByTestId('dnd-pool')).getByTestId('dnd-item-e2')).toBeTruthy();
  });

  it('fires onDone 350 ms after the last real placement, with the decoy still in the pool', async () => {
    const { onDone } = await setup();
    await fireEvent.press(screen.getByTestId('dnd-item-e1'));
    await fireEvent.press(screen.getByTestId('dnd-zone-spam'));
    await fireEvent.press(screen.getByTestId('dnd-item-e2'));
    await fireEvent.press(screen.getByTestId('dnd-zone-ok'));
    await act(async () => {
      jest.advanceTimersByTime(349);
    });
    expect(onDone).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('X-RAY (SCOUT) places the next item through the registered power and says where', async () => {
    const { api } = await setup('scout');
    await act(async () => {
      expect(api.usePower()).toBe(true);
    });
    expect(within(screen.getByTestId('dnd-zone-spam')).getByTestId('dnd-item-e1')).toBeTruthy();
    expect(api.lastSay()).toEqual({ text: 'X-RAY: that one goes in SPAM.', mood: 'good' });
    expect(api.powerUses).toBe(1);
  });

  it('FOCUS (ORACLE) dims the decoy first, then flashes a pair', async () => {
    const { api } = await setup('oracle');
    await act(async () => {
      api.usePower();
    });
    expect(api.lastSay()?.text).toBe('FOCUS: that one is not an answer. Skip it.');
    expect(screen.getByTestId('dnd-item-d1').props.accessibilityLabel).toMatch(/not an answer/);
    await act(async () => {
      api.usePower();
    });
    expect(api.lastSay()?.text).toBe('FOCUS: look at the glowing pair.');
    expect(api.powerUses).toBe(0);
  });

  it('ignores input once the session is over', async () => {
    const api = createTestGameApi({ hearts: 1 });
    await renderWithProviders(<SortBoard cfg={cfg} api={api} onDone={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('dnd-item-e2'));
    await fireEvent.press(screen.getByTestId('dnd-zone-spam'));
    expect(api.over).toBe(true);
    await fireEvent.press(screen.getByTestId('dnd-item-e1'));
    await fireEvent.press(screen.getByTestId('dnd-zone-spam'));
    expect(within(screen.getByTestId('dnd-pool')).getByTestId('dnd-item-e1')).toBeTruthy();
  });
});

describe('<SortBoard> Phase 3 mistake plumbing', () => {
  const mistake = (itemId: string, zoneId: string) => ({
    itemId, answer: zoneId, correct: 'spam', concept: 'Training data' as const, itemText: 'x', answerLabel: zoneId, correctLabel: 'SPAM',
  });

  it('passes cfg.mistake(item, zone) as the second miss argument on a wrong drop only', async () => {
    const api = createTestGameApi();
    const spy = jest.fn((it: { id: string }, z: { id: string }) => mistake(it.id, z.id));
    await renderWithProviders(<SortBoard cfg={{ ...cfg, mistake: spy }} api={api} onDone={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('dnd-item-e2'));
    await fireEvent.press(screen.getByTestId('dnd-zone-ok')); // right: no miss
    await fireEvent.press(screen.getByTestId('dnd-item-e1'));
    await fireEvent.press(screen.getByTestId('dnd-zone-ok')); // wrong
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toMatchObject({ id: 'e1' });
    expect(spy.mock.calls[0]?.[1]).toMatchObject({ id: 'ok', label: 'NOT SPAM' });
    expect(api.calls.mistakes).toEqual([mistake('e1', 'ok')]);
    expect(api.recorded).toEqual([{ mistake: mistake('e1', 'ok'), shielded: false }]);
  });

  it('without cfg.mistake the miss carries no payload (Phase-1 behaviour)', async () => {
    const { api } = await setup();
    await fireEvent.press(screen.getByTestId('dnd-item-e1'));
    await fireEvent.press(screen.getByTestId('dnd-zone-ok'));
    expect(api.calls.miss).toHaveLength(1);
    expect(api.calls.mistakes).toEqual([undefined]);
    expect(api.recorded).toEqual([]);
  });

  it('X-RAY and FOCUS never call cfg.mistake', async () => {
    const api = createTestGameApi({ powerUses: 4 });
    const spy = jest.fn(() => mistake('e1', 'ok'));
    await renderWithProviders(<SortBoard cfg={{ ...cfg, mistake: spy }} api={api} onDone={jest.fn()} />);
    await act(async () => {
      api.usePower('scan');
      api.usePower('hint');
    });
    expect(spy).not.toHaveBeenCalled();
    expect(api.recorded).toEqual([]);
  });
});
