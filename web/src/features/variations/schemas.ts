// Wire → game data for scenario variations (scenario-variations.md). Each content game's
// variation arrives as JSON in `data` of GET /v1/scenarios/{gameId}/next and is mapped onto
// the SAME shape as the game's v3 data (games/<id>/data.ts → *Scenario), so the games render a
// variation exactly like the classic case file. The server already validated it; this is the
// client's defensive copy of the structural + count rules — anything off → null → v3 classic.
//
// This is the only module that knows the wire shape — the served `data` pinned by P2-D1 in
// api/src/glitch_api/scenarios/schemas/<gameId>.py (spec/api.md → per-game variation JSON).
// Server item ids (e1…, t1…, c1…, a1…) must be the positional ids the games and Phase-3
// explanations use; anything else is refused.
import type { GameId } from '../../contracts/ids';
import type { TestEmail, TrainEmail, TrainScenario } from '../../games/m1g1/data';
import type { FibScenario, Sentence } from '../../games/m1g2/data';
import type { ProxyScenario, ResumeLine } from '../../games/m3g1/data';
import type { Citation, CitationId, DetectiveScenario } from '../../games/m4g1/data';
import type { Answer, AnswerId, CourtScenario } from '../../games/m4g2/data';

export interface ScenarioByGame {
  m1g1: TrainScenario;
  m1g2: FibScenario;
  m3g1: ProxyScenario;
  m4g1: DetectiveScenario;
  m4g2: CourtScenario;
}

export type ContentGameId = keyof ScenarioByGame;

/** The five content games that serve fresh case files on replay. */
export const CONTENT_GAME_IDS: readonly ContentGameId[] = ['m1g1', 'm1g2', 'm3g1', 'm4g1', 'm4g2'];

export const isContentGame = (g: GameId): g is ContentGameId => (CONTENT_GAME_IDS as readonly string[]).includes(g);

/** A parsed variation, discriminated by game. */
export type GameScenario = { [G in ContentGameId]: { gameId: G; scenario: ScenarioByGame[G] } }[ContentGameId];

/** Longest learner-facing line accepted (v3's longest is ~90 chars). */
export const MAX_TEXT = 240;
/** Fact or Fib: each fib's explanation is at most 20 words. */
export const MAX_EXPLANATION_WORDS = 20;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t && t.length <= MAX_TEXT ? t : null;
};
const words = (s: string): number => s.split(' ').filter(Boolean).length;

/** When the server sends an item id it must be the positional one (`e1`, `t3`, …). */
const idOk = (o: Obj, expected: string): boolean => o.id === undefined || o.id === expected;

/** Exactly `n` objects, each mapped by `f` (any null → null). */
function list<T>(v: unknown, n: number, f: (o: Obj, i: number) => T | null): T[] | null {
  if (!Array.isArray(v) || v.length !== n) return null;
  const out: T[] = [];
  for (let i = 0; i < n; i++) {
    const o = v[i];
    if (!isObj(o)) return null;
    const r = f(o, i);
    if (r === null) return null;
    out.push(r);
  }
  return out;
}

const count = <T>(xs: readonly T[], p: (x: T) => boolean): number => xs.filter(p).length;

/**
 * m1g1 Train the Model:
 * `{ trainEmails: [{ id: "e1", text, label: "spam"|"not_spam" }]×6,
 *    testEmails: [{ id: "t1", text, label, modelSays: "SPAM"|"NOT SPAM", modelRight: bool }]×4 }`
 * — model wrong on exactly 2 test emails; both labels present in training; `modelRight`
 * must agree with `modelSays` vs the true `label`.
 */
export function parseTrain(d: unknown): TrainScenario | null {
  if (!isObj(d)) return null;
  const train = list<TrainEmail>(d.trainEmails, 6, (o, i) => {
    const t = text(o.text);
    if (!t || !idOk(o, `e${i + 1}`) || (o.label !== 'spam' && o.label !== 'not_spam')) return null;
    return [`e${i + 1}`, t, o.label === 'spam' ? 's' : 'n'] as const;
  });
  const test = list<TestEmail>(d.testEmails, 4, (o, i) => {
    const t = text(o.text);
    if (!t || !idOk(o, `t${i + 1}`) || (o.modelSays !== 'SPAM' && o.modelSays !== 'NOT SPAM') || typeof o.modelRight !== 'boolean') return null;
    if ((o.label === 'spam' || o.label === 'not_spam') && o.modelRight !== ((o.modelSays === 'SPAM') === (o.label === 'spam'))) return null;
    return [`t${i + 1}`, t, o.modelSays, o.modelRight ? 'r' : 'w'] as const;
  });
  if (!train || !test) return null;
  const spam = count(train, (e) => e[2] === 's');
  if (spam === 0 || spam === train.length) return null;
  if (count(test, (e) => e[3] === 'w') !== 2) return null;
  return { train, test };
}

