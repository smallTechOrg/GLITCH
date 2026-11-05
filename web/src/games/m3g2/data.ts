// m3g2 · Fairness Lab — five cases, each with its own system, groups and inputs, plus a different
// ethics question once the audit passes. The maths is v3's. Feature tuple: [id, name, kind, weight],
// kind 's' = skill (adds weight to accuracy), 'p' = proxy (adds weight to the gap, +2 accuracy).

export type FeatureKind = 's' | 'p';
export type Feature = readonly [id: string, name: string, kind: FeatureKind, weight: number];

/** The hiring case's inputs. List order matters (X-RAY / FOCUS walk it front to back). */
export const FEATURES: readonly Feature[] = [
  ['code', 'Coding test score', 's', 14],
  ['gpa', 'GPA', 's', 10],
  ['int', 'Internship', 's', 12],
  ['col', "Women's college", 'p', 10],
  ['cap', "Girls' team captain", 'p', 6],
  ['brk', 'Career break', 'p', 8],
  ['pc', 'Postcode', 'p', 5],
];

export interface DecisionOption {
  id: 'a' | 'b' | 'c';
  text: string;
  right: boolean;
}

export interface FairnessCase {
  id: string;
  /** Heading, e.g. "THE SCREENER · INPUTS". */
  heading: string;
  rule: string;
  /** Bar labels: the favoured group and the group the proxies hurt. */
  groupA: string;
  groupB: string;
  features: readonly Feature[];
  /** The mistake text for a failed audit. */
  auditText: string;
  /** "Can stand in for ..." in FOCUS's proxy hint. */
  standsInFor: string;
  /** The ethics question this case raises after the audit. */
  concern: string;
  question: string;
  options: readonly DecisionOption[];
  summary: string;
}

export const CASES: readonly FairnessCase[] = [
  {
    id: 'hiring',
    heading: 'THE SCREENER · INPUTS',
    rule: 'A hiring AI shortlists candidates. Which inputs may it use?',
    groupA: 'MEN SHORTLISTED',
    groupB: 'WOMEN SHORTLISTED',
    features: FEATURES,
    auditText: 'THE SCREENER AUDIT',
    standsInFor: 'gender',
    concern: 'TRANSPARENCY',
    question: 'A rejected candidate asks why the AI said no. What do you do?',
    options: [
      { id: 'a', text: 'Say the decision is final.', right: false },
      { id: 'b', text: 'Explain the main reasons and offer a human review.', right: true },
      { id: 'c', text: 'Keep it secret, because the model is private.', right: false },
    ],
    summary: 'Removing the sensitive column is not enough. Remove the proxies, keep the real skill signals, test outcomes for each group, and explain decisions to the people they affect.',
  },
  {
    id: 'loans',
    heading: 'THE LOAN BOT · INPUTS',
    rule: 'A bank AI approves loans. Which inputs may it use?',
    groupA: 'APPROVED: WEALTHY AREAS',
    groupB: 'APPROVED: POORER AREAS',
    features: [
      ['repay', 'Repayment history', 's', 14],
      ['debt', 'Income against debt', 's', 12],
      ['save', 'Savings record', 's', 10],
      ['post', 'Postcode', 'p', 10],
      ['surn', 'Family name', 'p', 6],
      ['lang', 'Language at home', 'p', 8],
      ['phone', 'Phone model', 'p', 5],
    ],
    auditText: 'THE LOAN BOT AUDIT',
    standsInFor: 'race or class',
    concern: 'PRIVACY',
    question: "A vendor offers 2% more accuracy by reading applicants' social media. What do you do?",
    options: [
      { id: 'a', text: 'Say no. It is private and says little about repaying.', right: true },
      { id: 'b', text: 'Say yes, but do not tell applicants.', right: false },
      { id: 'c', text: 'Say yes, but only for people in poorer areas.', right: false },
    ],
    summary: 'Where you live or who your family is should not decide your loan. More data is not always better data: people have a right to privacy.',
  },
  {
    id: 'triage',
    heading: 'HOSPITAL TRIAGE · INPUTS',
    rule: 'A hospital AI ranks who needs care first. Which inputs may it use?',
    groupA: 'SEEN FIRST: HIGH INCOME',
    groupB: 'SEEN FIRST: LOW INCOME',
    features: [
      ['symp', 'Symptom severity', 's', 14],
      ['test', 'Test results', 's', 12],
      ['hist', 'Medical history', 's', 10],
      ['cost', 'Past spending on care', 'p', 10],
      ['insu', 'Insurance type', 'p', 6],
      ['dist', 'Distance to clinic', 'p', 8],
      ['pcod', 'Postcode', 'p', 5],
    ],
    auditText: 'THE TRIAGE AUDIT',
    standsInFor: 'wealth',
    concern: 'HUMAN OVERSIGHT',
    question: 'The system now passes its audit. Should it decide who gets a bed on its own?',
    options: [
      { id: 'a', text: 'Yes. People are slower than machines.', right: false },
      { id: 'b', text: 'Yes, but only on the night shift.', right: false },
      { id: 'c', text: 'No. A doctor makes the final call and can overrule it.', right: true },
    ],
    summary: 'Money spent on care is not the same as need for care. When lives are at stake, the AI advises and a person stays accountable.',
  },
  {
    id: 'grades',
    heading: 'THE EXAM GRADER · INPUTS',
    rule: 'Exams were cancelled, so an AI predicts grades. Which inputs may it use?',
    groupA: 'TOP GRADES: PRIVATE SCHOOLS',
    groupB: 'TOP GRADES: STATE SCHOOLS',
    features: [
      ['work', 'Coursework marks', 's', 14],
      ['mock', 'Mock exam result', 's', 12],
      ['teach', 'Teacher assessment', 's', 10],
      ['past', "School's past results", 'p', 10],
      ['fees', 'School fees', 'p', 6],
      ['class', 'Class size', 'p', 8],
      ['area', 'Home postcode', 'p', 5],
    ],
    auditText: 'THE GRADER AUDIT',
    standsInFor: 'family income',
    concern: 'THE RIGHT TO APPEAL',
    question: 'Thousands of students say their grade is wrong. What do you do?',
    options: [
      { id: 'a', text: 'Tell them the grades cannot change.', right: false },
      { id: 'b', text: 'Offer a free appeal, reviewed by a person.', right: true },
      { id: 'c', text: 'Let them appeal, for a fee.', right: false },
    ],
    summary: "A student should be judged on their own work, not on their school's history. If AI decides your future, you must be able to challenge it.",
  },
  {
    id: 'speech',
    heading: 'THE COMMENT MODERATOR · INPUTS',
    rule: 'An AI removes abusive comments. Which inputs may it use?',
    groupA: 'POSTS KEPT: STANDARD ENGLISH',
    groupB: 'POSTS KEPT: LOCAL DIALECTS',
    features: [
      ['threat', 'Direct threats', 's', 14],
      ['harass', 'Repeated harassment', 's', 12],
      ['report', 'Verified user reports', 's', 10],
      ['dial', 'Dialect words', 'p', 10],
      ['spell', 'Slang spelling', 'p', 6],
      ['name', 'Foreign-sounding name', 'p', 8],
      ['region', 'Home region', 'p', 5],
    ],
    auditText: 'THE MODERATOR AUDIT',
    standsInFor: 'race or culture',
    concern: 'FREE EXPRESSION',
    question: 'The AI wrongly removes a post about a local protest. What should happen?',
    options: [
      { id: 'a', text: 'Nothing. Mistakes happen at this scale.', right: false },
      { id: 'b', text: 'Remove all posts about protests, to be safe.', right: false },
      { id: 'c', text: 'Restore it, tell the author, and let a person check similar cases.', right: true },
    ],
    summary: 'How someone speaks is not abuse. Moderation shapes who gets heard, so people need to be told, and mistakes need to be put right.',
  },
];

