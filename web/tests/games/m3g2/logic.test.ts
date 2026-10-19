// m3g2 · Fairness Lab — v3 data + maths invariants (spec/GLITCH v3.html lines 558–568,
// spec/capabilities/v3-games.md → m3g2).
import { GAME_META } from '@/content/modules';
import {
  ACCURACY_BASE, ACCURACY_GOAL, AUDIT_LABEL, FEATURES, GAP_BASE, GAP_GOAL, GOAL, HEADING, INTRO,
  MEN_LABEL, MEN_SHORTLISTED, PASS_LINE, PROXY_ACCURACY_BONUS, RULE_LINE, TITLE, WIN_DELAY_MS,
  WIN_SUMMARY, WOMEN_LABEL, accuracyFailMessage, focusLine, gapFailMessage, xrayLine,
} from '@/games/m3g2/data';
import {
  FEATURE_IDS, audit, calc, correctState, focusTarget, initialOn, passes, toggle, womenShortlisted,
  xrayFix, type OnMap,
} from '@/games/m3g2/logic';

const allCombos = (): OnMap[] => {
  const out: OnMap[] = [];
  for (let mask = 0; mask < 1 << FEATURE_IDS.length; mask++) {
    const on = {} as OnMap;
    FEATURE_IDS.forEach((id, i) => {
      on[id] = (mask & (1 << i)) !== 0;
    });
    out.push(on);
  }
  return out;
};

const only = (ids: readonly string[]): OnMap => {
  const on = {} as OnMap;
  for (const id of FEATURE_IDS) on[id] = ids.includes(id);
  return on;
};
const SKILLS = ['code', 'gpa', 'int'] as const;
const PROXIES = ['col', 'cap', 'brk', 'pc'] as const;

describe('m3g2 data (v3 verbatim)', () => {
  it('keeps the v3 title, goal and intro (and matches the course metadata)', () => {
    expect(TITLE).toBe('Fairness Lab');
    expect(GOAL).toBe('SIMULATE · GAP ≤ 6 · ACCURACY ≥ 80');
    expect(INTRO).toBe('Switch features on or off. Fix the gap without wrecking accuracy.');
    expect(GAME_META.m3g2).toEqual({ title: TITLE, goal: GOAL, intro: INTRO });
  });

  it('has the 7 v3 features with kinds and weights in list order', () => {
    expect(FEATURES).toEqual([
      ['code', 'Coding test score', 's', 14],
      ['gpa', 'GPA', 's', 10],
      ['int', 'Internship', 's', 12],
      ['col', "Women's college", 'p', 10],
      ['cap', "Girls' team captain", 'p', 6],
      ['brk', 'Career break', 'p', 8],
      ['pc', 'Postcode', 'p', 5],
    ]);
    expect(FEATURE_IDS).toEqual(['code', 'gpa', 'int', 'col', 'cap', 'brk', 'pc']);
  });

  it('keeps the v3 constants and copy', () => {
    expect(ACCURACY_BASE).toBe(50);
    expect(GAP_BASE).toBe(2);
    expect(PROXY_ACCURACY_BONUS).toBe(2);
    expect(MEN_SHORTLISTED).toBe(48);
    expect(GAP_GOAL).toBe(6);
    expect(ACCURACY_GOAL).toBe(80);
    expect(WIN_DELAY_MS).toBe(500);
    expect(HEADING).toBe('THE SCREENER · FEATURES');
    expect(RULE_LINE).toBe('Which inputs does the AI use? Skill features measure ability. The rest may be proxies.');
    expect(AUDIT_LABEL).toBe('RUN AUDIT ▶');
    expect(MEN_LABEL).toBe('MEN SHORTLISTED');
    expect(WOMEN_LABEL).toBe('WOMEN SHORTLISTED');
    expect(PASS_LINE).toBe('Audit passed. Fair and accurate.');
    expect(gapFailMessage(31)).toBe('The gap is still 31 points. Some proxies are still switched on.');
    expect(accuracyFailMessage(76)).toBe('Accuracy fell to 76%. Keep the skill features on.');
    expect(xrayLine('Postcode')).toBe('X-RAY: I fixed Postcode.');
    expect(focusLine("Women's college")).toBe("FOCUS: Women's college is still on, and it can stand in for gender.");
    expect(WIN_SUMMARY).toBe(
      'Removing the sensitive column is not enough. Remove the proxies, keep the real skill signals, then test outcomes for each group.',
    );
  });
});

describe('m3g2 maths', () => {
  it('starts with every feature ON: accuracy 94, gap 31, women 17%', () => {
    const on = initialOn();
    expect(Object.values(on).every(Boolean)).toBe(true);
    expect(calc(on)).toEqual({ accuracy: 94, gap: 31 });
    expect(womenShortlisted(calc(on))).toBe(17);
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
      expect(womenShortlisted(calc(on))).toBe(48 - gap);
    }
  });

  it('everything off gives accuracy 50 and gap 2', () => {
    expect(calc(only([]))).toEqual({ accuracy: 50, gap: 2 });
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
    const passing = combos.filter((on) => passes(calc(on)));
    expect(passing).toEqual([only(SKILLS)]);
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
    expect(audit(only(['code', 'int']))).toEqual({ pass: false, message: 'Accuracy fell to 76%. Keep the skill features on.' });
  });

  it('the gap message wins when both goals fail', () => {
    const on = only(['col']);
    expect(calc(on)).toEqual({ accuracy: 52, gap: 12 });
    expect(audit(on)).toEqual({ pass: false, message: 'The gap is still 12 points. Some proxies are still switched on.' });
  });

  it('the start audit fails with "The gap is still 31 points…"', () => {
    expect(audit(initialOn()).message).toBe('The gap is still 31 points. Some proxies are still switched on.');
  });

  it('toggle flips one feature and never mutates its input', () => {
    const a = initialOn();
    const b = toggle(a, 'col');
    expect(a.col).toBe(true);
    expect(b.col).toBe(false);
    expect(toggle(b, 'col').col).toBe(true);
    expect({ ...b, col: true }).toEqual(a);
  });

  it('correctState is ON for skills and OFF for proxies', () => {
    expect(FEATURE_IDS.map(correctState)).toEqual([true, true, true, false, false, false, false]);
  });
});

describe('m3g2 powers', () => {
  it('X-RAY fixes the first feature (list order) not in its correct state', () => {
    const r = xrayFix(initialOn());
    expect(r?.id).toBe('col');
    expect(r?.name).toBe("Women's college");
    expect(r?.on.col).toBe(false);
    const offSkill = { ...only(SKILLS), gpa: false };
    expect(xrayFix(offSkill)?.id).toBe('gpa');
    expect(xrayFix(offSkill)?.on.gpa).toBe(true);
  });

  it('X-RAY repeated from the start reaches the unique passing set in 4 steps, then returns null', () => {
    let on = initialOn();
    const fixed: string[] = [];
    for (;;) {
      const r = xrayFix(on);
      if (!r) break;
      fixed.push(r.id);
      on = r.on;
    }
    expect(fixed).toEqual(['col', 'cap', 'brk', 'pc']);
    expect(passes(calc(on))).toBe(true);
    expect(xrayFix(on)).toBeNull();
  });

  it('FOCUS targets the first proxy still on, else null (skills off do not count)', () => {
    expect(focusTarget(initialOn())?.id).toBe('col');
    expect(focusTarget(only([...SKILLS, 'brk', 'pc']))).toEqual({ id: 'brk', name: 'Career break' });
    expect(focusTarget(only(SKILLS))).toBeNull();
    expect(focusTarget(only([]))).toBeNull();
  });
});
