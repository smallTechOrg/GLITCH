// FORGE 3 · FREE WRITE — component tests against a fake GLITCH server (real API client: envelope
// parsing, device header, 8 s abort) and the test GameApi (frame heart/shield/power rules).
import React from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { FreeWriteForge } from '@/features/freewrite/FreeWriteForge';
import { FreeWriteRound } from '@/features/freewrite/FreeWriteRound';
import { COPY, GOAL_BANK, LEVER_TIP } from '@/features/freewrite/data';
import { createTestGameApi, renderWithProviders } from '@/testing/renderWithProviders';
import { NOTHING_TO_USE, type TestGameApiOptions } from '@/testing/testGameApi';
import { useGlitchStore } from '@/state/store';
import { FREEWRITE_PROMPT_MAX } from '@/contracts/api';
import type { PromptHistoryEntry } from '@/contracts/state';
import { createFakeServer, DEVICE, type FakeServer } from './fakeServer';

const STRONG =
  'Act as a friendly science teacher. Explain photosynthesis to my 10-year-old brother, who loves plants. Use 3 short bullet points. Keep it under 80 words.';
const WEAK = 'plants';
const NOW = new Date('2026-10-20T21:30:00Z');

let ids = 0;
const makeId = (): string => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`;

interface Setup {
  server: FakeServer;
  api: ReturnType<typeof createTestGameApi>;
  onPassed: jest.Mock;
}

async function setup(
  o: { remaining?: number; api?: TestGameApiOptions; history?: PromptHistoryEntry[]; prep?: (s: FakeServer) => void } = {},
): Promise<Setup> {
  const server = createFakeServer(o.remaining ?? 10);
  o.prep?.(server);
  const api = createTestGameApi(o.api);
  const onPassed = jest.fn();
  await renderWithProviders(<FreeWriteForge api={api} onPassed={onPassed} client={server.client} now={() => NOW} makeId={makeId} />, {
    state: o.history ? { promptHistory: o.history } : {},
  });
  // energy read settles
  await waitFor(() => expect(screen.getByTestId('fw-energy').props.accessibilityLabel).not.toBe('AI energy loading'));
  return { server, api, onPassed };
}

async function type(text: string): Promise<void> {
  await fireEvent.changeText(screen.getByTestId('fw-input'), text);
}

async function send(): Promise<void> {
  await fireEvent.press(screen.getByTestId('fw-send'));
}

/** Press the hero power (frame semantics) inside act — handlers may set state. */
async function power(api: ReturnType<typeof createTestGameApi>): Promise<boolean> {
  let used = false;
  await act(async () => {
    used = api.usePower();
  });
  return used;
}

const history = (): PromptHistoryEntry[] => useGlitchStore.getState().promptHistory;
const sendDisabled = (): boolean => !!screen.getByTestId('fw-send').props.accessibilityState?.disabled;

beforeEach(() => {
  ids = 0;
});

describe('initial state', () => {
  it('shows the header, goal, energy, empty editor and the intro bubble', async () => {
    const { api, server } = await setup();
    expect(screen.getByText(COPY.header)).toBeTruthy();
    expect(screen.getByText(COPY.sub)).toBeTruthy();
    expect(screen.getByTestId('fw-goal')).toHaveTextContent(`YOUR GOAL: ${GOAL_BANK[0]!.goal}`);
    expect(screen.getByTestId('fw-energy').props.accessibilityLabel).toBe('AI energy 10 of 10');
    expect(screen.getByTestId('fw-count')).toHaveTextContent(`0/${FREEWRITE_PROMPT_MAX}`);
    expect(screen.getByTestId('fw-input').props.accessibilityLabel).toBe('Your prompt');
    expect(screen.getByTestId('fw-input').props.placeholder).toBe('e.g. Act as…');
    expect(screen.getByText(COPY.send)).toBeTruthy();
    expect(sendDisabled()).toBe(true);
    expect(api.calls.say[0]?.text).toBe(COPY.intro);
    expect(server.energyRequests).toBe(1);
    expect(screen.queryByTestId('fw-result')).toBeNull();
  });

  it('keeps send disabled for a whitespace-only prompt', async () => {
    const { server } = await setup();
    await type('    ');
    expect(sendDisabled()).toBe(true);
    await send();
    expect(server.evalRequests).toHaveLength(0);
  });

  it('caps the prompt at 600 characters and shows the counter', async () => {
    await setup();
    await type('a'.repeat(700));
    expect(screen.getByTestId('fw-input').props.value).toHaveLength(FREEWRITE_PROMPT_MAX);
    expect(screen.getByTestId('fw-input').props.maxLength).toBe(FREEWRITE_PROMPT_MAX);
    expect(screen.getByTestId('fw-count')).toHaveTextContent('600/600');
  });

  it('shows "?" energy when the server is unreachable and stays playable', async () => {
    await setup({ prep: (s) => (s.energyDown = true) });
    expect(screen.getByTestId('fw-energy').props.accessibilityLabel).toBe('AI energy unknown, NOVA is offline');
    expect(within(screen.getByTestId('fw-energy')).getByText('?')).toBeTruthy();
    await type(WEAK);
    expect(sendDisabled()).toBe(false);
  });

  it('picks the first unattempted goal from on-device history and lists past prompts in the log', async () => {
    const past: PromptHistoryEntry = {
      id: '11111111-1111-4111-8111-111111111111',
      goalId: 'fw1',
      goal: GOAL_BANK[0]!.goal,
      prompt: 'my old prompt',
      levers: { task: false, context: true, role: false, format: false, limit: false },
      leversHit: 1,
      passed: false,
      source: 'offline',
      at: '2026-10-19T10:00:00.000Z',
    };
    await setup({ history: [past] });
    expect(screen.getByTestId('fw-goal')).toHaveTextContent(`YOUR GOAL: ${GOAL_BANK[1]!.goal}`);
    // log is collapsed by default
    expect(screen.queryByTestId('fw-history-entry-0')).toBeNull();
    await fireEvent.press(screen.getByTestId('fw-history-toggle'));
    const entry = screen.getByTestId('fw-history-entry-0');
    expect(within(entry).getByText('1/5')).toBeTruthy();
    expect(within(entry).getByText('OFFLINE')).toBeTruthy();
    expect(screen.queryByTestId('fw-history-text-0')).toBeNull();
    await fireEvent.press(entry);
    expect(screen.getByTestId('fw-history-text-0')).toHaveTextContent('my old prompt');
  });
});

describe('AI path (demo provider)', () => {
  it('a strong prompt shows reply, DEMO tag, five lit chips, 5/5, one tip, and Finish wins', async () => {
    const { server, api, onPassed } = await setup();
    await type(`  ${STRONG}  `);
    await send();
    await screen.findByTestId('fw-result');

    expect(server.evalRequests).toEqual([{ body: { goalId: 'fw1', goal: GOAL_BANK[0]!.goal, prompt: STRONG }, device: DEVICE }]);
    expect(screen.getAllByTestId('fw-reply')).toHaveLength(1);
    expect(screen.getByText(COPY.replyLabel)).toBeTruthy();
    expect(screen.getByTestId('fw-reply-text')).toHaveTextContent(/DEMO NOVA/);
    expect(screen.getByTestId('fw-demo-tag')).toBeTruthy();
    for (const name of ['Task', 'Context', 'Role', 'Format', 'Limit']) expect(screen.getAllByLabelText(`${name}: hit`)).toHaveLength(1);
    expect(screen.getAllByTestId('fw-score')).toHaveLength(1);
    expect(screen.getByTestId('fw-score')).toHaveTextContent('5/5 LEVERS');
    expect(screen.getAllByTestId('fw-tip')).toHaveLength(1);
    expect(screen.getByTestId('fw-tip')).toHaveTextContent(`${COPY.tipLabel}All five levers. That's a prompt NOVA can't misread.`);
    expect(screen.queryByTestId('fw-offline-banner')).toBeNull();

    // energy falls by one after a successful AI evaluation
    expect(screen.getByTestId('fw-energy').props.accessibilityLabel).toBe('AI energy 9 of 10');
    expect(api.lastSay()).toEqual({ text: COPY.passed, mood: 'good' });
    expect(api.lost).toBe(0);
    // input locked, send gone, Finish shown
    expect(screen.getByTestId('fw-input').props.editable).toBe(false);
    expect(screen.queryByTestId('fw-send')).toBeNull();

    expect(history()).toHaveLength(1);
    expect(history()[0]).toMatchObject({ goalId: 'fw1', prompt: STRONG, leversHit: 5, passed: true, source: 'demo' });

    await fireEvent.press(screen.getByTestId('fw-finish'));
    await fireEvent.press(screen.getByTestId('fw-finish'));
    expect(onPassed).toHaveBeenCalledTimes(1);
  });

  it('a weak prompt costs one heart, keeps the text, then a strong resend passes', async () => {
    const { api, onPassed } = await setup();
    await type(WEAK);
    await send();
    await screen.findByTestId('fw-result');

    expect(screen.getByTestId('fw-score')).toHaveTextContent('0/5 LEVERS');
    for (const name of ['Task', 'Context', 'Role', 'Format', 'Limit']) expect(screen.getByLabelText(`${name}: missed`)).toBeTruthy();
    expect(screen.getByTestId('fw-tip')).toHaveTextContent(COPY.tipLabel + LEVER_TIP.task);
    expect(api.calls.miss).toEqual([COPY.weak]);
    expect(api.hearts).toBe(2);
    expect(api.lost).toBe(1);
    expect(screen.getByTestId('fw-input').props.value).toBe(WEAK);
    expect(screen.getByText(COPY.resend)).toBeTruthy();
    expect(screen.queryByTestId('fw-finish')).toBeNull();
    expect(screen.getByTestId('fw-energy').props.accessibilityLabel).toBe('AI energy 9 of 10');

    await type(STRONG);
    await send();
    await screen.findByTestId('fw-finish');
    expect(api.hearts).toBe(2);
    expect(history().map((h) => h.passed)).toEqual([true, false]);
    await fireEvent.press(screen.getByTestId('fw-finish'));
    expect(onPassed).toHaveBeenCalledTimes(1);
  });

  it('a shield blocks the weak-prompt heart loss', async () => {
    const { api } = await setup({ api: { hero: 'guard' } });
    expect(await power(api)).toBe(true);
    await type(WEAK);
    await send();
    await screen.findByTestId('fw-result');
    expect(api.hearts).toBe(3);
    expect(api.lost).toBe(0);
    expect(api.calls.miss).toHaveLength(1);
  });

  it('the last heart lost ends the round (frame shows Out of hearts) and locks the editor', async () => {
    const { api } = await setup({ api: { hearts: 1 } });
    await type(WEAK);
    await send();
    await screen.findByTestId('fw-result');
    expect(api.status).toBe('failed');
    expect(screen.getByTestId('fw-input').props.editable).toBe(false);
  });

  it('an openrouter reply has no DEMO tag and is logged as NOVA', async () => {
    await setup({ prep: (s) => (s.mode = { kind: 'fixed', data: { reply: '**Plants** make food:\n- sun\n- water' } }) });
    await type(STRONG);
    await send();
    await screen.findByTestId('fw-result');
    expect(screen.queryByTestId('fw-demo-tag')).toBeNull();
    expect(screen.getByTestId('fw-reply-text')).toHaveTextContent(/Plants make food:/);
    expect(screen.getByTestId('fw-reply-text')).toHaveTextContent(/• sun/);
    expect(history()[0]?.source).toBe('nova');
  });

  it('shows NOVA thinking (announced, input locked) while waiting', async () => {
    let release: (() => void) | undefined;
    const { server } = await setup();
    const real = server.fetch;
    server.fetch = (u, i) =>
      u.endsWith('/v1/freewrite/evaluate') ? new Promise<void>((r) => (release = r)).then(() => real(u, i)) : real(u, i);
    await type(STRONG);
    await send();
    expect(screen.getByTestId('fw-thinking')).toBeTruthy();
    expect(screen.getByTestId('fw-thinking').props.accessibilityLabel).toBe(COPY.thinking);
    expect(screen.getByTestId('fw-thinking-anim')).toBeTruthy();
    expect(screen.getByTestId('fw-input').props.editable).toBe(false);
    expect(sendDisabled()).toBe(true);
    await act(async () => release?.());
    await screen.findByTestId('fw-result');
    expect(screen.queryByTestId('fw-thinking')).toBeNull();
  });

  it('NOVA thinking is a static frame under reduced motion', async () => {
    let release: (() => void) | undefined;
    const { server } = await setup({ api: { reducedMotion: true } });
    const real = server.fetch;
    server.fetch = (u, i) =>
      u.endsWith('/v1/freewrite/evaluate') ? new Promise<void>((r) => (release = r)).then(() => real(u, i)) : real(u, i);
    await type(STRONG);
    await send();
    expect(screen.getByTestId('fw-thinking-static')).toBeTruthy();
    expect(screen.queryByTestId('fw-thinking-anim')).toBeNull();
    await act(async () => release?.());
    await screen.findByTestId('fw-result');
  });
});

describe('in-world fallbacks (offline check)', () => {
  afterEach(() => jest.useRealTimers());

  it('no answer within 8 s → OFFLINE banner, classic answer, offline scoring, energy unchanged', async () => {
    const { server, api } = await setup({ prep: (s) => (s.mode = { kind: 'hang' }) });
    jest.useFakeTimers();
    await type(STRONG);
    await send();
    expect(screen.getByTestId('fw-thinking')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(7_999);
    });
    expect(screen.queryByTestId('fw-offline-banner')).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    jest.useRealTimers();
    await screen.findByTestId('fw-offline-banner');
    expect(screen.getByTestId('fw-offline-banner')).toHaveTextContent("NOVA'S OFFLINE — HERE'S THE CLASSIC CHECKLIST");
    expect(screen.getByText(COPY.classicLabel)).toBeTruthy();
    expect(screen.getByTestId('fw-reply-text')).toHaveTextContent(/Plants make their own food/);
    expect(screen.queryByTestId('fw-demo-tag')).toBeNull();
    expect(screen.getByTestId('fw-score')).toHaveTextContent('5/5 LEVERS');
    expect(screen.getByTestId('fw-finish')).toBeTruthy();
    expect(server.evalRequests).toHaveLength(1);
    expect(screen.getByTestId('fw-energy').props.accessibilityLabel).toBe('AI energy 10 of 10');
    expect(history()[0]).toMatchObject({ source: 'offline', leversHit: 5, passed: true });
    expect(api.lost).toBe(0);
  });

  it('network failure → OFFLINE banner; a weak prompt still costs a heart', async () => {
    const { api } = await setup({ prep: (s) => (s.mode = { kind: 'network' }) });
    await type(WEAK);
    await send();
    await screen.findByTestId('fw-offline-banner');
    expect(screen.getByTestId('fw-score')).toHaveTextContent('0/5 LEVERS');
    expect(screen.getByTestId('fw-tip')).toHaveTextContent(COPY.tipLabel + LEVER_TIP.task);
    expect(api.hearts).toBe(2);
    expect(history()[0]?.source).toBe('offline');
  });

  it('an unreadable server body falls back to the offline check', async () => {
    await setup({ prep: (s) => (s.mode = { kind: 'garbage' }) });
    await type(STRONG);
    await send();
    await screen.findByTestId('fw-offline-banner');
    expect(screen.getByTestId('fw-score')).toHaveTextContent('5/5 LEVERS');
  });

  it.each([
    ['AI_INVALID_OUTPUT', 502, "NOVA'S OFFLINE — HERE'S THE CLASSIC CHECKLIST"],
    ['MODERATED', 422, "NOVA'S REPLY GOT CAUGHT BY THE SAFETY FILTER — THE CLASSIC CHECKLIST WILL SCORE YOU."],
    ['CAP_GLOBAL', 503, 'NOVA IS RESTING — TOO MANY AGENTS TODAY.'],
  ])('%s → in-world banner and offline check', async (code, status, banner) => {
    await setup({ prep: (s) => (s.mode = { kind: 'error', code, status }) });
    await type(STRONG);
    await send();
    await screen.findByTestId('fw-offline-banner');
    expect(screen.getByTestId('fw-offline-banner')).toHaveTextContent(banner);
    expect(screen.getByText(COPY.classicLabel)).toBeTruthy();
    expect(screen.getByTestId('fw-energy').props.accessibilityLabel).toBe('AI energy 10 of 10');
  });

  it('flat battery: offline button label and banner, scoring without calling the server', async () => {
    const { server, api } = await setup({ remaining: 0 });
    expect(screen.getByTestId('fw-energy').props.accessibilityLabel).toBe('AI energy 0 of 10');
    expect(screen.getByTestId('fw-offline-banner')).toHaveTextContent("NOVA'S BATTERY IS FLAT FOR TODAY. RECHARGES IN 3H.");
    expect(screen.getByText(COPY.sendOffline)).toBeTruthy();
    await type(WEAK);
    await send();
    await screen.findByTestId('fw-result');
    expect(server.evalRequests).toHaveLength(0);
    expect(screen.getByText(COPY.classicLabel)).toBeTruthy();
    expect(api.hearts).toBe(2);
    expect(history()[0]?.source).toBe('offline');
  });

  it('CAP_DEVICE from the server switches to the flat battery state', async () => {
    const { server } = await setup({ prep: (s) => (s.mode = { kind: 'error', code: 'CAP_DEVICE', status: 429 }) });
    await type(STRONG);
    await send();
    await screen.findByTestId('fw-offline-banner');
    expect(screen.getByTestId('fw-offline-banner')).toHaveTextContent(/BATTERY IS FLAT/);
    expect(screen.getByTestId('fw-energy').props.accessibilityLabel).toBe('AI energy 0 of 10');
    expect(server.evalRequests).toHaveLength(1);
  });
});

describe('hero powers (shared uses with forges 1–2)', () => {
  it('X-RAY on an empty draft is not consumed; on a draft it previews the chips', async () => {
    const { api } = await setup({ api: { hero: 'scout' } });
    expect(await power(api)).toBe(false);
    expect(api.calls.toast).toEqual([NOTHING_TO_USE]);
    expect(api.powerUses).toBe(2);

    await type('Act as a coach and explain offside to me');
    expect(await power(api)).toBe(true);
    expect(api.powerUses).toBe(1);
    expect(api.lastSay()?.text).toBe('X-RAY: your draft has TASK, ROLE. Missing: CONTEXT, FORMAT, LIMIT.');
    await waitFor(() => expect(screen.getByTestId('fw-preview')).toBeTruthy());
    expect(screen.getByLabelText('Task: hit (X-RAY preview)')).toBeTruthy();
    expect(screen.getByLabelText('Context: missed (X-RAY preview)')).toBeTruthy();
    // editing clears the preview
    await type('Act as a coach and explain offside to my class');
    expect(screen.queryByTestId('fw-preview')).toBeNull();
  });

  it('FOCUS names the first missed lever with the goal example and is always consumed', async () => {
    const { api } = await setup({ api: { hero: 'oracle' } });
    expect(await power(api)).toBe(true);
    expect(api.lastSay()?.text).toBe("FOCUS: add a TASK, e.g. 'Explain photosynthesis'");
    await type(STRONG);
    expect(await power(api)).toBe(true);
    expect(api.lastSay()?.text).toBe('FOCUS: your draft looks strong. Send it!');
    expect(api.powerUses).toBe(0);
  });

  it('REWIND restores a heart and the last sent prompt into an empty box', async () => {
    const { api } = await setup({ api: { hero: 'chrono' } });
    await type(WEAK);
    await send();
    await screen.findByTestId('fw-result');
    expect(api.hearts).toBe(2);
    await type('');
    expect(await power(api)).toBe(true);
    expect(api.hearts).toBe(3);
    expect(screen.getByTestId('fw-input').props.value).toBe(WEAK);
  });

  it('REWIND leaves a non-empty draft alone', async () => {
    const { api } = await setup({ api: { hero: 'chrono' } });
    await type(WEAK);
    await send();
    await screen.findByTestId('fw-result');
    await type('new draft here');
    await power(api);
    expect(screen.getByTestId('fw-input').props.value).toBe('new draft here');
  });

  it('shares remaining uses: with none left the power does nothing', async () => {
    const { api } = await setup({ api: { hero: 'oracle', powerUses: 0 } });
    expect(await power(api)).toBe(false);
    expect(api.calls.say.map((s) => s.text)).toEqual([COPY.intro]);
  });
});

describe('FreeWriteRound (frozen contract)', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('renders the forge with only { api, onPassed } and survives an unreachable server', async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    const api = createTestGameApi();
    await renderWithProviders(<FreeWriteRound api={api} onPassed={() => undefined} />);
    expect(screen.getByTestId('fw-root')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('fw-energy').props.accessibilityLabel).toBe('AI energy unknown, NOVA is offline'));
    await type(WEAK);
    await send();
    await screen.findByTestId('fw-offline-banner');
    expect(api.hearts).toBe(2);
  });
});
