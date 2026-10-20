// Pure, versioned migration + validation of the on-device state (spec/data.md).
// Every future shape change adds MIGRATIONS[n] (vN → vN+1) with a fixture unit test.
import {
  BADGE_IDS, GAME_IDS, HERO_IDS, LEVER_IDS, MODULE_IDS, STEP_IDS,
  type BadgeId, type GameId, type HeroId, type ModuleId, type StepId,
} from '../contracts/ids';
import {
  NICKNAME_MAX, PROMPT_HISTORY_MAX, SEEN_SCENARIOS_MAX, STATE_VERSION,
  type LeverMap, type PersistedState, type PromptHistoryEntry, type PromptSource, type SeenScenarios,
} from '../contracts/state';

export type MigrateResult = { ok: true; state: PersistedState; from: number } | { ok: false; error: string };

/** v1 → v2 (Phase 2): additive — every v1 field kept, `seenScenarios` starts empty. */
export function migrateV1toV2(s: Record<string, unknown>): Record<string, unknown> {
  return { ...s, version: 2, seenScenarios: {} };
}

/** vN → vN+1 steps. */
export const MIGRATIONS: Readonly<Record<number, (s: Record<string, unknown>) => Record<string, unknown>>> = {
  1: migrateV1toV2,
};

/** Variation ids are server-generated, content-derived (`<gameId>-<hash>`) and URL-safe — the
 * same rule the server applies to `?seen=` ids (api routes/scenarios.py `_SEEN_ID`). */
export const VARIATION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const isVariationId = (v: unknown): v is string => typeof v === 'string' && VARIATION_ID_RE.test(v);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const nonNegInt = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);
const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isIso = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));

export function cleanNickname(n: unknown): string | null {
  if (typeof n !== 'string') return null;
  const t = n.trim().slice(0, NICKNAME_MAX).trim();
  return t ? t : null;
}

export function createInitialState(now: Date = new Date()): PersistedState {
  return {
    version: STATE_VERSION,
    profile: { nickname: null, onboarded: false, createdAt: now.toISOString() },
    settings: { readableFont: false },
    xp: 0,
    streak: { current: 0, best: 0, lastPlayDay: null },
    steps: {},
    stars: {},
    heroByModule: {},
    lastHero: 'scout',
    heroesPlayed: {},
    powersUsed: {},
    badges: {},
    onceBonuses: {},
    promptHistory: [],
    seenScenarios: {},
  };
}

/** Append a seen id once (oldest first), keeping the newest SEEN_SCENARIOS_MAX. */
export function addSeen(list: readonly string[] | undefined, id: string): string[] {
  const cur = (list ?? []).filter((x) => x !== id);
  return [...cur, id].slice(-SEEN_SCENARIOS_MAX);
}

/** Validate the per-game seen map: known game ids only, valid unique ids, newest 100 kept. */
export function cleanSeenScenarios(v: unknown): SeenScenarios {
  const out: SeenScenarios = {};
  if (!isObj(v)) return out;
  for (const g of GAME_IDS) {
    const list = v[g];
    if (!Array.isArray(list)) continue;
    const ids = [...new Set(list.filter(isVariationId))].slice(-SEEN_SCENARIOS_MAX);
    if (ids.length) out[g] = ids;
  }
  return out;
}

function trueSet<K extends string>(v: unknown, keys: readonly K[]): Partial<Record<K, true>> {
  const out: Partial<Record<K, true>> = {};
  if (!isObj(v)) return out;
  for (const k of keys) if (v[k] === true || v[k] === 1) out[k] = true;
  return out;
}

function cleanLevers(v: unknown): LeverMap | null {
  if (!isObj(v)) return null;
  const out = {} as LeverMap;
  for (const k of LEVER_IDS) {
    const b = v[k];
    if (typeof b !== 'boolean') return null;
    out[k] = b;
  }
  return out;
}

const SOURCES: readonly PromptSource[] = ['nova', 'demo', 'offline'];

/** Validate one history entry; leversHit/passed are recomputed from the five booleans. */
export function cleanHistoryEntry(v: unknown): PromptHistoryEntry | null {
  if (!isObj(v)) return null;
  const levers = cleanLevers(v.levers);
  if (!levers) return null;
  if (typeof v.id !== 'string' || typeof v.goalId !== 'string' || typeof v.goal !== 'string' || typeof v.prompt !== 'string') return null;
  if (!SOURCES.includes(v.source as PromptSource) || !isIso(v.at)) return null;
  const hit = LEVER_IDS.filter((k) => levers[k]).length;
  return {
    id: v.id,
    goalId: v.goalId,
    goal: v.goal,
    prompt: v.prompt,
    levers,
    leversHit: hit,
    passed: hit >= 4,
    source: v.source as PromptSource,
    at: v.at,
  };
}

