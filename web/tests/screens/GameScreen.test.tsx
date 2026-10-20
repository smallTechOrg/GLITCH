// Game Frame: hearts, powers (2 uses, consumed only when they act), shield, speech bubble,
// miss / out-of-hearts / win, stars + XP + once-bonuses (game-runtime.md), and the Phase-3
// mistake recording + mount points (spec/architecture.md → Contracts → Phase 3).
// The game registry is replaced by a tiny probe game, and the tutor / recap / memory mount
// points by probes that expose the props the frame passes, so the frame is tested in isolation.
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import type { HeroId } from '@/contracts/ids';
import type { PersistedState } from '@/contracts/state';
import { router } from 'expo-router';
import { GameScreen } from '@/screens/GameScreen';
import { GAME } from '@/screens/copy';
import { setReducedMotionOverride } from '@/a11y/useReducedMotion';
import { useGlitchStore } from '@/state/store';
import { useToastStore, resetToasts } from '@/ui/toast';
import { renderWithProviders } from '@/testing/renderWithProviders';
import { setCaseFileClientForTests } from '@/features/variations';

jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), replace: jest.fn(), push: jest.fn(), back: jest.fn() },
}));

const mockMistake = {
  itemId: 's0', answer: 'fib', correct: 'true', concept: 'Machine learning' as const,
  itemText: 'Labels are the right answers.', answerLabel: 'FIB', correctLabel: 'TRUE',
};
const mockMemory = { remembered: [] as unknown[], won: [] as unknown[][] };

jest.mock('@/features/memory', () => ({
  rememberMistake: (m: unknown) => {
    mockMemory.remembered.push(m);
  },
  onGameWon: (...a: unknown[]) => {
    mockMemory.won.push(a);
  },
}));

jest.mock('@/features/tutor/AskNovaWhy', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  /* eslint-enable @typescript-eslint/no-require-imports */
  function AskNovaWhy(p: import('@/features/tutor/AskNovaWhy').AskNovaWhyProps) {
    return React.createElement(
      Pressable,
      { testID: 'ask-probe', onPress: () => p.onExplained(`${p.mistake.itemId}|${p.mistake.answer}`, { text: 'Because.', tip: 'Look first.' }) },
      React.createElement(Text, null, `chip ${p.chipVisible ? 'on' : 'off'} ${p.mistake.itemId} ${p.mistake.message}`),
    );
  }
  return { AskNovaWhy };
});

jest.mock('@/features/recap/MistakeRecap', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require('react');
  const { Text } = require('react-native');
  /* eslint-enable @typescript-eslint/no-require-imports */
  function MistakeRecap(p: import('@/features/recap/MistakeRecap').MistakeRecapProps) {
    return React.createElement(Text, { testID: 'recap' }, JSON.stringify({ n: p.mistakes.length, keys: p.mistakes.map((m) => `${m.itemId}|${m.answer}`), ex: p.explanations }));
  }
  return { MistakeRecap };
});

interface MockCtl {
  scan: boolean;
  hint: boolean;
  undos: number;
  mounts: number;
  api: import('@/contracts/game').GameApi | null;
}
const mockCtl: MockCtl = { scan: false, hint: false, undos: 0, mounts: 0, api: null };

