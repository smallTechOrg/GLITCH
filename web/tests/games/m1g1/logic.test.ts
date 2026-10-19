// m1g1 · Train the Model — v3 data + answer keys (spec/capabilities/v3-games.md → m1g1).
import game from '@/games/m1g1';
import { GAMES } from '@/games/registry';
import { createSort, drop, focus, isDone, xray } from '@/dnd/sortEngine';
import {
  RESULT_EXPLAIN, RESULT_HEAD, RESULT_TEST, RESULT_TRAIN, STEP1_DONE_LINE, STEP1_HEAD, STEP1_WRONG, STEP2_HEAD, STEP2_SUB, STEP2_WRONG,
  TEST_EMAILS, TRAIN_EMAILS, WIN_SUMMARY, FINISH_LABEL,
} from '@/games/m1g1/data';
import { modelSays, nextStep, testAnswer, testConfig, trainAnswer, trainingConfig } from '@/games/m1g1/logic';

describe('m1g1 definition', () => {
  it('registers v3 title, goal and intro under id m1g1 in module 1', () => {
    expect(GAMES.m1g1).toBe(game);
    expect(game).toMatchObject({
      id: 'm1g1',
      module: 1,
      title: 'Train the Model',
      goal: 'SORT · DRAG THE EXAMPLES',
      intro: 'Drag each email into SPAM or NOT SPAM. That is your training data.',
    });
    expect(typeof game.Component).toBe('function');
  });
});

describe('m1g1 step 1 · training data', () => {
  it('has the six v3 emails in v3 order', () => {
    expect(TRAIN_EMAILS.map((e) => e[0])).toEqual(['e1', 'e2', 'e3', 'e4', 'e5', 'e6']);
    expect(TRAIN_EMAILS.map((e) => e[1])).toEqual([
      'WIN a FREE prize!!! Click now',
      "Lunch at 1? I'm outside",
      'Account locked. Verify your password here',
      'Maths homework due Friday',
      'Cheap watches 90% off. Buy now',
      'Mum: dinner is ready',
    ]);
  });

  it('labels e1, e3, e5 as SPAM and e2, e4, e6 as NOT SPAM', () => {
    const cfg = trainingConfig();
    const key = Object.fromEntries(cfg.items.map((i) => [i.id, i.answer]));
    expect(key).toEqual({ e1: 'spam', e2: 'ok', e3: 'spam', e4: 'ok', e5: 'spam', e6: 'ok' });
    expect(TRAIN_EMAILS.map(trainAnswer)).toEqual(['spam', 'ok', 'spam', 'ok', 'spam', 'ok']);
  });

  it('uses zones spam "SPAM" and ok "NOT SPAM" with no decoys', () => {
    const cfg = trainingConfig();
    expect(cfg.zones.map((z) => [z.id, z.label])).toEqual([['spam', 'SPAM'], ['ok', 'NOT SPAM']]);
    expect(cfg.items.every((i) => i.answer !== null)).toBe(true);
    expect(cfg.cap).toBeUndefined();
  });

  it('returns the v3 wrong message for any wrong drop', () => {
    const s = createSort(trainingConfig());
    const r = drop(s, 'e2', 'spam');
    expect(r.result).toBe('wrong');
    expect(STEP1_WRONG).toBe('Look at the features: shouting, prizes, passwords. Those go with SPAM.');
    expect(trainingConfig().wrong?.(trainingConfig().items[1]!, trainingConfig().zones[0]!)).toBe(STEP1_WRONG);
  });

  it('keeps the v3 step-1 heading and done line', () => {
    expect(STEP1_HEAD).toBe('STEP 1 · LABEL THE TRAINING DATA');
    expect(STEP1_DONE_LINE).toBe('Labels done. The model learned the pattern.');
  });

  it('is done only after all six are placed', () => {
    let s = createSort(trainingConfig());
    for (const it of trainingConfig().items.slice(0, 5)) s = drop(s, it.id, it.answer as string).state;
    expect(isDone(s)).toBe(false);
    s = drop(s, 'e6', 'ok').state;
    expect(isDone(s)).toBe(true);
  });
});

