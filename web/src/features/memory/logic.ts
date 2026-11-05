// Mistake memory — pure rules (mistake-memory.md; spec/data.md → v3 `mistakes`).
// Records are closed ids only (never text), newest first, at most MISTAKES_MAX. Concept
// tallies are DERIVED from the records here and never stored.
import type { Concept, SessionMistake } from '../../contracts/game';
import type { GameId, ModuleId } from '../../contracts/ids';
import { MISTAKES_MAX, type MistakeRecord } from '../../contracts/state';
import { CONCEPTS, CONCEPTS_BY_GAME } from '../../content/concepts';
import { cleanMistakeRecord } from '../../state/migrate';

/** Max concepts shown in the Home REVIEW panel. */
export const REVIEW_MAX = 3;

/** The closed-id record for one session mistake, or null when it fails the v3 record rules. */
export function toRecord(m: SessionMistake, now: Date = new Date()): MistakeRecord | null {
  const at = typeof m.at === 'string' && m.at ? m.at : now.toISOString();
  return cleanMistakeRecord({
    gameId: m.gameId, variationId: m.variationId, itemId: m.itemId, answer: m.answer,
    concept: m.concept, shielded: m.shielded, at,
  });
}

/** Prepend (newest first) and drop the oldest past MISTAKES_MAX. */
export function addRecord(list: readonly MistakeRecord[], rec: MistakeRecord): MistakeRecord[] {
  return [rec, ...list].slice(0, MISTAKES_MAX);
}

/** Mastery: a 3-star win removes every record whose concept that game teaches (any game). */
export function clearMastered(list: readonly MistakeRecord[], gameId: GameId, stars: 1 | 2 | 3): MistakeRecord[] {
  if (stars !== 3) return [...list];
  const taught = CONCEPTS_BY_GAME[gameId] ?? [];
  return list.filter((r) => !taught.includes(r.concept));
}

export interface ConceptTally {
  concept: Concept;
  misses: number;
  /** Newest `at` (ISO) for this concept. */
  last: string;
  /** Game of the newest record with this concept — where "Replay" goes. */
  gameId: GameId;
}

const ms = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};

/** Per-concept tallies ranked misses desc → last desc → CONCEPTS order. */
export function conceptTallies(list: readonly MistakeRecord[]): ConceptTally[] {
  const by = new Map<Concept, ConceptTally>();
  for (const r of list) {
    const t = by.get(r.concept);
    if (!t) {
      by.set(r.concept, { concept: r.concept, misses: 1, last: r.at, gameId: r.gameId });
    } else {
      t.misses += 1;
      if (ms(r.at) > ms(t.last)) {
        t.last = r.at;
        t.gameId = r.gameId;
      }
    }
  }
  return [...by.values()].sort(
    (a, b) => b.misses - a.misses || ms(b.last) - ms(a.last) || CONCEPTS.indexOf(a.concept) - CONCEPTS.indexOf(b.concept),
  );
}

/** The REVIEW panel's rows: the top REVIEW_MAX concepts. */
export function topConcepts(list: readonly MistakeRecord[], n: number = REVIEW_MAX): ConceptTally[] {
  return conceptTallies(list).slice(0, n);
}

/** spec/ui.md: concept in lower case, non-alphanumerics → '-' ("Proxy variables" → proxy-variables). */
export function conceptSlug(c: Concept): string {
  return c.toLowerCase().replace(/[^a-z0-9]/g, '-');
}

/** Module that owns a game id (m3g1 → 3). */
export function moduleOfGame(g: GameId): ModuleId {
  return Number(g.charAt(1)) as ModuleId;
}
