// m2g1 · Tune the Sorter — v3 data verbatim from spec/idea/GLITCH v3.html lines 521–540
// (`tuneRound`, `GM.m2g1`). spec/capabilities/v3-games.md → m2g1.

/** v3 message tuple `[text, f1, caps, f3, truth]` (truth 1 = should be flagged). */
export type TuneMessage = readonly [text: string, f1: 0 | 1, caps: 0 | 1, f3: 0 | 1, truth: 0 | 1];

export interface TuneRoundConfig {
  id: 'r1' | 'r2';
  title: string;
  rule: string;
  /** Verdict label when flagged (score ≥ threshold) / not flagged. */
  yes: string;
  no: string;
  /** Metric A (truth=1 but not flagged) and B (truth=0 but flagged) labels. */
  ma: string;
  mbl: string;
  /** Goals: A ≤ ga and B ≤ gb. */
  ga: number;
  gb: number;
  /** Fixed weights for f1 and f3 (wk 0 = unused column). */
  wd: number;
  wk: number;
  /** X-RAY solution [threshold, caps weight]. */
  sol: readonly [number, number];
  /** Miss messages: fa when A > ga, fb otherwise. */
  fa: string;
  fb: string;
  msgs: readonly TuneMessage[];
}

/** Slider ranges and v3 start values (reset each round). Parity quirk: (50, 30) already passes both rounds. */
export const THRESHOLD = { id: 'th', label: 'THRESHOLD', min: 0, max: 100, start: 50 } as const;
export const CAPS_WEIGHT = { id: 'wc', label: 'ALL-CAPS WEIGHT', min: 0, max: 40, start: 30 } as const;

export const ROUND_1: TuneRoundConfig = {
  id: 'r1',
  title: 'ROUND 1 · EMERGENCY INBOX',
  rule: 'A message is URGENT if its score reaches the threshold. Never miss a real emergency. Allow at most 1 false alarm.',
  yes: 'URGENT',
  no: 'WAIT',
  ma: 'EMERGENCIES MISSED',
  mbl: 'FALSE ALARMS',
  ga: 0,
  gb: 1,
  wd: 30,
  wk: 20,
  sol: [55, 30],
  fa: 'A real emergency was missed. Lower the threshold.',
  fb: 'Too many false alarms. Raise the threshold a little.',
  msgs: [
    ['Mum: come home NOW!', 0, 1, 1, 1],
    ['Project due tonight 11pm', 1, 0, 1, 1],
    ['LOL look at this cat', 0, 0, 1, 0],
    ['SALE!!! 50% OFF!!!', 0, 1, 0, 0],
    ['Doctor: appointment 9am', 1, 0, 1, 1],
    ['Newsletter: weekly tips', 0, 0, 0, 0],
    ['Exam moved to today 2pm', 1, 0, 1, 1],
    ['WIN PHONE deadline today!!!', 1, 1, 0, 0],
  ],
};

// v3: "in round 2 the second feature column is spammy words and is weighted by wd, caps by
// slider; the 4th column unused".
export const ROUND_2: TuneRoundConfig = {
  id: 'r2',
  title: 'ROUND 2 · SPAM FOLDER',
  rule: 'Now a message is BLOCKED if its score reaches the threshold. Never block real mail. Let at most 1 spam through.',
  yes: 'BLOCKED',
  no: 'INBOX',
  ma: 'SPAM LEAKED',
  mbl: 'REAL MAIL BLOCKED',
  ga: 1,
  gb: 0,
  wd: 40,
  wk: 0,
  sol: [47, 30],
  fa: 'Too much spam got through. Lower the threshold.',
  fb: 'Real mail got blocked. Raise the threshold or lower the caps weight.',
  msgs: [
    ['FREE GIFT click here', 1, 1, 0, 1],
    ['Your parcel is on the way', 0, 0, 0, 0],
    ['Class trip form, please sign', 0, 0, 0, 0],
    ['BUY NOW cheap pills', 1, 1, 0, 1],
    ['WINNER!!! claim prize', 1, 1, 0, 1],
    ['Dad: call me when free', 0, 0, 0, 0],
    ['Great deal on shoes', 1, 0, 0, 1],
    ['URGENT: PE kit needed TODAY', 0, 1, 0, 0],
  ],
};

export const ROUNDS: readonly TuneRoundConfig[] = [ROUND_1, ROUND_2];

/** Base score every message starts with (v3 `10+…`). */
export const BASE_SCORE = 10;

export const LOCK_LABEL = 'LOCK IT IN ▶';
export const ROUND_CLEAR_LINE = 'Round clear!';
export const XRAY_LINE = 'X-RAY: the sliders are set to a good answer. Lock it in.';
export const FOCUS_PREFIX = 'FOCUS: ';
/** Deliberate deviation from v3 (which repeats fb here): both goals are already met. */
export const FOCUS_ALL_MET_LINE = 'FOCUS: this setting already meets both goals. Lock it in.';
/** Delay before the next round / the win (v3 setTimeout 500). */
export const NEXT_DELAY_MS = 500;

export const WIN_SUMMARY =
  'A threshold is a trade-off. Lower it and you catch more real cases but raise false alarms. The right setting depends on which mistake costs more.';

/** Screen-reader words for a mismatched row (colour is never the only signal). */
export const ROW_MISMATCH_TAG = 'WRONG';

/** Phase 3 mistake labels (spec/architecture.md → per-game mistake table, m2g1). */
export const OVER_GOAL_SUFFIX = ' OVER GOAL';
export const BOTH_GOALS_MET_LABEL = 'BOTH GOALS MET';