/**
 * m1g2 Fact or Fib: `{ sentences: [{ text, fib: bool, explanation: string | null }]×6 }` —
 * exactly 3 fibs, each with an explanation of at most 20 words (ignored on true sentences).
 */
export function parseFib(d: unknown): FibScenario | null {
  if (!isObj(d)) return null;
  const sentences = list<Sentence>(d.sentences, 6, (o) => {
    const t = text(o.text);
    if (!t || typeof o.fib !== 'boolean') return null;
    if (!o.fib) return [t, 0] as const;
    const e = text(o.explanation);
    if (!e || words(e) > MAX_EXPLANATION_WORDS) return null;
    return [t, 1, e] as const;
  });
  if (!sentences || count(sentences, (s) => s[1] === 1) !== 3) return null;
  return { sentences };
}

/** m3g1 candidate: one upper-case first name for the paper tag (server: `^[A-Z][A-Z'-]{1,11}$`). */
const CANDIDATE_RE = /^[A-Z][A-Z'-]{1,11}$/;

/**
 * m3g1 Proxy Hunt: `{ candidate: "ANAYA", lines: [{ text, proxy: true|false|null, note }]×11 }` —
 * 2 redacted (`proxy: null`, label shown, e.g. "NAME"), 5 proxies, 4 real signals.
 */
export function parseProxy(d: unknown): ProxyScenario | null {
  if (!isObj(d)) return null;
  if (typeof d.candidate !== 'string' || !CANDIDATE_RE.test(d.candidate)) return null;
  const resume = list<ResumeLine>(d.lines, 11, (o) => {
    const t = text(o.text);
    if (!t) return null;
    if (o.proxy === null) return [t, null, 'hid'] as const;
    const note = text(o.note);
    if (!note || typeof o.proxy !== 'boolean') return null;
    return [t, o.proxy ? 1 : 0, note] as const;
  });
  if (!resume) return null;
  if (count(resume, (l) => l[1] === null) !== 2 || count(resume, (l) => l[1] === 1) !== 5 || count(resume, (l) => l[1] === 0) !== 4) return null;
  return { resume, candidate: d.candidate };
}

/** m4g1 Source Detective: `{ citations: [{ id: "c1", text, real: bool }]×5 }` — 2–3 invented. */
export function parseDetective(d: unknown): DetectiveScenario | null {
  if (!isObj(d)) return null;
  const citations = list<Citation>(d.citations, 5, (o, i) => {
    const t = text(o.text);
    if (!t || !idOk(o, `c${i + 1}`) || typeof o.real !== 'boolean') return null;
    return [`c${i + 1}` as CitationId, t, o.real ? 1 : 0] as const;
  });
  if (!citations) return null;
  const fake = count(citations, (c) => c[2] === 0);
  if (fake < 2 || fake > 3) return null;
  return { citations };
}

/**
 * m4g2 Confidence Court: `{ answers: [{ id: "a1", statement, confidence: 0–100, evidence, trust: bool }]×6 }` —
 * at least one TRUST and one VERIFY (the server enforces 3/3 and the confidence-mismatch rule).
 */
export function parseCourt(d: unknown): CourtScenario | null {
  if (!isObj(d)) return null;
  const answers = list<Answer>(d.answers, 6, (o, i) => {
    const t = text(o.statement);
    const ev = text(o.evidence);
    const c = o.confidence;
    if (!t || !ev || !idOk(o, `a${i + 1}`) || typeof o.trust !== 'boolean' || typeof c !== 'number' || !Number.isInteger(c) || c < 0 || c > 100) return null;
    return [`a${i + 1}` as AnswerId, t, c, ev, o.trust ? 1 : 0] as const;
  });
  if (!answers) return null;
  const trust = count(answers, (a) => a[4] === 1);
  if (trust === 0 || trust === answers.length) return null;
  return { answers };
}

const PARSERS: { [G in ContentGameId]: (d: unknown) => ScenarioByGame[G] | null } = {
  m1g1: parseTrain,
  m1g2: parseFib,
  m3g1: parseProxy,
  m4g1: parseDetective,
  m4g2: parseCourt,
};

/** Validate + map a variation's `data` for `gameId`; null when anything is off. Never throws. */
export function parseScenario(gameId: GameId, data: unknown): GameScenario | null {
  if (!isContentGame(gameId)) return null;
  try {
    const scenario = PARSERS[gameId](data);
    return scenario ? ({ gameId, scenario } as GameScenario) : null;
  } catch {
    return null;
  }
}
