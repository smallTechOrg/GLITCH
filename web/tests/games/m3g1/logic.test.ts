// m3g1 · Proxy Hunt — v3 data + logic invariants (spec/GLITCH v3.html lines 550–557,
// spec/capabilities/v3-games.md → m3g1).
import { GAME_META } from '@/content/modules';
import { createPick, focus, isComplete, tap, targetCount, xray } from '@/dnd/pickEngine';
import {
  COUNTER_LABEL, FOCUS_LINE, FOUND_PREFIX, GOAL, INTRO, MISS_MESSAGE, PAPER_TAG, PROXY_COUNT,
  RESUME, SAFE_TAG, TARGET_TAG, TITLE, WIN_DELAY_MS, WIN_SUMMARY,
} from '@/games/m3g1/data';
import { foundLine, proxyIndices, realIndices, redactedIndices, resumeLines } from '@/games/m3g1/logic';

describe('m3g1 data (v3 verbatim)', () => {
  it('keeps the v3 title, goal and intro (and matches the course metadata)', () => {
    expect(TITLE).toBe('Proxy Hunt');
    expect(GOAL).toBe('SPOT THE ERROR · FIND 5 PROXIES');
    expect(INTRO).toBe('Name and gender are hidden. Tap the 5 lines that still give gender away.');
    expect(GAME_META.m3g1).toEqual({ title: TITLE, goal: GOAL, intro: INTRO });
  });

  it('has the 11 v3 resume lines in order', () => {
    expect(RESUME.map((r) => r[0])).toEqual([
      'NAME',
      'GENDER',
      "College: Maple Women's College",
      "Captain, Girls' Football Team",
      'Career break: 18 months',
      'Postcode 40021',
      'Hobby: Netball and Zumba',
      'Skills: Python, SQL',
      'Built a weather app',
      'GPA 3.8',
      'Data Analyst intern, 6 months',
    ]);
  });

  it('keeps the v3 notes for every interactive line', () => {
    expect(RESUME.slice(2).map((r) => r[2])).toEqual([
      'Stands in for gender.',
      'Stands in for gender.',
      'Can stand in for gender and caregiving.',
      'Can stand in for race and income.',
      'Can stand in for gender.',
      'A real skill.',
      'A real project.',
      'A real result.',
      'Real experience.',
    ]);
  });

  it('keeps the v3 copy for the paper, counter, tags, miss, FOCUS, found line and summary', () => {
    expect(PAPER_TAG).toBe('ANAYA · RESUME · SCREENED BY AI');
    expect(COUNTER_LABEL).toBe('PROXIES FOUND');
    expect(TARGET_TAG).toBe('PROXY');
    expect(SAFE_TAG).toBe('OK');
    expect(MISS_MESSAGE).toBe('That line measures ability, not who she is.');
    expect(FOCUS_LINE).toBe('FOCUS: that one is a real skill. Skip it.');
    expect(FOUND_PREFIX).toBe('Proxy found! ');
    expect(WIN_SUMMARY).toBe(
      'A proxy variable correlates with a sensitive trait. Deleting the trait does not delete the proxy, so the model can still learn the same bias.',
    );
    expect(WIN_DELAY_MS).toBe(700);
  });
});

describe('m3g1 logic', () => {
  it('lines 1–2 (NAME, GENDER) are redacted and non-interactive', () => {
    expect(redactedIndices()).toEqual([0, 1]);
    const lines = resumeLines();
    expect(lines[0]).toEqual({ text: 'NAME', label: 'NAME', isTarget: null });
    expect(lines[1]).toEqual({ text: 'GENDER', label: 'GENDER', isTarget: null });
  });

  it('proxies are lines 3–7 (0-based 2..6) and real signals are lines 8–11 (7..10)', () => {
    expect(proxyIndices()).toEqual([2, 3, 4, 5, 6]);
    expect(realIndices()).toEqual([7, 8, 9, 10]);
    expect(PROXY_COUNT).toBe(5);
    expect(targetCount(createPick(resumeLines()))).toBe(5);
  });

  it('the found line is "Proxy found! " + the note', () => {
    const l = resumeLines()[5];
    expect(l).toBeDefined();
    expect(foundLine(l!)).toBe('Proxy found! Can stand in for race and income.');
  });

  it('tapping a redacted line is ignored by the engine', () => {
    const s = createPick(resumeLines());
    expect(tap(s, 0).result).toBe('ignored');
    expect(tap(s, 1).result).toBe('ignored');
  });

  it('tapping all five proxies completes the hunt; real lines never count', () => {
    let s = createPick(resumeLines());
    for (const i of realIndices()) {
      const r = tap(s, i);
      expect(r.result).toBe('safe');
      s = r.state;
    }
    expect(s.found).toBe(0);
    for (const i of proxyIndices()) {
      const r = tap(s, i);
      expect(r.result).toBe('found');
      s = r.state;
    }
    expect(isComplete(s)).toBe(true);
  });

  it('X-RAY takes proxies in v3 order and FOCUS takes real lines in v3 order, then return none', () => {
    let s = createPick(resumeLines());
    const xs: (number | null)[] = [];
    for (let k = 0; k < 6; k++) {
      const r = xray(s);
      xs.push(r.index);
      s = r.state;
    }
    expect(xs).toEqual([2, 3, 4, 5, 6, null]);
    let f = createPick(resumeLines());
    const fs: (number | null)[] = [];
    for (let k = 0; k < 5; k++) {
      const r = focus(f);
      fs.push(r.index);
      f = r.state;
    }
    expect(fs).toEqual([7, 8, 9, 10, null]);
  });
});
