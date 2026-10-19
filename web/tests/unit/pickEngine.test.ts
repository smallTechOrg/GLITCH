// Pick-the-line engine (game-runtime.md → Pick-the-line engine).
import { createPick, focus, isComplete, tap, targetCount, xray, type PickLine } from '@/dnd/pickEngine';

const lines: PickLine[] = [
  { text: 'NAME', isTarget: null, label: 'NAME' },
  { text: 'College: Maple Women\'s College', isTarget: true, note: 'Stands in for gender.' },
  { text: 'Skills: Python, SQL', isTarget: false, note: 'A real skill.' },
  { text: 'Postcode 40021', isTarget: true, note: 'Can stand in for race and income.' },
  { text: 'GPA 3.8', isTarget: false, note: 'A real result.' },
];

describe('pickEngine', () => {
  it('counts targets and marks a tapped target as found', () => {
    const s = createPick(lines);
    expect(targetCount(s)).toBe(2);
    const r = tap(s, 1);
    expect(r.result).toBe('found');
    expect(r.state.found).toBe(1);
    expect(r.state.marks[1]).toBe('target');
  });

  it('marks a tapped non-target safe without counting it', () => {
    const r = tap(createPick(lines), 2);
    expect(r.result).toBe('safe');
    expect(r.state.found).toBe(0);
    expect(r.state.marks[2]).toBe('safe');
  });

  it('ignores redacted lines, marked lines and out-of-range taps', () => {
    let s = createPick(lines);
    expect(tap(s, 0).result).toBe('ignored');
    s = tap(s, 1).state;
    expect(tap(s, 1).result).toBe('ignored');
    expect(tap(s, 99).result).toBe('ignored');
  });

  it('X-RAY catches the first unmarked target; FOCUS marks the first unmarked non-target safe', () => {
    let s = createPick(lines);
    const x = xray(s);
    expect(x.index).toBe(1);
    s = x.state;
    expect(xray(s).index).toBe(3);
    const f = focus(s);
    expect(f.index).toBe(2);
    expect(f.state.marks[2]).toBe('safe');
    expect(f.state.found).toBe(1);
    expect(focus(f.state).index).toBe(4);
  });

  it('is complete when all targets are found and powers then return null', () => {
    let s = createPick(lines);
    s = xray(s).state;
    s = xray(s).state;
    expect(isComplete(s)).toBe(true);
    expect(xray(s).index).toBeNull();
    s = focus(focus(s).state).state;
    expect(focus(s).index).toBeNull();
  });
});
