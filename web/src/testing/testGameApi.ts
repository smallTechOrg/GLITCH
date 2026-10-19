// createTestGameApi() — a GameApi for component tests that records say/miss/win/toast and
// simulates hearts, shield and powers EXACTLY like the Game Frame (game-runtime.md, v3
// lines 467–487). Games are tested against this; A1's real frame must behave the same.
import type { HeroId, Mood, PowerKind } from '../contracts/ids';
import type { GameApi, PowerHandlers } from '../contracts/game';
import { HEROES } from '../content/heroes';

export const NOTHING_TO_USE = 'NOTHING TO USE IT ON YET';
export const REWIND_LINE = 'Time rewound. Heart restored.';
export const SHIELD_LINE = 'Shield up. Your next mistake is blocked.';
export const SHIELDED_PREFIX = 'SHIELDED! ';
export const DEFAULT_MISS = 'Not quite.';
export const START_HEARTS = 3;
export const START_POWER_USES = 2;

export interface TestGameApiOptions {
  hero?: HeroId;
  hearts?: number;
  shield?: boolean;
  powerUses?: number;
  reducedMotion?: boolean;
}

export interface SayCall {
  text: string;
  mood: Mood;
}

export interface TestGameApi extends GameApi {
  readonly calls: { say: SayCall[]; miss: (string | undefined)[]; win: (string | undefined)[]; toast: string[] };
  readonly lost: number;
  readonly shield: boolean;
  readonly powerUses: number;
  readonly status: 'playing' | 'won' | 'failed';
  readonly powers: PowerHandlers;
  /** Press the hero power button (frame semantics). Returns true iff a use was consumed. */
  usePower(kind?: PowerKind): boolean;
  /** Kinds whose use was consumed, in order (frame records "powers used"). */
  readonly powersUsed: PowerKind[];
  lastSay(): SayCall | undefined;
}

export function createTestGameApi(o: TestGameApiOptions = {}): TestGameApi {
  let hearts = o.hearts ?? START_HEARTS;
  let shield = o.shield ?? false;
  let uses = o.powerUses ?? START_POWER_USES;
  let lost = 0;
  let status: 'playing' | 'won' | 'failed' = 'playing';
  let powers: PowerHandlers = {};
  const hero = o.hero ?? 'scout';
  const calls: TestGameApi['calls'] = { say: [], miss: [], win: [], toast: [] };
  const powersUsed: PowerKind[] = [];

  const api: TestGameApi = {
    get hero() {
      return hero;
    },
    get hearts() {
      return hearts;
    },
    get over() {
      return status !== 'playing';
    },
    get reducedMotion() {
      return o.reducedMotion ?? false;
    },
    get lost() {
      return lost;
    },
    get shield() {
      return shield;
    },
    get powerUses() {
      return uses;
    },
    get status() {
      return status;
    },
    get powers() {
      return powers;
    },
    get calls() {
      return calls;
    },
    get powersUsed() {
      return powersUsed;
    },
    say(text: string, mood: Mood = 'neutral') {
      calls.say.push({ text, mood });
    },
    miss(message?: string) {
      if (status !== 'playing') return;
      calls.miss.push(message);
      if (shield) {
        shield = false;
        api.say(SHIELDED_PREFIX + (message ?? ''), 'good');
        return;
      }
      hearts -= 1;
      lost += 1;
      api.say(message || DEFAULT_MISS, 'bad');
      if (hearts <= 0) status = 'failed';
    },
    win(summary?: string) {
      if (status !== 'playing') return;
      calls.win.push(summary);
      status = 'won';
      api.say('Level clear!', 'good');
    },
    registerPowers(h: PowerHandlers) {
      powers = h;
    },
    toast(text: string) {
      calls.toast.push(text);
    },
    usePower(kind?: PowerKind) {
      if (status !== 'playing' || uses <= 0) return false;
      const k = kind ?? HEROES[hero].power;
      let ok = false;
      if (k === 'scan') ok = powers.scan ? !!powers.scan() : false;
      else if (k === 'hint') ok = powers.hint ? !!powers.hint() : false;
      else if (k === 'rewind') {
        if (hearts < START_HEARTS) {
          hearts += 1;
          ok = true;
          powers.undo?.();
          api.say(REWIND_LINE, 'good');
        }
      } else if (k === 'shield') {
        if (!shield) {
          shield = true;
          ok = true;
          api.say(SHIELD_LINE, 'good');
        }
      }
      if (ok) {
        uses -= 1;
        powersUsed.push(k);
      } else api.toast(NOTHING_TO_USE);
      return ok;
    },
    lastSay() {
      return calls.say[calls.say.length - 1];
    },
  };
  return api;
}
