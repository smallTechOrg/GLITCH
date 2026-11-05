// m1g1 · Train the Model — data + answer keys (spec/capabilities/v3-games.md → m1g1).
import { GAME_META } from '@/content/modules';
import game from '@/games/m1g1';
import { GAMES } from '@/games/registry';
import {
  FINISH_LABEL, RESULT_EXPLAIN, RESULT_HEAD, RESULT_TEST, RESULT_TRAIN, ROUND1_DONE_LINE, ROUND1_HEAD, ROUND1_WRONG, ROUND2_HEAD, ROUND2_WRONG,
  TEST_EMAILS, TRAIN_EMAILS, WIN_SUMMARY, ZONES, modelSaid,
} from '@/games/m1g1/data';
import {
  allCalled, callMistake, firstUncalled, nextStep, testAnswer, testRows, trainAnswer, trainRows, wrongMessage, wrongRows, zoneLabel, type Calls,
} from '@/games/m1g1/logic';

describe('m1g1 definition', () => {
  it('registers the course metadata under id m1g1 in module 1', () => {
    expect(GAMES.m1g1).toBe(game);
    expect(game).toMatchObject({ id: 'm1g1', module: 1, ...GAME_META.m1g1 });
    expect(game.title).toBe('Train the Model');
    expect(game.goal).toMatch(/^MISSION: /);
    expect(game.steps).toHaveLength(3);
    expect(typeof game.Component).toBe('function');
  });
});

describe('m1g1 round 1 · training data', () => {
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
    expect(Object.fromEntries(trainRows().map((r) => [r.id, r.truth]))).toEqual({ e1: 'spam', e2: 'ok', e3: 'spam', e4: 'ok', e5: 'spam', e6: 'ok' });
    expect(TRAIN_EMAILS.map(trainAnswer)).toEqual(['spam', 'ok', 'spam', 'ok', 'spam', 'ok']);
    expect(trainRows().every((r) => r.model === undefined)).toBe(true);
  });

  it('uses bins spam "SPAM" and ok "NOT SPAM"', () => {
    expect(ZONES.map((z) => [z.id, z.label])).toEqual([['spam', 'SPAM'], ['ok', 'NOT SPAM']]);
    expect(zoneLabel('spam')).toBe('SPAM');
    expect(zoneLabel('ok')).toBe('NOT SPAM');
  });

  it('keeps the heading, done line and wrong message', () => {
    expect(ROUND1_HEAD).toBe('ROUND 1 · TRAIN IT: MAKE YOUR CALLS');
    expect(ROUND1_DONE_LINE).toBe('Your labels trained the model. Now test it.');
    expect(ROUND1_WRONG).toBe('Look at the features: shouting, prizes, passwords. Those go with SPAM.');
    expect(wrongMessage('train')).toBe(ROUND1_WRONG);
  });
});

describe('m1g1 round 2 · testing on new emails', () => {
  it('has the four v3 test emails with the model verdicts', () => {
    expect(TEST_EMAILS).toEqual([
      ['t1', 'Meeting moved to 3pm', 'SPAM', 'w'],
      ['t2', 'FREE pizza voucher, click', 'SPAM', 'r'],
      ['t3', 'Photos from the trip', 'NOT SPAM', 'r'],
      ['t4', 'Exam result: verify password', 'NOT SPAM', 'w'],
    ]);
  });

  it('derives each truth from what the model said and whether it was right', () => {
    expect(TEST_EMAILS.map(testAnswer)).toEqual(['ok', 'spam', 'ok', 'spam']);
  });

  it('every row carries the model verdict', () => {
    expect(testRows()[0]).toEqual({ id: 't1', email: 'Meeting moved to 3pm', truth: 'ok', model: { says: 'SPAM', right: false } });
    expect(testRows()[1]?.model).toEqual({ says: 'SPAM', right: true });
    expect(modelSaid('SPAM', false)).toBe('MODEL: SPAM ✗');
    expect(modelSaid('NOT SPAM', true)).toBe('MODEL: NOT SPAM ✓');
  });

  it('keeps the heading and wrong message', () => {
    expect(ROUND2_HEAD).toBe('ROUND 2 · TEST IT: NEW EMAILS');
    expect(wrongMessage('test')).toBe(ROUND2_WRONG);
  });
});

describe('m1g1 calls', () => {
  const rows = trainRows();
  const right: Calls = { e1: 'spam', e2: 'ok', e3: 'spam', e4: 'ok', e5: 'spam', e6: 'ok' };

  it('allCalled is true only when every email has a call', () => {
    const { e6: _, ...five } = right;
    expect(allCalled(rows, {})).toBe(false);
    expect(allCalled(rows, five)).toBe(false);
    expect(allCalled(rows, right)).toBe(true);
  });

  it('firstUncalled walks the list in order, then runs out', () => {
    expect(firstUncalled(rows, {})?.id).toBe('e1');
    expect(firstUncalled(rows, { e1: 'ok' })?.id).toBe('e2');
    expect(firstUncalled(rows, right)).toBeUndefined();
  });

  it('wrongRows finds exactly the rows whose call differs from the truth', () => {
    expect(wrongRows(rows, right)).toEqual([]);
    expect(wrongRows(rows, { ...right, e1: 'ok', e4: 'spam' }).map((r) => r.id)).toEqual(['e1', 'e4']);
  });

  it('callMistake carries closed ids and on-screen labels', () => {
    expect(callMistake(rows[0]!, 'ok')).toEqual({
      itemId: 'e1', answer: 'ok', correct: 'spam', concept: 'Training data',
      itemText: 'WIN a FREE prize!!! Click now', answerLabel: 'NOT SPAM', correctLabel: 'SPAM', explain: true,
    });
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
