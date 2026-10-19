// Lever cue rules — the OFFLINE check. These MUST stay identical to the backend's demo
// provider rules (api heuristics/levers.py; spec/capabilities/freewrite-forge.md → Lever cue
// rules): case-insensitive, matched on the trimmed prompt, same alternatives and boundaries.
import { LEVER_IDS, type LeverId } from '../../contracts/ids';
import type { LeverMap } from '../../contracts/state';
import { ALL_LEVERS_TIP, LEVER_TIP } from './data';

// Python's `re` on `str` is Unicode-aware (\w, \d, \b), JS regexes are ASCII by default, so
// boundaries are spelled out with Unicode classes (no lookbehind: older Safari lacks it).
const W = '[\\p{L}\\p{N}_]';
const bounded = (body: string): RegExp => new RegExp(`(?:^|[^\\p{L}\\p{N}_])(?:${body})(?!${W})`, 'iu');

export const TASK_RE = bounded('explain|write|make|plan|create|list|summari[sz]e|describe|give|draft|suggest|compare|teach|tell me|help me');
export const TASK_MIN_WORDS = 5;
export const CONTEXT_RE = bounded("i am|i'm|i have|my|because|since|so that|who|years? old|year-old|grade|class");
export const ROLE_RE = bounded(
  `act as|you are|pretend (?:to be|you are)|imagine you are|as an? (?:${W}+ )?(?:teacher|tutor|expert|coach|scientist|writer|guide|librarian|historian|friend)`,
);
export const FORMAT_RE = bounded('list|bullets?|bullet points|table|steps|numbered|paragraphs?|email|poem|headings?|outline|timetable|chart|q&a');
export const LIMIT_WORD_RE = bounded('under|max|maximum|at most|no more than|less than|fewer than|only|within|short|brief');
export const LIMIT_COUNT_RE = bounded('\\p{Nd}+\\s*(?:words?|sentences?|lines?|points?|bullets?|minutes?|paragraphs?|days?)');

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Score a prompt with the cue rules. */
export function checkLevers(prompt: string): LeverMap {
  const p = prompt.trim();
  return {
    task: TASK_RE.test(p) && wordCount(p) >= TASK_MIN_WORDS,
    context: CONTEXT_RE.test(p),
    role: ROLE_RE.test(p),
    format: FORMAT_RE.test(p),
    limit: LIMIT_WORD_RE.test(p) || LIMIT_COUNT_RE.test(p),
  };
}

export function countHit(levers: LeverMap): number {
  return LEVER_IDS.filter((k) => levers[k]).length;
}

/** Server rule mirrored: passed = levers hit ≥ 4. */
export const PASS_AT = 4;
export const isPassing = (levers: LeverMap): boolean => countHit(levers) >= PASS_AT;

export function firstMissed(levers: LeverMap): LeverId | null {
  return LEVER_IDS.find((k) => !levers[k]) ?? null;
}

/** Offline tip: canned tip of the first missed lever, or the all-five praise. */
export function offlineTip(levers: LeverMap): string {
  const m = firstMissed(levers);
  return m ? LEVER_TIP[m] : ALL_LEVERS_TIP;
}
