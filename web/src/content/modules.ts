// Course data. Module ids are stable (saves, routes and the API's game ids depend on them), so
// the order players meet modules in lives apart in COURSE_ORDER, with moduleNumber() for display.
import type { GameId, ModuleId, NpcId, StepId } from '../contracts/ids';
import type { IconId, SceneId } from '../contracts/art';

export interface ModuleGame {
  id: GameId;
  title: string;
}

export interface ModuleDef {
  id: ModuleId;
  title: string; // v3 `t`
  subtitle: string; // v3 `sub`
  color: string; // v3 `c`
  scene: SceneId; // v3 `env`
  npc: NpcId; // NPC in the game frame (v3 `npc`)
  icon: IconId;
  tags: readonly string[];
  games: readonly ModuleGame[];
}

export const MODULES: readonly ModuleDef[] = [
  { id: 1, title: 'Training Lab', subtitle: 'How a machine learns from examples.', color: '#4cc9ff', scene: 'lab', npc: 'n', icon: 'chip', tags: ['Machine learning', 'Training data', 'Generalization'], games: [{ id: 'm1g1', title: 'Train the Model' }, { id: 'm1g2', title: 'Fact or Glitch' }] },
  { id: 2, title: 'Prompt Forge', subtitle: 'Ask better, get better answers.', color: '#ff6bb5', scene: 'forge', npc: 'n', icon: 'flask', tags: ['Prompt engineering', 'Classification', 'Weights and thresholds'], games: [{ id: 'm2g2', title: 'Prompt Forge' }, { id: 'm2g1', title: 'Inbox Filter' }] },
  { id: 3, title: 'Neon City', subtitle: 'How models learn unfair patterns.', color: '#b794ff', scene: 'city', npc: 'k', icon: 'scales', tags: ['Dataset bias', 'Proxy variables', 'Algorithmic discrimination'], games: [{ id: 'm3g1', title: 'Proxy Hunt' }, { id: 'm3g2', title: 'Fairness Lab' }] },
  { id: 4, title: 'The Newsroom', subtitle: 'Hallucinations, and who checks them.', color: '#3ee98a', scene: 'news', npc: 'd', icon: 'book', tags: ['Hallucination', 'Verification', 'Human oversight'], games: [{ id: 'm4g1', title: 'Source Detective' }, { id: 'm4g2', title: 'Confidence Court' }, { id: 'm4g3', title: 'Design the Companion' }] },
];

/** The order the course is played in. */
export const COURSE_ORDER: readonly ModuleId[] = [2, 1, 3, 4];

/** The number players see for a module (its place in the course). */
export const moduleNumber = (mod: ModuleId): number => COURSE_ORDER.indexOf(mod) + 1;

export const previousModule = (mod: ModuleId): ModuleId | null => COURSE_ORDER[COURSE_ORDER.indexOf(mod) - 1] ?? null;
export const nextModule = (mod: ModuleId): ModuleId | null => COURSE_ORDER[COURSE_ORDER.indexOf(mod) + 1] ?? null;

export interface GameMeta {
  title: string;
  /** One line, always on screen while playing. */
  goal: string;
  /** NOVA's opening line. */
  intro: string;
  steps: readonly string[];
}