/** Validate/coerce a current-shape object; invalid fields fall back to defaults, unknown keys dropped. */
export function sanitizeState(raw: Record<string, unknown>, now: Date = new Date()): PersistedState {
  const base = createInitialState(now);
  const profile = isObj(raw.profile) ? raw.profile : {};
  const settings = isObj(raw.settings) ? raw.settings : {};
  const streak = isObj(raw.streak) ? raw.streak : {};

  const stars: Partial<Record<GameId, 1 | 2 | 3>> = {};
  if (isObj(raw.stars)) {
    for (const g of GAME_IDS) {
      const s = raw.stars[g];
      if (s === 1 || s === 2 || s === 3) stars[g] = s;
    }
  }
  const heroByModule: Partial<Record<ModuleId, HeroId>> = {};
  if (isObj(raw.heroByModule)) {
    for (const m of MODULE_IDS) {
      const h = raw.heroByModule[String(m)];
      if ((HERO_IDS as readonly unknown[]).includes(h)) heroByModule[m] = h as HeroId;
    }
  }
  const badges: Partial<Record<BadgeId, string>> = {};
  if (isObj(raw.badges)) for (const b of BADGE_IDS) if (isIso(raw.badges[b])) badges[b] = raw.badges[b] as string;

  const onceBonuses: Record<string, true> = {};
  if (isObj(raw.onceBonuses)) {
    for (const [k, v] of Object.entries(raw.onceBonuses)) {
      if ((v === true || v === 1) && /^(story[1-4]|gm[1-4]g[1-3]|mod[1-4]|untouch)$/.test(k)) onceBonuses[k] = true;
    }
  }
  const history = Array.isArray(raw.promptHistory)
    ? raw.promptHistory.map(cleanHistoryEntry).filter((e): e is PromptHistoryEntry => e !== null).slice(0, PROMPT_HISTORY_MAX)
    : [];
  const current = nonNegInt(streak.current);
  return {
    version: STATE_VERSION,
    profile: {
      nickname: cleanNickname(profile.nickname),
      onboarded: profile.onboarded === true,
      createdAt: isIso(profile.createdAt) ? profile.createdAt : base.profile.createdAt,
    },
    settings: { readableFont: settings.readableFont === true },
    xp: nonNegInt(raw.xp),
    streak: {
      current,
      best: Math.max(current, nonNegInt(streak.best)),
      lastPlayDay: isDay(streak.lastPlayDay) ? streak.lastPlayDay : null,
    },
    steps: trueSet<StepId>(raw.steps, STEP_IDS),
    stars,
    heroByModule,
    lastHero: (HERO_IDS as readonly unknown[]).includes(raw.lastHero) ? (raw.lastHero as HeroId) : 'scout',
    heroesPlayed: trueSet<HeroId>(raw.heroesPlayed, HERO_IDS),
    powersUsed: trueSet<HeroId>(raw.powersUsed, HERO_IDS),
    badges,
    onceBonuses,
    promptHistory: history,
    seenScenarios: cleanSeenScenarios(raw.seenScenarios),
  };
}

/** Phase-1 name kept for callers/tests: the sanitizer accepts any v1/v2-shaped object. */
export const sanitizeV1 = sanitizeState;

/**
 * Bring any stored value up to the current shape.
 * - not an object / no numeric version → error (caller starts fresh + toast)
 * - version newer than this build → error (never silently downgrade)
 * - older versions run MIGRATIONS in order, then the current sanitizer
 */
export function migrateState(raw: unknown, now: Date = new Date()): MigrateResult {
  if (!isObj(raw)) return { ok: false, error: 'Saved progress is not an object' };
  const from = raw.version;
  if (typeof from !== 'number' || !Number.isInteger(from) || from < 1) return { ok: false, error: 'Saved progress has no valid version' };
  if (from > STATE_VERSION) return { ok: false, error: `Saved progress is from a newer version (${from})` };
  let cur: Record<string, unknown> = raw;
  for (let v = from; v < STATE_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) return { ok: false, error: `No migration from version ${v}` };
    cur = step(cur);
  }
  return { ok: true, state: sanitizeState(cur, now), from };
}

/** Parse the raw storage string (null = nothing stored). */
export function parseStored(text: string | null, now: Date = new Date()): MigrateResult | null {
  if (text == null) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Saved progress is not valid JSON' };
  }
  return migrateState(raw, now);
}
