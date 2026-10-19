// m2g2 · Prompt Forge — pure helpers (v3 `promptTask` + GM.m2g2, lines 541–548).
import { placedIn, type SortConfig, type SortItem, type SortState } from '../../dnd/sortEngine';
import { FORGES, SLOTS, SLOT_CAPACITY, WRONG_DECOY, WRONG_SLOT, type Forge } from './data';

/** v3 `promptTask(T)` + the m2g2 wrong-message rule, as a SortBoard config. */
export function forgeConfig(forge: Forge): SortConfig {
  return {
    items: forge.blocks.map((b, i) => ({ id: `b${i}`, answer: b[1], text: b[0] })),
    zones: SLOTS.map((s) => ({ id: s.id, label: s.label, icon: s.icon, color: s.color })),
    cap: SLOT_CAPACITY,
    wrong: (item: SortItem) => (item.answer === null ? WRONG_DECOY : WRONG_SLOT),
  };
}

/** YOUR PROMPT: placed blocks' text in slot order, joined by spaces. */
export function builtPrompt(state: SortState): string {
  return state.cfg.zones
    .flatMap((z) => placedIn(state, z.id))
    .map((it) => it.text)
    .join(' ');
}

/** Stage machine: forge k (blocks) → built k (PROMPT BUILT) → … → free (FORGE 3). */
export type Stage = { kind: 'forge'; k: number } | { kind: 'built'; k: number; prompt: string } | { kind: 'free' };

export const FIRST_STAGE: Stage = { kind: 'forge', k: 0 };

/** "Next forge ▶" from a built stage: the next block forge, or FORGE 3 after the last. */
export function nextStage(s: Stage): Stage {
  if (s.kind !== 'built') return s;
  return s.k < FORGES.length - 1 ? { kind: 'forge', k: s.k + 1 } : { kind: 'free' };
}
