// m2g2 · Prompt Forge — pure helpers (v3 `promptTask` + GM.m2g2, lines 541–548).
import type { Mistake } from '../../contracts/game';
import { placedIn, type SortConfig, type SortItem, type SortState, type SortZone } from '../../dnd/sortEngine';
import { buildMistake } from '../mistake';
import { FORGES, FREEWRITE_STRONG_LABEL, NO_SLOT_LABEL, freeWriteWeakLabel, SLOTS, SLOT_CAPACITY, WRONG_DECOY, WRONG_SLOT, type Forge } from './data';

/**
 * Wrong drop in forge `k` (1-based; mistake table): itemId `f<k>.b<i>`, answer = the slot dropped
 * on, correct = the block's slot or `decoy` (slot null) → "NO SLOT · TOO VAGUE".
 */
export function blockMistake(k: number, item: SortItem, zone: SortZone): Mistake {
  const slot = SLOTS.find((s) => s.id === item.answer);
  return buildMistake('m2g2', {
    itemId: `f${k}.${item.id}`,
    answer: zone.id,
    correct: slot ? slot.id : 'decoy',
    itemText: item.text,
    answerLabel: zone.label,
    correctLabel: slot ? slot.label : NO_SLOT_LABEL,
  });
}

/**
 * Weak free-write prompt (FORGE 3; mistake table): itemId `fw.<goalId>`, answer `weak`, correct
 * `strong`, itemText = the goal text (never the learner's prompt), explain false (no ASK NOVA WHY).
 */
export function freeWriteMistake(goal: { id: string; goal: string }, leversHit: number): Mistake {
  return buildMistake('m2g2', {
    itemId: `fw.${goal.id}`,
    answer: 'weak',
    correct: 'strong',
    itemText: goal.goal,
    answerLabel: freeWriteWeakLabel(leversHit),
    correctLabel: FREEWRITE_STRONG_LABEL,
    explain: false,
  });
}

/** v3 `promptTask(T)` + the m2g2 wrong-message rule, as a SortBoard config. `k` = 1-based forge number. */
export function forgeConfig(forge: Forge, k: number = FORGES.indexOf(forge) + 1): SortConfig {
  return {
    items: forge.blocks.map((b, i) => ({ id: `b${i}`, answer: b[1], text: b[0] })),
    zones: SLOTS.map((s) => ({ id: s.id, label: s.label, icon: s.icon, color: s.color })),
    cap: SLOT_CAPACITY,
    wrong: (item: SortItem) => (item.answer === null ? WRONG_DECOY : WRONG_SLOT),
    mistake: (item: SortItem, zone: SortZone) => blockMistake(k, item, zone),
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
