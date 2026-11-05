// m1g2 · Fact or Fib — v3 data + invariants (spec/capabilities/v3-games.md → m1g2).
import game from '@/games/m1g2';
import { GAMES } from '@/games/registry';
import { createPick, focus, isComplete, tap, xray } from '@/dnd/pickEngine';
import { COUNTER_LABEL, FIB_TAG, FOCUS_LINE, PAPER_TAG, SENTENCES, TRUE_MISS, TRUE_TAG, WIN_DELAY_MS, WIN_SUMMARY } from '@/games/m1g2/data';
import { fibIndices, foundLine, pickLines } from '@/games/m1g2/logic';

describe('m1g2 definition', () => {
  it('registers v3 title, goal and intro under id m1g2 in module 1', () => {
    expect(GAMES.m1g2).toBe(game);
    expect(game).toMatchObject({
      id: 'm1g2',
      module: 1,
      title: 'Fact or Fib',
      goal: 'SPOT THE ERROR · FIND 3 FIBS',
      intro: 'NOVA wrote 6 sentences about AI. Three are fibs. Tap them!',
    });
  });
});

describe('m1g2 data', () => {
  it('has the six v3 sentences in v3 order', () => {
    expect(SENTENCES.map((s) => s[0])).toEqual([
      'Machine learning finds patterns in training data.',
      'A model that memorizes its training data will always do well on new data.',
      'Labels are the right answers attached to training examples.',
      "A model's prediction is always a proven fact.",
      'Traditional software follows rules that a person wrote.',
      'Testing data is the same data the model trained on.',
    ]);
  });

  it('the fibs are indices 1, 3, 5 (2nd, 4th, 6th)', () => {
    expect(fibIndices()).toEqual([1, 3, 5]);
    expect(pickLines().map((l) => l.isTarget)).toEqual([false, true, false, true, false, true]);
  });

  it('every fib carries its v3 explanation and true lines carry none', () => {
    expect(pickLines().map((l) => l.note)).toEqual([
      undefined,
      'Memorizing is not generalizing. New data is the real test.',
      undefined,
      'A prediction is an informed guess and it can be wrong.',
      undefined,
      'Testing uses data the model has NOT seen.',
    ]);
  });

  it('keeps the v3 copy: paper tag, counter, tags, miss, FOCUS and win summary', () => {
    expect(PAPER_TAG).toBe('NOVA · DRAFT ESSAY');
    expect(COUNTER_LABEL).toBe('FIBS FOUND');
    expect(FIB_TAG).toBe('FIB');
    expect(TRUE_TAG).toBe('TRUE');
    expect(TRUE_MISS).toBe('That one is actually true. Look for something that sounds too sure.');
    expect(FOCUS_LINE).toBe('FOCUS: that one is true. Ignore it.');
    expect(WIN_DELAY_MS).toBe(700);
    expect(WIN_SUMMARY).toBe("Rules, learning, labels and testing: a model's output is a prediction, and memorizing training data is not the same as generalizing.");
  });

  it('the found line is "Fib caught! " + the explanation', () => {
    expect(foundLine(pickLines()[3]!)).toBe('Fib caught! A prediction is an informed guess and it can be wrong.');
  });
});

describe('m1g2 on the pick engine', () => {
  it('is complete only after all three fibs', () => {
    let s = createPick(pickLines());
    s = tap(s, 1).state;
    s = tap(s, 3).state;
    expect(isComplete(s)).toBe(false);
    s = tap(s, 0).state; // a true line does not count
    expect(s.found).toBe(2);
    s = tap(s, 5).state;
    expect(isComplete(s)).toBe(true);
  });

  it('X-RAY catches fibs in order 1, 3, 5 then has nothing left', () => {
    let s = createPick(pickLines());
    const got: (number | null)[] = [];
    for (let k = 0; k < 4; k++) {
      const r = xray(s);
      got.push(r.index);
      s = r.state;
    }
    expect(got).toEqual([1, 3, 5, null]);
  });

  it('FOCUS marks true lines 0, 2, 4 safe, skipping lines already tapped, then has nothing left', () => {
    let s = tap(createPick(pickLines()), 0).state;
    const got: (number | null)[] = [];
    for (let k = 0; k < 3; k++) {
      const r = focus(s);
      got.push(r.index);
      s = r.state;
    }
    expect(got).toEqual([2, 4, null]);
  });
});
