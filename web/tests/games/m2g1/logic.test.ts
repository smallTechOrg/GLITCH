// m2g1 · Tune the Sorter — v3 invariants (spec/capabilities/v3-games.md → m2g1, v3 lines 521–540).
import { CAPS_WEIGHT, FOCUS_ALL_MET_LINE, ROUNDS, ROUND_1, ROUND_2, THRESHOLD, WIN_SUMMARY, XRAY_LINE } from '@/games/m2g1/data';
import { evaluate, focusLine, lockIn, rowLabel, scoreOf } from '@/games/m2g1/logic';
import game from '@/games/m2g1';

describe('m2g1 data (v3 verbatim)', () => {
  it('has v3 title, goal and intro', () => {
    expect(game.id).toBe('m2g1');
    expect(game.module).toBe(2);
    expect(game.title).toBe('Tune the Sorter');
    expect(game.goal).toBe('SLIDERS · TWO ROUNDS');
    expect(game.intro).toBe('Move the threshold and the weight. Watch how the sorter changes.');
  });

  it('slider ranges and start values are v3 (threshold 0–100 @50, caps 0–40 @30)', () => {
    expect(THRESHOLD).toMatchObject({ id: 'th', label: 'THRESHOLD', min: 0, max: 100, start: 50 });
    expect(CAPS_WEIGHT).toMatchObject({ id: 'wc', label: 'ALL-CAPS WEIGHT', min: 0, max: 40, start: 30 });
  });

  it('round 1 config is v3: wd 30, wk 20, ga 0, gb 1, URGENT/WAIT, solution (55,30)', () => {
    expect(ROUND_1).toMatchObject({
      title: 'ROUND 1 · EMERGENCY INBOX', wd: 30, wk: 20, ga: 0, gb: 1, yes: 'URGENT', no: 'WAIT',
      ma: 'EMERGENCIES MISSED', mbl: 'FALSE ALARMS', sol: [55, 30],
      fa: 'A real emergency was missed. Lower the threshold.',
      fb: 'Too many false alarms. Raise the threshold a little.',
    });
    expect(ROUND_1.msgs).toHaveLength(8);
    expect(ROUND_1.msgs[0]).toEqual(['Mum: come home NOW!', 0, 1, 1, 1]);
    expect(ROUND_1.msgs[7]).toEqual(['WIN PHONE deadline today!!!', 1, 1, 0, 0]);
  });

  it('round 2 config is v3: wd 40, wk 0, ga 1, gb 0, BLOCKED/INBOX, solution (47,30)', () => {
    expect(ROUND_2).toMatchObject({
      title: 'ROUND 2 · SPAM FOLDER', wd: 40, wk: 0, ga: 1, gb: 0, yes: 'BLOCKED', no: 'INBOX',
      ma: 'SPAM LEAKED', mbl: 'REAL MAIL BLOCKED', sol: [47, 30],
      fa: 'Too much spam got through. Lower the threshold.',
      fb: 'Real mail got blocked. Raise the threshold or lower the caps weight.',
    });
    expect(ROUND_2.msgs).toHaveLength(8);
    expect(ROUND_2.msgs[6]).toEqual(['Great deal on shoes', 1, 0, 0, 1]);
    expect(ROUND_2.msgs[7]).toEqual(['URGENT: PE kit needed TODAY', 0, 1, 0, 0]);
    expect(ROUNDS).toEqual([ROUND_1, ROUND_2]);
  });

  it('keeps the v3 copy for X-RAY and the win summary', () => {
    expect(XRAY_LINE).toBe('X-RAY: the sliders are set to a good answer. Lock it in.');
    expect(WIN_SUMMARY).toMatch(/^A threshold is a trade-off\./);
  });
});

