// migrate.ts: pure validation + versioned migration from stored fixtures.
import {
  MIGRATIONS, addSeen, cleanHistoryEntry, cleanMistakeRecord, cleanMistakes, cleanSeenScenarios, createInitialState, migrateState,
  migrateV1toV2, migrateV2toV3, parseStored, sanitizeState, sanitizeV1,
} from '@/state/migrate';
import { MISTAKES_MAX, STATE_VERSION, type MistakeRecord, type PersistedStateV1, type PersistedStateV2, type PersistedStateV3 } from '@/contracts/state';

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

/** The v1 fixture after v1 → v2: every field kept, version 2, empty seen map. */
const fixtureV2: PersistedStateV2 = { ...fixtureV1, version: 2, seenScenarios: {} };
/** The v2 fixture after v2 → v3: every field kept, version 3, no mistakes. */
const fixtureV3: PersistedStateV3 = { ...fixtureV2, version: 3, mistakes: [] };
/** A stored v2 save from a device that has played case files. */
const storedV2: PersistedStateV2 = { ...fixtureV2, seenScenarios: { m1g2: ['m1g2-0123456789ab'], m4g1: ['m4g1-aaaaaaaaaaaa'] } };
const rec = (i: number, over: Partial<MistakeRecord> = {}): MistakeRecord => ({
  gameId: 'm1g2', variationId: 'v3', itemId: `s${i % 6}`, answer: 'fib', concept: 'Machine learning', shielded: false,
  at: new Date(Date.UTC(2026, 9, 19, 9, 0, i)).toISOString(), ...over,
});

describe('migrateState', () => {
  it('migrates a stored v1 save to v3: every v1 field kept, seenScenarios and mistakes start empty', () => {
    const r = migrateState(JSON.parse(JSON.stringify(fixtureV1)), NOW);
    expect(r).toEqual({ ok: true, state: fixtureV3, from: 1 });
  });

  it('migrates a stored v2 save to v3: every v2 field (incl. seenScenarios) kept, mistakes empty', () => {
    const r = migrateState(JSON.parse(JSON.stringify(storedV2)), NOW);
    expect(r).toEqual({ ok: true, state: { ...storedV2, version: 3, mistakes: [] }, from: 2 });
  });

  it('keeps a valid v3 save unchanged', () => {
    const v3: PersistedStateV3 = { ...fixtureV3, seenScenarios: { m1g2: ['a1b2', 'c3d4'], m4g1: ['z9'] }, mistakes: [rec(1), rec(0, { gameId: 'm3g1', itemId: 'l4', answer: 'proxy', concept: 'Proxy variables', shielded: true })] };
    expect(migrateState(JSON.parse(JSON.stringify(v3)), NOW)).toEqual({ ok: true, state: v3, from: 3 });
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
    expect(migrateState({ version: 4 })).toMatchObject({ ok: false, error: expect.stringMatching(/newer/) });
  });

  it('parseStored handles nothing stored, corrupt JSON and good JSON', () => {
    expect(parseStored(null)).toBeNull();
    expect(parseStored('{not json')).toMatchObject({ ok: false, error: expect.stringMatching(/JSON/) });
    expect(parseStored(JSON.stringify(fixtureV1), NOW)).toMatchObject({ ok: true, state: fixtureV3 });
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
    expect(s.seenScenarios).toEqual({});
    expect(s.mistakes).toEqual([]);
    expect(s).toMatchObject({ version: 3, xp: 0, lastHero: 'scout', profile: { nickname: null, onboarded: false }, streak: { current: 0, best: 0, lastPlayDay: null } });
  });
});