jest.mock('@/games/registry', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
  /* eslint-enable @typescript-eslint/no-require-imports */
  function ProbeGame({ api }: { api: import('@/contracts/game').GameApi }) {
    React.useEffect(() => {
      mockCtl.mounts += 1;
      mockCtl.api = api;
      api.registerPowers({
        scan: () => mockCtl.scan,
        hint: () => mockCtl.hint,
        undo: () => {
          mockCtl.undos += 1;
        },
      });
    }, [api]);
    const btn = (id: string, onPress: () => void) =>
      React.createElement(Pressable, { testID: id, onPress, accessibilityRole: 'button' }, React.createElement(Text, null, id));
    return React.createElement(
      View,
      { testID: 'probe-game' },
      btn('probe-miss', () => api.miss('Wrong bin.')),
      btn('probe-miss-default', () => api.miss()),
      btn('probe-miss-payload', () => api.miss('Wrong bin.', mockMistake)),
      btn('probe-miss-payload-default', () => api.miss(undefined, { ...mockMistake, itemId: 's1' })),
      btn('probe-miss-noexplain', () => api.miss('Weak prompt.', { ...mockMistake, itemId: 'fw.fw1', answer: 'weak', explain: false })),
      btn('probe-win', () => api.win('Examples teach patterns.')),
      btn('probe-say', () => api.say('Probe says hi.', 'good')),
      btn('probe-toast', () => api.toast('PROBE TOAST')),
      React.createElement(Text, { testID: 'probe-hearts' }, `api hearts ${api.hearts} over ${api.over ? 'yes' : 'no'}`),
    );
  }
  const mk = (id: string, module: number, title: string) => ({ id, module, title, goal: `GOAL ${id}`, intro: `Intro ${id}.`, Component: ProbeGame });
  const GAMES = {
    m1g1: mk('m1g1', 1, 'Train the Model'), m1g2: mk('m1g2', 1, 'Fact or Fib'),
    m2g1: mk('m2g1', 2, 'Tune the Sorter'), m2g2: mk('m2g2', 2, 'Prompt Forge'),
    m3g1: mk('m3g1', 3, 'Proxy Hunt'), m3g2: mk('m3g2', 3, 'Fairness Lab'),
    m4g1: mk('m4g1', 4, 'Source Detective'), m4g2: mk('m4g2', 4, 'Confidence Court'), m4g3: mk('m4g3', 4, 'Design the Companion'),
  };
  return { GAMES, getGame: (id: keyof typeof GAMES) => GAMES[id] };
});

const NOW = new Date(2026, 9, 20, 10);
const M1_READY: Partial<PersistedState> = {
  profile: { nickname: null, onboarded: true, createdAt: NOW.toISOString() },
  steps: { m1h: true, m1s: true },
};

// Replays of cleared content games ask for a fresh case file; this suite tests the frame, so
// the scenario server is "offline" (→ classic case file) and never touches the network.
let restoreCaseFiles: () => void = () => undefined;
beforeEach(() => {
  restoreCaseFiles = setCaseFileClientForTests({
    getNextScenario: async () => ({ ok: false, error: { code: 'NETWORK', message: 'offline (test)', retryable: true } }),
  });
  setReducedMotionOverride(true);
  Object.assign(mockCtl, { scan: false, hint: false, undos: 0, mounts: 0, api: null });
  mockMemory.remembered = [];
  mockMemory.won = [];
  (router.navigate as jest.Mock).mockClear();
});
afterEach(() => {
  setReducedMotionOverride(null);
  restoreCaseFiles();
});

async function open(hero: HeroId = 'scout', state: Partial<PersistedState> = {}, game: 'm1g1' | 'm1g2' = 'm1g1') {
  await renderWithProviders(<GameScreen mod={1} gameId={game} />, { state: { ...M1_READY, heroByModule: { 1: hero }, ...state }, now: NOW });
}
const press = async (id: string) => {
  await fireEvent.press(screen.getByTestId(id));
};
const label = (id: string): string => screen.getByTestId(id).props.accessibilityLabel as string;
const toasts = (): string[] => {
  const s = useToastStore.getState();
  return [s.current?.text, ...s.queue.map((q) => q.text)].filter((t): t is string => !!t);
};

