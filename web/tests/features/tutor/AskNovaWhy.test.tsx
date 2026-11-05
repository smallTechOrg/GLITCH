// Ask NOVA why (ask-nova-why.md, spec/ui.md → Tutor NOVA) against a fake fetch behind the real
// api client: chip → NOVA thinking → panel (text, tip, cost, DEMO tag) on a miss and on a cache
// hit; offline / timeout / BAD_REQUEST / CAP_GLOBAL → offline line + canned message; CAP_DEVICE →
// no-energy line; one request per mistake (double tap, remount, memo); onExplained; reduced
// motion; announcements; and the frame wiring (wrong tap in Fact or Fib → chip, gone after 10 s).
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { createApiClient, type FetchLike } from '@/api/client';
import { EXPLAIN_TIMEOUT_MS, type ExplainData } from '@/contracts/api';
import type { SessionMistake } from '@/contracts/game';
import { announcements, clearAnnouncements } from '@/a11y/announce';
import { setReducedMotionOverride } from '@/a11y/useReducedMotion';
import { AskNovaWhy, type Explanation } from '@/features/tutor/AskNovaWhy';
import { ASK_WINDOW_MS, TUTOR } from '@/features/tutor/copy';
import { explainKey, setTutorClientForTests } from '@/features/tutor/explain';
import { renderWithProviders } from '@/testing/renderWithProviders';
import type { PersistedState } from '@/contracts/state';
import { GameScreen } from '@/screens/GameScreen';

jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), replace: jest.fn(), push: jest.fn(), back: jest.fn() },
}));

const DEVICE = '0b6c8a64-9c1e-4a51-8d2f-2f3b8c1a9e77';
const NOW = new Date(2026, 9, 20, 10);
const CANNED = 'That one is actually true. Look for something that sounds too sure.';
const MISTAKE: SessionMistake = {
  gameId: 'm1g2', variationId: 'v3', itemId: 's0', answer: 'fib', correct: 'true', concept: 'Machine learning',
  itemText: 'Machine learning finds patterns in training data.', answerLabel: 'FIB', correctLabel: 'TRUE',
  message: CANNED, shielded: false, at: NOW.toISOString(),
};
const ENERGY = { remaining: 9, limit: 10, resetsAt: '2026-10-21T00:00:00Z' };
const DATA: ExplainData = {
  text: `${CANNED} The right call here: TRUE.`,
  tip: 'Slow down: find the clue first, then make the call.',
  cached: false,
  provider: 'fake',
};

type Handler = (body: Record<string, unknown>, signal?: AbortSignal | null) => Promise<Response> | Response;
const json = (status: number, body: unknown): Response => ({ status, ok: status < 400, json: async () => body }) as unknown as Response;
const errBody = (code: string) => ({ ok: false, error: { code, message: code, retryable: false }, energy: ENERGY });

let calls: Record<string, unknown>[] = [];
let restore: () => void = () => undefined;
function serve(handler: Handler): void {
  calls = [];
  const f: FetchLike = async (url, init = {}) => {
    expect(url).toBe('http://api.test/v1/explain');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    calls.push(body);
    return handler(body, init.signal);
  };
  restore();
  restore = setTutorClientForTests(createApiClient({ baseUrl: 'http://api.test', fetchImpl: f, deviceId: async () => DEVICE }));
}

async function settle(ms = 0): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

async function mount(props: Partial<React.ComponentProps<typeof AskNovaWhy>> = {}) {
  const onExplained = jest.fn<void, [string, Explanation]>();
  const r = await renderWithProviders(
    <AskNovaWhy mistake={MISTAKE} chipVisible onExplained={onExplained} {...props} />,
    { now: NOW },
  );
  return { onExplained, ...r };
}
const tapChip = async (): Promise<void> => {
  await fireEvent.press(screen.getByTestId('ask-nova-why'));
};
const textOf = (id: string): string => {
  const kids = screen.getByTestId(id).props.children as unknown;
  return Array.isArray(kids) ? kids.join('') : String(kids);
};

