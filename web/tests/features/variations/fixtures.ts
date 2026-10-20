// Wire-shaped variations (GET /v1/scenarios/{gameId}/next → data) for each content game, plus
// a fake GLITCH server that serves them honouring `?seen=`. Every fixture differs from v3.
import { createApiClient, type FetchLike } from '@/api/client';
import type { ContentGameId } from '@/features/variations';

export const WIRE: Record<ContentGameId, unknown> = {
  m1g1: {
    trainEmails: [
      { id: 'e1', text: 'URGENT: claim your lottery cash today', label: 'spam' },
      { id: 'e2', text: 'Band practice moved to Thursday', label: 'not_spam' },
      { id: 'e3', text: 'Your parcel is held. Pay the fee at this link', label: 'spam' },
      { id: 'e4', text: 'Grandma says thanks for the card', label: 'not_spam' },
      { id: 'e5', text: 'Lose 10 kg in 3 days with this pill', label: 'spam' },
      { id: 'e6', text: 'Science fair forms are due Monday', label: 'not_spam' },
    ],
    testEmails: [
      { id: 't1', text: 'Coach: bring your boots tomorrow', label: 'not_spam', modelSays: 'NOT SPAM', modelRight: true },
      { id: 't2', text: 'You won a FREE phone, reply YES', label: 'spam', modelSays: 'NOT SPAM', modelRight: false },
      { id: 't3', text: 'Library book due next week', label: 'not_spam', modelSays: 'SPAM', modelRight: false },
      { id: 't4', text: 'Crypto doubles overnight, invest now', label: 'spam', modelSays: 'SPAM', modelRight: true },
    ],
  },
  m1g2: {
    sentences: [
      { text: 'A spam filter learns from emails that people have labelled.', fib: false, explanation: null },
      { text: 'An AI model understands the world exactly like a person does.', fib: true, explanation: 'Models match patterns in data; they do not understand like people.' },
      { text: 'More varied training examples usually help a model generalize.', fib: false, explanation: null },
      { text: 'If a model is confident, its answer must be correct.', fib: true, explanation: 'Confidence is not proof. Confident answers can still be wrong.' },
      { text: 'A label is the answer attached to a training example.', fib: false, explanation: null },
      { text: 'Once trained, a model never needs testing again.', fib: true, explanation: 'Models must be tested on new data to see if they generalize.' },
    ],
  },
  m3g1: {
    candidate: 'MAYA',
    lines: [
      { text: 'NAME', proxy: null, note: 'hid' },
      { text: 'GENDER', proxy: null, note: 'hid' },
      { text: "Member, Girls' Coding Club", proxy: true, note: 'Stands in for gender.' },
      { text: 'Postcode 90210', proxy: true, note: 'Can stand in for income.' },
      { text: "Head Girl, St Mary's School", proxy: true, note: 'Stands in for gender.' },
      { text: 'Gap year: caring for a parent', proxy: true, note: 'Can stand in for caregiving.' },
      { text: "Hobby: Women's rugby", proxy: true, note: 'Stands in for gender.' },
      { text: 'Skills: JavaScript, R', proxy: false, note: 'A real skill.' },
      { text: 'Built a school timetable app', proxy: false, note: 'A real project.' },
      { text: 'Top 5% maths olympiad', proxy: false, note: 'A real result.' },
      { text: 'Junior developer, 1 year', proxy: false, note: 'Real experience.' },
    ],
  },
  m4g1: {
    citations: [
      { id: 'c1', text: 'Prof. Ada Quill (2024). Robots That Dream. Moon Review, 3(1).', real: false },
      { id: 'c2', text: 'European Union (2024). Regulation (EU) 2024/1689, the Artificial Intelligence Act. Official Journal of the EU.', real: true },
      { id: 'c3', text: 'Russell & Norvig (2020). Artificial Intelligence: A Modern Approach, 4th ed. Pearson.', real: true },
      { id: 'c4', text: 'Anon (2023). 100% True AI Secrets. Mystery Press.', real: false },
      { id: 'c5', text: 'Turing (1950). Computing Machinery and Intelligence. Mind, 59(236).', real: true },
    ],
  },
  m4g2: {
    answers: [
      { id: 'a1', statement: 'Mount Everest is the tallest mountain above sea level.', confidence: 96, evidence: 'Matches 2 atlases', trust: true },
      { id: 'a2', statement: 'Your phone battery will last 9 days.', confidence: 94, evidence: 'No test data given', trust: false },
      { id: 'a3', statement: 'A 2021 survey shows 87% of teens agree.', confidence: 92, evidence: 'Survey not found anywhere', trust: false },
      { id: 'a4', statement: 'This recipe has 4 ingredients.', confidence: 81, evidence: 'Recipe card lists 4', trust: true },
      { id: 'a5', statement: 'This rash is nothing to worry about.', confidence: 97, evidence: 'No doctor consulted. High stakes', trust: false },
      { id: 'a6', statement: 'The Moon orbits the Earth.', confidence: 71, evidence: 'Matches NASA website', trust: true },
    ],
  },
};

