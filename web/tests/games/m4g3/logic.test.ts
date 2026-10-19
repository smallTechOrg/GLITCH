// m4g3 · Design the Companion — v3 maths, targets, ordered failures (spec/GLITCH v3.html lines 581–592).
import game from '@/games/m4g3';
import {
  FOCUS_ALL_MET, METRICS, SHIPPED_LINE, START_DESIGN, SUMMARY, TOGGLES, XRAY_DESIGN, XRAY_LINE, type Design,
} from '@/games/m4g3/data';
import { calc, failures, flip, focusHint, metricMet, setLevel, ship } from '@/games/m4g3/logic';

const D = (e: number, d: number, R: 0 | 1 = 0, H: 0 | 1 = 0, A: 0 | 1 = 0): Design => ({ e, d, R, H, A });

describe('m4g3 data (v3 verbatim)', () => {
  it('has the v3 title, goal and intro and is a module 4 game', () => {
    expect(game.id).toBe('m4g3');
    expect(game.module).toBe(4);
    expect(game.title).toBe('Design the Companion');
    expect(game.goal).toBe('SIMULATE · HIT ALL 5 TARGETS');
    expect(game.intro).toBe('Design a chatbot companion for teens. Balance engagement, data and safety.');
  });

  it('starts with both sliders at 80 and every safeguard off', () => {
    expect(START_DESIGN).toEqual({ e: 80, d: 80, R: 0, H: 0, A: 0 });
  });

  it('has the three v3 safeguards', () => {
    expect(TOGGLES.map((t) => [t.id, t.label])).toEqual([
      ['R', 'Refers teens to a trusted adult'],
      ['H', 'Human review of chats'],
      ['A', '"I am an AI" reminders'],
    ]);
  });

  it('has the five v3 metrics, targets, directions and failure phrases in order', () => {
    expect(METRICS.map((m) => [m.testId, m.label, m.target, m.dir, m.failure])).toEqual([
      ['k1', 'TIME ON APP', 30, 1, 'People barely use it'],
      ['k2', 'WELLBEING', 65, 1, 'wellbeing is too low'],
      ['k3', 'REAL FRIENDSHIPS', 55, 1, 'it replaces real friends'],
      ['k4', 'PRIVACY RISK', 35, -1, 'privacy risk is too high'],
      ['k5', 'HELPFULNESS', 50, 1, "it isn't helpful enough"],
    ]);
    expect(SHIPPED_LINE).toBe('Shipped. You balanced every trade-off.');
    expect(XRAY_LINE).toBe('X-RAY: here is a balanced design. Ship it.');
    expect(SUMMARY).toBe('Optimizing one number, like engagement, does not make the right decision. Responsible design balances trade-offs and keeps humans in the loop.');
  });
});