describe('GameScreen · session start', () => {
  it('opens with 3 hearts, 2 power uses, no shield, the intro line, title and goal', async () => {
    await open('scout');
    expect(screen.getByTestId('game-title')).toHaveTextContent('Train the Model');
    expect(screen.getByTestId('game-goal')).toHaveTextContent('GOAL m1g1');
    expect(screen.getByTestId('say-bubble')).toHaveTextContent('Intro m1g1.');
    expect(label('hearts')).toBe('Hearts 3 of 3');
    expect(label('power-button')).toBe('X-RAY power, 2 uses left');
    expect(screen.getByTestId('power-button')).toHaveTextContent(/x2/);
    expect(screen.queryByTestId('shield-indicator')).toBeNull();
    expect(screen.queryByTestId('ask-nova-why-stub')).toBeNull();
    expect(screen.queryByTestId('ask-probe')).toBeNull();
    expect(screen.getByTestId('game-body')).toBeTruthy();
  });

  it('uses the hero chosen for the module and marks it played', async () => {
    await open('oracle');
    expect(label('power-button')).toBe('FOCUS power, 2 uses left');
    expect(useGlitchStore.getState().heroesPlayed.oracle).toBe(true);
  });

  it('falls back to the last hero when the module has none', async () => {
    await open('scout', { heroByModule: {}, lastHero: 'guard' });
    expect(label('power-button')).toBe('SHIELD power, 2 uses left');
  });

  it('shows the locked screen for a module that is not open yet (deep link)', async () => {
    await renderWithProviders(<GameScreen mod={2} gameId="m2g1" />, { state: M1_READY, now: NOW });
    expect(screen.getByTestId('locked-screen')).toBeTruthy();
    expect(screen.queryByTestId('game-body')).toBeNull();
  });

  it('deep link to a game whose earlier steps are not done shows the step-locked copy (course-shell: step startable)', async () => {
    // Module 1 is open, but m1g2 needs m1g1 done first.
    await open('scout', {}, 'm1g2');
    expect(screen.getByTestId('locked-screen')).toHaveTextContent(/This step is locked\. Finish the earlier steps first\./);
    expect(screen.queryByTestId('game-body')).toBeNull();
    expect(screen.getByTestId('locked-home')).toBeTruthy();
  });

  it('deep link to a module-1 game before storytime is done is locked', async () => {
    await open('scout', { steps: { m1h: true } }, 'm1g1');
    expect(screen.getByTestId('locked-screen')).toBeTruthy();
    expect(screen.queryByTestId('game-body')).toBeNull();
  });

  it('a later game of an open module is locked until the games before it are done', async () => {
    const m3open = { m1h: true, m1s: true, m1g1: true, m1g2: true, m2h: true, m2s: true, m2g1: true, m2g2: true } as const;
    await renderWithProviders(<GameScreen mod={4} gameId="m4g3" />, {
      state: { ...M1_READY, steps: { ...m3open, m3h: true, m3s: true, m3g1: true, m3g2: true, m4h: true, m4s: true, m4g1: true } },
      now: NOW,
    });
    expect(screen.getByTestId('locked-screen')).toBeTruthy();
    expect(screen.queryByTestId('game-body')).toBeNull();
  });

  it('an already-done step stays replayable even when an earlier step is (somehow) not done', async () => {
    await open('scout', { steps: { m1h: true, m1s: true, m1g1: true, m1g2: true } }, 'm1g2');
    expect(screen.getByTestId('game-body')).toBeTruthy();
    expect(screen.queryByTestId('locked-screen')).toBeNull();
  });

  it('replaying a done step with all earlier steps done opens the game', async () => {
    await open('scout', { steps: { m1h: true, m1s: true, m1g1: true } }, 'm1g1');
    expect(screen.getByTestId('game-body')).toBeTruthy();
  });
});

