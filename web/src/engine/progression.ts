// Course progression (v3 `modDone`, `modOpen`, `stepOpen`, `nextStepOf`, `curMod`,
// `stepLabel`, `heroOf`, lines 308–318) + the Home quest box (v3 `menu`, line 349).
import { MODULE_IDS, type GameId, type HeroId, type ModuleId, type StepId } from '../contracts/ids';
import type { PersistedState } from '../contracts/state';
import { MODULES, getModule, stepsOf } from '../content/modules';

type Progress = Pick<PersistedState, 'steps'>;

export const moduleOfStep = (id: StepId): ModuleId => Number(id.charAt(1)) as ModuleId;

export function isStepDone(s: Progress, id: StepId): boolean {
  return s.steps[id] === true;
}

/** Every step of the module is done. */
export function isModuleDone(s: Progress, mod: ModuleId): boolean {
  return stepsOf(mod).every((st) => isStepDone(s, st.id));
}

/** Module 1 is always open; module n+1 opens when module n is done. */
export function isModuleOpen(s: Progress, mod: ModuleId): boolean {
  return mod === 1 || isModuleDone(s, (mod - 1) as ModuleId);
}

/** v3 `stepOpen`: every earlier step of the module is done (done steps stay replayable). */
export function isStepOpenInModule(s: Progress, id: StepId): boolean {
  const list = stepsOf(moduleOfStep(id));
  const k = list.findIndex((st) => st.id === id);
  if (k < 0) return false;
  return list.slice(0, k).every((st) => isStepDone(s, st.id));
}

/** Startable = its module is open AND every earlier step of the module is done. */
export function isStepStartable(s: Progress, id: StepId): boolean {
  return isModuleOpen(s, moduleOfStep(id)) && isStepOpenInModule(s, id);
}

/** First not-done step of the module, or null when the module is complete. */
export function nextStepOf(s: Progress, mod: ModuleId): StepId | null {
  return stepsOf(mod).find((st) => !isStepDone(s, st.id))?.id ?? null;
}

/** First module that is not done, or null when the whole course is complete. */
export function currentModule(s: Progress): ModuleId | null {
  return MODULE_IDS.find((m) => !isModuleDone(s, m)) ?? null;
}

export function modulesDone(s: Progress): number {
  return MODULE_IDS.filter((m) => isModuleDone(s, m)).length;
}

export function stepsDoneIn(s: Progress, mod: ModuleId): number {
  return stepsOf(mod).filter((st) => isStepDone(s, st.id)).length;
}

export function stepLabel(id: StepId): string {
  return stepsOf(moduleOfStep(id)).find((st) => st.id === id)?.label ?? '';
}

/** v3 `heroOf`: hero chosen for the module, else last hero, else SCOUT. */
export function heroOf(s: Pick<PersistedState, 'heroByModule' | 'lastHero'>, mod: ModuleId): HeroId {
  return s.heroByModule[mod] ?? s.lastHero ?? 'scout';
}

/** True when the game's module has no remaining incomplete step (win button reads "Finish module ▶"). */
export function isLastOpenStep(s: Progress, game: GameId): boolean {
  return nextStepOf(s, moduleOfStep(game)) === null;
}

export type FlowTarget = { kind: 'step'; step: StepId } | { kind: 'complete'; mod: ModuleId };

/** v3 `advance`: the module's first not-done step, else its Module Complete screen. */
export function advanceTarget(s: Progress, mod: ModuleId): FlowTarget {
  const next = nextStepOf(s, mod);
  return next ? { kind: 'step', step: next } : { kind: 'complete', mod };
}

export interface QuestBox {
  eyebrow: 'START HERE' | 'CONTINUE' | 'COURSE COMPLETE';
  text: string;
  step: StepId;
  button: string; // "▶ Start" | "▶ Continue" | "▶ Replay"
}

export const COURSE_COMPLETE_TEXT = 'You finished all four modules. Replay any game to earn more stars.';

/** v3 menu() quest box. */
export function questBox(s: Progress): QuestBox {
  const ci = currentModule(s);
  if (ci === null) return { eyebrow: 'COURSE COMPLETE', text: COURSE_COMPLETE_TEXT, step: 'm1s', button: '▶ Replay' };
  const fresh = Object.keys(s.steps).length === 0;
  const ns = nextStepOf(s, ci) ?? stepsOf(ci)[0]!.id;
  return {
    eyebrow: fresh ? 'START HERE' : 'CONTINUE',
    text: `Module ${ci}: ${getModule(ci).title} · ${stepLabel(ns)}`,
    step: ns,
    button: fresh ? '▶ Start' : '▶ Continue',
  };
}

export const TOTAL_MODULES = MODULES.length;
