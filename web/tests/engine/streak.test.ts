import { applyDailyStreak, localDay, previousDay } from '@/engine/streak';
import { runDaily } from '@/engine/rewards';
import { createInitialState } from '@/state/migrate';

const at = (y: number, m: number, d: number, h = 9): Date => new Date(y, m - 1, d, h, 0, 0);

describe('daily streak (injected clock)', () => {
  it('formats the local day as YYYY-MM-DD and finds yesterday across month/year edges', () => {
    expect(localDay(at(2026, 3, 5))).toBe('2026-03-05');
    expect(previousDay(at(2026, 3, 1))).toBe('2026-02-28');
    expect(previousDay(at(2027, 1, 1))).toBe('2026-12-31');
  });

  it('a fresh device starts at streak 1, best 1 and +10 XP "DAILY x1"', () => {
    const s = createInitialState();
    const r = runDaily(s, at(2026, 10, 20));
    expect(r).toEqual({ awarded: 10, toasts: ['+10 XP · DAILY x1'] });
    expect(s.xp).toBe(10);
    expect(s.streak).toEqual({ current: 1, best: 1, lastPlayDay: '2026-10-20' });
  });

  it('last day = yesterday → streak + 1 and best follows', () => {
    const s = createInitialState();
    s.streak = { current: 2, best: 2, lastPlayDay: '2026-10-19' };
    expect(runDaily(s, at(2026, 10, 20)).toasts).toEqual(['+10 XP · DAILY x3', 'BADGE · 3-DAY STREAK']);
    expect(s.streak).toEqual({ current: 3, best: 3, lastPlayDay: '2026-10-20' });
    expect(s.badges.streak).toBeDefined();
  });

  it('last day = 3 days ago → streak resets to 1 but best is kept', () => {
    const s = createInitialState();
    s.streak = { current: 5, best: 7, lastPlayDay: '2026-10-17' };
    applyDailyStreak(s, at(2026, 10, 20));
    expect(s.streak).toEqual({ current: 1, best: 7, lastPlayDay: '2026-10-20' });
  });

  it('same day → no change and no XP', () => {
    const s = createInitialState();
    runDaily(s, at(2026, 10, 20, 8));
    const r = runDaily(s, at(2026, 10, 20, 23));
    expect(r).toEqual({ awarded: 0, toasts: [] });
    expect(s.xp).toBe(10);
    expect(s.streak.current).toBe(1);
  });
});
