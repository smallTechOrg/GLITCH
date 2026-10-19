// m1g2 · Fact or Fib — v3 data verbatim from `GM.m1g2` (spec/GLITCH v3.html lines 512–519).
// Every learner-facing string lives here so tests can import the exact copy.

/** v3 `S`: [sentence, 1 = fib | 0 = true, explanation (fibs only)]. */
export type Sentence = readonly [text: string, fib: 0 | 1, explanation?: string];

export const SENTENCES: readonly Sentence[] = [
  ['Machine learning finds patterns in training data.', 0],
  ['A model that memorizes its training data will always do well on new data.', 1, 'Memorizing is not generalizing. New data is the real test.'],
  ['Labels are the right answers attached to training examples.', 0],
  ["A model's prediction is always a proven fact.", 1, 'A prediction is an informed guess and it can be wrong.'],
  ['Traditional software follows rules that a person wrote.', 0],
  ['Testing data is the same data the model trained on.', 1, 'Testing uses data the model has NOT seen.'],
];

export const PAPER_TAG = 'NOVA · DRAFT ESSAY';
export const COUNTER_LABEL = 'FIBS FOUND';
export const FIB_TAG = 'FIB';
export const TRUE_TAG = 'TRUE';
export const FOUND_PREFIX = 'Fib caught! ';
export const TRUE_MISS = 'That one is actually true. Look for something that sounds too sure.';
export const FOCUS_LINE = 'FOCUS: that one is true. Ignore it.';
/** Win fires this long after the 3rd fib (v3 setTimeout 700). */
export const WIN_DELAY_MS = 700;

export const WIN_SUMMARY = "Rules, learning, labels and testing: a model's output is a prediction, and memorizing training data is not the same as generalizing.";
