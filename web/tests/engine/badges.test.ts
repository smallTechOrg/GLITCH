import { BADGE_IDS, STEP_IDS, type StepId } from '@/contracts/ids';
import { BADGES } from '@/content/badges';
import { BADGE_RULES, badgesEarned, checkBadges } from '@/engine/badges';
import { createInitialState } from '@/state/migrate';

const NOW = new Date('2026-10-20T10:00:00.000Z');
const fresh = () => createInitialState(NOW);

describe('badges (v3 BD)', () => {
  it('has the 12 v3 badges in v3 order with v3 names and how-to text', () => {
    expect(BADGES.map((b) => b.id)).toEqual(BADGE_IDS);
    expect(BADGES.map((b) => b.name)).toEqual([
      'Boot Up', 'Story Fan', 'Sharp Eye', 'Prompt Smith', 'Bias Buster', 'Fact Checker',
      'Untouchable', 'Power User', 'Hero Collector', 'Graduate', '3-Day Streak', 'Level 3',
    ]);
    expect(BADGES.find((b) => b.id === 'lvl')?.description).toBe('Earn 200 XP');
  });

  it('a fresh device has no badges', () => {
    const s = fresh();
    expect(checkBadges(s, NOW)).toEqual([]);
    expect(badgesEarned(s)).toBe(0);
  });

  it('each rule fires on exactly its condition', () => {
    const s = fresh();
    for (const id of STEP_IDS.filter((x) => x.startsWith('m1'))) s.steps[id] = true;
    expect(BADGE_RULES.boot(s)).toBe(true);
    expect(BADGE_RULES.grad(s)).toBe(false);
    s.steps = Object.fromEntries((['m1s', 'm2s', 'm3s'] as StepId[]).map((k) => [k, true]));
    expect(BADGE_RULES.story(s)).toBe(false);
    s.steps.m4s = true;
    expect(BADGE_RULES.story(s)).toBe(true);
    s.stars = { m1g1: 2 };
    expect(BADGE_RULES.eye(s)).toBe(false);
    s.stars = { m1g1: 3 };
    expect([BADGE_RULES.eye(s), BADGE_RULES.smith(s)]).toEqual([true, false]);
    s.stars = { m2g2: 3, m3g2: 3, m4g1: 3 };
    expect([BADGE_RULES.smith(s), BADGE_RULES.bias(s), BADGE_RULES.fact(s)]).toEqual([true, true, true]);
    s.powersUsed = { scout: true, chrono: true, guard: true };
    expect(BADGE_RULES.power(s)).toBe(false);
    s.powersUsed.oracle = true;
    expect(BADGE_RULES.power(s)).toBe(true);
    s.heroesPlayed = { scout: true, chrono: true, guard: true, oracle: true };
    expect(BADGE_RULES.heroes(s)).toBe(true);
    s.streak.best = 2;
    expect(BADGE_RULES.streak(s)).toBe(false);
    s.streak.best = 3;
    expect(BADGE_RULES.streak(s)).toBe(true);
  });

  it('Level 3 unlocks at exactly 200 XP, not 199', () => {
    const s = fresh();
    s.xp = 199;
    expect(checkBadges(s, NOW)).toEqual([]);
    s.xp = 200;
    expect(checkBadges(s, NOW)).toEqual(['BADGE · LEVEL 3']);
    expect(s.badges.lvl).toBe(NOW.toISOString());
  });

  it('unlocks once and never re-locks', () => {
    const s = fresh();
    s.onceBonuses.untouch = true;
    expect(checkBadges(s, NOW)).toEqual(['BADGE · UNTOUCHABLE']);
    expect(checkBadges(s, NOW)).toEqual([]);
    delete s.onceBonuses.untouch;
    checkBadges(s, NOW);
    expect(s.badges.untouch).toBeDefined();
  });
});
