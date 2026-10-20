// The 12 badges — verbatim from v3 `BD` (spec/idea/GLITCH v3.html lines 323–335): id, icon,
// name and how-to description. The unlock rules live in engine/badges.ts.
import type { BadgeId } from '../contracts/ids';
import type { IconId } from '../contracts/art';

export interface BadgeDef {
  id: BadgeId;
  icon: IconId; // v3 `i`
  name: string; // v3 `n`
  description: string; // v3 `d` (shown while locked)
}

export const BADGES: readonly BadgeDef[] = [
  { id: 'boot', icon: 'plug', name: 'Boot Up', description: 'Finish Module 1' },
  { id: 'story', icon: 'book', name: 'Story Fan', description: 'Watch all 4 storytimes' },
  { id: 'eye', icon: 'eye', name: 'Sharp Eye', description: 'Get 3 stars on any game' },
  { id: 'smith', icon: 'flask', name: 'Prompt Smith', description: '3 stars in Prompt Forge' },
  { id: 'bias', icon: 'scales', name: 'Bias Buster', description: '3 stars in Fairness Lab' },
  { id: 'fact', icon: 'scan', name: 'Fact Checker', description: '3 stars in Source Detective' },
  { id: 'untouch', icon: 'shield', name: 'Untouchable', description: 'Clear a game with no hearts lost' },
  { id: 'power', icon: 'bolt', name: 'Power User', description: 'Use all 4 hero powers' },
  { id: 'heroes', icon: 'mask', name: 'Hero Collector', description: 'Play with all 4 heroes' },
  { id: 'grad', icon: 'trophy', name: 'Graduate', description: 'Finish all 4 modules' },
  { id: 'streak', icon: 'flame', name: '3-Day Streak', description: 'Play 3 days in a row' },
  { id: 'lvl', icon: 'star', name: 'Level 3', description: 'Earn 200 XP' },
];

export function badgeDef(id: BadgeId): BadgeDef {
  const b = BADGES.find((x) => x.id === id);
  if (!b) throw new Error(`unknown badge ${id}`);
  return b;
}

/** Badge unlock toast: "BADGE · <NAME UPPERCASE>" (v3 checkBadges). */
export const badgeToast = (b: BadgeDef): string => `BADGE · ${b.name.toUpperCase()}`;