beforeEach(() => {
  jest.useFakeTimers();
  setReducedMotionOverride(false);
  clearAnnouncements();
});
afterEach(() => {
  restore();
  restore = () => undefined;
  setReducedMotionOverride(null);
  jest.useRealTimers();
});

describe('chip', () => {
  it('is an enabled "ASK NOVA WHY" button with the energy hint while chipVisible', async () => {
    serve(() => json(200, { ok: true, data: DATA, energy: ENERGY }));
    await mount();
    const chip = screen.getByTestId('ask-nova-why');
    expect(chip.props.accessibilityState?.disabled ?? false).toBe(false);
    expect(chip.props.accessibilityHint).toBe(TUTOR.chipHint);
    expect(screen.getByText(TUTOR.chip)).toBeTruthy();
    expect(calls).toHaveLength(0); // nothing is fetched until the learner asks
  });

  it('renders nothing when the window is closed and the panel was never opened', async () => {
    serve(() => json(200, { ok: true, data: DATA, energy: ENERGY }));
    await mount({ chipVisible: false });
    expect(screen.queryByTestId('ask-nova-why')).toBeNull();
    expect(screen.queryByTestId('nova-why-panel')).toBeNull();
  });

  it('is never offered for an explain:false mistake (free-write weak prompt)', async () => {
    serve(() => json(200, { ok: true, data: DATA, energy: ENERGY }));
    await mount({ mistake: { ...MISTAKE, gameId: 'm3g2', itemId: 'fw.fw1', answer: 'weak', explain: false } });
    expect(screen.queryByTestId('ask-nova-why')).toBeNull();
  });
});

describe('cache miss (costs 1 energy)', () => {
  it('thinking → text, TIP, "−1 AI ENERGY", DEMO tag; sends only the 4 ids; calls onExplained once', async () => {
    let release: (r: Response) => void = () => undefined;
    serve(() => new Promise<Response>((res) => (release = res)));
    const { onExplained } = await mount();
    await tapChip();
    await settle();
    expect(screen.queryByTestId('ask-nova-why')).toBeNull();
    expect(screen.getByTestId('nova-why-panel')).toBeTruthy();
    const thinking = screen.getByTestId('nova-why-thinking');
    expect(thinking.props.accessibilityRole).toBe('progressbar');
    expect(thinking.props.accessibilityLabel).toBe(TUTOR.thinking);
    expect(screen.getByTestId('nova-why-thinking-anim')).toBeTruthy();
    expect(announcements()).toContain(TUTOR.thinking);
    expect(calls).toEqual([{ gameId: 'm1g2', variationId: 'v3', itemId: 's0', answer: 'fib' }]);

    release(json(200, { ok: true, data: DATA, energy: ENERGY }));
    await settle();
    expect(screen.queryByTestId('nova-why-thinking')).toBeNull();
    expect(textOf('nova-why-text')).toBe(DATA.text);
    expect(textOf('nova-why-text').split(/\s+/).length).toBeLessThanOrEqual(60);
    expect(textOf('nova-why-tip')).toBe(`TIP: ${DATA.tip}`);
    expect(textOf('nova-why-cost')).toBe('−1 AI ENERGY');
    expect(screen.getByTestId('nova-why-demo-tag')).toBeTruthy();
    expect(screen.getByText('DEMO')).toBeTruthy();
    expect(screen.queryByTestId('nova-why-offline')).toBeNull();
    expect(onExplained).toHaveBeenCalledTimes(1);
    expect(onExplained).toHaveBeenCalledWith('s0|fib', { text: DATA.text, tip: DATA.tip });
    // Announced once, politely, with the tip.
    expect(announcements().filter((a) => a.startsWith(DATA.text))).toEqual([`${DATA.text} TIP: ${DATA.tip}`]);
  });

  it('a double tap sends one request', async () => {
    serve(() => json(200, { ok: true, data: DATA, energy: ENERGY }));
    await mount();
    const chip = screen.getByTestId('ask-nova-why');
    await fireEvent.press(chip);
    await fireEvent.press(chip);
    await settle();
    expect(calls).toHaveLength(1);
    expect(screen.getByTestId('nova-why-text')).toBeTruthy();
  });

  it('the panel stays open when the chip window closes, until CLOSE', async () => {
    serve(() => json(200, { ok: true, data: DATA, energy: ENERGY }));
    const { rerender, onExplained } = await mount();
    await tapChip();
    await settle();
    await rerender(<AskNovaWhy mistake={MISTAKE} chipVisible={false} onExplained={onExplained} />);
    expect(screen.getByTestId('nova-why-panel')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('nova-why-close'));
    expect(screen.queryByTestId('nova-why-panel')).toBeNull();
    expect(screen.queryByTestId('ask-nova-why')).toBeNull();
  });
});

