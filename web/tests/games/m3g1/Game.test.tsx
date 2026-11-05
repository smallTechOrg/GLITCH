// m3g1 · Proxy Hunt — component behaviour against the frame-exact test GameApi:
// taps, misses/hearts, 700 ms win, powers per hero, keyboard + screen-reader labels.
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import type { HeroId } from '@/contracts/ids';
import game from '@/games/m3g1';
import { FOCUS_LINE, MISS_MESSAGE, WIN_SUMMARY } from '@/games/m3g1/data';
import { createTestGameApi, renderWithProviders } from '@/testing/renderWithProviders';
import { NOTHING_TO_USE, SHIELDED_PREFIX } from '@/testing/testGameApi';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

async function setup(hero: HeroId = 'scout', opts: { hearts?: number } = {}) {
  const api = createTestGameApi({ hero, ...opts });
  const G = game.Component;
  await renderWithProviders(<G api={api} />);
  return api;
}

const press = async (i: number) => {
  await fireEvent.press(screen.getByTestId(`pick-line-${i}`));
};
const advance = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

describe('m3g1 definition', () => {
  it('registers as module 3 with the v3 title, goal and intro', () => {
    expect(game).toMatchObject({
      id: 'm3g1',
      module: 3,
      title: 'Proxy Hunt',
      goal: 'SPOT THE ERROR · FIND 5 PROXIES',
      intro: 'Name and gender are hidden. Tap the 5 lines that still give gender away.',
    });
  });
});

