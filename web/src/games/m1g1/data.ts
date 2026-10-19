// m1g1 · Train the Model — v3 data verbatim from `GM.m1g1` (spec/GLITCH v3.html lines 504–511).
// Every learner-facing string lives here so tests can import the exact copy.
import type { IconId } from '../../contracts/art';
import { colors } from '../../theme/tokens';

/** Step 1 email: [id, text, "s" = spam | "n" = not spam] (v3 `E`). */
export type TrainEmail = readonly [id: string, text: string, label: 's' | 'n'];
/** Step 2 email: [id, text, model verdict, "r" = model right | "w" = model wrong] (v3 `T`). */
export type TestEmail = readonly [id: string, text: string, says: 'SPAM' | 'NOT SPAM', verdict: 'r' | 'w'];

export const TRAIN_EMAILS: readonly TrainEmail[] = [
  ['e1', 'WIN a FREE prize!!! Click now', 's'],
  ['e2', "Lunch at 1? I'm outside", 'n'],
  ['e3', 'Account locked. Verify your password here', 's'],
  ['e4', 'Maths homework due Friday', 'n'],
  ['e5', 'Cheap watches 90% off. Buy now', 's'],
  ['e6', 'Mum: dinner is ready', 'n'],
];

export const TEST_EMAILS: readonly TestEmail[] = [
  ['t1', 'Meeting moved to 3pm', 'SPAM', 'w'],
  ['t2', 'FREE pizza voucher, click', 'SPAM', 'r'],
  ['t3', 'Photos from the trip', 'NOT SPAM', 'r'],
  ['t4', 'Exam result: verify password', 'NOT SPAM', 'w'],
];

export interface ZoneDef {
  id: string;
  label: string;
  icon: IconId;
  color: string;
}

/** v3 zones: SPAM #ff5d73 (= colors.no), NOT SPAM #3ee98a (= colors.ok). */
export const TRAIN_ZONES: readonly ZoneDef[] = [
  { id: 'spam', label: 'SPAM', icon: 'warning', color: colors.no },
  { id: 'ok', label: 'NOT SPAM', icon: 'check', color: colors.ok },
];

/** v3 zones: RIGHT #3ee98a, WRONG #ff5d73. */
export const TEST_ZONES: readonly ZoneDef[] = [
  { id: 'right', label: 'RIGHT', icon: 'check', color: colors.ok },
  { id: 'wrong', label: 'WRONG', icon: 'cross', color: colors.no },
];

export const ITEM_ICON: IconId = 'envelope';

export const STEP1_HEAD = 'STEP 1 · LABEL THE TRAINING DATA';
export const STEP2_HEAD = 'STEP 2 · TEST ON NEW EMAILS';
export const STEP2_SUB = 'The model says what is in the tag. Was it RIGHT or WRONG?';
export const MODEL_SAYS_PREFIX = 'MODEL SAYS: ';

export const STEP1_WRONG = 'Look at the features: shouting, prizes, passwords. Those go with SPAM.';
export const STEP2_WRONG = "Compare the model's verdict with what the email really is.";
export const STEP1_DONE_LINE = 'Labels done. The model learned the pattern.';

/** Result screen (fixed copy, v3 line 509). */
export const RESULT_HEAD = 'TRAINING VS TESTING';
export const RESULT_TRAIN = { label: 'TRAINING DATA', score: '6/6', pct: '100% correct' } as const;
export const RESULT_TEST = { label: 'NEW TEST DATA', score: '2/4', pct: '50% correct' } as const;
export const RESULT_EXPLAIN = 'The model aced what it studied but stumbled on new emails. It memorized instead of generalizing.';
export const FINISH_LABEL = 'Finish ▶';

export const WIN_SUMMARY = 'Training data has features and labels. A model must generalize: test it on data it has not seen. Memorizing is not learning.';
