import type { StepId } from '@/contracts/ids';
import { STEP_IDS } from '@/contracts/ids';
import {
  advanceTarget, currentModule, heroOf, isLastOpenStep, isModuleDone, isModuleOpen, isStepStartable,
  modulesDone, nextStepOf, questBox, stepsDoneIn,
} from '@/engine/progression';

const done = (...ids: StepId[]): { steps: Partial<Record<StepId, true>> } => ({ steps: Object.fromEntries(ids.map((i) => [i, true])) });
const all = (mod: number): StepId[] => STEP_IDS.filter((s) => s.charAt(1) === String(mod));

describe('progression', () => {
  it('fresh device: module 1 open, 2–4 locked, only m1h startable', () => {
    const s = done();
    expect([1, 2, 3, 4].map((m) => isModuleOpen(s, m as 1))).toEqual([true, false, false, false]);
    expect(isStepStartable(s, 'm1h')).toBe(true);
    expect(isStepStartable(s, 'm1s')).toBe(false);
    expect(isStepStartable(s, 'm2h')).toBe(false);
    expect(nextStepOf(s, 1)).toBe('m1h');
    expect(currentModule(s)).toBe(1);
  });

  it('a step is startable once every earlier step of its module is done; done steps stay replayable', () => {
    const s = done('m1h', 'm1s');
    expect(isStepStartable(s, 'm1g1')).toBe(true);
    expect(isStepStartable(s, 'm1g2')).toBe(false);
    expect(isStepStartable(s, 'm1h')).toBe(true);
    expect(stepsDoneIn(s, 1)).toBe(2);
  });

  it('completing every Module 1 step unlocks Module 2', () => {
    const s = done(...all(1));
    expect(isModuleDone(s, 1)).toBe(true);
    expect(isModuleOpen(s, 2)).toBe(true);
    expect(isModuleOpen(s, 3)).toBe(false);
    expect(modulesDone(s)).toBe(1);
    expect(currentModule(s)).toBe(2);
  });

  it('advance goes to the first not-done step, else the module complete screen', () => {
    expect(advanceTarget(done('m1h'), 1)).toEqual({ kind: 'step', step: 'm1s' });
    expect(advanceTarget(done('m1h', 'm1g1'), 1)).toEqual({ kind: 'step', step: 'm1s' });
    expect(advanceTarget(done(...all(1)), 1)).toEqual({ kind: 'complete', mod: 1 });
    expect(isLastOpenStep(done(...all(1)), 'm1g2')).toBe(true);
    expect(isLastOpenStep(done('m1h', 'm1s', 'm1g1'), 'm1g2')).toBe(false);
  });

  it('quest box: START HERE → CONTINUE → COURSE COMPLETE (Replay opens m1s)', () => {
    expect(questBox(done())).toEqual({ eyebrow: 'START HERE', text: 'Module 1: Training Lab · Choose your hero', step: 'm1h', button: '▶ Start' });
    expect(questBox(done(...all(1), 'm2h'))).toEqual({ eyebrow: 'CONTINUE', text: 'Module 2: Prompt Forge · Storytime', step: 'm2s', button: '▶ Continue' });
    expect(questBox(done(...STEP_IDS))).toEqual({
      eyebrow: 'COURSE COMPLETE', text: 'You finished all four modules. Replay any game to earn more stars.', step: 'm1s', button: '▶ Replay',
    });
  });

  it('heroOf: module hero, else last hero, else scout', () => {
    expect(heroOf({ heroByModule: { 2: 'guard' }, lastHero: 'oracle' }, 2)).toBe('guard');
    expect(heroOf({ heroByModule: {}, lastHero: 'oracle' }, 2)).toBe('oracle');
  });
});