describe('cache hit (free)', () => {
  it('server cached:true → "FREE · NOVA ALREADY KNEW THIS"; a real provider has no DEMO tag', async () => {
    serve(() => json(200, { ok: true, data: { ...DATA, cached: true, provider: 'openrouter' }, energy: { ...ENERGY, remaining: 10 } }));
    const { onExplained } = await mount();
    await tapChip();
    await settle();
    expect(textOf('nova-why-cost')).toBe(TUTOR.costFree);
    expect(screen.queryByTestId('nova-why-demo-tag')).toBeNull();
    expect(onExplained).toHaveBeenCalledTimes(1);
  });

  it('asking the same mistake again in this page (a new mount) makes no network call and is free', async () => {
    serve(() => json(200, { ok: true, data: DATA, energy: ENERGY }));
    const first = await mount();
    await tapChip();
    await settle();
    expect(textOf('nova-why-cost')).toBe(TUTOR.costPaid);
    await first.unmount();

    const second = await mount();
    await tapChip();
    await settle();
    expect(calls).toHaveLength(1);
    expect(textOf('nova-why-text')).toBe(DATA.text);
    expect(textOf('nova-why-cost')).toBe(TUTOR.costFree);
    expect(second.onExplained).toHaveBeenCalledWith('s0|fib', { text: DATA.text, tip: DATA.tip });
  });

  it('the memo is keyed by game, variation, item and answer', async () => {
    serve(() => json(200, { ok: true, data: DATA, energy: ENERGY }));
    const a = await mount();
    await tapChip();
    await settle();
    await a.unmount();
    await mount({ mistake: { ...MISTAKE, variationId: 'm1g2-0123456789ab' } });
    await tapChip();
    await settle();
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual({ gameId: 'm1g2', variationId: 'm1g2-0123456789ab', itemId: 's0', answer: 'fib' });
    expect(explainKey(MISTAKE)).toBe('m1g2|v3|s0|fib');
  });
});

