// rememberMistake / onGameWon through the real store, and the Home REVIEW panel
// (mistake-memory.md success criteria; spec/ui.md → REVIEW test IDs).
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { STATE_STORAGE_KEY } from '@/contracts/state';
import { onGameWon, rememberMistake } from '@/features/memory';
import { ReviewPanel } from '@/features/memory/ReviewPanel';
import { hydrateStore, resetHydrationForTests, resetStoreForTests, useGlitchStore } from '@/state/store';
import { renderWithProviders } from '@/testing/renderWithProviders';
import { sm } from '../recap/fixtures';

jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), replace: jest.fn(), push: jest.fn(), back: jest.fn() },
}));

const proxy = (i: number, sec: number) =>
  sm(i, { gameId: 'm3g1', itemId: `l${i}`, answer: 'ok', correct: 'proxy', concept: 'Proxy variables', itemText: `Line ${i}`, answerLabel: 'OK', correctLabel: 'PROXY', at: new Date(Date.UTC(2026, 9, 20, 11, 0, sec)).toISOString() });

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(async () => {
  await AsyncStorage.clear();
  (router.navigate as jest.Mock).mockClear();
});

describe('rememberMistake', () => {
  beforeEach(() => resetStoreForTests());

  it('saves each miss immediately, newest first, ids only (shielded included)', () => {
    rememberMistake(sm(1));
    rememberMistake(sm(2, { shielded: true }));
    const m = useGlitchStore.getState().mistakes;
    expect(m.map((r) => [r.itemId, r.shielded])).toEqual([['e2', true], ['e1', false]]);
    expect(Object.keys(m[0] ?? {}).sort()).toEqual(['answer', 'at', 'concept', 'gameId', 'itemId', 'shielded', 'variationId']);
  });

  it('a malformed payload is dropped, not stored', () => {
    rememberMistake(sm(1, { itemId: 'has space' }));
    expect(useGlitchStore.getState().mistakes).toEqual([]);
  });

  it('201 → 200 stored via the store', () => {
    for (let i = 0; i < 201; i++) rememberMistake(sm(i, { itemId: `i${i}` }));
    const m = useGlitchStore.getState().mistakes;
    expect(m).toHaveLength(200);
    expect(m[0]?.itemId).toBe('i200');
    expect(m.find((r) => r.itemId === 'i0')).toBeUndefined();
  });

  it('records are written to device storage', async () => {
    rememberMistake(proxy(1, 1));
    await flush();
    const disk = JSON.parse((await AsyncStorage.getItem(STATE_STORAGE_KEY)) ?? '{}') as { mistakes?: unknown[] };
    expect(disk.mistakes).toHaveLength(1);
  });
});

describe('onGameWon', () => {
  beforeEach(() => resetStoreForTests());

  it('a 2-star win keeps the records; a 3-star clear of that game removes its concepts from every game', () => {
    rememberMistake(proxy(1, 1));
    rememberMistake(proxy(2, 2));
    rememberMistake(sm(3));
    onGameWon('m3g1', 2);
    expect(useGlitchStore.getState().mistakes).toHaveLength(3);
    onGameWon('m3g1', 3);
    expect(useGlitchStore.getState().mistakes.map((r) => r.concept)).toEqual(['Training data']);
  });

  it('a 3-star win of a game with no matching records changes nothing', () => {
    rememberMistake(sm(3));
    const before = useGlitchStore.getState().mistakes;
    onGameWon('m4g3', 3);
    expect(useGlitchStore.getState().mistakes).toBe(before);
  });
});

describe('<ReviewPanel>', () => {
  it('no records → not rendered', async () => {
    await renderWithProviders(<ReviewPanel />);
    expect(screen.queryByTestId('home-review')).toBeNull();
  });

  it('missing two proxies then a 2-star Proxy Hunt win → "Proxy variables · 2 misses" + "Replay Proxy Hunt"; later 3-star clear removes it', async () => {
    await renderWithProviders(<ReviewPanel />);
    await act(async () => {
      rememberMistake(proxy(1, 1));
      rememberMistake(proxy(2, 2));
      onGameWon('m3g1', 2);
    });
    expect(screen.getByTestId('home-review')).toHaveTextContent(/REVIEW · IDEAS TO PRACTISE/);
    expect(screen.getByTestId('review-concept-proxy-variables')).toHaveTextContent(/Proxy variables · 2 misses/);
    const btn = screen.getByTestId('review-replay-proxy-variables');
    expect(btn).toHaveTextContent('Replay Proxy Hunt');
    expect(btn.props.accessibilityRole).toBe('button');
    await fireEvent.press(btn);
    expect(router.navigate).toHaveBeenCalledWith('/module/3/game/m3g1');
    await act(async () => {
      onGameWon('m3g1', 3);
    });
    expect(screen.queryByTestId('review-concept-proxy-variables')).toBeNull();
    expect(screen.queryByTestId('home-review')).toBeNull();
  });

  it('one miss → singular "1 miss"; shows at most 3 concepts in rank order', async () => {
    await renderWithProviders(<ReviewPanel />);
    await act(async () => {
      rememberMistake(sm(1, { gameId: 'm1g2', itemId: 's0', answer: 'fib', concept: 'Machine learning', at: '2026-10-20T10:00:01.000Z' }));
      rememberMistake(sm(2, { at: '2026-10-20T10:00:02.000Z' }));
      rememberMistake(sm(3, { at: '2026-10-20T10:00:03.000Z' }));
      rememberMistake(proxy(1, 4));
      rememberMistake(sm(4, { gameId: 'm4g3', itemId: 'age', answer: 'low', concept: 'Human oversight', at: '2026-10-20T12:00:00.000Z' }));
    });
    expect(screen.getByTestId('review-concept-training-data')).toHaveTextContent(/Training data · 2 misses/);
    expect(screen.getByTestId('review-concept-human-oversight')).toHaveTextContent(/Human oversight · 1 miss(?!es)/);
    expect(screen.getByTestId('review-concept-proxy-variables')).toBeTruthy();
    expect(screen.queryByTestId('review-concept-machine-learning')).toBeNull();
    expect(screen.getByTestId('review-replay-human-oversight')).toHaveTextContent('Replay Design the Companion');
  });

  it('Reset progress empties REVIEW', async () => {
    await renderWithProviders(<ReviewPanel />);
    await act(async () => {
      rememberMistake(proxy(1, 1));
    });
    expect(screen.getByTestId('home-review')).toBeTruthy();
    await act(async () => {
      useGlitchStore.getState().resetProgress();
    });
    expect(screen.queryByTestId('home-review')).toBeNull();
    expect(useGlitchStore.getState().mistakes).toEqual([]);
  });

  it('survives a reload (records re-read from device storage)', async () => {
    resetStoreForTests();
    rememberMistake(proxy(1, 1));
    rememberMistake(proxy(2, 2));
    await flush();
    const raw = await AsyncStorage.getItem(STATE_STORAGE_KEY);
    resetStoreForTests();
    resetHydrationForTests();
    await flush();
    expect(useGlitchStore.getState().mistakes).toEqual([]);
    await AsyncStorage.setItem(STATE_STORAGE_KEY, raw ?? '');
    await hydrateStore();
    expect(useGlitchStore.getState().mistakes).toHaveLength(2);
    // render without resetting the hydrated store
    await render(<ReviewPanel />);
    expect(screen.getByTestId('review-concept-proxy-variables')).toHaveTextContent(/Proxy variables · 2 misses/);
  });
});
