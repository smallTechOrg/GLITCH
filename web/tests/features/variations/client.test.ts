// GET /v1/scenarios/{gameId}/next through the real client: path + ?seen=, device header,
// envelope parsing, error envelopes, network failure and the bounded timeout. Never throws.
import { createApiClient, isScenarioNext, scenarioNextPath, type FetchLike } from '@/api/client';
import { SCENARIO_TIMEOUT_MS } from '@/contracts/api';
import { DEVICE, WIRE, createFakeScenarioServer } from './fixtures';

describe('getNextScenario', () => {
  it('builds /v1/scenarios/<id>/next?seen=a,b (empty seen → seen=)', () => {
    expect(scenarioNextPath('m1g2', [])).toBe('/v1/scenarios/m1g2/next?seen=');
    expect(scenarioNextPath('m1g2', ['abc', 'd_e-f'])).toBe('/v1/scenarios/m1g2/next?seen=abc,d_e-f');
    expect(scenarioNextPath('m1g2', ['a,b'])).toBe('/v1/scenarios/m1g2/next?seen=a%2Cb');
  });

  it('sends the seen list and device header and returns the variation', async () => {
    const srv = createFakeScenarioServer();
    const r = await srv.client.getNextScenario('m1g2', ['m1g2-v1aaaa']);
    expect(srv.requests).toHaveLength(1);
    expect(srv.requests[0]).toMatchObject({ gameId: 'm1g2', seen: ['m1g2-v1aaaa'], device: DEVICE });
    expect(r).toMatchObject({ ok: true, data: { variationId: 'm1g2-v2bbbb', gameId: 'm1g2', cached: true } });
  });

  it('passes server error envelopes through (CAP_DEVICE, AI_INVALID_OUTPUT)', async () => {
    const srv = createFakeScenarioServer();
    srv.mode = { kind: 'error', code: 'CAP_DEVICE', status: 429 };
    expect(await srv.client.getNextScenario('m1g2', [])).toMatchObject({ ok: false, error: { code: 'CAP_DEVICE' } });
    srv.mode = { kind: 'error', code: 'AI_INVALID_OUTPUT', status: 502 };
    expect(await srv.client.getNextScenario('m1g2', [])).toMatchObject({ ok: false, error: { code: 'AI_INVALID_OUTPUT' } });
  });

  it('a network failure resolves to NETWORK (never rejects)', async () => {
    const srv = createFakeScenarioServer();
    srv.mode = { kind: 'network' };
    await expect(srv.client.getNextScenario('m1g2', [])).resolves.toMatchObject({ ok: false, error: { code: 'NETWORK' } });
  });

  it('a malformed success body (no variationId / unknown game / no data) is NETWORK', async () => {
    const body = (data: unknown): FetchLike => async () => ({ status: 200, ok: true, json: async () => ({ ok: true, data }) }) as unknown as Response;
    for (const data of [
      { gameId: 'm1g2', data: WIRE.m1g2, cached: true },
      { variationId: 'x1', gameId: 'zz', data: WIRE.m1g2, cached: true },
      { variationId: 'x1', gameId: 'm1g2', cached: true },
      { variationId: 'x1', gameId: 'm1g2', data: WIRE.m1g2 },
    ]) {
      expect(isScenarioNext(data)).toBe(false);
      const c = createApiClient({ baseUrl: 'http://api.test', fetchImpl: body(data), deviceId: async () => DEVICE });
      expect(await c.getNextScenario('m1g2', [])).toMatchObject({ ok: false, error: { code: 'NETWORK' } });
    }
  });

  it(`times out after SCENARIO_TIMEOUT_MS (${SCENARIO_TIMEOUT_MS} ms = the brief's ~8 s, above the server's 7 s pipeline deadline)`, async () => {
    expect(SCENARIO_TIMEOUT_MS).toBe(8000);
    jest.useFakeTimers();
    try {
      const srv = createFakeScenarioServer();
      srv.mode = { kind: 'hang' };
      let result: unknown = null;
      void srv.client.getNextScenario('m1g2', []).then((r) => (result = r));
      // The server gives up at 7 s and answers (fallback/error); the client must still be waiting then.
      await jest.advanceTimersByTimeAsync(7000);
      expect(result).toBeNull();
      await jest.advanceTimersByTimeAsync(SCENARIO_TIMEOUT_MS - 7000 - 1);
      expect(result).toBeNull();
      await jest.advanceTimersByTimeAsync(1);
      expect(result).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    } finally {
      jest.useRealTimers();
    }
  });
});
