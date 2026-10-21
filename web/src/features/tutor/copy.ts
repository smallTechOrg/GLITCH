// Tutor NOVA copy + timing (ask-nova-why.md, spec/ui.md → Tutor NOVA). P3-C creates this file
// with the frozen window constant; P3-W1 adds the panel/failure strings here.

/** The chip shows for at most 10 s after the mistake (and only while the bubble shows its line). */
export const ASK_WINDOW_MS = 10_000;

export const TUTOR = {
  chip: 'ASK NOVA WHY',
  chipHint: 'May use 1 AI energy',
  /** Progressbar label + polite announcement while the explanation is fetched. */
  thinking: 'NOVA is thinking',
  thinkingShown: 'NOVA IS THINKING…',
  panelLabel: 'NOVA explains',
  tipPrefix: 'TIP: ',
  costFree: 'FREE · NOVA ALREADY KNEW THIS',
  costPaid: '−1 AI ENERGY',
  costFreeLabel: 'Free, NOVA already knew this',
  costPaidLabel: 'Used 1 AI energy',
  demoTag: 'DEMO',
  demoLabel: 'Demo NOVA, not a real AI answer',
  /** Network error, timeout, AI_*, MODERATED, INTERNAL, BAD_REQUEST, CAP_GLOBAL, anything else. */
  offline: "NOVA'S OFFLINE — here's the short version:",
  /** CAP_DEVICE. */
  noEnergy: "OUT OF AI ENERGY TODAY — here's the short version:",
  close: 'CLOSE',
  closeHint: 'Closes the explanation and returns to the game',
} as const;
