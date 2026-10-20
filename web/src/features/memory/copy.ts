// REVIEW panel copy (spec/ui.md → Tutor NOVA → REVIEW).
import type { Concept } from '../../contracts/game';

export const REVIEW = {
  heading: 'REVIEW · IDEAS TO PRACTISE',
  row: (c: Concept, n: number): string => `${c} · ${n} ${n === 1 ? 'miss' : 'misses'}`,
  replay: (title: string): string => `Replay ${title}`,
  replayHint: (c: Concept): string => `Practise ${c} again`,
} as const;
