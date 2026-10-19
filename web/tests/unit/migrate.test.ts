// migrate.ts: pure validation + versioned migration from stored fixtures.
import { cleanHistoryEntry, createInitialState, migrateState, parseStored, sanitizeV1 } from '@/state/migrate';
import type { PersistedStateV1 } from '@/contracts/state';

const NOW = new Date('2026-10-19T10:00:00.000Z');

const fixtureV1: PersistedStateV1 = {
  version: 1,
  profile: { nickname: 'Ana', onboarded: true, createdAt: '2026-10-01T08:00:00.000Z' },
  settings: { readableFont: true },
  xp: 145,
  streak: { current: 2, best: 4, lastPlayDay: '2026-10-18' },
  steps: { m1h: true, m1s: true, m1g1: true },
  stars: { m1g1: 2 },
  heroByModule: { 1: 'guard' },
  lastHero: 'guard',
  heroesPlayed: { guard: true },
  powersUsed: { guard: true },
  badges: { boot: '2026-10-02T08:00:00.000Z' },
  onceBonuses: { story1: true, gm1g1: true },
  promptHistory: [
    {
      id: 'h1', goalId: 'fw1', goal: 'Explain photosynthesis to a 10-year-old.', prompt: 'plants',
      levers: { task: false, context: false, role: false, format: false, limit: false }, leversHit: 0, passed: false, source: 'offline', at: '2026-10-18T09:00:00.000Z',
    },
  ],
};

describe('migrateState', () => {
  it('keeps a valid v1 fixture unchanged', () => {
    const r = migrateState(JSON.parse(JSON.stringify(fixtureV1)), NOW);
    expect(r).toEqual({ ok: true, state: fixtureV1, from: 1 });
  });

  it('fills defaults for missing fields and drops invalid entries', () => {
    const r = migrateState(
      {
        version: 1,
        xp: -5,
        profile: { nickname: '   ', onboarded: 'yes' },
        steps: { m1h: true, bogus: true, m2s: 1 },
        stars: { m1g1: 4, m1g2: 3 },
        heroByModule: { 1: 'batman', 2: 'oracle' },
        lastHero: 'nobody',
        badges: { boot: 'not a date', lvl: '2026-10-02T00:00:00Z' },
        onceBonuses: { story1: true, hack: true },
        streak: { current: 3, best: 1, lastPlayDay: 'yesterday' },
        promptHistory: [{ id: 1 }, fixtureV1.promptHistory[0]],
        extra: 'dropped',
      },
      NOW,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = r.state;
    expect(s.xp).toBe(0);
    expect(s.profile).toEqual({ nickname: null, onboarded: false, createdAt: NOW.toISOString() });
    expect(s.steps).toEqual({ m1h: true, m2s: true });
    expect(s.stars).toEqual({ m1g2: 3 });
    expect(s.heroByModule).toEqual({ 2: 'oracle' });
    expect(s.lastHero).toBe('scout');
    expect(s.badges).toEqual({ lvl: '2026-10-02T00:00:00Z' });
    expect(s.onceBonuses).toEqual({ story1: true });
    expect(s.streak).toEqual({ current: 3, best: 3, lastPlayDay: null });
    expect(s.promptHistory).toHaveLength(1);
    expect('extra' in s).toBe(false);
  });

  it('refuses non-objects, missing versions and newer versions', () => {
    expect(migrateState(null)).toMatchObject({ ok: false });
    expect(migrateState([1, 2])).toMatchObject({ ok: false });
    expect(migrateState({ xp: 10 })).toMatchObject({ ok: false, error: expect.stringMatching(/version/) });
    expect(migrateState({ version: 2 })).toMatchObject({ ok: false, error: expect.stringMatching(/newer/) });
  });

  it('parseStored handles nothing stored, corrupt JSON and good JSON', () => {
    expect(parseStored(null)).toBeNull();
    expect(parseStored('{not json')).toMatchObject({ ok: false, error: expect.stringMatching(/JSON/) });
    expect(parseStored(JSON.stringify(fixtureV1), NOW)).toMatchObject({ ok: true, state: fixtureV1 });
  });

  it('clamps nicknames to 20 characters and caps history at 50, newest first kept', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ ...fixtureV1.promptHistory[0], id: `h${i}` }));
    const s = sanitizeV1({ version: 1, profile: { nickname: 'x'.repeat(30) }, promptHistory: many }, NOW);
    expect(s.profile.nickname).toHaveLength(20);
    expect(s.promptHistory).toHaveLength(50);
    expect(s.promptHistory[0]?.id).toBe('h0');
  });

  it('recomputes leversHit/passed from the five booleans', () => {
    const e = cleanHistoryEntry({ ...fixtureV1.promptHistory[0], levers: { task: true, context: true, role: true, format: true, limit: false }, leversHit: 0, passed: false });
    expect(e).toMatchObject({ leversHit: 4, passed: true });
    expect(cleanHistoryEntry({ ...fixtureV1.promptHistory[0], source: 'cloud' })).toBeNull();
  });

  it('creates the documented fresh state', () => {
    const s = createInitialState(NOW);
    expect(s).toMatchObject({ version: 1, xp: 0, lastHero: 'scout', profile: { nickname: null, onboarded: false }, streak: { current: 0, best: 0, lastPlayDay: null } });
  });
});
