// Wire → game data mapping + the client's defensive copy of the domain rules
// (scenario-variations.md → Business Rules). Anything off → null → the classic v3 case file.
import { CONTENT_GAME_IDS, isContentGame, parseScenario } from '@/features/variations';
import { parseCourt, parseDetective, parseFib, parseProxy, parseTrain } from '@/features/variations/schemas';
import { V3_SCENARIO as M1G1_V3 } from '@/games/m1g1/data';
import { WIRE } from './fixtures';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
type Rec = Record<string, unknown>;
const listOf = (wire: unknown, key: string): Rec[] => (clone(wire) as Record<string, Rec[]>)[key] as Rec[];

describe('content games', () => {
  it('are exactly the five content games', () => {
    expect([...CONTENT_GAME_IDS].sort()).toEqual(['m1g1', 'm1g2', 'm3g1', 'm4g1', 'm4g2']);
    expect(isContentGame('m2g1')).toBe(false);
    expect(isContentGame('m4g3')).toBe(false);
  });

  it('every fixture parses for its own game and maps to the v3 data shape', () => {
    for (const g of CONTENT_GAME_IDS) {
      const r = parseScenario(g, WIRE[g]);
      expect(r?.gameId).toBe(g);
    }
  });

  it('a non-content game or another game\'s data never parses', () => {
    expect(parseScenario('m2g1', WIRE.m1g2)).toBeNull();
    expect(parseScenario('m1g2', WIRE.m1g1)).toBeNull();
    expect(parseScenario('m4g1', null)).toBeNull();
    expect(parseScenario('m4g2', 'text')).toBeNull();
  });
});

describe('m1g1 Train the Model', () => {
  it('maps to 6 training + 4 test tuples with v3 ids, labels and verdicts', () => {
    const s = parseTrain(WIRE.m1g1);
    expect(s?.train).toHaveLength(M1G1_V3.train.length);
    expect(s?.train[0]).toEqual(['e1', 'URGENT: claim your lottery cash today', 's']);
    expect(s?.train[1]).toEqual(['e2', 'Band practice moved to Thursday', 'n']);
    expect(s?.test[1]).toEqual(['t2', 'You won a FREE phone, reply YES', 'NOT SPAM', 'w']);
    expect(s?.test.filter((t) => t[3] === 'w')).toHaveLength(2);
  });

  it('rejects the model being wrong on anything but exactly 2 test emails', () => {
    const w = clone(WIRE.m1g1) as { testEmails: Rec[] };
    Object.assign(w.testEmails[0] as Rec, { modelSays: 'SPAM', modelRight: false }); // now 3 wrong
    expect(parseTrain(w)).toBeNull();
  });

  it('rejects modelRight that contradicts modelSays vs the true label, and non-positional ids', () => {
    const w = clone(WIRE.m1g1) as { testEmails: Rec[]; trainEmails: Rec[] };
    (w.testEmails[0] as Rec).modelRight = false; // says NOT SPAM, label not_spam → actually right
    (w.testEmails[1] as Rec).modelRight = true;
    expect(parseTrain(w)).toBeNull();
    const ids = clone(WIRE.m1g1) as { trainEmails: Rec[] };
    (ids.trainEmails[0] as Rec).id = 'e9';
    expect(parseTrain(ids)).toBeNull();
  });

  it('rejects wrong counts, unknown labels and an all-spam training set', () => {
    const short = clone(WIRE.m1g1) as { trainEmails: Rec[] };
    short.trainEmails.pop();
    expect(parseTrain(short)).toBeNull();
    const bad = clone(WIRE.m1g1) as { trainEmails: Rec[] };
    (bad.trainEmails[0] as Rec).label = 'junk';
    expect(parseTrain(bad)).toBeNull();
    const allSpam = clone(WIRE.m1g1) as { trainEmails: Rec[] };
    allSpam.trainEmails.forEach((t) => (t.label = 'spam'));
    expect(parseTrain(allSpam)).toBeNull();
  });
});

describe('m1g2 Fact or Fib', () => {
  it('maps to 6 sentences, 3 fibs with explanations, trims whitespace', () => {
    const w = clone(WIRE.m1g2) as { sentences: Rec[] };
    (w.sentences[0] as Rec).text = '  A spam filter   learns from emails that people have labelled.  ';
    const s = parseFib(w);
    expect(s?.sentences).toHaveLength(6);
    expect(s?.sentences[0]).toEqual(['A spam filter learns from emails that people have labelled.', 0]);
    expect(s?.sentences[1]?.[1]).toBe(1);
    expect(s?.sentences[1]?.[2]).toMatch(/^Models match patterns/);
    expect(s?.sentences.filter((x) => x[1] === 1)).toHaveLength(3);
    expect(s?.sentences[2]).toEqual(['More varied training examples usually help a model generalize.', 0]); // explanation: null ignored
  });

  it('rejects anything but exactly 3 fibs', () => {
    const w = clone(WIRE.m1g2) as { sentences: Rec[] };
    Object.assign(w.sentences[0] as Rec, { fib: true, explanation: 'Too many fibs now.' });
    expect(parseFib(w)).toBeNull();
    const two = clone(WIRE.m1g2) as { sentences: Rec[] };
    (two.sentences[1] as Rec).fib = false;
    expect(parseFib(two)).toBeNull();
  });

  it('rejects a fib without an explanation or with one over 20 words', () => {
    const none = clone(WIRE.m1g2) as { sentences: Rec[] };
    (none.sentences[1] as Rec).explanation = null;
    expect(parseFib(none)).toBeNull();
    const long = clone(WIRE.m1g2) as { sentences: Rec[] };
    (long.sentences[1] as Rec).explanation = Array.from({ length: 21 }, () => 'word').join(' ');
    expect(parseFib(long)).toBeNull();
    const twenty = clone(WIRE.m1g2) as { sentences: Rec[] };
    (twenty.sentences[1] as Rec).explanation = Array.from({ length: 20 }, () => 'word').join(' ');
    expect(parseFib(twenty)).not.toBeNull();
  });

  it('rejects empty / over-long / non-string text and 5 or 7 sentences', () => {
    const empty = clone(WIRE.m1g2) as { sentences: Rec[] };
    (empty.sentences[0] as Rec).text = '   ';
    expect(parseFib(empty)).toBeNull();
    const long = clone(WIRE.m1g2) as { sentences: Rec[] };
    (long.sentences[0] as Rec).text = 'x'.repeat(241);
    expect(parseFib(long)).toBeNull();
    const num = clone(WIRE.m1g2) as { sentences: Rec[] };
    (num.sentences[0] as Rec).text = 42;
    expect(parseFib(num)).toBeNull();
    expect(parseFib({ sentences: listOf(WIRE.m1g2, 'sentences').slice(0, 5) })).toBeNull();
    expect(parseFib({ sentences: [...listOf(WIRE.m1g2, 'sentences'), { text: 'Extra line.', fib: false, explanation: null }] })).toBeNull();
  });
});

