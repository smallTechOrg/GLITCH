// Mistake recap copy (spec/ui.md → Tutor NOVA → Recap; mistake-recap.md).
export const RECAP = {
  heading: 'MISTAKE RECAP',
  clean: 'No mistakes. Clean run!',
  said: (l: string): string => `YOU SAID: ${l}`,
  was: (l: string): string => `IT WAS: ${l}`,
  shielded: 'SHIELDED',
  count: (n: number): string => `×${n}`,
  more: (n: number): string => `+${n} more`,
  rowLabel: (item: string, said: string, was: string, why: string): string => `${item}. You said ${said}. It was ${was}. ${why}`,
} as const;
