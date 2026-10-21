// commitPower: a consumed power is committed onto the LATEST session (a game may end the
// round from inside its X-RAY/FOCUS handler), never reviving a finished session.
import { applyPower, commitPower, createSession, type GameSession } from '@/engine/session';

describe('commitPower', () => {
  it('X-RAY that wins inside its handler keeps the win and still spends the use', () => {
    let latest: GameSession = createSession('m3g1', 'scout');
    const r = applyPower(latest, {
      scan: () => {
        latest = { ...latest, status: 'won' };
        return true;
      },
    });
    const next = commitPower(latest, r, 'scan');
    expect(next).toMatchObject({ status: 'won', powerUses: 1, hearts: 3 });
  });

  it('REWIND restores one heart (max 3) and SHIELD raises the shield on the latest session', () => {
    const hurt = { ...createSession('m1g1', 'chrono'), hearts: 2, lost: 1 };
    expect(commitPower(hurt, applyPower(hurt, {}), 'rewind')).toMatchObject({ hearts: 3, lost: 1, powerUses: 1 });
    const g = createSession('m1g1', 'guard');
    expect(commitPower(g, applyPower(g, {}), 'shield')).toMatchObject({ shield: true, powerUses: 1 });
  });

  it('a power that was not consumed changes nothing', () => {
    const s = createSession('m1g1', 'scout');
    const r = applyPower(s, { scan: () => false });
    expect(r.consumed).toBe(false);
    expect(commitPower(s, r, 'scan')).toBe(s);
  });
});
