// Tutor NOVA copy + timing (ask-nova-why.md, spec/ui.md → Tutor NOVA). P3-C creates this file
// with the frozen window constant; P3-W1 adds the panel/failure strings here.

/** The chip shows for at most 10 s after the mistake (and only while the bubble shows its line). */
export const ASK_WINDOW_MS = 10_000;

export const TUTOR = {
  chip: 'ASK NOVA WHY',
  chipHint: 'May use 1 AI energy',
} as const;