describe('m2g1 scoring', () => {
  it('score = 10 + wd·f1 + wC·caps + wk·f3', () => {
    expect(scoreOf(ROUND_1, ['x', 0, 0, 0, 0], 30)).toBe(10);
    expect(scoreOf(ROUND_1, ['x', 1, 1, 1, 1], 30)).toBe(10 + 30 + 30 + 20);
    expect(scoreOf(ROUND_1, ['x', 0, 1, 0, 0], 0)).toBe(10);
    expect(scoreOf(ROUND_2, ['x', 1, 1, 1, 1], 40)).toBe(10 + 40 + 40 + 0); // wk 0: 4th column unused
  });

  it('flags iff score ≥ threshold (boundary inclusive)', () => {
    const at60 = evaluate(ROUND_1, 60, 30);
    expect(at60.rows[1]).toMatchObject({ text: 'Project due tonight 11pm', score: 60, flagged: true });
    const at61 = evaluate(ROUND_1, 61, 30);
    expect(at61.rows[1]).toMatchObject({ score: 60, flagged: false, ok: false });
  });

  it('PARITY QUIRK: the v3 start (50,30) already passes both rounds (R1 A=0 B=1, R2 A=0 B=0)', () => {
    expect(evaluate(ROUND_1, 50, 30)).toMatchObject({ a: 0, b: 1, passes: true });
    expect(evaluate(ROUND_2, 50, 30)).toMatchObject({ a: 0, b: 0, passes: true });
    expect(lockIn(ROUND_1, THRESHOLD.start, CAPS_WEIGHT.start)).toEqual({ pass: true });
    expect(lockIn(ROUND_2, THRESHOLD.start, CAPS_WEIGHT.start)).toEqual({ pass: true });
  });

  it('the X-RAY solutions pass: (55,30) for R1 and (47,30) for R2', () => {
    expect(evaluate(ROUND_1, 55, 30).passes).toBe(true);
    expect(evaluate(ROUND_2, 47, 30).passes).toBe(true);
  });

  it('R1 at t=61, wC=30 fails with the missed-emergency message', () => {
    const v = evaluate(ROUND_1, 61, 30);
    expect(v.a).toBe(4);
    expect(lockIn(ROUND_1, 61, 30)).toEqual({ pass: false, message: 'A real emergency was missed. Lower the threshold.' });
  });

  it('too low a threshold fails with the false-alarm message (fb) when no emergency is missed', () => {
    const v = evaluate(ROUND_1, 0, 30); // everything flagged → A 0, B 4
    expect(v).toMatchObject({ a: 0, b: 4, passes: false });
    expect(lockIn(ROUND_1, 0, 30)).toEqual({ pass: false, message: ROUND_1.fb });
  });

  it('when both goals fail, the miss message is fa (A checked first)', () => {
    // R1 threshold 70 with caps 40: WIN PHONE 80 flagged (B 1, ok), emergencies at 60 missed (A 3) → fa.
    expect(lockIn(ROUND_1, 70, 40)).toEqual({ pass: false, message: ROUND_1.fa });
    // Edge: R2 at t=100 → all spam leaks (A 4 > 1).
    expect(lockIn(ROUND_2, 100, 30)).toEqual({ pass: false, message: ROUND_2.fa });
    // R2 caps weight 40, threshold 50: PE kit = 50 → blocked real mail (B 1 > 0).
    expect(lockIn(ROUND_2, 50, 40)).toEqual({ pass: false, message: ROUND_2.fb });
  });

  it('extremes: threshold 0 flags everything; threshold 100 flags nothing above 90', () => {
    expect(evaluate(ROUND_2, 0, 0).rows.every((r) => r.flagged)).toBe(true);
    expect(evaluate(ROUND_2, 100, 40).rows.some((r) => r.flagged)).toBe(false);
  });
});

describe('m2g1 FOCUS line', () => {
  it('names fa when A > ga', () => {
    expect(focusLine(ROUND_1, 61, 30)).toBe('FOCUS: A real emergency was missed. Lower the threshold.');
  });

  it('names fb when only B > gb', () => {
    expect(focusLine(ROUND_1, 0, 30)).toBe('FOCUS: Too many false alarms. Raise the threshold a little.');
    expect(focusLine(ROUND_2, 50, 40)).toBe('FOCUS: Real mail got blocked. Raise the threshold or lower the caps weight.');
  });

  it('says both goals are met when the setting already passes (deliberate change from v3)', () => {
    expect(focusLine(ROUND_1, 50, 30)).toBe(FOCUS_ALL_MET_LINE);
    expect(FOCUS_ALL_MET_LINE).toBe('FOCUS: this setting already meets both goals. Lock it in.');
  });
});

describe('m2g1 row label', () => {
  it('reads text, score, verdict and a WRONG tag on mismatched rows', () => {
    const v = evaluate(ROUND_1, 50, 30);
    expect(rowLabel(ROUND_1, v.rows[0]!, 'WRONG')).toBe('Mum: come home NOW!: score 60, URGENT');
    expect(rowLabel(ROUND_1, v.rows[7]!, 'WRONG')).toBe('WIN PHONE deadline today!!!: score 70, URGENT, WRONG');
    expect(rowLabel(ROUND_1, v.rows[5]!, 'WRONG')).toBe('Newsletter: weekly tips: score 10, WAIT');
  });
});
