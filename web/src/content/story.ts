// Storytime cutscenes — verbatim from v3 `STORY` (spec/idea/GLITCH v3.html lines 382–428):
// 41 slides (11/10/10/10), same order, same text, same kinds (T/Pt/Ic/Sn/Ky helpers).
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
  1: [
    T(['MODULE 1', 'TRAINING LAB', 'Week one. A question on the board.']),
    Pt('d', "Welcome to the Training Lab. Today's question: what is AI, really?"),
    Sn('z', 'a robot brain that thinks like a person, right?'),
    Sn('d', 'Let\'s compare. Traditional software follows rules a person wrote. Same input, same output, every time.'),
    Ic(['gear', 'doc', 'key', 'chip', 'bin', 'check', 'clock', 'book'], 'Traditional software = rules written by people. It does exactly what the rules say, nothing more.', ['RULES', 'CODE', 'LOGIC', 'CHIP', 'BIN', 'OK', 'TIME', 'BOOK']),
    Ky('Machine learning', 'Instead of rules, a model learns patterns from examples. We show it lots of examples and it finds the patterns itself.'),
    Ic(['envelope', 'bubble', 'question', 'target', 'star', 'warning', 'eye', 'scan'], 'Examples are training data. Each one has features, the details we measure. Many have a label: the right answer, like SPAM.', ['EMAIL', 'WORDS', '?', 'LABEL', 'GOOD', 'SPAM', 'LOOK', 'SCAN']),
    Sn('d', 'The model learns which features go with which labels, then predicts on new examples. A prediction is an informed guess, not a fact.'),
    Ky('Generalization', 'A good model works on examples it has never seen. Memorizing training data is not learning, so we hold data back for testing.'),
    Sn('n', "I'm NOVA, a generative AI. I learned patterns from huge amounts of text and I write one likely word at a time.", { big: true }),
    Pt('n', 'Useful for drafts and ideas. Limited wherever facts, judgment or accountability matter. Time to train your first model.'),
  ],
  2: [
    T(['MODULE 2', 'PROMPT FORGE', 'Where scores become decisions.']),
    Sn('z', 'I want NOVA to sort my messages into URGENT and CAN WAIT. How does it decide?'),
    Pt('n', 'For every message I look at features: words like tonight or deadline, who sent it, how long it is.'),
    Ic(['envelope', 'clock', 'warning', 'mic', 'phone', 'bolt', 'bubble', 'bin'], 'Each feature gets a weight: how strongly it pushes the decision. The weights add up into a score.', ['MAIL', 'DEADLINE', '!!', 'VOICE', 'PHONE', 'BIG', 'lol', 'BIN']),
    Ky('Thresholds', 'A score becomes a probability, like 85% urgent. A threshold is the line where the decision flips.'),
    Sn('z', 'so URGENT is just everything above a line somebody picked?'),
    Sn('n', "Yes. Raise the line and fewer things count as urgent, but real emergencies can slip through. That's classification, and it's a trade-off."),
    Sn('d', 'Now flip it. When you chat with an AI, YOU supply the features. Your prompt is the input.', { big: true }),
    Ic(['target', 'globe', 'gear', 'mask', 'doc', 'clock', 'anchor', 'flask'], 'Prompt levers: specificity, context, constraints, role and audience, format. Then iterate.', ['SPECIFIC', 'CONTEXT', 'LIMITS', 'ROLE', 'FORMAT', 'LENGTH', 'AIM', 'TRY']),
    Pt('d', 'Your first prompt is a draft. Read the answer, then refine it. Step up to the forge.'),
  ],
  3: [
    T(['MODULE 3', 'NEON CITY', 'The screener that said no.']),
    Sn('k', "Anaya didn't get an interview. The company used an AI screener. They deleted her name and gender first. So how can it be biased?"),
    Ic(['bubble', 'doc', 'chip', 'scan', 'eye', 'bin', 'book', 'question'], 'I split text into tokens, small chunks of words. Each token becomes a list of numbers, a representation. Similar words get similar numbers.', ['TEXT', 'TOKENS', 'NUMBERS', 'MATCH', 'SEE', 'STORE', 'READ', '?']),
    Sn('n', 'A screener works like the sorter: features get weights, weights give a score. But it learned its weights from past hires.', { big: true }),
    Ky('Dataset bias', 'If past hires were mostly men, good candidate starts to mean looks like past hires. Groups missing from the data get worse results.'),
    Sn('k', 'But gender was deleted!'),
    Sn('d', 'Other features can stand in for it. These are proxy variables: a women\'s college, a career gap, a postcode, even a hobby.'),
    Ky('Proxy variables', 'A proxy correlates with a sensitive trait. Deleting the trait does not delete the proxy.'),
    Pt('n', "I can be 99% confident while doing this. Confidence measures how strongly a pattern fits. It does not measure fairness."),
    Pt('d', 'That is algorithmic discrimination. Test the outcomes for each group, not only the inputs. Hunt the proxies.'),
  ],
  4: [
    T(['MODULE 4', 'THE NEWSROOM', 'Final lesson: trust.']),
    Sn('d', "Everyone has an AI in their pocket. Ms. D'Souza has one last lesson, and it is about trust."),
    Ky('Hallucination', 'An AI can write something fluent and confident that is simply false. It can even invent sources with real-sounding authors.'),
    Pt('n', "I'm built to produce likely, fluent text. Fluent feels true, but it isn't. I have no built-in way to know something was verified."),
    Ic(['book', 'globe', 'doc', 'scan', 'eye', 'check', 'cross', 'key'], 'Verification means checking against something outside the AI: a catalogue, a textbook, the original paper. Source quality matters.', ['BOOKS', 'WEB', 'PAPER', 'SCAN', 'LOOK', 'TRUE', 'FAKE', 'KEY']),
    Sn('z', 'but AI is so useful! why not just use it for everything?'),
    Sn('d', 'That is an ethics question. Ethics is about trade-offs: speed against accuracy, convenience against privacy, one group against another.'),
    Ic(['shield', 'eye', 'warning', 'mic', 'phone', 'scales', 'heart', 'anchor'], 'Privacy, risk, human oversight. Match your trust to the stakes and keep a human in the loop.', ['SAFE', 'WATCH', 'RISK', 'SPEAK', 'DATA', 'FAIR', 'CARE', 'ANCHOR']),
    Ky('Responsible deployment', 'Ask should we, not only can we. Optimizing one number is not the same as doing the right thing. People decide what right means.'),
    Pt('d', 'Everything you learned is about to be tested. Go and run the newsroom.'),
  ],
};

/** The text that types out on a slide ('' for title slides — v3 shows title text at once). */
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