describe('v1 → v2 (seenScenarios)', () => {
  it('is a pure, additive step registered as MIGRATIONS[1]', () => {
    const v1 = JSON.parse(JSON.stringify(fixtureV1)) as Record<string, unknown>;
    const out = migrateV1toV2(v1);
    expect(out).toEqual({ ...fixtureV1, version: 2, seenScenarios: {} });
    expect(v1.version).toBe(1); // input untouched
    expect(MIGRATIONS[1]).toBe(migrateV1toV2);
  });

  it('a v1 save carrying a stray seenScenarios key is reset to empty (v1 had none)', () => {
    const r = migrateState({ ...JSON.parse(JSON.stringify(fixtureV1)), seenScenarios: { m1g2: ['x1'] } }, NOW);
    expect(r).toMatchObject({ ok: true, state: { seenScenarios: {} } });
  });

  it('cleans the seen map: known games only, URL-safe unique ids, newest 100 kept', () => {
    const many = Array.from({ length: 130 }, (_, i) => `id${i}`);
    const s = cleanSeenScenarios({
      m1g2: ['ok1', 'ok1', 'has space', 'a,b', 42, '', 'x'.repeat(65), 'ok2'],
      m9g9: ['nope'],
      m1g1: 'not a list',
      m4g1: many,
      m3g1: [],
    });
    expect(s.m1g2).toEqual(['ok1', 'ok2']);
    expect('m9g9' in s).toBe(false);
    expect('m1g1' in s).toBe(false);
    expect('m3g1' in s).toBe(false);
    expect(s.m4g1).toHaveLength(100);
    expect(s.m4g1?.[0]).toBe('id30');
    expect(s.m4g1?.[99]).toBe('id129');
    expect(cleanSeenScenarios(null)).toEqual({});
    expect(cleanSeenScenarios(['m1g2'])).toEqual({});
  });

  it('addSeen appends once, moves a repeat to the end and caps at 100 (oldest dropped)', () => {
    expect(addSeen(undefined, 'a')).toEqual(['a']);
    expect(addSeen(['a', 'b'], 'a')).toEqual(['b', 'a']);
    const full = Array.from({ length: 100 }, (_, i) => `v${i}`);
    const next = addSeen(full, 'new');
    expect(next).toHaveLength(100);
    expect(next[0]).toBe('v1');
    expect(next[99]).toBe('new');
  });
});

describe('v2 → v3 (mistakes)', () => {
  it('is a pure, additive step registered as MIGRATIONS[2]; STATE_VERSION is 3', () => {
    const v2 = JSON.parse(JSON.stringify(storedV2)) as Record<string, unknown>;
    const out = migrateV2toV3(v2);
    expect(out).toEqual({ ...storedV2, version: 3, mistakes: [] });
    expect(v2.version).toBe(2); // input untouched
    expect('mistakes' in v2).toBe(false);
    expect(MIGRATIONS[2]).toBe(migrateV2toV3);
    expect(STATE_VERSION).toBe(3);
  });

  it('a v2 save carrying a stray mistakes key is reset to empty (v2 had none)', () => {
    const r = migrateState({ ...JSON.parse(JSON.stringify(storedV2)), mistakes: [rec(0)] }, NOW);
    expect(r).toMatchObject({ ok: true, state: { mistakes: [] } });
  });

  it('cleanMistakeRecord applies the spec/data.md rules and drops unknown keys (no text persisted)', () => {
    expect(cleanMistakeRecord({ ...rec(0), itemText: 'secret text', message: 'x', answerLabel: 'FIB' })).toEqual(rec(0));
    expect(cleanMistakeRecord(rec(0, { variationId: 'm1g2-0123456789ab' }))).not.toBeNull();
    expect(cleanMistakeRecord(rec(0, { itemId: 'f1.b3' }))).not.toBeNull();
    expect(cleanMistakeRecord(rec(0, { answer: 'false_alarms' }))).not.toBeNull();
    const bad: Record<string, unknown>[] = [
      { gameId: 'm9g9' }, { variationId: 'has space' }, { variationId: '' }, { variationId: 'x'.repeat(65) },
      { itemId: '' }, { itemId: 'a b' }, { itemId: 'x'.repeat(41) }, { answer: 'FIB' }, { answer: 'x'.repeat(25) }, { answer: 'a-b' },
      { concept: 'Magic' }, { shielded: 'no' }, { at: 'yesterday' },
    ];
    for (const b of bad) expect(cleanMistakeRecord({ ...rec(0), ...b })).toBeNull();
    expect(cleanMistakeRecord(null)).toBeNull();
    expect(cleanMistakeRecord([rec(0)])).toBeNull();
  });

  it('sanitize drops invalid records and keeps the newest 200 (newest first)', () => {
    const many = Array.from({ length: 230 }, (_, i) => rec(i));
    const withBad = [{ junk: true }, ...many.slice(0, 5), rec(0, { concept: 'Nope' as never }), ...many.slice(5)];
    const s = sanitizeState({ ...JSON.parse(JSON.stringify(fixtureV3)), mistakes: withBad }, NOW);
    expect(s.mistakes).toHaveLength(MISTAKES_MAX);
    expect(s.mistakes[0]).toEqual(many[0]);
    expect(s.mistakes[199]).toEqual(many[199]);
    expect(cleanMistakes('not a list')).toEqual([]);
  });
});
