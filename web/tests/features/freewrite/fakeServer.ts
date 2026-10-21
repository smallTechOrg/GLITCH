// A fake GLITCH server behind a FetchLike, speaking the frozen DTOs in src/contracts/api.ts.
// Used with createApiClient so component tests exercise the real client (envelope parsing,
// device header, 8 s abort).
import type { EnergyDTO, FreewriteEvaluateData, FreewriteEvaluateRequest } from '@/contracts/api';
import { createApiClient, type FetchLike } from '@/api/client';
import { checkLevers, countHit, offlineTip } from '@/features/freewrite/levers';

export const DEVICE = '3f2b8c1e-6a4d-4f1a-9b2c-0d1e2f3a4b5c';
export const RESETS_AT = '2026-10-21T00:00:00Z';

export type EvalMode =
  | { kind: 'demo' } // FakeProvider semantics: cue rules
  | { kind: 'fixed'; data: Partial<FreewriteEvaluateData> }
  | { kind: 'error'; code: string; status: number }
  | { kind: 'hang' } // never answers (until aborted)
  | { kind: 'network' } // fetch rejects
  | { kind: 'garbage' }; // 200 with an invalid body

export interface FakeServer {
  fetch: FetchLike;
  energy: EnergyDTO;
  energyDown: boolean;
  mode: EvalMode;
  evalRequests: { body: FreewriteEvaluateRequest; device: string | undefined }[];
  energyRequests: number;
  client: ReturnType<typeof createApiClient>;
}

const res = (status: number, body: unknown): Response =>
  ({ status, ok: status < 400, json: async () => body }) as unknown as Response;

export function createFakeServer(remaining = 10): FakeServer {
  const s: FakeServer = {
    energy: { remaining, limit: 10, resetsAt: RESETS_AT },
    energyDown: false,
    mode: { kind: 'demo' },
    evalRequests: [],
    energyRequests: 0,
    fetch: async (url, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      if (url.endsWith('/v1/energy')) {
        s.energyRequests += 1;
        if (s.energyDown) throw new TypeError('Failed to fetch');
        return res(200, { ok: true, data: {}, energy: { ...s.energy } });
      }
      if (url.endsWith('/v1/freewrite/evaluate')) {
        const body = JSON.parse(String(init?.body)) as FreewriteEvaluateRequest;
        s.evalRequests.push({ body, device: headers['X-Glitch-Device'] });
        const m = s.mode;
        if (m.kind === 'network') throw new TypeError('Failed to fetch');
        if (m.kind === 'hang') {
          return new Promise<Response>((_, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
          });
        }
        if (m.kind === 'garbage') return res(200, { ok: true, data: { reply: 42 } });
        if (m.kind === 'error') {
          if (m.code === 'CAP_DEVICE') s.energy = { ...s.energy, remaining: 0 };
          return res(m.status, { ok: false, error: { code: m.code, message: m.code, retryable: false }, energy: { ...s.energy } });
        }
        if (s.energy.remaining <= 0) {
          return res(429, { ok: false, error: { code: 'CAP_DEVICE', message: 'flat', retryable: false }, energy: { ...s.energy } });
        }
        s.energy = { ...s.energy, remaining: s.energy.remaining - 1 };
        let data: FreewriteEvaluateData;
        if (m.kind === 'demo') {
          const levers = checkLevers(body.prompt);
          const hit = countHit(levers);
          data = {
            reply: `[DEMO NOVA] Here's my answer to your prompt about: ${body.goal}\n- point one\n- point two`,
            levers,
            leversHit: hit,
            passed: hit >= 4,
            tip: offlineTip(levers),
            provider: 'fake',
            model: 'fake-demo',
          };
        } else {
          const levers = m.data.levers ?? { task: true, context: true, role: true, format: true, limit: true };
          const hit = countHit(levers);
          data = { reply: 'A real reply.', tip: 'A real tip.', provider: 'openrouter', model: 'google/gemini-2.5-flash-lite', ...m.data, levers, leversHit: hit, passed: hit >= 4 };
        }
        return res(200, { ok: true, data, energy: { ...s.energy } });
      }
      return res(404, { ok: false, error: { code: 'INTERNAL', message: 'not found', retryable: false } });
    },
    client: undefined as unknown as ReturnType<typeof createApiClient>,
  };
  s.client = createApiClient({ baseUrl: 'http://api.test', fetchImpl: (u, i) => s.fetch(u, i), deviceId: async () => DEVICE });
  return s;
}
