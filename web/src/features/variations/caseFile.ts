// Which case file a game session plays (scenario-variations.md → Business Rules):
//  - first playthrough of a content game on this device → the server draws at random among the
//    classic v3 case and the cached unseen variations (`first`: never generates, never charges);
//    v3 drawn / nothing cached / any failure → v3 silently (no note);
//  - replay of a cleared content game → ask the server for the next unseen variation;
//  - ANY replay failure (offline, timeout, cap, invalid/duplicate/seen variation) → v3 classic +
//    an in-world note. Never throws.
import type { ApiClient, ScenarioRequestOptions } from '../../api/client';
import { createApiClient } from '../../api/client';
import type { GameId } from '../../contracts/ids';
import type { PersistedState } from '../../contracts/state';
import { isStepDone } from '../../engine/progression';
import { isVariationId } from '../../state/migrate';
import { isContentGame, parseScenario, type GameScenario } from './schemas';

export type CaseFile =
  /** v3 data; `note` = show the in-world "NOVA'S OFFLINE" note (a variation was wanted but not served). */
  | { kind: 'classic'; note: boolean; reason: ClassicReason }
  | { kind: 'variation'; variationId: string; cached: boolean; game: GameScenario };

export type ClassicReason = 'first-play' | 'not-content' | 'unavailable' | 'invalid';

export const CLASSIC_FIRST_PLAY: CaseFile = { kind: 'classic', note: false, reason: 'first-play' };

/** A replay of a cleared content game asks for a fresh case file; everything else plays v3. */
export function wantsVariation(s: Pick<PersistedState, 'steps'>, gameId: GameId): boolean {
  return isContentGame(gameId) && isStepDone(s, gameId);
}

let client: Pick<ApiClient, 'getNextScenario'> = createApiClient();

/** Tests only: swap the client (fake server / failing fetch). Returns a restore function. */
export function setCaseFileClientForTests(c: Pick<ApiClient, 'getNextScenario'>): () => void {
  const prev = client;
  client = c;
  return () => {
    client = prev;
  };
}

/** Ask the server for a case file for `gameId`; v3 classic on any problem (silently on a first play). */
export async function fetchCaseFile(gameId: GameId, seen: readonly string[], opts: ScenarioRequestOptions = {}): Promise<CaseFile> {
  if (!isContentGame(gameId)) return { kind: 'classic', note: false, reason: 'not-content' };
  const fallback = (reason: ClassicReason): CaseFile => (opts.first ? CLASSIC_FIRST_PLAY : { kind: 'classic', note: true, reason });
  let r;
  try {
    r = await client.getNextScenario(gameId, seen, opts);
  } catch {
    return fallback('unavailable');
  }
  if (!r.ok) return fallback('unavailable');
  const d = r.data;
  // Defensive: the server must never return another game's, a malformed, or an already-seen id.
  if (d.gameId !== gameId || !isVariationId(d.variationId) || seen.includes(d.variationId)) {
    return fallback('invalid');
  }
  const game = parseScenario(gameId, d.data);
  if (!game) return fallback('invalid');
  return { kind: 'variation', variationId: d.variationId, cached: d.cached, game };
}
