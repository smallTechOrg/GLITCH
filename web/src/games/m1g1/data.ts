// m1g1 · Train the Model. Email data keeps the v3 shape; every learner-facing string lives here
// so tests can import the exact copy.
import type { IconId } from '../../contracts/art';
import { colors } from '../../theme/tokens';

/** Round 1 email: [id, text, "s" = spam | "n" = not spam] (v3 `E`). */
export type TrainEmail = readonly [id: string, text: string, label: 's' | 'n'];
/** Round 2 email: [id, text, model verdict, "r" = model right | "w" = model wrong] (v3 `T`). */
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

/**
 * The data-source seam (Phase 2): a scenario is everything that varies between case files.
 * v3 is the default; a NOVA variation (features/variations) is the same shape — 6 training
 * emails + 4 test emails, the model wrong on exactly 2 — so the fixed result copy stays true.
 */
export interface TrainScenario {
  train: readonly TrainEmail[];
  test: readonly TestEmail[];
}

export const V3_SCENARIO: TrainScenario = { train: TRAIN_EMAILS, test: TEST_EMAILS };

export interface ZoneDef {
  id: string;
  label: string;
  icon: IconId;
  color: string;
}

/** v3 zones: SPAM #ff5d73 (= colors.no), NOT SPAM #3ee98a (= colors.ok). */
export const ZONES: readonly ZoneDef[] = [
  { id: 'spam', label: 'SPAM', icon: 'warning', color: colors.no },
  { id: 'ok', label: 'NOT SPAM', icon: 'check', color: colors.ok },
];

export const ROUND1_HEAD = 'ROUND 1 · TRAIN IT: MAKE YOUR CALLS';
export const ROUND2_HEAD = 'ROUND 2 · TEST IT: NEW EMAILS';
export const CALL_HINT = 'Drag each email left into a bin.';
export const callCount = (n: number, total: number): string => `${n}/${total} CALLED`;
export const VERIFY_LABEL = 'VERIFY MY CALLS ▶';
export const NEXT_LABEL = 'Next round ▶';
export const RESULTS_LABEL = 'See results ▶';
export const VERIFY_COLUMN = 'VERIFY';
export const verifiedAs = (label: string): string => `IT'S ${label}`;
export const modelSaid = (says: string, right: boolean): string => `MODEL: ${says} ${right ? '✓' : '✗'}`;
/** Phone versions: the pixel font is too wide for the full verify lines. */
export const modelSaidShort = (right: boolean): string => `MODEL ${right ? '✓' : '✗'}`;
export const verifyRowA11y = (right: boolean, label: string): string => `${right ? 'Correct' : 'Wrong'}, it is ${label}`;

export const ROUND1_WRONG = 'Look at the features: shouting, prizes, passwords. Those go with SPAM.';
export const ROUND2_WRONG = 'New emails are harder. Ignore the tone and ask what the email wants from you.';
export const ALL_RIGHT_LINE = 'All correct. Nice calls!';
export const ROUND1_DONE_LINE = 'Your labels trained the model. Now test it.';

/** Result screen (fixed copy, v3 line 509). */
export const RESULT_HEAD = 'TRAINING VS TESTING';
export const RESULT_TRAIN = { label: 'TRAINING DATA', score: '6/6', pct: '100% correct' } as const;
export const RESULT_TEST = { label: 'NEW TEST DATA', score: '2/4', pct: '50% correct' } as const;
export const RESULT_EXPLAIN = 'The model aced what it studied but stumbled on new emails. It memorized instead of generalizing.';
export const FINISH_LABEL = 'Finish ▶';

export const WIN_SUMMARY = 'Training data has features and labels. A model must generalize: test it on data it has not seen. Memorizing is not learning.';

export const xrayCallLine = (label: string): string => `X-RAY: that one is ${label}.`;
export const FOCUS_CALL_LINE = 'FOCUS: look at the glowing pair.';