describe('<Proxy Hunt>', () => {
  it("renders ANAYA's resume with redacted NAME / GENDER and the 0/5 counter", async () => {
    await setup();
    expect(screen.getByText('ANAYA · RESUME · SCREENED BY AI')).toBeTruthy();
    expect(screen.getByTestId('pick-found')).toHaveTextContent('PROXIES FOUND: 0/5');
    expect(screen.getByTestId('pick-line-0')).toHaveTextContent(/NAME: ▮▮▮▮▮▮ REMOVED/);
    expect(screen.getByTestId('pick-line-1')).toHaveTextContent(/GENDER: ▮▮▮▮▮▮ REMOVED/);
    expect(screen.getByTestId('pick-line-0').props.accessibilityRole).toBeUndefined();
    expect(screen.getByTestId('pick-line-1').props.accessibilityLabel).toBe('2. GENDER: removed');
  });

  it('pressing a redacted line does nothing', async () => {
    const api = await setup();
    await press(0);
    await press(1);
    expect(api.calls.miss).toHaveLength(0);
    expect(api.calls.say).toHaveLength(0);
    expect(screen.getByTestId('pick-found')).toHaveTextContent('PROXIES FOUND: 0/5');
  });

  it('every interactive line is a labelled, keyboard-focusable button', async () => {
    await setup();
    for (let i = 2; i <= 10; i++) {
      const el = screen.getByTestId(`pick-line-${i}`);
      expect(el.props.accessibilityRole).toBe('button');
      expect(el.props.accessibilityLabel).toMatch(new RegExp(`^${i + 1}\\. `));
    }
    expect(screen.getByTestId('pick-line-2').props.accessibilityLabel).toBe("3. College: Maple Women's College");
  });

  it('a proxy tap shows PROXY + note, counts it and says "Proxy found! <note>"', async () => {
    const api = await setup();
    await press(4);
    expect(screen.getByTestId('pick-line-4')).toHaveTextContent(/PROXY/);
    expect(screen.getByTestId('pick-line-4')).toHaveTextContent(/Can stand in for gender and caregiving\./);
    expect(screen.getByTestId('pick-line-4').props.accessibilityLabel).toBe('5. Career break: 18 months, PROXY');
    expect(screen.getByTestId('pick-found')).toHaveTextContent('PROXIES FOUND: 1/5');
    expect(api.lastSay()).toEqual({ text: 'Proxy found! Can stand in for gender and caregiving.', mood: 'good' });
    expect(api.calls.miss).toHaveLength(0);
  });

  it('a real-signal tap shows OK + note, costs a heart with the v3 message and disables the line', async () => {
    const api = await setup();
    await press(7);
    expect(screen.getByTestId('pick-line-7')).toHaveTextContent(/OK/);
    expect(screen.getByTestId('pick-line-7')).toHaveTextContent(/A real skill\./);
    expect(api.calls.miss).toEqual([MISS_MESSAGE]);
    expect(api.hearts).toBe(2);
    expect(screen.getByTestId('pick-line-7').props.accessibilityState).toMatchObject({ disabled: true });
    await press(7);
    expect(api.calls.miss).toHaveLength(1);
  });

  it('a marked proxy cannot be counted twice', async () => {
    await setup();
    await press(2);
    await press(2);
    expect(screen.getByTestId('pick-found')).toHaveTextContent('PROXIES FOUND: 1/5');
  });

  it('wins exactly 700 ms after the 5th proxy with the v3 summary and 3 hearts (flawless)', async () => {
    const api = await setup();
    for (const i of [2, 3, 4, 5, 6]) await press(i);
    expect(screen.getByTestId('pick-found')).toHaveTextContent('PROXIES FOUND: 5/5');
    await advance(699);
    expect(api.calls.win).toHaveLength(0);
    await advance(1);
    expect(api.calls.win).toEqual([WIN_SUMMARY]);
    expect(api.hearts).toBe(3);
    expect(api.lost).toBe(0);
  });

  it('a win after one wrong tap leaves 2 hearts (2 stars)', async () => {
    const api = await setup();
    await press(10);
    for (const i of [2, 3, 4, 5, 6]) await press(i);
    await advance(700);
    expect(api.status).toBe('won');
    expect(api.hearts).toBe(2);
  });

  it('three wrong taps run out of hearts and further taps are ignored', async () => {
    const api = await setup();
    await press(7);
    await press(8);
    await press(9);
    expect(api.status).toBe('failed');
    expect(api.hearts).toBe(0);
    await press(10);
    await press(2);
    expect(api.calls.miss).toHaveLength(3);
    expect(screen.getByTestId('pick-found')).toHaveTextContent('PROXIES FOUND: 0/5');
  });

  it('SHIELD (GUARDIAN) blocks the next wrong tap without losing a heart', async () => {
    const api = await setup('guard');
    await act(async () => {
      expect(api.usePower()).toBe(true);
    });
    await press(8);
    expect(api.hearts).toBe(3);
    expect(api.lost).toBe(0);
    expect(api.lastSay()).toEqual({ text: SHIELDED_PREFIX + MISS_MESSAGE, mood: 'good' });
    await act(async () => {
      expect(api.usePower()).toBe(true);
    });
    expect(api.powerUses).toBe(0);
  });

  it('REWIND (CHRONO) restores a heart after a mistake and is not consumed at full hearts', async () => {
    const api = await setup('chrono');
    await act(async () => {
      expect(api.usePower()).toBe(false);
    });
    expect(api.calls.toast).toEqual([NOTHING_TO_USE]);
    await press(9);
    expect(api.hearts).toBe(2);
    await act(async () => {
      expect(api.usePower()).toBe(true);
    });
    expect(api.hearts).toBe(3);
    expect(api.lost).toBe(1);
  });

  it('X-RAY (SCOUT) catches the next proxy in v3 order', async () => {
    const api = await setup('scout');
    await press(2);
    await act(async () => {
      expect(api.usePower()).toBe(true);
    });
    expect(screen.getByTestId('pick-line-3')).toHaveTextContent(/PROXY/);
    expect(screen.getByTestId('pick-found')).toHaveTextContent('PROXIES FOUND: 2/5');
    expect(api.lastSay()?.text).toBe("Proxy found! Stands in for gender.");
  });

  it('X-RAY on the last proxy still triggers the 700 ms win', async () => {
    const api = await setup('scout');
    for (const i of [2, 3, 4, 5]) await press(i);
    await act(async () => {
      expect(api.usePower()).toBe(true);
    });
    await advance(700);
    expect(api.calls.win).toEqual([WIN_SUMMARY]);
  });

  it('FOCUS (ORACLE) marks the next real skill OK with no heart cost', async () => {
    const api = await setup('oracle');
    await act(async () => {
      expect(api.usePower()).toBe(true);
    });
    expect(screen.getByTestId('pick-line-7')).toHaveTextContent(/OK/);
    expect(api.lastSay()).toEqual({ text: FOCUS_LINE, mood: 'good' });
    expect(api.hearts).toBe(3);
    expect(api.calls.miss).toHaveLength(0);
    await act(async () => {
      expect(api.usePower()).toBe(true);
    });
    expect(screen.getByTestId('pick-line-8')).toHaveTextContent(/OK/);
    expect(api.powerUses).toBe(0);
  });

  it('FOCUS with every real line already marked is not consumed', async () => {
    const api = await setup('oracle');
    // Tap two real lines (2 hearts lost), FOCUS marks the other two → nothing left to hint.
    await press(7);
    await press(8);
    await act(async () => {
      expect(api.usePower()).toBe(true);
    });
    await act(async () => {
      expect(api.usePower()).toBe(true);
    });
    expect(screen.getByTestId('pick-line-10')).toHaveTextContent(/OK/);
    let r: boolean | undefined;
    await act(async () => {
      r = api.powers.hint?.();
    });
    expect(r).toBe(false);
  });
});
