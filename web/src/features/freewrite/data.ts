// FORGE 3 · FREE WRITE — every learner-facing string and the on-device goal bank
// (spec/capabilities/freewrite-forge.md). v3 has only the two block-forge goals (v3 lines
// 544–545), so the six goals below are newly authored in v3's voice (spec "Assumed").
import type { LeverId } from '../../contracts/ids';
import type { IconId } from '../../contracts/art';

export interface Goal {
  id: string;
  goal: string;
  /** What a good answer looks like (≤ 80 words) — shown as "CLASSIC ANSWER" offline. */
  offlineReply: string;
  /** One example phrase per lever, used by FOCUS. */
  examples: Record<LeverId, string>;
}

export const GOAL_BANK: readonly Goal[] = [
  {
    id: 'fw1',
    goal: 'Explain photosynthesis to a 10-year-old.',
    offlineReply:
      'Plants make their own food! Here is how:\n- Leaves catch sunlight, like tiny solar panels.\n- Roots drink water and leaves breathe in carbon dioxide.\n- The plant mixes them into sugar for energy, and lets out oxygen for us to breathe.',
    examples: {
      task: 'Explain photosynthesis',
      context: 'to my 10-year-old brother who loves plants',
      role: 'Act as a friendly science teacher',
      format: 'Use 3 bullet points',
      limit: 'Keep it under 80 words',
    },
  },
  {
    id: 'fw2',
    goal: 'Plan a 3-day revision timetable for your science test.',
    offlineReply:
      'DAY 1 · Cells and organs · 45 min · flashcards\nDAY 2 · Forces and energy · 45 min · practice questions\nDAY 3 · Mixed past paper · 60 min · mark it and fix mistakes\nShort breaks every 20 minutes. Sleep well before the test.',
    examples: {
      task: 'Plan a 3-day revision timetable for my science test',
      context: 'I have 1 hour after school and I find forces hard',
      role: 'Act as a calm study coach',
      format: 'Give it as a table: Day, Topic, Time',
      limit: 'Keep it under 100 words',
    },
  },
  {
    id: 'fw3',
    goal: 'Write a message asking your coach to move practice to Thursday.',
    offlineReply:
      'Hi Coach, could we move Tuesday\'s practice to Thursday this week? I have a school concert on Tuesday evening and really don\'t want to miss training. Thursday at the same time works for me. Thanks for understanding!',
    examples: {
      task: 'Write a message asking my coach to move practice to Thursday',
      context: 'because I have a school concert on Tuesday',
      role: 'Act as a polite team captain',
      format: 'Format it as a short email',
      limit: 'No more than 50 words',
    },
  },
  {
    id: 'fw4',
    goal: 'Get ideas for a school poster about saving water.',
    offlineReply:
      '- "Every drop counts": a giant tap with one drop falling.\n- Turn off the tap while brushing: saves up to 6 litres a minute.\n- A bucket vs a hose: fact boxes comparing litres.\n- A QR code to the school water-saving challenge.',
    examples: {
      task: 'Suggest ideas for a school poster about saving water',
      context: 'for my Year 8 class display',
      role: 'Act as a creative art teacher',
      format: 'Give me a bullet list',
      limit: 'Only 4 ideas',
    },
  },
  {
    id: 'fw5',
    goal: 'Summarise the causes of World War I for a quiz tomorrow.',
    offlineReply:
      'Remember MAIN + a spark:\n1. Militarism: countries built huge armies.\n2. Alliances: friends promised to fight together.\n3. Imperialism: rivals competed for empires.\n4. Nationalism: strong pride and tension.\nSpark: Archduke Franz Ferdinand was shot in 1914.',
    examples: {
      task: 'Summarise the causes of World War I',
      context: 'I have a history quiz tomorrow',
      role: 'Act as a history tutor',
      format: 'Use a numbered list',
      limit: 'At most 5 points',
    },
  },
  {
    id: 'fw6',
    goal: 'Write a short thank-you note to a teacher.',
    offlineReply:
      'Dear Ms. Patel,\nThank you for all your help this term. Your extra lunchtime sessions made fractions finally make sense, and I passed my test! I really appreciate your patience.\nBest wishes,\nAarav',
    examples: {
      task: 'Write a thank-you note to my maths teacher',
      context: 'she helped me pass my fractions test',
      role: 'Pretend to be a grateful student',
      format: 'Write it as one short paragraph',
      limit: 'Under 60 words',
    },
  },
];

