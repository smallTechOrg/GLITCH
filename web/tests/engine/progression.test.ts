import type { StepId } from '@/contracts/ids';
import { STEP_IDS } from '@/contracts/ids';
import { COURSE_MODULES, COURSE_ORDER, moduleNumber, nextModule, previousModule } from '@/content/modules';
import {
  advanceTarget, currentModule, heroOf, isLastOpenStep, isModuleDone, isModuleOpen, isStepStartable,
  modulesDone, nextStepOf, questBox, stepsDoneIn,
} from '@/engine/progression';

const done = (...ids: StepId[]): { steps: Partial<Record<StepId, true>> } => ({ steps: Object.fromEntries(ids.map((i) => [i, true])) });
const all = (mod: number): StepId[] => STEP_IDS.filter((s) => s.charAt(1) === String(mod));

describe('course order', () => {
  it('plays Prompt Forge first, and numbers modules by their place in the course', () => {
    expect(COURSE_ORDER).toEqual([2, 1, 3, 4]);
    expect(COURSE_MODULES.map((m) => m.title)).toEqual(['Prompt Forge', 'Training Lab', 'Neon City', 'The Newsroom']);
    expect([2, 1, 3, 4].map((m) => moduleNumber(m as 1))).toEqual([1, 2, 3, 4]);
    expect(previousModule(2)).toBeNull();
    expect(previousModule(1)).toBe(2);
    expect(nextModule(2)).toBe(1);
    expect(nextModule(4)).toBeNull();
  });
});

describe('progression', () => {
  it('fresh device: Prompt Forge open, the rest locked, only m2h startable', () => {
    const s = done();
    expect([1, 2, 3, 4].map((m) => isModuleOpen(s, m as 1))).toEqual([false, true, false, false]);
    expect(isStepStartable(s, 'm2h')).toBe(true);
    expect(isStepStartable(s, 'm2s')).toBe(false);
    expect(isStepStartable(s, 'm1h')).toBe(false);
    expect(nextStepOf(s, 2)).toBe('m2h');
    expect(currentModule(s)).toBe(2);
  });

  it('a step is startable once every earlier step of its module is done; done steps stay replayable', () => {
    const s = done('m2h', 'm2s');
    expect(isStepStartable(s, 'm2g2')).toBe(true);
    expect(isStepStartable(s, 'm2g1')).toBe(false);
    expect(isStepStartable(s, 'm2h')).toBe(true);
    expect(stepsDoneIn(s, 2)).toBe(2);
  });

  it('completing every Prompt Forge step unlocks the Training Lab, and so on down the course', () => {
    const s = done(...all(2));
    expect(isModuleDone(s, 2)).toBe(true);
    expect(isModuleOpen(s, 1)).toBe(true);
    expect(isModuleOpen(s, 3)).toBe(false);
    expect(modulesDone(s)).toBe(1);
    expect(currentModule(s)).toBe(1);
    const next = done(...all(2), ...all(1));
    expect(isModuleOpen(next, 3)).toBe(true);
    expect(isModuleOpen(next, 4)).toBe(false);
    expect(currentModule(next)).toBe(3);
  });

  it('a save from before the reorder keeps its started modules open', () => {
    const oldSave = done(...all(1), 'm2h');
    expect(isModuleOpen(oldSave, 1)).toBe(true);
    expect(isModuleOpen(oldSave, 2)).toBe(true);
    expect(isStepStartable(oldSave, 'm1g2')).toBe(true);
    expect(currentModule(oldSave)).toBe(2);
    const started = done('m3h');
    expect(isModuleOpen(started, 3)).toBe(true);
    expect(isModuleOpen(started, 4)).toBe(false);
  });

  it('advance goes to the first not-done step, else the module complete screen', () => {
    expect(advanceTarget(done('m1h'), 1)).toEqual({ kind: 'step', step: 'm1s' });
    expect(advanceTarget(done('m1h', 'm1g1'), 1)).toEqual({ kind: 'step', step: 'm1s' });
    expect(advanceTarget(done(...all(1)), 1)).toEqual({ kind: 'complete', mod: 1 });
    expect(advanceTarget(done('m2h', 'm2s'), 2)).toEqual({ kind: 'step', step: 'm2g2' });
    expect(isLastOpenStep(done(...all(1)), 'm1g2')).toBe(true);
    expect(isLastOpenStep(done('m1h', 'm1s', 'm1g1'), 'm1g2')).toBe(false);
  });

  it('quest box: START HERE → CONTINUE → COURSE COMPLETE (Replay opens the first module story)', () => {
    expect(questBox(done())).toEqual({ eyebrow: 'START HERE', text: 'Module 1: Prompt Forge · Choose your hero', step: 'm2h', button: '▶ Start' });
    expect(questBox(done(...all(2), 'm1h'))).toEqual({ eyebrow: 'CONTINUE', text: 'Module 2: Training Lab · Storytime', step: 'm1s', button: '▶ Continue' });
    expect(questBox(done(...STEP_IDS))).toEqual({
      eyebrow: 'COURSE COMPLETE', text: 'You finished all four modules. Replay any game to earn more stars.', step: 'm2s', button: '▶ Replay',
    });
  });

  it('heroOf: module hero, else last hero, else scout', () => {
    expect(heroOf({ heroByModule: { 2: 'guard' }, lastHero: 'oracle' }, 2)).toBe('guard');
    expect(heroOf({ heroByModule: {}, lastHero: 'oracle' }, 2)).toBe('oracle');
  });
});