describe('m1g1 step 2 · testing on new emails', () => {
  it('has the four v3 test emails with the model verdicts', () => {
    expect(TEST_EMAILS).toEqual([
      ['t1', 'Meeting moved to 3pm', 'SPAM', 'w'],
      ['t2', 'FREE pizza voucher, click', 'SPAM', 'r'],
      ['t3', 'Photos from the trip', 'NOT SPAM', 'r'],
      ['t4', 'Exam result: verify password', 'NOT SPAM', 'w'],
    ]);
    expect(TEST_EMAILS.map(modelSays)).toEqual(['MODEL SAYS: SPAM', 'MODEL SAYS: SPAM', 'MODEL SAYS: NOT SPAM', 'MODEL SAYS: NOT SPAM']);
  });

  it('answers t1 WRONG, t2 RIGHT, t3 RIGHT, t4 WRONG', () => {
    const key = Object.fromEntries(testConfig().items.map((i) => [i.id, i.answer]));
    expect(key).toEqual({ t1: 'wrong', t2: 'right', t3: 'right', t4: 'wrong' });
    expect(TEST_EMAILS.map(testAnswer)).toEqual(['wrong', 'right', 'right', 'wrong']);
  });

  it('uses zones right "RIGHT" and wrong "WRONG" and the v3 wrong message', () => {
    const cfg = testConfig();
    expect(cfg.zones.map((z) => [z.id, z.label])).toEqual([['right', 'RIGHT'], ['wrong', 'WRONG']]);
    expect(cfg.wrong?.(cfg.items[0]!, cfg.zones[0]!)).toBe("Compare the model's verdict with what the email really is.");
    expect(STEP2_WRONG).toBe("Compare the model's verdict with what the email really is.");
  });

  it('puts the model verdict into the screen-reader text of each item', () => {
    const t1 = testConfig().items[0]!;
    expect(t1.text).toBe('Meeting moved to 3pm. MODEL SAYS: SPAM');
    expect(t1.email).toBe('Meeting moved to 3pm');
    expect(t1.says).toBe('MODEL SAYS: SPAM');
  });

  it('keeps the v3 step-2 heading and sub line', () => {
    expect(STEP2_HEAD).toBe('STEP 2 · TEST ON NEW EMAILS');
    expect(STEP2_SUB).toBe('The model says what is in the tag. Was it RIGHT or WRONG?');
  });
});

describe('m1g1 powers on the sort boards', () => {
  it('X-RAY places items in pool order and runs out after the last', () => {
    let s = createSort(testConfig());
    const order: string[] = [];
    for (;;) {
      const r = xray(s);
      if (!r.placed) break;
      order.push(`${r.placed.item.id}->${r.placed.zone.label}`);
      s = r.state;
    }
    expect(order).toEqual(['t1->WRONG', 't2->RIGHT', 't3->RIGHT', 't4->WRONG']);
  });

  it('FOCUS has no decoys to dim, so it flashes the first remaining pair', () => {
    const r = focus(createSort(trainingConfig()));
    expect(r.effect).toEqual({ kind: 'flash', itemId: 'e1', zoneId: 'spam' });
  });
});

describe('m1g1 result', () => {
  it('shows the fixed TRAINING VS TESTING comparison (6/6 100%, 2/4 50%)', () => {
    expect(RESULT_HEAD).toBe('TRAINING VS TESTING');
    expect(RESULT_TRAIN).toEqual({ label: 'TRAINING DATA', score: '6/6', pct: '100% correct' });
    expect(RESULT_TEST).toEqual({ label: 'NEW TEST DATA', score: '2/4', pct: '50% correct' });
    expect(RESULT_EXPLAIN).toBe('The model aced what it studied but stumbled on new emails. It memorized instead of generalizing.');
    expect(FINISH_LABEL).toBe('Finish ▶');
  });

  it('the fixed 2/4 matches the data: the model is right on exactly 2 of 4 test emails', () => {
    expect(TEST_EMAILS.filter((e) => e[3] === 'r')).toHaveLength(2);
  });

  it('wins with the v3 summary', () => {
    expect(WIN_SUMMARY).toBe('Training data has features and labels. A model must generalize: test it on data it has not seen. Memorizing is not learning.');
  });

  it('steps go train → test → result', () => {
    expect(nextStep('train')).toBe('test');
    expect(nextStep('test')).toBe('result');
    expect(nextStep('result')).toBe('result');
  });
});
