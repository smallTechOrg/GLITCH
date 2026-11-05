// m2g2 · Prompt Forge — component: forges 1–2 by tap-to-select (= keyboard Enter/Space on
// RN Web), PROMPT BUILT, heart loss across forges, powers shared with FORGE 3, and the
// hand-off to the free-write round (mocked: slice E owns it).
import React from 'react';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import game from '@/games/m2g2';
import { PromptForgeGame } from '@/games/m2g2/Game';
import { ANOTHER_FORGE_LINE, FORGES, WIN_SUMMARY, WRONG_DECOY, WRONG_SLOT } from '@/games/m2g2/data';
import { SORT_DONE_DELAY_MS } from '@/dnd/sortEngine';
import { createTestGameApi, renderWithProviders } from '@/testing/renderWithProviders';
import type { TestGameApi as Api } from '@/testing/testGameApi';
import type { HeroId } from '@/contracts/ids';
import type { GameApi } from '@/contracts/game';

const mockFreeWrite = { lastApi: null as GameApi | null, renders: 0 };

jest.mock('@/features/freewrite/FreeWriteRound', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react') as typeof import('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable, Text } = require('react-native') as typeof import('react-native');
  return {
    FreeWriteRound: ({ api, onPassed }: { api: GameApi; onPassed: () => void }) => {
      mockFreeWrite.lastApi = api;
      mockFreeWrite.renders += 1;
      R.useEffect(() => {
        api.registerPowers({ scan: () => true, hint: () => true });
      }, [api]);
      return R.createElement(
        Pressable,
        { testID: 'fw-mock-pass', onPress: onPassed, accessibilityRole: 'button' },
        R.createElement(Text, null, 'FORGE 3 · FREE WRITE (mock)'),
      );
    },
  };
});

beforeEach(() => {
  jest.useFakeTimers();
  mockFreeWrite.lastApi = null;
  mockFreeWrite.renders = 0;
});
afterEach(() => jest.useRealTimers());

