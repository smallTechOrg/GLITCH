// api/client.ts → explainMistake (Phase 3, ask-nova-why.md): POST /v1/explain with exactly the
// four id keys + device header, ExplainData guard, server envelopes pass through, never throws,
// 8 s (EXPLAIN_TIMEOUT_MS) abort → TIMEOUT.
import { createApiClient, isExplainData, type FetchLike } from '@/api/client';
import { EXPLAIN_TIMEOUT_MS, type ExplainData, type ExplainRequest } from '@/contracts/api';

const DEVICE = '0b6c8a64-9c1e-4a51-8d2f-2f3b8c1a9e77';
const energy = { remaining: 9, limit: 10, resetsAt: '2026-10-21T00:00:00Z' };
const data: ExplainData = { text: 'That line is true. The right call here: TRUE.', tip: 'Slow down: find the clue first, then make the call.', cached: false, provider: 'fake' };
const req: ExplainRequest = { gameId: 'm1g2', variationId: 'v3', itemId: 's0', answer: 'fib' };

const jsonResponse = (status: number, body: unknown): Response => ({ status, ok: status < 400, json: async () => body }) as unknown as Response;

function fakeFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f: FetchLike = async (url, init = {}) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  return { f, calls };
}
const client = (f: FetchLike) => createApiClient({ baseUrl: 'http://api.test', fetchImpl: f, deviceId: async () => DEVICE });

describe('explainMistake', () => {
  it('POSTs exactly {gameId, variationId, itemId, answer} with the device header and returns the data + energy', async () => {
    const { f, calls } = fakeFetch(() => jsonResponse(200, { ok: true, data, energy }));
    const extra = { ...req, itemText: 'never sent', message: 'never sent' } as ExplainRequest;
    const r = await client(f).explainMistake(extra);
    expect(r).toEqual({ ok: true, data, energy });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('http://api.test/v1/explain');
    expect(calls[0]?.init.method).toBe('POST');
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers['X-Glitch-Device']).toBe(DEVICE);
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(String(calls[0]?.init.body)) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['answer', 'gameId', 'itemId', 'variationId']);
    expect(body).toEqual(req);
  });

  it('passes a cached hit through (cached: true)', async () => {
    const { f } = fakeFetch(() => jsonResponse(200, { ok: true, data: { ...data, cached: true, provider: 'openrouter' }, energy }));
    await expect(client(f).explainMistake(req)).resolves.toMatchObject({ ok: true, data: { cached: true, provider: 'openrouter' } });
  });

  it('passes error envelopes through with energy (CAP_DEVICE, AI_UNAVAILABLE stub, BAD_REQUEST)', async () => {
    for (const [status, code] of [[429, 'CAP_DEVICE'], [502, 'AI_UNAVAILABLE'], [400, 'BAD_REQUEST']] as const) {
      const { f } = fakeFetch(() => jsonResponse(status, { ok: false, error: { code, message: 'm', retryable: false }, energy }));
      await expect(client(f).explainMistake(req)).resolves.toEqual({ ok: false, error: { code, message: 'm', retryable: false }, energy });
    }
  });

  it('a malformed success body → NETWORK (never throws)', async () => {
    for (const bad of [{ text: 'x' }, { ...data, provider: 'gpt' }, { ...data, text: '  ' }, { ...data, cached: 'no' }, null]) {
      const { f } = fakeFetch(() => jsonResponse(200, { ok: true, data: bad }));
      await expect(client(f).explainMistake(req)).resolves.toMatchObject({ ok: false, error: { code: 'NETWORK' } });
    }
    const { f } = fakeFetch(() => ({ status: 502, ok: false, json: async () => { throw new SyntaxError('html'); } }) as unknown as Response);
    await expect(client(f).explainMistake(req)).resolves.toMatchObject({ ok: false, error: { code: 'NETWORK' } });
  });

  it('a network failure, or a failing device id, → NETWORK without throwing', async () => {
    const { f } = fakeFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    await expect(client(f).explainMistake(req)).resolves.toMatchObject({ ok: false, error: { code: 'NETWORK', retryable: true } });
    const noDevice = createApiClient({ baseUrl: 'http://api.test', fetchImpl: f, deviceId: async () => { throw new Error('storage'); } });
    await expect(noDevice.explainMistake(req)).resolves.toMatchObject({ ok: false, error: { code: 'NETWORK' } });
  });

  it(`aborts after EXPLAIN_TIMEOUT_MS (${EXPLAIN_TIMEOUT_MS} ms) and reports TIMEOUT`, async () => {
    expect(EXPLAIN_TIMEOUT_MS).toBe(8000);
    jest.useFakeTimers();
    try {
      let aborted = false;
      const { f } = fakeFetch(
        (_u, init) =>
          new Promise<Response>((_res, rej) => {
            init.signal?.addEventListener('abort', () => {
              aborted = true;
              rej(new Error('aborted'));
            });
          }),
      );
      const p = client(f).explainMistake(req);
      await jest.advanceTimersByTimeAsync(EXPLAIN_TIMEOUT_MS - 1);
      expect(aborted).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      await expect(p).resolves.toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
      expect(aborted).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('an outer abort signal cancels → NETWORK "Request cancelled"', async () => {
    const ctrl = new AbortController();
    const { f } = fakeFetch(
      (_u, init) =>
        new Promise<Response>((_res, rej) => {
          if (init.signal?.aborted) rej(new Error('aborted')); // like fetch with an already-aborted signal
          else init.signal?.addEventListener('abort', () => rej(new Error('aborted')));
        }),
    );
    const p = client(f).explainMistake(req, { signal: ctrl.signal });
    ctrl.abort();
    await expect(p).resolves.toMatchObject({ ok: false, error: { code: 'NETWORK', message: 'Request cancelled' } });
  });

  it('isExplainData guards the DTO', () => {
    expect(isExplainData(data)).toBe(true);
    expect(isExplainData({ ...data, tip: 3 })).toBe(false);
    expect(isExplainData([])).toBe(false);
  });
});
