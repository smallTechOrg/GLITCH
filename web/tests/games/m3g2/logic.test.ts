// m3g2 · Fairness Lab — case data + maths invariants (spec/capabilities/v3-games.md → m3g2).
import { GAME_META } from '@/content/modules';
import {
  ACCURACY_BASE, ACCURACY_GOAL, AUDIT_A11Y_LABEL, AUDIT_LABEL, CASES, FEATURES, GAP_BASE, GAP_GOAL,
  MEN_SHORTLISTED, PASS_LINE, PROXY_ACCURACY_BONUS, WIN_DELAY_MS,
  accuracyFailMessage, caseFor, focusLine, focusSkillLine, gapFailMessage, xrayLine, type FairnessCase, type Feature,
} from '@/games/m3g2/data';
import {
  audit, auditMistake, calc, correctState, decisionMistake, focusTarget, groupBShare, initialOn, passes, toggle,
  xrayFix, type OnMap,
} from '@/games/m3g2/logic';

const FEATURE_IDS = FEATURES.map((f) => f[0]);

function allCombos(features: readonly Feature[] = FEATURES): OnMap[] {
  const out: OnMap[] = [];
  for (let mask = 0; mask < 1 << features.length; mask++) {
    out.push(Object.fromEntries(features.map((f, i) => [f[0], (mask & (1 << i)) !== 0])));
  }
  return out;
}

const only = (ids: readonly string[], features: readonly Feature[] = FEATURES): OnMap => Object.fromEntries(features.map((f) => [f[0], ids.includes(f[0])]));
const SKILLS = ['code', 'gpa', 'int'] as const;
const PROXIES = ['col', 'cap', 'brk', 'pc'] as const;
const skillsOf = (c: FairnessCase): string[] => c.features.filter((f) => f[2] === 's').map((f) => f[0]);

describe('m3g2 data', () => {
  it('has the course metadata with a plain mission', () => {
    expect(GAME_META.m3g2.title).toBe('Fairness Lab');
    expect(GAME_META.m3g2.goal).toBe('MISSION: Gap 6 or less, accuracy 80 or more, then make the call');
    expect(GAME_META.m3g2.intro).toBe('Every input starts OFF. Choose what the AI may use.');
  });

  it('has the 7 v3 hiring features with kinds and weights in list order', () => {
    expect(FEATURES).toEqual([
      ['code', 'Coding test score', 's', 14],
      ['gpa', 'GPA', 's', 10],
      ['int', 'Internship', 's', 12],
      ['col', "Women's college", 'p', 10],
      ['cap', "Girls' team captain", 'p', 6],
      ['brk', 'Career break', 'p', 8],
      ['pc', 'Postcode', 'p', 5],
    ]);
  });

  it('keeps the constants and copy', () => {
    expect(ACCURACY_BASE).toBe(50);
    expect(GAP_BASE).toBe(2);
    expect(PROXY_ACCURACY_BONUS).toBe(2);
    expect(MEN_SHORTLISTED).toBe(48);
    expect(GAP_GOAL).toBe(6);
    expect(ACCURACY_GOAL).toBe(80);
    expect(WIN_DELAY_MS).toBe(500);
    expect(AUDIT_LABEL).toBe('RUN AUDIT ▶');
    expect(AUDIT_A11Y_LABEL).toBe('RUN AUDIT');
    expect(PASS_LINE).toBe('Audit passed. Fair and accurate. One more call to make.');
    expect(gapFailMessage(31)).toBe('The gap is still 31 points. Some proxies are still switched on.');
    expect(accuracyFailMessage(76)).toBe('Accuracy is only 76%. Switch on more inputs that really measure this.');
    expect(xrayLine('Postcode')).toBe('X-RAY: I fixed Postcode.');
    expect(focusLine("Women's college", 'gender')).toBe("FOCUS: Women's college is on, and it can stand in for gender.");
    expect(focusSkillLine('GPA')).toBe('FOCUS: GPA really measures this. It should be on.');
  });
});