describe('GameScreen · mistakes', () => {
  it('a miss costs a heart and shows the message in a bad bubble; the Phase-1 SOON stub is gone', async () => {
    await open();
    await press('probe-miss');
    expect(label('hearts')).toBe('Hearts 2 of 3');
    expect(screen.getByTestId('say-bubble')).toHaveTextContent('Wrong bin.');
    expect(screen.queryByTestId('ask-nova-why-stub')).toBeNull();
    expect(screen.getByTestId('probe-hearts')).toHaveTextContent('api hearts 2 over no');
  });

  it('a miss without a message says "Not quite."', async () => {
    await open();
    await press('probe-miss-default');
    expect(screen.getByTestId('say-bubble')).toHaveTextContent('Not quite.');
  });

  it('three misses → OUT OF HEARTS; Try again starts a fresh session of the same game', async () => {
    await open();
    for (let i = 0; i < 3; i++) await press('probe-miss');
    expect(screen.getByTestId('fail-screen')).toHaveTextContent(/OUT OF HEARTS/);
    expect(screen.getByTestId('fail-screen')).toHaveTextContent(/No problem\. Use your hero power, read the clues, and try again\./);
    expect(label('hearts')).toBe('Hearts 0 of 3');
    expect(screen.getByTestId('power-button').props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.queryByTestId('probe-game')).toBeNull();
    const mounts = mockCtl.mounts;
    await press('fail-retry');
    expect(label('hearts')).toBe('Hearts 3 of 3');
    expect(label('power-button')).toBe('X-RAY power, 2 uses left');
    expect(screen.getByTestId('say-bubble')).toHaveTextContent('Intro m1g1.');
    expect(mockCtl.mounts).toBe(mounts + 1);
  });

  it('Home on the fail screen navigates home', async () => {
    await open();
    for (let i = 0; i < 3; i++) await press('probe-miss');
    await press('fail-home');
    expect(router.navigate).toHaveBeenCalledWith('/');
  });
});

describe('GameScreen · powers', () => {
  it('SHIELD blocks the next mistake: no heart, no lost, "SHIELDED! " bubble; a second press while up is not consumed', async () => {
    await open('guard');
    await press('power-button');
    expect(screen.getByTestId('shield-indicator')).toBeTruthy();
    expect(label('hearts')).toBe('Hearts 3 of 3, shield up');
    expect(screen.getByTestId('say-bubble')).toHaveTextContent('Shield up. Your next mistake is blocked.');
    expect(label('power-button')).toBe('SHIELD power, 1 use left');
    await press('power-button');
    expect(label('power-button')).toBe('SHIELD power, 1 use left');
    expect(toasts()).toContain('NOTHING TO USE IT ON YET');
    await press('probe-miss');
    expect(label('hearts')).toBe('Hearts 3 of 3');
    expect(screen.getByTestId('say-bubble')).toHaveTextContent('SHIELDED! Wrong bin.');
    expect(screen.queryByTestId('shield-indicator')).toBeNull();
    // lost stayed 0 → a win now is flawless
    await press('probe-win');
    expect(screen.getByTestId('win-flawless-tag')).toHaveTextContent('FLAWLESS +25');
    expect(useGlitchStore.getState().powersUsed.guard).toBe(true);
  });

  it('REWIND at 3 hearts is not consumed; after a miss it restores a heart, calls undo, and the win is not flawless', async () => {
    await open('chrono');
    await press('power-button');
    expect(label('power-button')).toBe('REWIND power, 2 uses left');
    expect(toasts()).toContain('NOTHING TO USE IT ON YET');
    await press('probe-miss');
    await press('power-button');
    expect(label('hearts')).toBe('Hearts 3 of 3');
    expect(label('power-button')).toBe('REWIND power, 1 use left');
    expect(screen.getByTestId('say-bubble')).toHaveTextContent('Time rewound. Heart restored.');
    expect(mockCtl.undos).toBe(1);
    await press('probe-win');
    expect(label('win-stars')).toBe('3 stars');
    expect(screen.queryByTestId('win-flawless-tag')).toBeNull();
  });

  it('X-RAY returning false is never consumed; true consumes; after 2 uses the button is disabled', async () => {
    await open('scout');
    await press('power-button');
    expect(label('power-button')).toBe('X-RAY power, 2 uses left');
    expect(useGlitchStore.getState().powersUsed.scout).toBeUndefined();
    mockCtl.scan = true;
    await press('power-button');
    await press('power-button');
    expect(label('power-button')).toBe('X-RAY power, 0 uses left');
    expect(screen.getByTestId('power-button').props.accessibilityState).toMatchObject({ disabled: true });
    expect(useGlitchStore.getState().powersUsed.scout).toBe(true);
  });

  it('FOCUS calls the hint handler and is consumed only when it gives a hint', async () => {
    await open('oracle');
    await press('power-button');
    expect(label('power-button')).toBe('FOCUS power, 2 uses left');
    mockCtl.hint = true;
    await press('power-button');
    expect(label('power-button')).toBe('FOCUS power, 1 use left');
  });

  it('using all four heroes’ powers unlocks Power User', async () => {
    await open('scout', { powersUsed: { chrono: true, guard: true, oracle: true } });
    mockCtl.scan = true;
    await press('power-button');
    expect(useGlitchStore.getState().badges.power).toBeDefined();
  });

  it('game say() and toast() reach the bubble and the toast queue', async () => {
    await open();
    await press('probe-say');
    expect(screen.getByTestId('say-bubble')).toHaveTextContent('Probe says hi.');
    await press('probe-toast');
    expect(toasts()).toContain('PROBE TOAST');
  });
});

