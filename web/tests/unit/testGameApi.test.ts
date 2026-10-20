// createTestGameApi mirrors the Game Frame rules (game-runtime.md → Session/Mistakes/Powers/Winning).
import { createTestGameApi, NOTHING_TO_USE, SHIELD_LINE, REWIND_LINE } from '@/testing/testGameApi';

describe('createTestGameApi', () => {
  it('starts with 3 hearts, 2 power uses, no shield, not over', () => {
    const api = createTestGameApi();
    expect([api.hearts, api.powerUses, api.shield, api.over]).toEqual([3, 2, false, false]);
  });

  it('a shielded miss drops the shield, costs no heart and says "SHIELDED! …"', () => {
    const api = createTestGameApi({ hero: 'guard' });
    expect(api.usePower()).toBe(true);
    expect(api.lastSay()?.text).toBe(SHIELD_LINE);
    api.miss('Not there.');
    expect([api.hearts, api.lost, api.shield]).toEqual([3, 0, false]);
    expect(api.lastSay()).toEqual({ text: 'SHIELDED! Not there.', mood: 'good' });
  });

  it('three misses end the session; a fourth changes nothing', () => {
    const api = createTestGameApi();
    api.miss();
    api.miss();
    api.miss();
    expect([api.hearts, api.status]).toEqual([0, 'failed']);
    api.miss();
    expect(api.hearts).toBe(0);
    expect(api.calls.miss).toHaveLength(3);
    expect(api.calls.say[0]).toEqual({ text: 'Not quite.', mood: 'bad' });
  });

  it('REWIND at 3 hearts is not consumed; at 2 it restores one heart and lost stays', () => {
    const api = createTestGameApi({ hero: 'chrono' });
    expect(api.usePower()).toBe(false);
    expect(api.calls.toast).toEqual([NOTHING_TO_USE]);
    api.miss();
    const undo = jest.fn();
    api.registerPowers({ undo });
    expect(api.usePower()).toBe(true);
    expect([api.hearts, api.lost, api.powerUses]).toEqual([3, 1, 1]);
    expect(undo).toHaveBeenCalledTimes(1);
    expect(api.lastSay()?.text).toBe(REWIND_LINE);
  });

  it('SHIELD twice in a row: the second press is not consumed', () => {
    const api = createTestGameApi({ hero: 'guard' });
    expect(api.usePower()).toBe(true);
    expect(api.usePower()).toBe(false);
    expect(api.powerUses).toBe(1);
  });

  it('X-RAY/FOCUS returning false never consume; after two uses the power is spent', () => {
    const api = createTestGameApi({ hero: 'scout' });
    api.registerPowers({ scan: () => false });
    expect(api.usePower()).toBe(false);
    api.registerPowers({ scan: () => true });
    expect(api.usePower()).toBe(true);
    expect(api.usePower()).toBe(true);
    expect(api.usePower()).toBe(false);
    expect(api.powersUsed).toEqual(['scan', 'scan']);
  });

  it('win ends the session once and records the summary', () => {
    const api = createTestGameApi();
    api.win('Summary');
    api.win('again');
    expect(api.calls.win).toEqual(['Summary']);
    expect(api.over).toBe(true);
  });
});

describe('createTestGameApi · Phase 3 mistakes (same rule as the frame)', () => {
  const m = {
    itemId: 'e1', answer: 'ok', correct: 'spam', concept: 'Training data' as const,
    itemText: 'WIN A FREE PHONE!!!', answerLabel: 'NOT SPAM', correctLabel: 'SPAM',
  };

  it('calls.mistakes runs parallel to calls.miss; recorded holds accepted payload misses only', () => {
    const api = createTestGameApi();
    api.miss('Wrong bin.', m);
    api.miss('No payload.');
    expect(api.calls.miss).toEqual(['Wrong bin.', 'No payload.']);
    expect(api.calls.mistakes).toEqual([m, undefined]);
    expect(api.recorded).toEqual([{ mistake: m, shielded: false }]);
    expect(api.hearts).toBe(1); // behaviour of miss itself unchanged
  });

  it('a shielded payload miss is recorded with shielded: true', () => {
    const api = createTestGameApi({ shield: true });
    api.miss('Wrong bin.', m);
    expect(api.recorded).toEqual([{ mistake: m, shielded: true }]);
    expect(api.hearts).toBe(3);
  });

  it('misses after the game is over are ignored — not in calls, not recorded', () => {
    const api = createTestGameApi();
    api.win();
    api.miss('late', m);
    expect(api.calls.miss).toEqual([]);
    expect(api.calls.mistakes).toEqual([]);
    expect(api.recorded).toEqual([]);
  });

  it('powers never record a mistake (X-RAY auto-solve)', () => {
    const api = createTestGameApi({ hero: 'scout' });
    api.registerPowers({ scan: () => true });
    expect(api.usePower()).toBe(true);
    expect(api.recorded).toEqual([]);
    expect(api.calls.mistakes).toEqual([]);
  });
});
