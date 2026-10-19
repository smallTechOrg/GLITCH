// FROZEN Phase-1 contract (spec/architecture.md → Contracts → game.ts).
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
  miss(message?: string): void; // shield/heart rules live in the frame, not the game
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
