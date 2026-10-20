// Course data — verbatim from v3 `MODS` + `stepsOf` (spec/idea/GLITCH v3.html lines 303–307)
// and the game titles/goals/intros of v3 `GM.*` (lines 504–592).
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
  { id: 1, title: 'Training Lab', subtitle: 'Rules versus learning. How a machine learns from examples.', color: '#4cc9ff', scene: 'lab', npc: 'n', icon: 'chip', tags: ['Machine learning', 'Training data', 'Generalization'], games: [{ id: 'm1g1', title: 'Train the Model' }, { id: 'm1g2', title: 'Fact or Fib' }] },
  { id: 2, title: 'Prompt Forge', subtitle: 'Scores, thresholds, and how your prompt shapes the answer.', color: '#ff6bb5', scene: 'forge', npc: 'n', icon: 'flask', tags: ['Weights and thresholds', 'Classification', 'Prompt engineering'], games: [{ id: 'm2g1', title: 'Tune the Sorter' }, { id: 'm2g2', title: 'Prompt Forge' }] },
  { id: 3, title: 'Neon City', subtitle: 'How models learn unfair patterns, even after you delete the obvious feature.', color: '#b794ff', scene: 'city', npc: 'k', icon: 'scales', tags: ['Dataset bias', 'Proxy variables', 'Algorithmic discrimination'], games: [{ id: 'm3g1', title: 'Proxy Hunt' }, { id: 'm3g2', title: 'Fairness Lab' }] },
  { id: 4, title: 'The Newsroom', subtitle: 'Hallucinations, verification, and who decides what is right.', color: '#3ee98a', scene: 'news', npc: 'd', icon: 'book', tags: ['Hallucination', 'Verification', 'Human oversight'], games: [{ id: 'm4g1', title: 'Source Detective' }, { id: 'm4g2', title: 'Confidence Court' }, { id: 'm4g3', title: 'Design the Companion' }] },
];

/** v3 GM.<id> t/goal/intro (titles, goal lines, intro bubble). */
export const GAME_META: Readonly<Record<GameId, { title: string; goal: string; intro: string }>> = {
  m1g1: { title: 'Train the Model', goal: 'SORT · DRAG THE EXAMPLES', intro: 'Drag each email into SPAM or NOT SPAM. That is your training data.' },
  m1g2: { title: 'Fact or Fib', goal: 'SPOT THE ERROR · FIND 3 FIBS', intro: 'NOVA wrote 6 sentences about AI. Three are fibs. Tap them!' },
  m2g1: { title: 'Tune the Sorter', goal: 'SLIDERS · TWO ROUNDS', intro: 'Move the threshold and the weight. Watch how the sorter changes.' },
  m2g2: { title: 'Prompt Forge', goal: 'BUILD · ASSEMBLE THE PROMPT', intro: 'Build a strong prompt by dragging blocks into the right slots.' },
  m3g1: { title: 'Proxy Hunt', goal: 'SPOT THE ERROR · FIND 5 PROXIES', intro: 'Name and gender are hidden. Tap the 5 lines that still give gender away.' },
  m3g2: { title: 'Fairness Lab', goal: 'SIMULATE · GAP ≤ 6 · ACCURACY ≥ 80', intro: 'Switch features on or off. Fix the gap without wrecking accuracy.' },
  m4g1: { title: 'Source Detective', goal: 'INVESTIGATE · KEEP OR CUT', intro: 'NOVA cited 5 sources. Check 3 in the catalogue, then drag each to KEEP or CUT.' },
  m4g2: { title: 'Confidence Court', goal: 'SORT · TRUST OR VERIFY', intro: 'Each NOVA answer has a confidence score and evidence. Ignore the score. Judge the evidence.' },
  m4g3: { title: 'Design the Companion', goal: 'SIMULATE · HIT ALL 5 TARGETS', intro: 'Design a chatbot companion for teens. Balance engagement, data and safety.' },
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