async function setup(opts: { hero?: HeroId; hearts?: number; powerUses?: number } = {}): Promise<Api> {
  const api = createTestGameApi(opts);
  await renderWithProviders(<PromptForgeGame api={api} />);
  return api;
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

async function tapSort(item: string, zone: string): Promise<void> {
  await fireEvent.press(screen.getByTestId(`dnd-item-${item}`));
  await fireEvent.press(screen.getByTestId(`dnd-zone-${zone}`));
}

/** Correct [item, slot] pairs for forge k. */
const pairs = (k: number): [string, string][] =>
  FORGES[k]!.blocks.flatMap((b, i) => (b[1] ? ([[`b${i}`, b[1]]] as [string, string][]) : []));

async function solveForge(k: number, order?: [string, string][]): Promise<void> {
  for (const [item, zone] of order ?? pairs(k)) await tapSort(item, zone);
  await advance(SORT_DONE_DELAY_MS);
}

describe('<PromptForgeGame>', () => {
  it('is the registered m2g2 component', () => {
    expect(game.Component).toBe(PromptForgeGame);
  });

  it('renders FORGE 1 with its 8 blocks in the pool and the 5 slots', async () => {
    await setup();
    expect(screen.getByText('FORGE 1 · STUDY PLAN')).toBeTruthy();
    expect(screen.getByText('Drag each block into its slot. Some blocks are too vague to use.')).toBeTruthy();
    const pool = screen.getByTestId('dnd-pool');
    for (let i = 0; i < 8; i++) expect(within(pool).getByTestId(`dnd-item-b${i}`)).toBeTruthy();
    for (const z of ['task', 'ctx', 'role', 'fmt', 'lim']) expect(screen.getByTestId(`dnd-zone-${z}`)).toBeTruthy();
    expect(screen.getByTestId('dnd-zone-task').props.accessibilityLabel).toBe('TASK zone, 0 placed');
  });

  it('announces selection and placement to screen readers via labels', async () => {
    await setup();
    await fireEvent.press(screen.getByTestId('dnd-item-b1'));
    expect(screen.getByTestId('dnd-item-b1').props.accessibilityLabel).toBe('Make a 3-day study plan for my Maths test., selected');
    expect(screen.getByTestId('dnd-item-b1').props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(screen.getByTestId('dnd-zone-task'));
    expect(within(screen.getByTestId('dnd-zone-task')).getByTestId('dnd-item-b1').props.accessibilityLabel).toBe(
      'Make a 3-day study plan for my Maths test., placed in TASK',
    );
    expect(screen.getByTestId('dnd-zone-task').props.accessibilityLabel).toBe('TASK zone, 1 placed, full');
  });

  it('completing forge 1 (out of slot order) shows PROMPT BUILT with the slot-ordered prompt and NOVA reply', async () => {
    const api = await setup();
    const shuffled = [...pairs(0)].reverse();
    for (const [item, zone] of shuffled) await tapSort(item, zone);
    await advance(SORT_DONE_DELAY_MS - 1);
    expect(screen.queryByTestId('m2g2-built-1')).toBeNull();
    await advance(1);
    expect(screen.getByTestId('m2g2-built-1')).toBeTruthy();
    expect(screen.getByText('PROMPT BUILT')).toBeTruthy();
    expect(screen.getByTestId('m2g2-your-prompt')).toHaveTextContent(
      "YOUR PROMPTMake a 3-day study plan for my Maths test. I have 3 hours a day and I'm weak at algebra. Act as a patient Maths tutor for a 14-year-old. Give it as a table: Day, Topic, Time. Keep it under 120 words.",
    );
    expect(screen.getByTestId('m2g2-nova-replies')).toHaveTextContent(`NOVA REPLIES${FORGES[0]!.out}`);
    expect(screen.getByText('Specific task, context, role, format and limit: that is why the answer is useful.')).toBeTruthy();
    expect(screen.getByTestId('m2g2-next-forge')).toHaveTextContent('Next forge ▶');
    expect(api.calls.miss).toHaveLength(0);
  });

  it('a decoy in a slot costs a heart with the vague-block message', async () => {
    const api = await setup();
    await tapSort('b0', 'task');
    expect(api.calls.miss).toEqual([WRONG_DECOY]);
    expect(api.hearts).toBe(2);
    expect(within(screen.getByTestId('dnd-pool')).getByTestId('dnd-item-b0')).toBeTruthy();
  });

  it('a real block in the wrong slot costs a heart with the slot message', async () => {
    const api = await setup();
    await tapSort('b2', 'role');
    expect(api.calls.miss).toEqual([WRONG_SLOT]);
    expect(api.hearts).toBe(2);
  });

  it('three decoys in three different slots → out of hearts, then input is ignored', async () => {
    const api = await setup();
    await tapSort('b0', 'task');
    await tapSort('b6', 'fmt');
    await tapSort('b7', 'lim');
    expect(api.hearts).toBe(0);
    expect(api.status).toBe('failed');
    await tapSort('b1', 'task');
    expect(within(screen.getByTestId('dnd-pool')).getByTestId('dnd-item-b1')).toBeTruthy();
  });

  it('Next forge ▶ opens FORGE 2 with the v3 bubble; hearts carry over from forge 1', async () => {
    const api = await setup();
    await tapSort('b0', 'ctx'); // lose one heart in forge 1
    await solveForge(0);
    await fireEvent.press(screen.getByTestId('m2g2-next-forge'));
    expect(api.lastSay()).toEqual({ text: ANOTHER_FORGE_LINE, mood: 'good' });
    expect(screen.getByTestId('m2g2-forge-2')).toBeTruthy();
    expect(screen.getByText('FORGE 2 · EMAIL TO A TEACHER')).toBeTruthy();
    for (let i = 0; i < 8; i++) expect(within(screen.getByTestId('dnd-pool')).getByTestId(`dnd-item-b${i}`)).toBeTruthy();
    expect(api.hearts).toBe(2);
    // two more mistakes in forge 2 end the game (3 hearts total across forges)
    await tapSort('b6', 'task');
    await tapSort('b7', 'role');
    expect(api.status).toBe('failed');
  });

  it('after forge 2, Next forge ▶ hands off to FORGE 3 · FREE WRITE; passing it wins with the v3 summary', async () => {
    const api = await setup();
    await solveForge(0);
    await fireEvent.press(screen.getByTestId('m2g2-next-forge'));
    await solveForge(1);
    expect(screen.getByTestId('m2g2-built-2')).toBeTruthy();
    expect(screen.getByTestId('m2g2-your-prompt')).toHaveTextContent(
      'YOUR PROMPTWrite an email asking Mr. Rao for a 2-day extension on my history essay. I was ill on Monday and have finished two of four sections. Write as a polite Year 9 student, not a robot. Three short paragraphs with a subject line. Maximum 100 words. Friendly but formal.',
    );
    expect(api.calls.win).toHaveLength(0);
    await fireEvent.press(screen.getByTestId('m2g2-next-forge'));
    expect(screen.getByTestId('m2g2-forge-3')).toBeTruthy();
    expect(mockFreeWrite.lastApi).toBe(api);
    expect(api.calls.win).toHaveLength(0);
    await fireEvent.press(screen.getByTestId('fw-mock-pass'));
    expect(api.calls.win).toEqual([WIN_SUMMARY]);
    expect(api.status).toBe('won');
    expect(api.hearts).toBe(3);
  });

  it('X-RAY places the first remaining block and names its slot', async () => {
    const api = await setup({ hero: 'scout' });
    await act(async () => {
      expect(api.usePower()).toBe(true);
    });
    expect(within(screen.getByTestId('dnd-zone-task')).getByTestId('dnd-item-b1')).toBeTruthy();
    expect(api.lastSay()).toEqual({ text: 'X-RAY: that one goes in TASK.', mood: 'good' });
  });

  it('FOCUS dims the 3 decoys first, then flashes a pair', async () => {
    const api = await setup({ hero: 'oracle', powerUses: 4 });
    for (const id of ['b0', 'b6', 'b7']) {
      await act(async () => {
        expect(api.usePower()).toBe(true);
      });
      expect(api.lastSay()?.text).toBe('FOCUS: that one is not an answer. Skip it.');
      expect(screen.getByTestId(`dnd-item-${id}`).props.accessibilityLabel).toMatch(/not an answer$/);
    }
    await act(async () => {
      expect(api.usePower()).toBe(true);
    });
    expect(api.lastSay()?.text).toBe('FOCUS: look at the glowing pair.');
  });

  it('on PROMPT BUILT, X-RAY has nothing to act on and is not consumed', async () => {
    const api = await setup({ hero: 'scout' });
    await solveForge(0);
    await act(async () => {
      expect(api.usePower()).toBe(false);
    });
    expect(api.calls.toast).toEqual(['NOTHING TO USE IT ON YET']);
    expect(api.powerUses).toBe(2);
  });

  it('the 2 power uses are shared across forges 1, 2 and the free-write round', async () => {
    const api = await setup({ hero: 'scout' });
    await act(async () => {
      expect(api.usePower()).toBe(true);
    }); // forge 1: places b1
    await solveForge(0, pairs(0).filter(([i]) => i !== 'b1'));
    await fireEvent.press(screen.getByTestId('m2g2-next-forge'));
    await act(async () => {
      expect(api.usePower()).toBe(true);
    }); // forge 2: places b1
    await solveForge(1, pairs(1).filter(([i]) => i !== 'b1'));
    await fireEvent.press(screen.getByTestId('m2g2-next-forge'));
    expect(screen.getByTestId('fw-mock-pass')).toBeTruthy();
    await act(async () => {
      expect(api.usePower()).toBe(false); // free-write's handler would accept, but no uses remain
    });
    expect(api.powerUses).toBe(0);
  });

  it('the free-write round keeps its own power handlers (not clobbered by the hand-off)', async () => {
    const api = await setup({ hero: 'scout' });
    await solveForge(0);
    await fireEvent.press(screen.getByTestId('m2g2-next-forge'));
    await solveForge(1);
    await fireEvent.press(screen.getByTestId('m2g2-next-forge'));
    await act(async () => {
      expect(api.usePower()).toBe(true); // the mock round's scan handler
    });
  });
});