describe('m3g2 cases', () => {
  it('has five cases raising five different ethical concerns, hiring first', () => {
    expect(CASES.map((c) => c.id)).toEqual(['hiring', 'loans', 'triage', 'grades', 'speech']);
    expect(CASES[0]?.features).toBe(FEATURES);
    expect(new Set(CASES.map((c) => c.concern)).size).toBe(CASES.length);
    expect(new Set(CASES.map((c) => c.question)).size).toBe(CASES.length);
    expect(new Set(CASES.map((c) => c.summary)).size).toBe(CASES.length);
  });

  it('caseFor rotates through every case by number cleared, then wraps', () => {
    expect(CASES.map((_, i) => caseFor(i).id)).toEqual(CASES.map((c) => c.id));
    expect(caseFor(CASES.length).id).toBe(CASES[0]?.id);
    expect(caseFor(CASES.length + 2).id).toBe(CASES[2]?.id);
  });

  describe.each(CASES.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    it('starts with every input off, and that start does not pass the audit', () => {
      const on = initialOn(c.features);
      expect(Object.keys(on)).toHaveLength(c.features.length);
      expect(Object.values(on).every((v) => v === false)).toBe(true);
      expect(calc(on, c.features)).toEqual({ accuracy: 50, gap: 2 });
      expect(audit(on, c.features).pass).toBe(false);
    });

    it('is solvable with exactly one input set: all skills on, all proxies off', () => {
      const passing = allCombos(c.features).filter((on) => passes(calc(on, c.features)));
      expect(passing).toEqual([only(skillsOf(c), c.features)]);
      expect(audit(passing[0]!, c.features)).toEqual({ pass: true, message: PASS_LINE });
    });

    it('has unique input ids and exactly one right option among a, b, c', () => {
      expect(new Set(c.features.map((f) => f[0])).size).toBe(c.features.length);
      expect(c.options.map((o) => o.id)).toEqual(['a', 'b', 'c']);
      expect(c.options.filter((o) => o.right)).toHaveLength(1);
    });

    it('X-RAY reaches the passing set from the start', () => {
      let on = initialOn(c.features);
      for (;;) {
        const r = xrayFix(on, c.features);
        if (!r) break;
        on = r.on;
      }
      expect(passes(calc(on, c.features))).toBe(true);
    });

    it('a wrong decision is never explainable, and carries both option texts', () => {
      const wrong = c.options.find((o) => !o.right)!;
      const right = c.options.find((o) => o.right)!;
      expect(decisionMistake(c, wrong)).toEqual({
        itemId: `decide-${c.id}`, answer: wrong.id, correct: right.id, concept: 'Algorithmic discrimination',
        itemText: c.question, answerLabel: wrong.text, correctLabel: right.text, explain: false,
      });
    });
  });

  it('only the hiring audit is explainable: the API has no content for the others', () => {
    for (const c of CASES) {
      expect(auditMistake(initialOn(c.features), c)?.explain).toBe(c.id === 'hiring');
      expect(auditMistake(initialOn(c.features), c)?.itemText).toBe(c.auditText);
      expect(auditMistake(only(skillsOf(c), c.features), c)).toBeUndefined();
    }
  });
});