describe('m4g3 formulas', () => {
  it('computes time / wellbeing / friendships / privacy / helpfulness exactly as v3', () => {
    for (const d of [D(0, 0), D(80, 80), D(30, 30, 1, 1, 1), D(55, 12, 1, 0, 1), D(100, 100, 0, 1, 0)]) {
      const c = calc(d);
      expect(c.time).toBeCloseTo(20 + 0.7 * d.e, 10);
      expect(c.well).toBeCloseTo(95 - 0.9 * d.e + 12 * d.R + 6 * d.A, 10);
      expect(c.fr).toBeCloseTo(90 - 0.9 * d.e + 15 * d.R, 10);
      expect(c.pv).toBeCloseTo(10 + 0.8 * d.d - 15 * d.H, 10);
      expect(c.help).toBeCloseTo(40 + 0.4 * d.d + 0.2 * d.e, 10);
    }
  });

  it('start design reads 76 / 23 / 18 / 74 / 88 and fails with "Not yet: wellbeing is too low."', () => {
    const c = calc(START_DESIGN);
    expect([c.time, c.well, c.fr, c.pv, c.help].map(Math.round)).toEqual([76, 23, 18, 74, 88]);
    expect(failures(START_DESIGN)).toEqual(['wellbeing is too low', 'it replaces real friends', 'privacy risk is too high']);
    expect(ship(START_DESIGN)).toEqual({ ok: false, message: 'Not yet: wellbeing is too low.' });
  });

  it('the X-RAY design (30, 30, all on) reads 41 / 86 / 78 / 19 / 58 and passes', () => {
    expect(XRAY_DESIGN).toEqual({ e: 30, d: 30, R: 1, H: 1, A: 1 });
    const c = calc(XRAY_DESIGN);
    expect([c.time, c.well, c.fr, c.pv, c.help].map(Math.round)).toEqual([41, 86, 78, 19, 58]);
    expect(failures(XRAY_DESIGN)).toEqual([]);
    expect(ship(XRAY_DESIGN)).toEqual({ ok: true });
  });

  it('the game is solvable from the v3 slider range (0..100 integers) — and only with low engagement', () => {
    let passing = 0;
    let maxE = -1;
    const bits: (0 | 1)[] = [0, 1];
    for (let e = 0; e <= 100; e++)
      for (let d = 0; d <= 100; d++)
        for (const R of bits) for (const H of bits) for (const A of bits) {
          if (ship(D(e, d, R, H, A)).ok) {
            passing++;
            maxE = Math.max(maxE, e);
          }
        }
    expect(passing).toBeGreaterThan(0);
    // wellbeing ≥ 65 needs e ≤ 53 even with R and A on (95 − 0.9e + 18 ≥ 65 → e ≤ 53.3)
    expect(maxE).toBe(53);
  });

  it('failure messages follow v3 order (time first)', () => {
    expect(ship(D(0, 0))).toEqual({ ok: false, message: 'Not yet: People barely use it.' });
    expect(ship(D(30, 80, 1, 0, 1))).toEqual({ ok: false, message: 'Not yet: privacy risk is too high.' });
    expect(ship(D(30, 0, 1, 1, 1))).toEqual({ ok: false, message: "Not yet: it isn't helpful enough." });
    expect(ship(D(40, 30, 0, 1, 1))).toEqual({ ok: false, message: 'Not yet: it replaces real friends.' });
    expect(ship(D(40, 30, 1, 1, 0)).ok).toBe(true);
    expect(ship(D(45, 30, 0, 1, 1))).toEqual({ ok: false, message: 'Not yet: wellbeing is too low.' });
  });

  it('uses unrounded values at the boundaries', () => {
    // time: e=14 → 29.8 (fails though it displays 30), e=15 → 30.5
    expect(metricMet('time', calc(D(14, 0)).time)).toBe(false);
    expect(Math.round(calc(D(14, 0)).time)).toBe(30);
    expect(metricMet('time', calc(D(15, 0)).time)).toBe(true);
    // privacy: d=50 with human review → exactly 35 → met (≤)
    expect(calc(D(0, 50, 0, 1)).pv).toBe(35);
    expect(metricMet('pv', 35)).toBe(true);
    expect(metricMet('pv', 35.0001)).toBe(false);
    // wellbeing: e=33 → 65.3 met; e=34 → 64.4 not met
    expect(metricMet('well', calc(D(33, 0)).well)).toBe(true);
    expect(metricMet('well', calc(D(34, 0)).well)).toBe(false);
    expect(metricMet('help', 50)).toBe(true);
  });
});

describe('m4g3 FOCUS + editing helpers', () => {
  it('FOCUS names the first failure, or says all targets are met', () => {
    expect(focusHint(START_DESIGN)).toBe('FOCUS: wellbeing is too low. Try less engagement push, or turn on a safeguard.');
    expect(focusHint(XRAY_DESIGN)).toBe(FOCUS_ALL_MET);
    expect(FOCUS_ALL_MET).toBe('FOCUS: all targets met. Ship it!');
  });

  it('flip toggles one safeguard; setLevel clamps to 0..100', () => {
    expect(flip(START_DESIGN, 'H')).toEqual({ ...START_DESIGN, H: 1 });
    expect(flip(flip(START_DESIGN, 'H'), 'H')).toEqual(START_DESIGN);
    expect(setLevel(START_DESIGN, 'e', 130).e).toBe(100);
    expect(setLevel(START_DESIGN, 'd', -5).d).toBe(0);
  });
});
