import { addXp, levelOf, xpIntoLevel, xpToast } from '@/engine/xp';
import { createInitialState } from '@/state/migrate';

describe('xp + levels', () => {
  it('level = floor(xp/100)+1 and the bar shows xp mod 100', () => {
    expect([0, 99, 100, 199, 200, 535].map(levelOf)).toEqual([1, 1, 2, 2, 3, 6]);
    expect([0, 10, 99, 100, 245].map(xpIntoLevel)).toEqual([0, 10, 99, 0, 45]);
    expect(levelOf(-5)).toBe(1);
  });

  it('toasts "+n XP · REASON" and "LEVEL UP! LVL n" only when a boundary is crossed', () => {
    const s = createInitialState();
    s.xp = 90;
    expect(addXp(s, 5, 'DAILY x1')).toEqual(['+5 XP · DAILY x1']);
    expect(addXp(s, 5, 'GAME CLEAR')).toEqual(['+5 XP · GAME CLEAR', 'LEVEL UP! LVL 2']);
    expect(s.xp).toBe(100);
    s.xp = 190;
    expect(addXp(s, 30, 'GAME CLEAR')).toEqual(['+30 XP · GAME CLEAR', 'LEVEL UP! LVL 3']);
    expect(xpToast(10)).toBe('+10 XP');
  });

  it('never subtracts XP from a negative or fractional award', () => {
    const s = createInitialState();
    addXp(s, -20, 'X');
    addXp(s, 2.9, 'X');
    expect(s.xp).toBe(2);
  });
});