/** A different case each time one is cleared; retries stay on the same case. */
export const caseFor = (cleared: number): FairnessCase => CASES[cleared % CASES.length] as FairnessCase;

/** v3 `calc`: a = 50, g = 2; each proxy on adds +2 to accuracy. */
export const ACCURACY_BASE = 50;
export const GAP_BASE = 2;
export const PROXY_ACCURACY_BONUS = 2;
/** v3 `draw`: group A = 48, group B = A − gap. */
export const MEN_SHORTLISTED = 48;
export const BAR_PX_PER_PCT = 1;
export const GAP_GOAL = 6; // ≤
export const ACCURACY_GOAL = 80; // ≥
export const WIN_DELAY_MS = 500;
/** v3 FOCUS flash duration. */
export const FLASH_MS = 2200;

export const GAP_LABEL = 'GAP';
export const ACCURACY_LABEL = 'ACCURACY';
export const AUDIT_LABEL = 'RUN AUDIT ▶';
/** Screen-reader name of the audit button: the ▶ glyph is decoration, not part of the name. */
export const AUDIT_A11Y_LABEL = 'RUN AUDIT';
export const PASS_LINE = 'Audit passed. Fair and accurate. One more call to make.';
export const DECISION_HEAD = (concern: string): string => `NOW YOU DECIDE · ${concern}`;
export const DECISION_RIGHT = 'That is the responsible call.';
export const DECISION_WRONG = 'Think about the people this affects. Who can check or challenge it?';
export const gapFailMessage = (gap: number): string => `The gap is still ${gap} points. Some proxies are still switched on.`;
export const accuracyFailMessage = (acc: number): string => `Accuracy is only ${acc}%. Switch on more inputs that really measure this.`;
export const xrayLine = (name: string): string => `X-RAY: I fixed ${name}.`;
export const focusLine = (name: string, standsInFor: string): string => `FOCUS: ${name} is on, and it can stand in for ${standsInFor}.`;
export const focusSkillLine = (name: string): string => `FOCUS: ${name} really measures this. It should be on.`;
export const gapFailLabel = (gap: number): string => `GAP ${gap} · GOAL ≤ ${GAP_GOAL}`;
export const accuracyFailLabel = (acc: number): string => `ACCURACY ${acc}% · GOAL ≥ ${ACCURACY_GOAL}`;
export const AUDIT_PASS_LABEL = `GAP ≤ ${GAP_GOAL} · ACCURACY ≥ ${ACCURACY_GOAL}`;
