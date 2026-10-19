// Game session rules (v3 `gameStart`, `usePower`, `miss`, `fail`, `win`, lines 467–487;
// game-runtime.md). Pure: the frame holds the session and applies these transitions.
import type { GameId, HeroId, Mood, PowerKind } from '../contracts/ids';
import type { PowerHandlers } from '../contracts/game';
import { HEROES } from '../content/heroes';

export const START_HEARTS = 3;
export const START_POWER_USES = 2;
export const DEFAULT_MISS = 'Not quite.';
export const SHIELDED_PREFIX = 'SHIELDED! ';
export const REWIND_LINE = 'Time rewound. Heart restored.';
export const SHIELD_LINE = 'Shield up. Your next mistake is blocked.';
export const NOTHING_TO_USE = 'NOTHING TO USE IT ON YET';
export const WIN_LINE = 'Level clear!';

export type SessionStatus = 'playing' | 'won' | 'failed';

export interface GameSession {
  gameId: GameId;
  hero: HeroId;
  hearts: number; // 0..3
  lost: number;
  shield: boolean;
  powerUses: number; // 0..2
  status: SessionStatus;
}

export interface Line {
  text: string;
  mood: Mood;
}

export function createSession(gameId: GameId, hero: HeroId): GameSession {
  return { gameId, hero, hearts: START_HEARTS, lost: 0, shield: false, powerUses: START_POWER_USES, status: 'playing' };
}

export const isOver = (s: GameSession): boolean => s.status !== 'playing';

/** Stars = hearts remaining, clamped to 1..3. */
export function starsFor(hearts: number): 1 | 2 | 3 {
  return Math.max(1, Math.min(3, Math.floor(hearts))) as 1 | 2 | 3;
}

export interface MissResult {
  session: GameSession;
  line: Line | null; // null when ignored (session over)
  shake: boolean;
  failed: boolean; // hearts reached 0 on this miss
}

/**
 * v3 `miss`: ignored once over. Shield up → shield drops, no heart lost, lost unchanged,
 * good bubble "SHIELDED! " + message. Otherwise hearts −1, lost +1, bad bubble with the
 * message (default "Not quite."); hearts 0 → failed.
 */
export function applyMiss(s: GameSession, message?: string): MissResult {
  if (isOver(s)) return { session: s, line: null, shake: false, failed: false };
  if (s.shield) {
    return { session: { ...s, shield: false }, line: { text: SHIELDED_PREFIX + (message ?? ''), mood: 'good' }, shake: true, failed: false };
  }
  const hearts = s.hearts - 1;
  const failed = hearts <= 0;
  return {
    session: { ...s, hearts: Math.max(0, hearts), lost: s.lost + 1, status: failed ? 'failed' : s.status },
    line: { text: message || DEFAULT_MISS, mood: 'bad' },
    shake: true,
    failed,
  };
}

export interface PowerResult {
  session: GameSession;
  consumed: boolean;
  line: Line | null; // frame-authored bubble (REWIND/SHIELD); X-RAY/FOCUS lines come from the game
  toast: string | null; // "NOTHING TO USE IT ON YET" when not consumed
}

export function canUsePower(s: GameSession): boolean {
  return !isOver(s) && s.powerUses > 0;
}

/**
 * v3 `usePower` — a use is consumed ONLY when the power acts.
 * X-RAY → handlers.scan(); FOCUS → handlers.hint(); REWIND → +1 heart if < 3 (lost NOT
 * decremented) then handlers.undo(); SHIELD → shield up if none is up.
 */
export function applyPower(s: GameSession, handlers: PowerHandlers, kind: PowerKind = HEROES[s.hero].power): PowerResult {
  if (!canUsePower(s)) return { session: s, consumed: false, line: null, toast: null };
  let next = s;
  let line: Line | null = null;
  let ok = false;
  if (kind === 'scan') ok = handlers.scan ? !!handlers.scan() : false;
  else if (kind === 'hint') ok = handlers.hint ? !!handlers.hint() : false;
  else if (kind === 'rewind') {
    if (s.hearts < START_HEARTS) {
      next = { ...s, hearts: s.hearts + 1 };
      ok = true;
      handlers.undo?.();
      line = { text: REWIND_LINE, mood: 'good' };
    }
  } else if (kind === 'shield') {
    if (!s.shield) {
      next = { ...s, shield: true };
      ok = true;
      line = { text: SHIELD_LINE, mood: 'good' };
    }
  }
  if (!ok) return { session: s, consumed: false, line: null, toast: NOTHING_TO_USE };
  return { session: { ...next, powerUses: next.powerUses - 1 }, consumed: true, line, toast: null };
}

/** v3 `win`: ignored once over; ends the session. */
export function applyWin(s: GameSession): { session: GameSession; accepted: boolean } {
  if (isOver(s)) return { session: s, accepted: false };
  return { session: { ...s, status: 'won' }, accepted: true };
}

/** Accessible HUD labels (spec/ui.md → Accessibility). */
export function heartsLabel(s: Pick<GameSession, 'hearts' | 'shield'>): string {
  return `Hearts ${s.hearts} of ${START_HEARTS}${s.shield ? ', shield up' : ''}`;
}
export function powerLabel(s: Pick<GameSession, 'hero' | 'powerUses'>): string {
  return `${HEROES[s.hero].powerName} power, ${s.powerUses} ${s.powerUses === 1 ? 'use' : 'uses'} left`;
}

/**
 * Commit a consumed power onto the LATEST session. X-RAY/FOCUS handlers may themselves end
 * the round (e.g. the last line found → win) while the power runs, so only the frame-owned
 * fields the power changed are taken from the result: uses always, hearts for REWIND,
 * shield for SHIELD. Never revives a session that ended meanwhile.
 */
export function commitPower(latest: GameSession, r: PowerResult, kind: PowerKind): GameSession {
  if (!r.consumed) return latest;
  return {
    ...latest,
    powerUses: Math.max(0, latest.powerUses - 1),
    hearts: kind === 'rewind' && !isOver(latest) ? Math.min(START_HEARTS, latest.hearts + 1) : latest.hearts,
    shield: kind === 'shield' ? true : latest.shield,
  };
}