describe('GameScreen · winning', () => {
  it('first flawless win: 3 stars, +30 XP and FLAWLESS +25 tags, summary, recap (no stub strip), step done, bubble "Level clear!"', async () => {
    await open();
    const xp0 = useGlitchStore.getState().xp;
    await press('probe-win');
    const win = screen.getByTestId('win-screen');
    expect(win).toHaveTextContent(/LEVEL CLEAR/);
    expect(win).toHaveTextContent(/WHAT YOU LEARNED/);
    expect(win).toHaveTextContent(/Examples teach patterns\./);
    expect(label('win-stars')).toBe('3 stars');
    expect(screen.getByTestId('win-xp-tag')).toHaveTextContent('+30 XP');
    expect(screen.getByTestId('win-flawless-tag')).toHaveTextContent('FLAWLESS +25');
    expect(screen.queryByTestId('win-soon-strip')).toBeNull();
    expect(win).not.toHaveTextContent(/COMING SOON/);
    expect(screen.getByTestId('recap')).toHaveTextContent(/"n":0/);
    expect(mockMemory.won).toEqual([['m1g1', 3]]);
    expect(screen.getByTestId('say-bubble')).toHaveTextContent('Level clear!');
    expect(screen.getByTestId('win-continue')).toHaveTextContent('Continue ▶');
    const s = useGlitchStore.getState();
    expect(s.xp).toBe(xp0 + 55);
    expect(s.stars.m1g1).toBe(3);
    expect(s.steps.m1g1).toBe(true);
    expect(s.onceBonuses.gm1g1).toBe(true);
    expect(s.badges.untouch).toBeDefined();
    expect(s.badges.eye).toBeDefined();
  });

  it('a win with 2 hearts stores 2 stars; a replay won with 1 heart keeps 2 and grants no game-clear XP', async () => {
    await open();
    await press('probe-miss');
    await press('probe-win');
    expect(label('win-stars')).toBe('2 stars');
    expect(screen.queryByTestId('win-flawless-tag')).toBeNull();
    const xpAfterFirst = useGlitchStore.getState().xp;
    await press('win-replay');
    expect(screen.getByTestId('probe-game')).toBeTruthy();
    await press('probe-miss');
    await press('probe-miss');
    await press('probe-win');
    expect(label('win-stars')).toBe('1 stars');
    expect(screen.queryByTestId('win-xp-tag')).toBeNull();
    expect(useGlitchStore.getState().stars.m1g1).toBe(2);
    expect(useGlitchStore.getState().xp).toBe(xpAfterFirst);
  });

  it('a second flawless win in another game grants no FLAWLESS XP', async () => {
    await open('scout', { steps: { m1h: true, m1s: true, m1g1: true }, onceBonuses: { untouch: true, gm1g1: true } }, 'm1g2');
    await press('probe-win');
    expect(screen.getByTestId('win-xp-tag')).toHaveTextContent('+30 XP');
    expect(screen.queryByTestId('win-flawless-tag')).toBeNull();
  });

  it('miss and win are ignored once the session is over', async () => {
    await open();
    const api = mockCtl.api!;
    await press('probe-win');
    expect(api.over).toBe(true);
    const xp = useGlitchStore.getState().xp;
    await act(async () => {
      api.miss('late');
      api.win('again');
    });
    expect(label('hearts')).toBe('Hearts 3 of 3');
    expect(useGlitchStore.getState().xp).toBe(xp);
    expect(screen.getByTestId('power-button').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('Continue goes to the next step; the last step of the module reads "Finish module ▶" and goes to Module Complete', async () => {
    await open();
    await press('probe-win');
    await press('win-continue');
    expect(router.navigate).toHaveBeenLastCalledWith('/module/1/game/m1g2');
  });

  it('winning the last open step offers "Finish module ▶" → module complete', async () => {
    await open('scout', { steps: { m1h: true, m1s: true, m1g1: true } }, 'm1g2');
    await press('probe-win');
    expect(screen.getByTestId('win-continue')).toHaveTextContent('Finish module ▶');
    await press('win-continue');
    expect(router.navigate).toHaveBeenLastCalledWith('/module/1/complete');
    expect(useGlitchStore.getState().badges.boot).toBeDefined();
  });

  it('announces copy constants used for screen readers', () => {
    expect(GAME.winAnnounce(3)).toBe('Level clear, 3 stars');
    expect(GAME.stars(1)).toBe('1 stars');
  });
});

describe('GameScreen · stale callbacks', () => {
  it('a timer from a previous run (old GameApi) cannot touch the retried session', async () => {
    await open();
    const old = mockCtl.api!;
    for (let i = 0; i < 3; i++) await press('probe-miss');
    await press('fail-retry');
    expect(mockCtl.api).not.toBe(old);
    expect(old.over).toBe(true);
    await act(async () => {
      old.miss('stale');
      old.win('stale');
    });
    expect(label('hearts')).toBe('Hearts 3 of 3');
    expect(screen.queryByTestId('win-screen')).toBeNull();
    expect(mockCtl.api!.over).toBe(false);
  });
});

afterEach(() => resetToasts()); // no toast timer outlives a test

describe('GameScreen · Phase 3 mistake recording', () => {
  const recap = (): { n: number; keys: string[]; ex: Record<string, unknown> } =>
    JSON.parse(String(screen.getByTestId('recap').props.children)) as { n: number; keys: string[]; ex: Record<string, unknown> };

  it('an accepted miss with a payload is recorded (v3, message, not shielded) and offered to ASK NOVA WHY', async () => {
    await open();
    const before = Date.now();
    await press('probe-miss-payload');
    expect(mockMemory.remembered).toHaveLength(1);
    const rec = mockMemory.remembered[0] as Record<string, unknown>;
    expect(rec).toMatchObject({ ...mockMistake, gameId: 'm1g1', variationId: 'v3', message: 'Wrong bin.', shielded: false });
    expect(Date.parse(rec.at as string)).toBeGreaterThanOrEqual(before - 1000);
    expect(screen.getByTestId('ask-probe')).toHaveTextContent('chip on s0 Wrong bin.');
  });

  it('no message → the record carries DEFAULT_MISS ("Not quite.")', async () => {
    await open();
    await press('probe-miss-payload-default');
    expect(mockMemory.remembered[0]).toMatchObject({ itemId: 's1', message: 'Not quite.' });
  });

  it('a shielded miss is recorded with shielded: true and still offers the chip', async () => {
    await open('guard');
    await press('power-button');
    await press('probe-miss-payload');
    expect(label('hearts')).toBe('Hearts 3 of 3');
    expect(screen.getByTestId('say-bubble')).toHaveTextContent('SHIELDED! Wrong bin.');
    expect(mockMemory.remembered[0]).toMatchObject({ shielded: true, message: 'Wrong bin.' });
    expect(screen.getByTestId('ask-probe')).toHaveTextContent(/chip on s0/);
  });

  it('a miss without a payload records nothing and mounts no chip', async () => {
    await open();
    await press('probe-miss');
    expect(mockMemory.remembered).toHaveLength(0);
    expect(screen.queryByTestId('ask-probe')).toBeNull();
  });

  it('a power auto-solve (X-RAY) never records a mistake', async () => {
    mockCtl.scan = true;
    await open('scout');
    await press('power-button');
    expect(label('power-button')).toBe('X-RAY power, 1 use left');
    expect(mockMemory.remembered).toHaveLength(0);
    expect(screen.queryByTestId('ask-probe')).toBeNull();
  });

  it('a miss after the game is over is ignored (not recorded)', async () => {
    await open();
    await press('probe-win');
    await act(async () => {
      mockCtl.api?.miss('late', mockMistake);
    });
    expect(mockMemory.remembered).toHaveLength(0);
    expect(recap().n).toBe(0);
  });

  it('explain: false is recorded but never offered to ASK NOVA WHY', async () => {
    await open();
    await press('probe-miss-noexplain');
    expect(mockMemory.remembered[0]).toMatchObject({ itemId: 'fw.fw1', explain: false });
    expect(screen.queryByTestId('ask-probe')).toBeNull();
  });

  it('the chip hides as soon as the bubble changes (next say), the panel mount stays for the latest mistake', async () => {
    await open();
    await press('probe-miss-payload');
    expect(screen.getByTestId('ask-probe')).toHaveTextContent(/chip on/);
    await press('probe-say');
    expect(screen.getByTestId('ask-probe')).toHaveTextContent(/chip off/);
  });

  it('the chip window closes after ASK_WINDOW_MS (10 s)', async () => {
    jest.useFakeTimers();
    try {
      await open();
      await press('probe-miss-payload');
      expect(screen.getByTestId('ask-probe')).toHaveTextContent(/chip on/);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(9_900);
      });
      expect(screen.getByTestId('ask-probe')).toHaveTextContent(/chip on/);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(200);
      });
      expect(screen.getByTestId('ask-probe')).toHaveTextContent(/chip off/);
    } finally {
      jest.useRealTimers();
    }
  });

  it('every accepted payload miss reaches the fail-screen recap with the fetched explanations', async () => {
    await open();
    await press('probe-miss-payload');
    await press('ask-probe'); // onExplained(s0|fib)
    await press('probe-miss-payload-default');
    await press('probe-miss');
    expect(screen.getByTestId('fail-screen')).toBeTruthy();
    const r = recap();
    expect(r.n).toBe(2);
    expect(r.keys).toEqual(['s0|fib', 's1|fib']);
    expect(r.ex).toEqual({ 's0|fib': { text: 'Because.', tip: 'Look first.' } });
  });

  it('restart clears the run: mistakes, latest mistake (chip) and explanations', async () => {
    await open();
    await press('probe-miss-payload');
    await press('ask-probe');
    await press('probe-miss-payload');
    await press('probe-miss-payload');
    expect(recap().n).toBe(3);
    await press('fail-retry');
    expect(screen.queryByTestId('ask-probe')).toBeNull();
    await press('probe-win');
    expect(recap()).toEqual({ n: 0, keys: [], ex: {} });
    expect(mockMemory.remembered).toHaveLength(3); // device memory is not a run list
  });
});
