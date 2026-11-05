// m1g2 · Fact or Glitch — sentences from v3 `GM.m1g2`. Every learner-facing string lives here so
// tests can import the exact copy. Internally a false sentence is still a `fib`: that is the wire
// field in the API and in stored case files.

/** v3 `S`: [sentence, 1 = glitch | 0 = true, explanation (glitches only)]. */
export type Sentence = readonly [text: string, fib: 0 | 1, explanation?: string];

export const SENTENCES: readonly Sentence[] = [
  ['Machine learning finds patterns in training data.', 0],
  ['A model that memorizes its training data will always do well on new data.', 1, 'Memorizing is not generalizing. New data is the real test.'],
  ['Labels are the right answers attached to training examples.', 0],
  ["A model's prediction is always a proven fact.", 1, 'A prediction is an informed guess and it can be wrong.'],
  ['Traditional software follows rules that a person wrote.', 0],
  ['Testing data is the same data the model trained on.', 1, 'Testing uses data the model has NOT seen.'],
];

/** The data-source seam (Phase 2): v3 by default; a NOVA variation has the same shape (6 lines, 3 glitches). */
export interface FibScenario {
  sentences: readonly Sentence[];
}

export const V3_SCENARIO: FibScenario = { sentences: SENTENCES };

export const PAPER_TAG = 'NOVA · DRAFT ESSAY';
export const COUNTER_LABEL = 'GLITCHES FOUND';
export const FIB_TAG = 'GLITCH';
export const TRUE_TAG = 'TRUE';
export const FOUND_PREFIX = 'Glitch caught! ';
export const TRUE_MISS = 'That one is actually true. Look for something that sounds too sure.';
export const FOCUS_LINE = 'FOCUS: that one is true. Ignore it.';
/** Win fires this long after the 3rd glitch (v3 setTimeout 700). */
export const WIN_DELAY_MS = 700;

export const WIN_SUMMARY = "Rules, learning, labels and testing: a model's output is a prediction, and memorizing training data is not the same as generalizing.";