export const DEVICE = '3f2b8c1e-6a4d-4f1a-9b2c-0d1e2f3a4b5c';

const res = (status: number, body: unknown): Response => ({ status, ok: status < 400, json: async () => body }) as unknown as Response;

export type ScenarioMode =
  | { kind: 'serve' } // serve the bank in order, skipping seen ids; none left → CAP_DEVICE
  | { kind: 'error'; code: string; status: number }
  | { kind: 'network' }
  | { kind: 'hang' }
  | { kind: 'garbage' } // 200 with an invalid scenario body
  | { kind: 'repeat' }; // ignores ?seen= (buggy server) — client must still refuse

export interface FakeScenarioServer {
  fetch: FetchLike;
  mode: ScenarioMode;
  /** Variation bank per game: [variationId, wire data]. */
  bank: Partial<Record<ContentGameId, [string, unknown][]>>;
  requests: { url: string; gameId: string; seen: string[]; device: string | undefined }[];
  client: ReturnType<typeof createApiClient>;
}

/** A second, different variation: every top-level list reversed (counts unchanged). */
export function reversed(wire: unknown): unknown {
  const o = wire as Record<string, unknown>;
  const flip = (v: unknown[]): unknown[] =>
    [...v].reverse().map((item, i) => {
      const it = item as Record<string, unknown>;
      return typeof it.id === 'string' ? { ...it, id: `${it.id.replace(/\d+$/, '')}${i + 1}` } : it;
    });
  const out = Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.isArray(v) ? flip(v) : v]));
  // Proxy Hunt: the redacted NAME/GENDER lines stay first, as the server serves them.
  if (Array.isArray(o.lines)) out.lines = [...(o.lines as unknown[]).slice(0, 2), ...[...(o.lines as unknown[]).slice(2)].reverse()];
  return out;
}

/** Two distinct variations per game (server-style ids `<game>-<hash>`): v1 = WIRE fixture, v2 = reversed. */
export function createFakeScenarioServer(): FakeScenarioServer {
  const bank: FakeScenarioServer['bank'] = {};
  for (const g of Object.keys(WIRE) as ContentGameId[]) bank[g] = [[`${g}-v1aaaa`, WIRE[g]], [`${g}-v2bbbb`, reversed(WIRE[g])]];
  const s: FakeScenarioServer = {
    mode: { kind: 'serve' },
    bank,
    requests: [],
    fetch: async (url, init) => {
      const u = new URL(url);
      const m = /^\/v1\/scenarios\/([^/]+)\/next$/.exec(u.pathname);
      if (!m) return res(404, { ok: false, error: { code: 'BAD_REQUEST', message: 'nope', retryable: false } });
      const gameId = decodeURIComponent(m[1] ?? '');
      const seenRaw = u.searchParams.get('seen') ?? '';
      const seen = seenRaw ? seenRaw.split(',') : [];
      const headers = (init?.headers ?? {}) as Record<string, string>;
      s.requests.push({ url, gameId, seen, device: headers['X-Glitch-Device'] });
      const mode = s.mode;
      if (mode.kind === 'network') throw new TypeError('Failed to fetch');
      if (mode.kind === 'hang') {
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        });
      }
      if (mode.kind === 'error') return res(mode.status, { ok: false, error: { code: mode.code, message: mode.code, retryable: false } });
      const list = s.bank[gameId as ContentGameId] ?? [];
      if (mode.kind === 'garbage') return res(200, { ok: true, data: { variationId: 'bad1', gameId, data: { sentences: [] }, cached: true } });
      const pick = mode.kind === 'repeat' ? list[0] : list.find(([id]) => !seen.includes(id));
      if (!pick) return res(429, { ok: false, error: { code: 'CAP_DEVICE', message: 'No energy', retryable: false } });
      return res(200, { ok: true, data: { variationId: pick[0], gameId, schemaVersion: 1, data: pick[1], cached: true } });
    },
    client: undefined as unknown as ReturnType<typeof createApiClient>,
  };
  s.client = createApiClient({ baseUrl: 'http://api.test', fetchImpl: s.fetch, deviceId: async () => DEVICE });
  return s;
}
