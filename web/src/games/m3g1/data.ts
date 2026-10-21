// m3g1 · Proxy Hunt — v3 data and copy, verbatim from spec/idea/GLITCH v3.html lines 550–557
// (GM.m3g1). Tuple shape kept from v3: [text, isProxy (1/0, null = redacted), note].

export const TITLE = 'Proxy Hunt';
export const GOAL = 'SPOT THE ERROR · FIND 5 PROXIES';
export const INTRO = 'Name and gender are hidden. Tap the 5 lines that still give gender away.';

export type ResumeLine = readonly [text: string, proxy: 1 | 0 | null, note: string];

/** v3 `L`: lines 1–2 redacted ("hid"), 3–7 proxies, 8–11 real signals. */
export const RESUME: readonly ResumeLine[] = [
  ['NAME', null, 'hid'],
  ['GENDER', null, 'hid'],
  ["College: Maple Women's College", 1, 'Stands in for gender.'],
  ["Captain, Girls' Football Team", 1, 'Stands in for gender.'],
  ['Career break: 18 months', 1, 'Can stand in for gender and caregiving.'],
  ['Postcode 40021', 1, 'Can stand in for race and income.'],
  ['Hobby: Netball and Zumba', 1, 'Can stand in for gender.'],
  ['Skills: Python, SQL', 0, 'A real skill.'],
  ['Built a weather app', 0, 'A real project.'],
  ['GPA 3.8', 0, 'A real result.'],
  ['Data Analyst intern, 6 months', 0, 'Real experience.'],
];

export const PROXY_COUNT = 5;

/**
 * The data-source seam (Phase 2): v3 by default; a NOVA variation has the same shape (2 redacted,
 * 5 proxies, 4 real) plus the candidate's upper-case first name for the paper tag.
 */
export interface ProxyScenario {
  resume: readonly ResumeLine[];
  candidate?: string;
}

export const V3_SCENARIO: ProxyScenario = { resume: RESUME, candidate: 'ANAYA' };

/** v3 "ANAYA · RESUME · SCREENED BY AI" with the scenario's candidate. */
export const paperTag = (sc: ProxyScenario): string => (sc.candidate ? `${sc.candidate} · RESUME · SCREENED BY AI` : PAPER_TAG);
export const PAPER_TAG = 'ANAYA · RESUME · SCREENED BY AI';
export const COUNTER_LABEL = 'PROXIES FOUND';
export const TARGET_TAG = 'PROXY';
export const SAFE_TAG = 'OK';
export const FOUND_PREFIX = 'Proxy found! ';
export const MISS_MESSAGE = 'That line measures ability, not who she is.';
export const FOCUS_LINE = 'FOCUS: that one is a real skill. Skip it.';
export const WIN_DELAY_MS = 700;
export const WIN_SUMMARY =
  'A proxy variable correlates with a sensitive trait. Deleting the trait does not delete the proxy, so the model can still learn the same bias.';