describe('m3g2 maths', () => {
  it('starts with every feature OFF: accuracy 50, gap 2, group B 46%', () => {
    const on = initialOn();
    expect(Object.values(on).every((v) => !v)).toBe(true);
    expect(calc(on)).toEqual({ accuracy: 50, gap: 2 });
    expect(groupBShare(calc(on))).toBe(46);
    expect(passes(calc(on))).toBe(false);
  });

  it('accuracy = 50 + Σ skill weights on + 2·(proxies on); gap = 2 + Σ proxy weights on', () => {
    for (const on of allCombos()) {
      let acc = 50;
      let gap = 2;
      for (const [id, , kind, w] of FEATURES) {
        if (!on[id]) continue;
        if (kind === 's') acc += w;
        else {
          acc += 2;
          gap += w;
        }
      }
      expect(calc(on)).toEqual({ accuracy: acc, gap });
      expect(groupBShare(calc(on))).toBe(48 - gap);
    }
  });

  it('the v3 configuration is solvable: all skills on, all proxies off → accuracy 86, gap 2, passes', () => {
    const sol = only(SKILLS);
    expect(calc(sol)).toEqual({ accuracy: 86, gap: 2 });
    expect(passes(calc(sol))).toBe(true);
    expect(audit(sol)).toEqual({ pass: true, message: PASS_LINE });
  });

  it('an exhaustive check of all 128 toggle combinations finds exactly one passing set', () => {
    const combos = allCombos();
    expect(combos).toHaveLength(128);
    expect(combos.filter((on) => passes(calc(on)))).toEqual([only(SKILLS)]);
  });

  it('the pass check is exact at the boundaries: gap 6 passes, 7 fails; accuracy 80 passes, 79 fails', () => {
    expect(passes({ gap: 6, accuracy: 80 })).toBe(true);
    expect(passes({ gap: 7, accuracy: 80 })).toBe(false);
    expect(passes({ gap: 6, accuracy: 79 })).toBe(false);
    expect(passes({ gap: 2, accuracy: 100 })).toBe(true);
  });

  it('any single proxy on (with all skills) → gap ≥ 7 and the audit fails on the gap', () => {
    for (const p of PROXIES) {
      const on = only([...SKILLS, p]);
      const c = calc(on);
      expect(c.gap).toBeGreaterThanOrEqual(7);
      expect(audit(on)).toEqual({ pass: false, message: gapFailMessage(c.gap) });
    }
    expect(calc(only([...SKILLS, 'pc'])).gap).toBe(7);
  });

  it('any skill off with proxies off → accuracy ≤ 76 and the audit fails on accuracy', () => {
    for (const s of SKILLS) {
      const on = only(SKILLS.filter((x) => x !== s));
      const c = calc(on);
      expect(c.accuracy).toBeLessThanOrEqual(76);
      expect(c.gap).toBe(2);
      expect(audit(on)).toEqual({ pass: false, message: accuracyFailMessage(c.accuracy) });
    }
  });

  it('the gap message wins when both goals fail', () => {
    const on = only(['col']);
    expect(calc(on)).toEqual({ accuracy: 52, gap: 12 });
    expect(audit(on)).toEqual({ pass: false, message: 'The gap is still 12 points. Some proxies are still switched on.' });
  });

  it('the start audit fails on accuracy, since no proxy is on', () => {
    expect(audit(initialOn()).message).toBe(accuracyFailMessage(50));
  });

  it('toggle flips one feature and never mutates its input', () => {
    const a = initialOn();
    const b = toggle(a, 'col');
    expect(a.col).toBe(false);
    expect(b.col).toBe(true);
    expect(toggle(b, 'col').col).toBe(false);
  });

  it('correctState is ON for skills and OFF for proxies', () => {
    expect(correctState('s')).toBe(true);
    expect(correctState('p')).toBe(false);
    expect(FEATURE_IDS).toEqual(['code', 'gpa', 'int', 'col', 'cap', 'brk', 'pc']);
  });
});

describe('m3g2 powers', () => {
  it('X-RAY fixes the first feature (list order) not in its correct state', () => {
    const r = xrayFix(initialOn());
    expect(r?.id).toBe('code');
    expect(r?.name).toBe('Coding test score');
    expect(r?.on.code).toBe(true);
    expect(xrayFix(only([...SKILLS, 'brk']))?.id).toBe('brk');
    expect(xrayFix(only([...SKILLS, 'brk']))?.on.brk).toBe(false);
  });

  it('X-RAY repeated from the start reaches the passing set in 3 steps, then returns null', () => {
    let on = initialOn();
    const fixed: string[] = [];
    for (;;) {
      const r = xrayFix(on);
      if (!r) break;
      fixed.push(r.id);
      on = r.on;
    }
    expect(fixed).toEqual(['code', 'gpa', 'int']);
    expect(passes(calc(on))).toBe(true);
    expect(xrayFix(on)).toBeNull();
  });

  it('FOCUS targets a proxy still on first, then a skill still off, else null', () => {
    expect(focusTarget(only(['code', 'brk', 'pc']))).toEqual({ id: 'brk', name: 'Career break', kind: 'p' });
    expect(focusTarget(initialOn())).toEqual({ id: 'code', name: 'Coding test score', kind: 's' });
    expect(focusTarget(only(['code']))?.id).toBe('gpa');
    expect(focusTarget(only(SKILLS))).toBeNull();
  });
});
