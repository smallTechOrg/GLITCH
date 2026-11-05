// Storytime cutscenes: short on purpose, one idea per slide, about a minute per module.
// Keyed by module id; the title slides carry the number players see (COURSE_ORDER).
import type { CharacterId, ModuleId, NpcId } from '../contracts/ids';
import type { IconId } from '../contracts/art';

export interface TitleSlide { t: 'title'; h: string; s: string; x: string }
export interface PortraitSlide { t: 'portrait'; w: CharacterId; x: string }
export interface IconsSlide { t: 'icons'; ic: readonly IconId[]; x: string; cap: readonly string[] }
export interface SceneSlide { t: 'scene'; w: NpcId; x: string; big?: boolean }
export interface KeySlide { t: 'key'; k: string; x: string }
export type Slide = TitleSlide | PortraitSlide | IconsSlide | SceneSlide | KeySlide;

const T = (x: readonly [string, string, string]): TitleSlide => ({ t: 'title', h: x[0], s: x[1], x: x[2] });
const Pt = (w: CharacterId, x: string): PortraitSlide => ({ t: 'portrait', w, x });
const Ic = (ic: readonly IconId[], x: string, cap: readonly string[]): IconsSlide => ({ t: 'icons', ic, x, cap });
const Sn = (w: NpcId, x: string, o: { big?: boolean } = {}): SceneSlide => ({ t: 'scene', w, x, ...(o.big ? { big: true } : {}) });
const Ky = (k: string, x: string): KeySlide => ({ t: 'key', k, x });

export const STORY: Readonly<Record<ModuleId, readonly Slide[]>> = {
  2: [
    T(['MODULE 1', 'PROMPT FORGE', 'Vague in. Vague out.']),
    Sn('n', "I'm NOVA, a generative AI. I guess one likely word at a time.", { big: true }),
    Sn('z', 'NOVA, write about space.'),
    Pt('n', 'Done! 900 words nobody wanted. You did not tell me much, so I guessed.'),
    Ic(['target', 'globe', 'mask', 'doc', 'clock'], 'Five levers fix that. Pull them and I get useful.', ['TASK', 'CONTEXT', 'ROLE', 'FORMAT', 'LIMIT']),
    Ky('Thresholds', 'Sorting works the same way. Messages score points, and someone picks the line.'),
    Pt('d', 'A first prompt is a draft. Read the answer, then improve it. To the forge!'),
  ],
  1: [
    T(['MODULE 2', 'TRAINING LAB', 'Nobody wrote the rules.']),
    Sn('z', 'So AI is a robot brain that thinks like us, right?'),
    Sn('d', 'Not quite. Normal software follows rules people wrote. Same input, same output.'),
    Ky('Machine learning', 'No rules here. Show a model labelled examples and it finds the pattern itself.'),
    Ky('Generalization', 'Acing old examples proves nothing. The real test is data it has never seen.'),
    Pt('d', 'Your turn. Make the call on each email, then check how you did.'),
  ],
  3: [
    T(['MODULE 3', 'NEON CITY', 'The screener that said no.']),
    Sn('k', 'An AI rejected Anaya. They deleted her name and gender first. So how is it biased?'),
    Ky('Dataset bias', 'It learned from past hires. If those were mostly men, "good" starts to mean "like them".'),
    Ky('Proxy variables', "A women's college. A career gap. A postcode. Clues that stand in for what was deleted."),
    Pt('n', 'I can be 99% confident and still be unfair. Confidence is not fairness.'),
    Pt('d', 'Check the results for every group. Go hunt the proxies.'),
  ],
  4: [
    T(['MODULE 4', 'THE NEWSROOM', 'Final lesson: trust.']),
    Ky('Hallucination', 'AI can sound certain and be flat wrong. It even invents sources.'),
    Pt('n', 'Smooth writing feels true. It is not proof. I cannot tell what was checked.'),
    Sn('z', 'But AI is so useful! Why not use it for everything?'),
    Sn('d', 'Check outside the AI, and match your trust to the stakes.'),
    Ky('Human oversight', 'Ask "should we?", not only "can we?". People decide what right means.'),
    Pt('d', 'Everything you learned gets tested now. Run the newsroom.'),
  ],
};

/** The text that types out on a slide ('' for title slides, which show their text at once). */
export function slideText(s: Slide): string {
  return s.t === 'title' ? '' : s.x;
}

/** Storytime copy (v3 cut()). */
export const STORY_COPY = {
  skip: 'SKIP ▶▶',
  keyIdea: 'KEY IDEA',
  hint: 'CLICK · SPACE · ► TO CONTINUE',
  hintTouch: 'TAP TO CONTINUE',
  hintBack: ' · ◄ BACK',
  next: '▼',
} as const;