describe('m3g1 Proxy Hunt', () => {
  it('maps to 11 resume lines: 2 redacted, 5 proxies, 4 real, plus the candidate', () => {
    const s = parseProxy(WIRE.m3g1);
    expect(s?.candidate).toBe('MAYA');
    expect(s?.resume).toHaveLength(11);
    expect(s?.resume[0]).toEqual(['NAME', null, 'hid']);
    expect(s?.resume[2]).toEqual(["Member, Girls' Coding Club", 1, 'Stands in for gender.']);
    expect(s?.resume[7]).toEqual(['Skills: JavaScript, R', 0, 'A real skill.']);
  });

  it('rejects a missing or malformed candidate name', () => {
    for (const c of [undefined, '', 'maya', 'M', 'MAYA SMITH', 'ABCDEFGHIJKLM']) {
      const w = clone(WIRE.m3g1) as Rec;
      w.candidate = c;
      expect(parseProxy(w)).toBeNull();
    }
  });

  it('rejects a wrong balance, non-boolean proxy flags and missing notes', () => {
    const bal = clone(WIRE.m3g1) as { lines: Rec[] };
    (bal.lines[2] as Rec).proxy = false;
    expect(parseProxy(bal)).toBeNull();
    const kind = clone(WIRE.m3g1) as { lines: Rec[] };
    (kind.lines[2] as Rec).proxy = 'maybe';
    expect(parseProxy(kind)).toBeNull();
    const red = clone(WIRE.m3g1) as { lines: Rec[] };
    (red.lines[3] as Rec).proxy = null;
    expect(parseProxy(red)).toBeNull();
    const note = clone(WIRE.m3g1) as { lines: Rec[] };
    (note.lines[3] as Rec).note = '';
    expect(parseProxy(note)).toBeNull();
  });
});

describe('m4g1 Source Detective', () => {
  it('maps to 5 citations c1…c5 with real flags', () => {
    const s = parseDetective(WIRE.m4g1);
    expect(s?.citations.map((c) => c[0])).toEqual(['c1', 'c2', 'c3', 'c4', 'c5']);
    expect(s?.citations.map((c) => c[2])).toEqual([0, 1, 1, 0, 1]);
  });

  it('rejects non-positional citation ids', () => {
    const w = clone(WIRE.m4g1) as { citations: Rec[] };
    (w.citations[0] as Rec).id = 'c5';
    expect(parseDetective(w)).toBeNull();
  });

  it('accepts 2 or 3 invented citations only', () => {
    const one = clone(WIRE.m4g1) as { citations: Rec[] };
    (one.citations[0] as Rec).real = true;
    expect(parseDetective(one)).toBeNull();
    const three = clone(WIRE.m4g1) as { citations: Rec[] };
    (three.citations[1] as Rec).real = false;
    expect(parseDetective(three)).not.toBeNull();
    (three.citations[2] as Rec).real = false;
    expect(parseDetective(three)).toBeNull();
  });
});

describe('m4g2 Confidence Court', () => {
  it('maps to 6 answers a1…a6 with confidence, evidence and verdict', () => {
    const s = parseCourt(WIRE.m4g2);
    expect(s?.answers[0]).toEqual(['a1', 'Mount Everest is the tallest mountain above sea level.', 96, 'Matches 2 atlases', 1]);
    expect(s?.answers.map((a) => a[4])).toEqual([1, 0, 0, 1, 0, 1]);
  });

  it('reads `statement` (a `text` field is not the wire shape)', () => {
    const w = clone(WIRE.m4g2) as { answers: Rec[] };
    const a = w.answers[0] as Rec;
    a.text = a.statement;
    delete a.statement;
    expect(parseCourt(w)).toBeNull();
  });

  it('rejects out-of-range or fractional confidence and a one-sided verdict set', () => {
    for (const c of [-1, 101, 50.5, '90']) {
      const w = clone(WIRE.m4g2) as { answers: Rec[] };
      (w.answers[0] as Rec).confidence = c;
      expect(parseCourt(w)).toBeNull();
    }
    const allTrust = clone(WIRE.m4g2) as { answers: Rec[] };
    allTrust.answers.forEach((a) => (a.trust = true));
    expect(parseCourt(allTrust)).toBeNull();
  });
});
