// FROZEN Phase-1 contract (spec/architecture.md → Contracts → game.ts), extended additively in
// Phase 3 (Contracts → Phase 3): Concept / Mistake / SessionMistake / mistakeKey and the optional
// `mistake` payload on `miss`. Every Phase-1 `miss(message)` call compiles and behaves as before.
import type React from 'react';
import type { GameId, HeroId, ModuleId, Mood } from './ids';

export interface PowerHandlers {
  scan?: () => boolean; // X-RAY: return true iff something was revealed/solved (use consumed)
  hint?: () => boolean; // FOCUS: return true iff a hint was given (use consumed)
  undo?: () => void; // called by REWIND after it restores a heart (optional)
}

export interface GameApi {
  readonly hero: HeroId;
  readonly hearts: number; // 0..3, live
  readonly over: boolean; // true after win or fail — games ignore input then
  readonly reducedMotion: boolean;
  say(text: string, mood?: Mood): void; // speech bubble (also a polite live region)
  /**
   * Shield/heart rules live in the frame, not the game. `mistake` (Phase 3) is the closed-id
   * payload of what the learner got wrong; the frame records it only when the miss is
   * accepted (not over). Powers (X-RAY/FOCUS) never call `miss`, so they never record.
   */
  miss(message?: string, mistake?: Mistake): void;
  win(summary?: string): void; // frame computes stars/XP/bonuses
  registerPowers(h: PowerHandlers): void; // replace current handlers (call again per step/round)
  toast(text: string): void;
}

export interface GameDefinition {
  id: GameId;
  module: ModuleId;
  title: string;
  goal: string;
  intro: string;
  Component: React.ComponentType<{ api: GameApi }>;
}

/** The 12 module tags, in module order (content/concepts.ts → CONCEPTS). */
export type Concept =
  | 'Machine learning' | 'Training data' | 'Generalization'
  | 'Weights and thresholds' | 'Classification' | 'Prompt engineering'
  | 'Dataset bias' | 'Proxy variables' | 'Algorithmic discrimination'
  | 'Hallucination' | 'Verification' | 'Human oversight';

/** One learner mistake, as a game reports it (per-game table: spec/architecture.md → Phase 3). */
export interface Mistake {
  itemId: string; // ^[A-Za-z0-9._-]{1,40}$ — scheme per game
  answer: string; // ^[a-z_]{1,24}$ — the learner's choice, closed vocabulary per game
  correct: string; // same vocabulary; the right choice
  concept: Concept; // = conceptOf(gameId, itemId)
  itemText: string; // ≤ 160 chars, the game's own content (never learner text) — recap only
  answerLabel: string; // on-screen label of `answer`, e.g. "NOT SPAM" — recap only
  correctLabel: string; // on-screen label of `correct` — recap only
  explain?: boolean; // default true; false = ASK NOVA WHY not offered
}

/** A mistake recorded by the frame for this run. */
export interface SessionMistake extends Mistake {
  gameId: GameId;
  variationId: string; // 'v3' or the served case file's variationId
  message: string; // the miss message as passed (no "SHIELDED! " prefix); DEFAULT_MISS when none
  shielded: boolean; // the shield absorbed it
  at: string; // ISO
}

/** Cache/memo key shared by the client memo, the recap and the server cache path. */
export const mistakeKey = (m: Pick<Mistake, 'itemId' | 'answer'>): string => `${m.itemId}|${m.answer}`;