export const GAME_META: Readonly<Record<GameId, GameMeta>> = {
  m1g1: {
    title: 'Train the Model',
    goal: 'MISSION: Call every email SPAM or NOT SPAM, then verify your calls',
    intro: 'Drag each email into a bin. Then hit VERIFY.',
    steps: ['Drag each email from the right into SPAM or NOT SPAM.', 'Press VERIFY. Your calls get checked right next to each email.', 'Round 2 uses new emails. See how the model did too.'],
  },
  m1g2: {
    title: 'Fact or Glitch',
    goal: "MISSION: Find all 3 glitches in NOVA's essay",
    intro: 'NOVA wrote 6 sentences. Three are glitches. Tap them!',
    steps: ['Read each sentence in the essay.', 'Tap a sentence if you think it is false.', 'Find all 3 glitches to win. Tapping a true one breaks a heart.'],
  },
  m2g1: {
    title: 'Inbox Filter',
    goal: 'MISSION: Move both sliders until both goals say OK, then lock in',
    intro: 'Both sliders start at 0. You set them.',
    steps: ['Every message earns points. Its bar shows the total.', 'FLAG AT SCORE sets how many points flag a message. ALL-CAPS POINTS sets how much shouting counts.', 'When both goals say OK, press LOCK IT IN. There are two rounds.'],
  },
  m2g2: {
    title: 'Prompt Forge',
    goal: 'MISSION: Build 2 strong prompts, then write your own',
    intro: 'Drag each block into its slot. Vague blocks fit nowhere.',
    steps: ['Drag each block into TASK, CONTEXT, ROLE, FORMAT or LIMIT.', 'Leave vague blocks alone. Using one breaks a heart.', 'Finish with your own prompt. Hit 4 of the 5 levers to win.'],
  },
  m3g1: {
    title: 'Proxy Hunt',
    goal: 'MISSION: Find the 5 lines that still give gender away',
    intro: 'Name and gender are hidden. Tap the 5 lines that still give gender away.',
    steps: ['Read the resume. Name and gender are already removed.', 'Tap a line if it hints at gender.', 'Find all 5 to win. Tapping a real skill breaks a heart.'],
  },
  m3g2: {
    title: 'Fairness Lab',
    goal: 'MISSION: Gap 6 or less, accuracy 80 or more, then make the call',
    intro: 'Every input starts OFF. Choose what the AI may use.',
    steps: ['Switch on the inputs that really measure what matters.', 'Press RUN AUDIT when the gap is 6 or less and accuracy is 80 or more.', 'Then answer one ethics question. Each case raises a different one.'],
  },
  m4g1: {
    title: 'Source Detective',
    goal: 'MISSION: Keep the real sources, cut the fakes',
    intro: 'Read what each source says. Then KEEP it or CUT it.',
    steps: ['Read the source and what it says. Use the numbers to move between sources.', 'Unsure? CHECK looks it up in the catalogue. You get 3 lookups.', 'Drag each source, or tap KEEP or CUT. Asking NOVA is a trap.'],
  },
  m4g2: {
    title: 'Confidence Court',
    goal: 'MISSION: Rule TRUST or VERIFY on all 6 answers',
    intro: 'Ignore the confidence score. Judge the evidence.',
    steps: ['Read NOVA\'s answer and its evidence.', 'TRUST it if the evidence checks out. VERIFY it if a person should check.', 'Drag each answer, or tap a verdict. A wrong ruling breaks a heart.'],
  },
  m4g3: {
    title: 'Design the Companion',
    goal: 'MISSION: Hit all 5 targets, then ship it',
    intro: 'Everything starts at 0. Design a chatbot companion for teens.',
    steps: ['Set the two sliders and switch on the safeguards you want.', 'Watch the 5 targets. Each one says OK when it is met.', 'Press SHIP IT when all 5 say OK. Shipping too early breaks a heart.'],
  },
};

export type StepKind = 'HERO' | 'STORY' | 'GAME';

export interface StepDef {
  id: StepId;
  kind: StepKind;
  label: string;
  module: ModuleId;
}

export function getModule(mod: ModuleId): ModuleDef {
  const m = MODULES[mod - 1];
  if (!m || m.id !== mod) throw new Error(`unknown module ${String(mod)}`);
  return m;
}

/** Modules in the order they are played. */
export const COURSE_MODULES: readonly ModuleDef[] = COURSE_ORDER.map(getModule);

/** v3 `stepsOf(m)`: hero, story, then the module's games in order. */
export function stepsOf(mod: ModuleId): readonly StepDef[] {
  const m = getModule(mod);
  return [
    { id: `m${mod}h`, kind: 'HERO', label: 'Choose your hero', module: mod },
    { id: `m${mod}s`, kind: 'STORY', label: 'Storytime', module: mod },
    ...m.games.map((g): StepDef => ({ id: g.id, kind: 'GAME', label: g.title, module: mod })),
  ];
}

/** True iff `game` belongs to module `mod`. */
export function isGameOfModule(mod: ModuleId, game: GameId): boolean {
  return getModule(mod).games.some((g) => g.id === game);
}

/** Static params for every route under module/[mod]/… (Expo Router static export). */
export function moduleParams(): { mod: string }[] {
  return MODULES.map((m) => ({ mod: String(m.id) }));
}
export function gameParams(): { mod: string; game: string }[] {
  return MODULES.flatMap((m) => m.games.map((g) => ({ mod: String(m.id), game: g.id })));
}