export const LEVER_LABEL: Record<LeverId, string> = {
  task: 'TASK',
  context: 'CONTEXT',
  role: 'ROLE',
  format: 'FORMAT',
  limit: 'LIMIT',
};

/** Screen-reader names ("Task: hit"). */
export const LEVER_NAME: Record<LeverId, string> = {
  task: 'Task',
  context: 'Context',
  role: 'Role',
  format: 'Format',
  limit: 'Limit',
};

/** v3 m2g2 slot icons (line 543). */
export const LEVER_ICON: Record<LeverId, IconId> = {
  task: 'target',
  context: 'globe',
  role: 'mask',
  format: 'doc',
  limit: 'clock',
};

/** Canned tip for the first missed lever (order task, context, role, format, limit). */
export const LEVER_TIP: Record<LeverId, string> = {
  task: "Start with a clear job: an action word plus a subject, like 'Explain photosynthesis'.",
  context: "Add context: who it's for or why you need it, like 'for my 10-year-old brother'.",
  role: "Give NOVA a role, like 'Act as a friendly science teacher'.",
  format: 'Pick a format: a list, a table, steps or an email.',
  limit: "Set a limit: a word count, a number of points, or 'keep it short'.",
};
export const ALL_LEVERS_TIP = "All five levers. That's a prompt NOVA can't misread.";

export const COPY = {
  header: 'FORGE 3 · FREE WRITE',
  sub: 'Now write your own. Use the five levers: task, context, role, format, limit.',
  goalLabel: 'YOUR GOAL:',
  inputLabel: 'Your prompt',
  placeholder: 'e.g. Act as…',
  send: 'SEND TO NOVA ▶',
  resend: 'EDIT AND RESEND ▶',
  sendOffline: 'CHECK MY PROMPT (OFFLINE) ▶',
  intro: "Your turn. Write a prompt NOVA can't misread.",
  thinking: 'NOVA IS THINKING…',
  replyLabel: 'NOVA REPLIES',
  classicLabel: 'CLASSIC ANSWER',
  demoTag: 'DEMO NOVA',
  tipLabel: "NOVA'S TIP",
  passed: 'Strong prompt! NOVA knew exactly what you wanted.',
  weak: 'NOVA had to guess. Add the levers you missed and try again.',
  finish: 'Finish ▶',
  logTitle: 'YOUR PROMPT LOG',
  logEmpty: 'No prompts yet. Your sends will appear here.',
  offline: "NOVA'S OFFLINE — HERE'S THE CLASSIC CHECKLIST",
  moderated: "NOVA'S REPLY GOT CAUGHT BY THE SAFETY FILTER — THE CLASSIC CHECKLIST WILL SCORE YOU.",
  resting: 'NOVA IS RESTING — TOO MANY AGENTS TODAY.',
  flat: (h: number): string => `NOVA'S BATTERY IS FLAT FOR TODAY. RECHARGES IN ${h}H.`,
  xray: (hit: string, missed: string): string => `X-RAY: your draft has ${hit}. Missing: ${missed}.`,
  xrayNoHits: 'no levers yet',
  xrayNoMissing: 'nothing',
  focus: (lever: string, phrase: string): string => `FOCUS: add a ${lever}, e.g. '${phrase}'`,
  focusStrong: 'FOCUS: your draft looks strong. Send it!',
} as const;

export const SOURCE_TAG = { nova: 'NOVA', demo: 'DEMO', offline: 'OFFLINE' } as const;

/** How many history entries the prompt log shows. */
export const LOG_SHOWN = 5;
