// api/client.ts: envelopes pass through, never throws, NETWORK / TIMEOUT, device header, base URL.
import { createApiClient, parseEnvelope, isFreewriteData, type FetchLike } from '@/api/client';
import { DEFAULT_API_URL, normalizeBaseUrl } from '@/api/config';
import type { FreewriteEvaluateData } from '@/contracts/api';

const DEVICE = '0b6c8a64-9c1e-4a51-8d2f-2f3b8c1a9e77';
const energy = { remaining: 9, limit: 10, resetsAt: '2026-10-20T00:00:00Z' };
const data: FreewriteEvaluateData = {
  reply: 'Plants make food from light.',
  levers: { task: true, context: true, role: true, format: true, limit: false },
  leversHit: 4, passed: true, tip: 'Add a word limit.', provider: 'fake', model: 'fake/demo',
};

const jsonResponse = (status: number, body: unknown): Response =>
  ({ status, ok: status < 400, json: async () => body } as unknown as Response);

function fakeFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f: FetchLike = async (url, init = {}) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  return { f, calls };
}

const client = (f: FetchLike) => createApiClient({ baseUrl: 'http://api.test/', fetchImpl: f, deviceId: async () => DEVICE });

describe('api client', () => {
  it('POSTs the evaluate request with JSON body and the X-Glitch-Device header', async () => {
    const { f, calls } = fakeFetch(() => jsonResponse(200, { ok: true, data, energy }));
    const r = await client(f).evaluateFreewrite({ goalId: 'fw1', goal: 'Explain photosynthesis to a 10-year-old.', prompt: 'Act as a teacher…' });
    expect(r).toEqual({ ok: true, data, energy });
    expect(calls[0]?.url).toBe('http://api.test/v1/freewrite/evaluate');
    expect(calls[0]?.init.method).toBe('POST');
    expect((calls[0]?.init.headers as Record<string, string>)['X-Glitch-Device']).toBe(DEVICE);
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ goalId: 'fw1', goal: 'Explain photosynthesis to a 10-year-old.', prompt: 'Act as a teacher…' });
  });

  it('GET /v1/energy returns the envelope energy', async () => {
    const { f, calls } = fakeFetch(() => jsonResponse(200, { ok: true, data: {}, energy }));
    const r = await client(f).getEnergy();
    expect(r).toEqual({ ok: true, data: {}, energy });
    expect(calls[0]?.init.method).toBe('GET');
  });

  it('passes server error envelopes through, with energy', async () => {
    const { f } = fakeFetch(() => jsonResponse(429, { ok: false, error: { code: 'CAP_DEVICE', message: 'Out of energy', retryable: false }, energy: { ...energy, remaining: 0 } }));
    const r = await client(f).evaluateFreewrite({ goalId: 'fw1', goal: 'g', prompt: 'p' });
    expect(r).toEqual({ ok: false, error: { code: 'CAP_DEVICE', message: 'Out of energy', retryable: false }, energy: { ...energy, remaining: 0 } });
  });

  it('maps a network failure to NETWORK without throwing', async () => {
    const { f } = fakeFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    const r = await client(f).getEnergy();
    expect(r).toMatchObject({ ok: false, error: { code: 'NETWORK', message: 'Failed to fetch', retryable: true } });
  });

  it('aborts after the timeout (default 8000 ms) and reports TIMEOUT', async () => {
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
      const p = client(f).evaluateFreewrite({ goalId: 'fw1', goal: 'g', prompt: 'p' });
      await jest.advanceTimersByTimeAsync(7999);
      expect(aborted).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      await expect(p).resolves.toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
      expect(aborted).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('treats unreadable or mis-shaped bodies as NETWORK', async () => {
    const bad = fakeFetch(() => ({ status: 502, ok: false, json: async () => { throw new SyntaxError('html'); } } as unknown as Response));
    expect(await client(bad.f).getEnergy()).toMatchObject({ ok: false, error: { code: 'NETWORK' } });
    const shape = fakeFetch(() => jsonResponse(200, { ok: true, data: { reply: 1 } }));
    expect(await client(shape.f).evaluateFreewrite({ goalId: 'a', goal: 'b', prompt: 'c' })).toMatchObject({ ok: false, error: { code: 'NETWORK' } });
  });

  it('reads provider info from /healthz without a device header', async () => {
    const { f, calls } = fakeFetch(() => jsonResponse(200, { ok: true, data: { status: 'ok', provider: 'fake', model: 'demo', env: 'dev', version: '0.1.0' } }));
    const r = await client(f).getHealth();
    expect(r).toMatchObject({ ok: true, data: { provider: 'fake' } });
    expect((calls[0]?.init.headers as Record<string, string>)['X-Glitch-Device']).toBeUndefined();
  });

  it('normalises the base URL and validates envelope data', () => {
    expect(normalizeBaseUrl('https://x.run.app///')).toBe('https://x.run.app');
    expect(normalizeBaseUrl('')).toBe(DEFAULT_API_URL);
    expect(normalizeBaseUrl(undefined)).toBe('http://127.0.0.1:8787');
    expect(isFreewriteData(data)).toBe(true);
    expect(isFreewriteData({ ...data, levers: { task: true } })).toBe(false);
    expect(parseEnvelope({ ok: false, error: { code: 'WHAT' } }, isFreewriteData)).toMatchObject({ ok: false, error: { code: 'INTERNAL', retryable: false } });
    expect(parseEnvelope('nope', isFreewriteData)).toMatchObject({ ok: false, error: { code: 'NETWORK' } });
  });
});
