// m2g2 · Prompt Forge — v3 data verbatim from spec/GLITCH v3.html lines 541–548
// (`promptTask`, `GM.m2g2`), plus the hand-off to FORGE 3 · FREE WRITE
// (spec/capabilities/freewrite-forge.md, rendered by features/freewrite/FreeWriteRound).
import type { IconId } from '../../contracts/art';

export type SlotId = 'task' | 'ctx' | 'role' | 'fmt' | 'lim';

export interface PromptSlot {
  id: SlotId;
  label: string;
  icon: IconId;
  color: string;
}

/** v3 `S`: five slots, capacity 1 each, in slot order. */
export const SLOTS: readonly PromptSlot[] = [
  { id: 'task', label: 'TASK', icon: 'target', color: '#ffd23b' },
  { id: 'ctx', label: 'CONTEXT', icon: 'globe', color: '#4cc9ff' },
  { id: 'role', label: 'ROLE', icon: 'mask', color: '#ff6bb5' },
  { id: 'fmt', label: 'FORMAT', icon: 'doc', color: '#3ee98a' },
  { id: 'lim', label: 'LIMIT', icon: 'clock', color: '#ffa63d' },
];

export const SLOT_CAPACITY = 1;

/** v3 block tuple `[text, slot | null]` — null = decoy (too vague). Item id = "b" + index. */
export type PromptBlock = readonly [text: string, slot: SlotId | null];

export interface Forge {
  /** Header (v3 `h`). */
  title: string;
  /** NOVA's canned reply (v3 `out`). */
  out: string;
  /** v3 `sum` (unused by v3's render; kept verbatim). */
  sum: string;
  blocks: readonly PromptBlock[];
}

export const FORGES: readonly Forge[] = [
  {
    title: 'FORGE 1 · STUDY PLAN',
    out: 'DAY 1 · Algebra basics · 90 min · DAY 2 · Practice sets · 120 min · DAY 3 · Mock test · 150 min',
    sum: 'Make a 3-day study plan for my Maths test.',
    blocks: [
      ['Help me study.', null],
      ['Make a 3-day study plan for my Maths test.', 'task'],
      ["I have 3 hours a day and I'm weak at algebra.", 'ctx'],
      ['Act as a patient Maths tutor for a 14-year-old.', 'role'],
      ['Give it as a table: Day, Topic, Time.', 'fmt'],
      ['Keep it under 120 words.', 'lim'],
      ['Make it good, thanks!', null],
      ['You know what I mean.', null],
    ],
  },
  {
    title: 'FORGE 2 · EMAIL TO A TEACHER',
    out: 'Subject: Extension request · Dear Mr. Rao, I was ill on Monday and have finished two of four sections...',
    sum: '',
    blocks: [
      ['Write an email.', null],
      ['Write an email asking Mr. Rao for a 2-day extension on my history essay.', 'task'],
      ['I was ill on Monday and have finished two of four sections.', 'ctx'],
      ['Write as a polite Year 9 student, not a robot.', 'role'],
      ['Three short paragraphs with a subject line.', 'fmt'],
      ['Maximum 100 words. Friendly but formal.', 'lim'],
      ['Make it really persuasive!!!', null],
      ['Do my essay for me.', null],
    ],
  },
];

export const FORGE_SUBHEAD = 'Drag each block into its slot. Some blocks are too vague to use.';
export const WRONG_DECOY = 'That block is too vague. Look for a specific one.';
export const WRONG_SLOT = 'That block is a different part of a prompt. Check the slot name.';

export const PROMPT_BUILT = 'PROMPT BUILT';
export const YOUR_PROMPT = 'YOUR PROMPT';
export const NOVA_REPLIES = 'NOVA REPLIES';
export const BUILT_EXPLANATION = 'Specific task, context, role, format and limit: that is why the answer is useful.';
export const NEXT_FORGE_LABEL = 'Next forge ▶';
export const ANOTHER_FORGE_LINE = 'Another forge. Same levers.';

/** v3 win summary (line 547) — awarded when FORGE 3 · FREE WRITE is passed. */
export const WIN_SUMMARY =
  'A strong prompt is specific, gives context, sets a role and audience, picks a format, adds limits, and then you iterate.';
