// Which case file a session plays: first play → v3 (no request); replay of a cleared content
// game → next unseen variation; any failure → v3 + in-world note. Never throws.
import { CLASSIC_FIRST_PLAY, fetchCaseFile, setCaseFileClientForTests, wantsVariation } from '@/features/variations';
import { createFakeScenarioServer, type FakeScenarioServer } from './fixtures';

let srv: FakeScenarioServer;
let restore: () => void;
beforeEach(() => {
  srv = createFakeScenarioServer();
  restore = setCaseFileClientForTests(srv.client);
});
afterEach(() => restore());

describe('wantsVariation', () => {
  it('only for a content game already cleared on this device', () => {
    expect(wantsVariation({ steps: {} }, 'm1g2')).toBe(false);
    expect(wantsVariation({ steps: { m1g1: true } }, 'm1g2')).toBe(false);
    expect(wantsVariation({ steps: { m1g2: true } }, 'm1g2')).toBe(true);
    for (const g of ['m1g1', 'm3g1', 'm4g1', 'm4g2'] as const) expect(wantsVariation({ steps: { [g]: true } }, g)).toBe(true);
    // Simulation / forge games are Phase 4 — never a scenario request.
    for (const g of ['m2g1', 'm2g2', 'm3g2', 'm4g3'] as const) expect(wantsVariation({ steps: { [g]: true } }, g)).toBe(false);
  });

  it('the first-play case file is the silent v3 classic', () => {
    expect(CLASSIC_FIRST_PLAY).toEqual({ kind: 'classic', note: false, reason: 'first-play' });
  });
});

describe('fetchCaseFile', () => {
  it('serves the next unseen variation, parsed into the game shape', async () => {
    const f = await fetchCaseFile('m1g2', []);
    expect(f).toMatchObject({ kind: 'variation', variationId: 'm1g2-v1aaaa', cached: true, game: { gameId: 'm1g2' } });
    const g = await fetchCaseFile('m1g2', ['m1g2-v1aaaa']);
    expect(g).toMatchObject({ kind: 'variation', variationId: 'm1g2-v2bbbb' });
    expect(srv.requests.map((r) => r.seen)).toEqual([[], ['m1g2-v1aaaa']]);
  });

  it('every variation seen and nothing new (CAP_DEVICE) → v3 classic with the note', async () => {
    expect(await fetchCaseFile('m1g2', ['m1g2-v1aaaa', 'm1g2-v2bbbb'])).toEqual({ kind: 'classic', note: true, reason: 'unavailable' });
  });

  it.each([
    ['backend down', { kind: 'network' } as const],
    ['global cap', { kind: 'error', code: 'CAP_GLOBAL', status: 503 } as const],
    ['generation failed', { kind: 'error', code: 'AI_INVALID_OUTPUT', status: 502 } as const],
  ])('%s → v3 classic with the note', async (_n, mode) => {
    srv.mode = mode;
    expect(await fetchCaseFile('m4g1', [])).toEqual({ kind: 'classic', note: true, reason: 'unavailable' });
  });

  it('an invalid scenario body → v3 classic (never a broken game)', async () => {
    srv.mode = { kind: 'garbage' };
    expect(await fetchCaseFile('m1g2', [])).toEqual({ kind: 'classic', note: true, reason: 'invalid' });
  });

  it('a server that returns an already-seen id is refused (never repeat on this device)', async () => {
    srv.mode = { kind: 'repeat' };
    expect(await fetchCaseFile('m1g2', ['m1g2-v1aaaa'])).toEqual({ kind: 'classic', note: true, reason: 'invalid' });
  });

  it("another game's variation or a non-URL-safe id is refused", async () => {
    const wrongGame = setCaseFileClientForTests({
      getNextScenario: async () => ({ ok: true, data: { variationId: 'x1', gameId: 'm4g1', data: {}, cached: true } }),
    });
    expect(await fetchCaseFile('m1g2', [])).toMatchObject({ kind: 'classic', reason: 'invalid' });
    wrongGame();
    const badId = setCaseFileClientForTests({
      getNextScenario: async () => ({ ok: true, data: { variationId: 'a b/c', gameId: 'm1g2', data: {}, cached: true } }),
    });
    expect(await fetchCaseFile('m1g2', [])).toMatchObject({ kind: 'classic', reason: 'invalid' });
    badId();
  });

  it('a non-content game never requests', async () => {
    expect(await fetchCaseFile('m2g1', [])).toEqual({ kind: 'classic', note: false, reason: 'not-content' });
    expect(srv.requests).toHaveLength(0);
  });

  it('a client that throws (should never happen) still resolves to v3', async () => {
    const r = setCaseFileClientForTests({ getNextScenario: () => Promise.reject(new Error('boom')) });
    expect(await fetchCaseFile('m1g2', [])).toMatchObject({ kind: 'classic', note: true });
    r();
  });
});
