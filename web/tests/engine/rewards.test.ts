import { GAME_IDS, STEP_IDS } from '@/contracts/ids';
import {
  MAX_ONE_OFF_XP, chooseHero, completeModule, finishStory, recordPowerUse, startGame, winGame,
} from '@/engine/rewards';
import { createInitialState } from '@/state/migrate';

const NOW = new Date('2026-10-20T10:00:00.000Z');
const fresh = () => createInitialState(NOW);

describe('rewards', () => {
  it('max one-off XP is 535 (4×10 + 9×30 + 4×50 + 25)', () => {
    expect(MAX_ONE_OFF_XP).toBe(535);
  });

  it('hero select saves the module hero, last hero, hero played and marks m<n>h', () => {
    const s = fresh();
    chooseHero(s, 1, 'guard', NOW);
    expect(s.heroByModule[1]).toBe('guard');
    expect(s.lastHero).toBe('guard');
    expect(s.heroesPlayed).toEqual({ guard: true });
    expect(s.steps.m1h).toBe(true);
    expect(s.xp).toBe(0);
  });

  it('Hero Collector unlocks after playing with all 4 heroes', () => {
    const s = fresh();
    startGame(s, 'scout', NOW);
    startGame(s, 'chrono', NOW);
    chooseHero(s, 1, 'guard', NOW);
    expect(s.badges.heroes).toBeUndefined();
    expect(startGame(s, 'oracle', NOW)).toEqual(['BADGE · HERO COLLECTOR']);
  });

  it('story finish marks the step and grants +10 "STORYTIME DONE" once', () => {
    const s = fresh();
    expect(finishStory(s, 1, NOW)).toEqual({ xp: 10, toasts: ['+10 XP · STORYTIME DONE'] });
    expect(s.steps.m1s).toBe(true);
    expect(finishStory(s, 1, NOW)).toEqual({ xp: 0, toasts: [] });
    expect(s.xp).toBe(10);
    expect(s.onceBonuses).toEqual({ story1: true });
  });

  it('win with 2 hearts stores 2 stars; a later 1-heart replay keeps 2; first win +30 only once', () => {
    const s = fresh();
    const a = winGame(s, 'm1g1', 2, 1, NOW);
    expect(a).toMatchObject({ stars: 2, bestStars: 2, gameXp: 30, flawlessXp: 0 });
    expect(a.toasts[0]).toBe('+30 XP · GAME CLEAR');
    expect(s.steps.m1g1).toBe(true);
    const b = winGame(s, 'm1g1', 1, 2, NOW);
    expect(b).toMatchObject({ stars: 1, bestStars: 2, gameXp: 0, flawlessXp: 0, toasts: [] });
    expect(s.stars.m1g1).toBe(2);
    expect(s.xp).toBe(30);
    expect(s.onceBonuses.gm1g1).toBe(true);
  });

  it('stars clamp hearts to 1..3', () => {
    const s = fresh();
    expect(winGame(s, 'm1g2', 0, 3, NOW).stars).toBe(1);
    expect(winGame(s, 'm2g1', 3, 0, NOW).stars).toBe(3);
  });

  it('first flawless win grants +25 and Untouchable; a second flawless win elsewhere grants no FLAWLESS XP', () => {
    const s = fresh();
    const a = winGame(s, 'm1g1', 3, 0, NOW);
    expect(a.flawlessXp).toBe(25);
    expect(a.toasts).toEqual(['+30 XP · GAME CLEAR', '+25 XP · FLAWLESS', 'BADGE · SHARP EYE', 'BADGE · UNTOUCHABLE']);
    const b = winGame(s, 'm1g2', 3, 0, NOW);
    expect(b.flawlessXp).toBe(0);
    expect(b.gameXp).toBe(30);
    expect(s.xp).toBe(85);
  });

  it('a REWIND-restored win (3 hearts, lost 1) is NOT flawless', () => {
    const s = fresh();
    expect(winGame(s, 'm1g1', 3, 1, NOW)).toMatchObject({ stars: 3, flawlessXp: 0 });
    expect(s.onceBonuses.untouch).toBeUndefined();
  });

  it('module complete grants +50 once and unlocks Boot Up / Graduate', () => {
    const s = fresh();
    for (const id of STEP_IDS.filter((x) => x.startsWith('m1'))) s.steps[id] = true;
    const r = completeModule(s, 1, NOW);
    expect(r.xp).toBe(50);
    expect(r.toasts[0]).toBe('+50 XP · MODULE COMPLETE');
    expect(s.badges.boot).toBeDefined();
    expect(completeModule(s, 1, NOW)).toEqual({ xp: 0, toasts: [] });
  });

  it('level-up toasts fire at 100 and 200 through real awards', () => {
    const s = fresh();
    s.xp = 80;
    expect(winGame(s, 'm1g1', 2, 1, NOW).toasts).toContain('LEVEL UP! LVL 2');
    s.xp = 190;
    expect(winGame(s, 'm1g2', 2, 1, NOW).toasts).toEqual(['+30 XP · GAME CLEAR', 'LEVEL UP! LVL 3', 'BADGE · LEVEL 3']);
  });

  it('powers used with all four heroes unlocks Power User', () => {
    const s = fresh();
    recordPowerUse(s, 'scout', NOW);
    recordPowerUse(s, 'scout', NOW);
    recordPowerUse(s, 'chrono', NOW);
    recordPowerUse(s, 'guard', NOW);
    expect(recordPowerUse(s, 'oracle', NOW)).toEqual(['BADGE · POWER USER']);
  });

  it('a perfect run of the whole course earns exactly 535 one-off XP and the Graduate badge', () => {
    const s = fresh();
    for (const m of [1, 2, 3, 4] as const) {
      chooseHero(s, m, 'scout', NOW);
      finishStory(s, m, NOW);
      for (const g of GAME_IDS.filter((x) => x.charAt(1) === String(m))) winGame(s, g, 3, 0, NOW);
      completeModule(s, m, NOW);
    }
    expect(s.xp).toBe(535);
    expect(s.badges.grad).toBeDefined();
    expect(s.badges.story).toBeDefined();
    expect(s.badges.lvl).toBeDefined();
  });
});
