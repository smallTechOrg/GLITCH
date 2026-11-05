// Badge unlock rules (v3 `BD[].ok` + `checkBadges`, lines 323–336). Pure; badges never re-lock.
import { MODULE_IDS, type BadgeId } from '../contracts/ids';
import type { PersistedState } from '../contracts/state';
import { BADGES, badgeToast } from '../content/badges';
import { isModuleDone } from './progression';
import { levelOf } from './xp';

const count = (o: object): number => Object.keys(o).length;

export const BADGE_RULES: Readonly<Record<BadgeId, (s: PersistedState) => boolean>> = {
  boot: (s) => isModuleDone(s, 1),
  story: (s) => MODULE_IDS.every((m) => s.steps[`m${m}s`] === true),
  eye: (s) => Object.values(s.stars).some((n) => (n ?? 0) >= 3),
  smith: (s) => (s.stars.m2g2 ?? 0) >= 3,
  bias: (s) => (s.stars.m3g2 ?? 0) >= 3,
  fact: (s) => (s.stars.m4g1 ?? 0) >= 3,
  untouch: (s) => s.onceBonuses.untouch === true,
  power: (s) => count(s.powersUsed) >= 4,
  heroes: (s) => count(s.heroesPlayed) >= 4,
  grad: (s) => MODULE_IDS.every((m) => isModuleDone(s, m)),
  streak: (s) => s.streak.best >= 3,
  lvl: (s) => levelOf(s.xp) >= 3,
};

/** Unlock every newly-earned badge on the draft (stamped `now`); returns their toasts in v3 order. */
export function checkBadges(s: PersistedState, now: Date): string[] {
  const out: string[] = [];
  for (const b of BADGES) {
    if (!s.badges[b.id] && BADGE_RULES[b.id](s)) {
      s.badges[b.id] = now.toISOString();
      out.push(badgeToast(b));
    }
  }
  return out;
}

export function badgesEarned(s: Pick<PersistedState, 'badges'>): number {
  return BADGES.filter((b) => !!s.badges[b.id]).length;
}
