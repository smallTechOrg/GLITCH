import type { PowerHandlers } from '@/contracts/game';
import {
  NOTHING_TO_USE, REWIND_LINE, SHIELD_LINE, applyMiss, applyPower, applyWin, canUsePower,
  createSession, heartsLabel, powerLabel, starsFor,
} from '@/engine/session';

describe('game session', () => {
  it('a new session has hearts 3, power uses 2, no shield, lost 0, playing', () => {
    expect(createSession('m1g1', 'scout')).toEqual({ gameId: 'm1g1', hero: 'scout', hearts: 3, lost: 0, shield: false, powerUses: 2, status: 'playing' });
  });

  it('miss without shield: hearts −1, lost +1, bad bubble (default "Not quite.")', () => {
    const r = applyMiss(createSession('m1g1', 'scout'));
    expect(r.session).toMatchObject({ hearts: 2, lost: 1 });
    expect(r.line).toEqual({ text: 'Not quite.', mood: 'bad' });
    expect(applyMiss(r.session, 'Wrong bin.').line).toEqual({ text: 'Wrong bin.', mood: 'bad' });
  });

  it('miss with shield up keeps hearts 3 and lost 0, drops the shield, says "SHIELDED! "+msg', () => {
    const s = { ...createSession('m1g1', 'guard'), shield: true };
    const r = applyMiss(s, 'Look again.');
    expect(r.session).toMatchObject({ hearts: 3, lost: 0, shield: false });
    expect(r.line).toEqual({ text: 'SHIELDED! Look again.', mood: 'good' });
    expect(applyMiss(s).line?.text).toBe('SHIELDED! ');
  });

  it('three misses → failed; a 4th miss changes nothing', () => {
    let s = createSession('m1g1', 'scout');
    s = applyMiss(s).session;
    s = applyMiss(s).session;
    const third = applyMiss(s);
    expect(third.failed).toBe(true);
    expect(third.session).toMatchObject({ hearts: 0, lost: 3, status: 'failed' });
    const fourth = applyMiss(third.session);
    expect(fourth.session).toBe(third.session);
    expect(fourth.line).toBeNull();
  });

  it('REWIND at 3 hearts is not consumed and toasts NOTHING TO USE IT ON YET', () => {
    const r = applyPower(createSession('m1g1', 'chrono'), {});
    expect(r).toMatchObject({ consumed: false, toast: NOTHING_TO_USE });
    expect(r.session.powerUses).toBe(2);
  });

  it('REWIND at 2 hearts restores 3, consumes one use, keeps lost, calls undo', () => {
    const undo = jest.fn();
    const hurt = applyMiss(createSession('m1g1', 'chrono')).session;
    const r = applyPower(hurt, { undo });
    expect(r.consumed).toBe(true);
    expect(r.session).toMatchObject({ hearts: 3, lost: 1, powerUses: 1 });
    expect(r.line).toEqual({ text: REWIND_LINE, mood: 'good' });
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('SHIELD twice in a row: the second press is not consumed', () => {
    const a = applyPower(createSession('m1g1', 'guard'), {});
    expect(a).toMatchObject({ consumed: true, line: { text: SHIELD_LINE, mood: 'good' } });
    expect(a.session).toMatchObject({ shield: true, powerUses: 1 });
    const b = applyPower(a.session, {});
    expect(b).toMatchObject({ consumed: false, toast: NOTHING_TO_USE });
    expect(b.session.powerUses).toBe(1);
  });

  it('X-RAY/FOCUS returning false (or missing) never consume; after 2 consumed uses the power is unavailable', () => {
    const no: PowerHandlers = { scan: () => false, hint: () => false };
    expect(applyPower(createSession('m1g1', 'scout'), no).consumed).toBe(false);
    expect(applyPower(createSession('m1g1', 'oracle'), {}).consumed).toBe(false);
    const scan = jest.fn(() => true);
    let s = createSession('m1g1', 'scout');
    s = applyPower(s, { scan }).session;
    s = applyPower(s, { scan }).session;
    expect(s.powerUses).toBe(0);
    expect(canUsePower(s)).toBe(false);
    const third = applyPower(s, { scan });
    expect(third).toMatchObject({ consumed: false, toast: null });
    expect(scan).toHaveBeenCalledTimes(2);
    const hint = jest.fn(() => true);
    expect(applyPower(createSession('m1g1', 'oracle'), { hint }).consumed).toBe(true);
    expect(hint).toHaveBeenCalled();
  });

  it('powers and wins are ignored once the session is over', () => {
    const won = applyWin(createSession('m1g1', 'scout'));
    expect(won).toMatchObject({ accepted: true, session: { status: 'won' } });
    expect(applyWin(won.session).accepted).toBe(false);
    expect(applyPower(won.session, { scan: () => true }).consumed).toBe(false);
    expect(applyMiss(won.session).line).toBeNull();
  });

  it('stars = hearts clamped 1..3; HUD labels read for screen readers', () => {
    expect([0, 1, 2, 3, 4].map(starsFor)).toEqual([1, 1, 2, 3, 3]);
    expect(heartsLabel({ hearts: 2, shield: false })).toBe('Hearts 2 of 3');
    expect(heartsLabel({ hearts: 3, shield: true })).toBe('Hearts 3 of 3, shield up');
    expect(powerLabel({ hero: 'scout', powerUses: 2 })).toBe('X-RAY power, 2 uses left');
    expect(powerLabel({ hero: 'oracle', powerUses: 1 })).toBe('FOCUS power, 1 use left');
  });
});