describe('failures → line + the canned miss message; the game is never blocked', () => {
  const expectOffline = (line: string): void => {
    const box = screen.getByTestId('nova-why-offline');
    expect(box.props.accessibilityLabel).toBe(`${line} ${CANNED}`);
    expect(screen.getByText(line)).toBeTruthy();
    expect(screen.getByText(CANNED)).toBeTruthy();
    expect(screen.queryByTestId('nova-why-text')).toBeNull();
    expect(screen.queryByTestId('nova-why-cost')).toBeNull();
    expect(announcements()).toContain(`${line} ${CANNED}`);
  };

  it('network error → offline line; onExplained is not called', async () => {
    serve(() => Promise.reject(new TypeError('Failed to fetch')));
    const { onExplained } = await mount();
    await tapChip();
    await settle();
    expectOffline(TUTOR.offline);
    expect(TUTOR.offline).toBe("NOVA'S OFFLINE — here's the short version:");
    expect(onExplained).not.toHaveBeenCalled();
  });

  it.each(['AI_UNAVAILABLE', 'AI_TIMEOUT', 'AI_INVALID_OUTPUT', 'MODERATED', 'INTERNAL', 'BAD_REQUEST', 'CAP_GLOBAL'])(
    '%s → offline line',
    async (code) => {
      serve(() => json(code === 'BAD_REQUEST' ? 400 : 502, errBody(code)));
      await mount();
      await tapChip();
      await settle();
      expectOffline(TUTOR.offline);
    },
  );

  it('CAP_DEVICE → "OUT OF AI ENERGY TODAY" line + canned message', async () => {
    serve(() => json(429, errBody('CAP_DEVICE')));
    await mount();
    await tapChip();
    await settle();
    expectOffline(TUTOR.noEnergy);
    expect(TUTOR.noEnergy).toBe("OUT OF AI ENERGY TODAY — here's the short version:");
  });

  it('no answer within 8 s → offline line (the request is aborted)', async () => {
    let aborted = false;
    serve((_b, signal) => new Promise<Response>((_res, rej) => {
      signal?.addEventListener('abort', () => {
        aborted = true;
        rej(new Error('aborted'));
      });
    }));
    await mount();
    await tapChip();
    await settle(EXPLAIN_TIMEOUT_MS - 100);
    expect(screen.getByTestId('nova-why-thinking')).toBeTruthy();
    await settle(200);
    expect(aborted).toBe(true);
    expectOffline(TUTOR.offline);
  });

  it('a failure is not memoised: the next mistake can ask again', async () => {
    serve(() => json(502, errBody('AI_UNAVAILABLE')));
    const a = await mount();
    await tapChip();
    await settle();
    await a.unmount();
    await mount();
    await tapChip();
    await settle();
    expect(calls).toHaveLength(2);
  });
});

describe('reduced motion', () => {
  it('shows a static NOVA (no dots) while thinking and still announces it', async () => {
    setReducedMotionOverride(true);
    serve(() => new Promise<Response>(() => undefined));
    await mount();
    await tapChip();
    await settle();
    expect(screen.getByTestId('nova-why-thinking-static')).toBeTruthy();
    expect(screen.queryByTestId('nova-why-thinking-anim')).toBeNull();
    expect(announcements()).toContain(TUTOR.thinking);
  });
});

describe('in the game frame (Fact or Fib)', () => {
  const M1G2_OPEN: Partial<PersistedState> = {
    profile: { nickname: null, onboarded: true, createdAt: NOW.toISOString() },
    steps: { m1h: true, m1s: true, m1g1: true },
    heroByModule: { 1: 'scout' },
  };

  it('a wrong tap shows the chip; it is gone after 10 s', async () => {
    serve(() => json(200, { ok: true, data: DATA, energy: ENERGY }));
    await renderWithProviders(<GameScreen mod={1} gameId="m1g2" />, { state: M1G2_OPEN, now: NOW });
    await settle();
    expect(screen.queryByTestId('ask-nova-why')).toBeNull();
    await fireEvent.press(screen.getByTestId('pick-line-0')); // line 0 is true → a miss
    await settle();
    expect(screen.getByTestId('ask-nova-why')).toBeTruthy();
    await settle(ASK_WINDOW_MS + 50);
    expect(screen.queryByTestId('ask-nova-why')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('a wrong tap → ASK NOVA WHY → explanation + tip under the bubble; the game stays playable', async () => {
    serve(() => json(200, { ok: true, data: DATA, energy: ENERGY }));
    await renderWithProviders(<GameScreen mod={1} gameId="m1g2" />, { state: M1G2_OPEN, now: NOW });
    await settle();
    await fireEvent.press(screen.getByTestId('pick-line-0'));
    await settle();
    await tapChip();
    await settle();
    expect(calls).toEqual([{ gameId: 'm1g2', variationId: 'v3', itemId: 's0', answer: 'fib' }]);
    expect(textOf('nova-why-text')).toBe(DATA.text);
    expect(textOf('nova-why-tip')).toBe(`TIP: ${DATA.tip}`);
    await settle(ASK_WINDOW_MS + 50); // the panel outlives the chip window
    expect(screen.getByTestId('nova-why-panel')).toBeTruthy();
    expect(screen.getByTestId('pick-line-1')).toBeTruthy();
  });
});
