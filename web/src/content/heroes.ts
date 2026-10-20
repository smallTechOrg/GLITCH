// Heroes and NPCs — verbatim from v3 `HERO` / `NPC` (spec/idea/GLITCH v3.html lines 209–222).
import type { CharacterId, HeroId, NpcId, PowerKind } from '../contracts/ids';
import type { IconId } from '../contracts/art';

export type HairStyle = 'short' | 'spiky' | 'helmet' | 'hat' | 'long' | 'bun';
export type Accessory = 'goggles' | 'cape' | 'shield' | 'orb';

export interface Look {
  skin: string;
  hair: string;
  hs: HairStyle;
  top: string;
  bot: string;
  acc?: Accessory;
}

export interface HeroDef extends Look {
  id: HeroId;
  name: string; // v3 `n`
  power: PowerKind; // v3 `pw`
  powerName: string; // v3 `pn`
  description: string; // v3 `d`
  color: string; // v3 `col`
  acc: Accessory;
}

export interface NpcDef {
  id: NpcId;
  name: string;
  color: string;
  look: Look | null; // null for NOVA (robot, drawn by drawNova)
}

export const HEROES: Readonly<Record<HeroId, HeroDef>> = {
  scout: { id: 'scout', name: 'SCOUT', power: 'scan', powerName: 'X-RAY', description: 'Reveals the hidden truth about one thing.', skin: '#e0a87c', hair: '#2a2a2a', hs: 'short', top: '#4cc9ff', bot: '#2b2f63', acc: 'goggles', color: '#4cc9ff' },
  chrono: { id: 'chrono', name: 'CHRONO', power: 'rewind', powerName: 'REWIND', description: 'Undo your last mistake and win the heart back.', skin: '#f1c9a5', hair: '#b794ff', hs: 'spiky', top: '#6a44c2', bot: '#2b2f63', acc: 'cape', color: '#b794ff' },
  guard: { id: 'guard', name: 'GUARDIAN', power: 'shield', powerName: 'SHIELD', description: 'Blocks your next mistake. No heart lost.', skin: '#8d5a3c', hair: '#ffa63d', hs: 'helmet', top: '#ffa63d', bot: '#5a6090', acc: 'shield', color: '#ffa63d' },
  oracle: { id: 'oracle', name: 'ORACLE', power: 'hint', powerName: 'FOCUS', description: 'Points out one wrong choice so you can skip it.', skin: '#c68a62', hair: '#1c8f55', hs: 'hat', top: '#3ee98a', bot: '#1c8f55', acc: 'orb', color: '#3ee98a' },
};

export const NPCS: Readonly<Record<NpcId, NpcDef>> = {
  z: { id: 'z', name: 'ZARA', color: '#ff6bb5', look: { skin: '#c68a62', hair: '#2b1630', hs: 'long', top: '#ff6bb5', bot: '#2b2f63' } },
  k: { id: 'k', name: 'KABIR', color: '#4cc9ff', look: { skin: '#b97b55', hair: '#101418', hs: 'short', top: '#4cc9ff', bot: '#3a3d82' } },
  d: { id: 'd', name: "MS. D'SOUZA", color: '#ffd23b', look: { skin: '#d09a72', hair: '#5a2d1a', hs: 'bun', top: '#ffd23b', bot: '#6a44c2' } },
  n: { id: 'n', name: 'NOVA', color: '#5eead4', look: null },
};

export const HERO_ORDER: readonly HeroId[] = ['scout', 'chrono', 'guard', 'oracle'];
export const DEFAULT_HERO: HeroId = 'scout';

/** Icon for each power (v3: FOCUS/hint uses the `target` icon). */
export const POWER_ICON: Readonly<Record<PowerKind, IconId>> = { scan: 'scan', rewind: 'rewind', shield: 'shield', hint: 'target' };

export const isHero = (id: CharacterId): id is HeroId => Object.prototype.hasOwnProperty.call(HEROES, id);

/** v3 `chDef(id)` — display name + colour + look for any character. */
export function characterName(id: CharacterId): string {
  return isHero(id) ? HEROES[id].name : NPCS[id].name;
}
export function characterColor(id: CharacterId): string {
  return isHero(id) ? HEROES[id].color : NPCS[id].color;
}
export function characterLook(id: CharacterId): Look | null {
  return isHero(id) ? HEROES[id] : NPCS[id].look;
}
