/**
 * Parity: the API's bundled v3 content JSON (api/src/glitch_api/content/v3/<gameId>.json,
 * spec/data.md → v3 content JSON) is rebuilt here from the web games' v3 `data.ts`
 * constants and `content/concepts.ts`, and must deep-equal the shipped files. The server
 * explains a v3 mistake from those files, so a copy edit on the web that is not mirrored
 * in the API fails this test.
 *
 * Regenerate the JSON after an intentional v3 change:
 *   cd web && GLITCH_WRITE_EXPLAIN_CONTENT=1 npx jest --ci tests/contracts/explainContent.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';

import type { Concept } from '../../src/contracts/game';
import type { GameId } from '../../src/contracts/ids';
import { CONCEPTS_BY_GAME, conceptOf } from '../../src/content/concepts';
import * as m1g1 from '../../src/games/m1g1/data';
import * as m1g2 from '../../src/games/m1g2/data';
import * as m2g1 from '../../src/games/m2g1/data';
import * as m2g2 from '../../src/games/m2g2/data';
import * as m3g1 from '../../src/games/m3g1/data';
import * as m3g2 from '../../src/games/m3g2/data';
import * as m4g1 from '../../src/games/m4g1/data';
import * as m4g2 from '../../src/games/m4g2/data';
import * as m4g3 from '../../src/games/m4g3/data';

const CONTENT_DIR = path.resolve(__dirname, '../../../api/src/glitch_api/content/v3');
const GAME_IDS: readonly GameId[] = ['m1g1', 'm1g2', 'm2g1', 'm2g2', 'm3g1', 'm3g2', 'm4g1', 'm4g2', 'm4g3'];

type ConceptRule = readonly [prefix: string, concept: Concept];
interface ContentFile {
  gameId: GameId;
  data: unknown;
  copy: Record<string, unknown>;
  conceptRules: readonly ConceptRule[];
}

const zoneLabels = (zones: readonly { id: string; label: string }[]): Record<string, string> =>
  Object.fromEntries(zones.map((z) => [z.id, z.label]));

/** `{n}` stands where v3 inserts the number (the explainer substitutes "some"). */
const N = '{n}' as unknown as number;

function build(gameId: GameId): ContentFile {
  switch (gameId) {
    case 'm1g1':
      return {
        gameId,
        data: {
          trainEmails: m1g1.TRAIN_EMAILS.map(([id, text, label]) => ({ id, text, label: label === 's' ? 'spam' : 'not_spam' })),
          testEmails: m1g1.TEST_EMAILS.map(([id, text, says, verdict]) => ({
            id,
            text,
            // modelRight = (modelSays == SPAM) == (label == spam) → label from says + verdict.
            label: (says === 'SPAM') === (verdict === 'r') ? 'spam' : 'not_spam',
            modelSays: says,
            modelRight: verdict === 'r',
          })),
        },
        copy: {
          zones: { ...zoneLabels(m1g1.TRAIN_ZONES), ...zoneLabels(m1g1.TEST_ZONES) },
          trainWrong: m1g1.STEP1_WRONG,
          testWrong: m1g1.STEP2_WRONG,
        },
        conceptRules: [['e', 'Training data'], ['t', 'Generalization']],
      };
    case 'm1g2':
      return {
        gameId,
        data: {
          sentences: m1g2.SENTENCES.map(([text, fib, explanation]) => ({
            text,
            fib: fib === 1,
            explanation: fib === 1 ? (explanation ?? null) : null,
          })),
        },
        copy: { trueMiss: m1g2.TRUE_MISS },
        conceptRules: [['', 'Machine learning']],
      };
    case 'm2g1':
      return {
        gameId,
        data: {
          rounds: m2g1.ROUNDS.map((r) => ({
            id: r.id, title: r.title, rule: r.rule, ma: r.ma, mbl: r.mbl, ga: r.ga, gb: r.gb, fa: r.fa, fb: r.fb,
          })),
        },
        copy: {},
        conceptRules: [['r2', 'Classification'], ['', 'Weights and thresholds']],
      };
    case 'm2g2':
      return {
        gameId,
        data: {
          forges: m2g2.FORGES.map((f) => ({
            title: f.title,
            blocks: f.blocks.map(([text, slot], i) => ({ id: `b${i}`, text, slot })),
          })),
        },
        copy: { slots: zoneLabels(m2g2.SLOTS), wrongDecoy: m2g2.WRONG_DECOY, wrongSlot: m2g2.WRONG_SLOT },
        conceptRules: [['', 'Prompt engineering']],
      };
    case 'm3g1':
      return {
        gameId,
        data: {
          candidate: m3g1.V3_SCENARIO.candidate,
          lines: m3g1.RESUME.map(([text, proxy, note]) => ({ text, proxy: proxy === null ? null : proxy === 1, note })),
        },
        copy: { missMessage: m3g1.MISS_MESSAGE },
        conceptRules: [['', 'Proxy variables']],
      };
    case 'm3g2':
      return {
        gameId,
        data: {
          features: m3g2.FEATURES.map(([id, name, kind, weight]) => ({ id, name, kind: kind === 's' ? 'skill' : 'proxy', weight })),
          gapGoal: m3g2.GAP_GOAL,
          accuracyGoal: m3g2.ACCURACY_GOAL,
        },
        copy: { gapFail: m3g2.gapFailMessage(N), accuracyFail: m3g2.accuracyFailMessage(N) },
        conceptRules: [['', 'Algorithmic discrimination']],
      };
    case 'm4g1':
      return {
        gameId,
        data: { citations: m4g1.CITATIONS.map(([id, text, real]) => ({ id, text, real: real === 1 })) },
        copy: { zones: zoneLabels(m4g1.ZONES), wrong: m4g1.WRONG, askMiss: m4g1.ASK_MISS },
        conceptRules: [['ask', 'Verification'], ['', 'Hallucination']],
      };
    case 'm4g2':
      return {
        gameId,
        data: {
          answers: m4g2.ANSWERS.map(([id, statement, confidence, evidence, trust]) => ({
            id, statement, confidence, evidence, trust: trust === 1,
          })),
        },
        copy: { zones: zoneLabels(m4g2.ZONES), wrong: m4g2.WRONG },
        conceptRules: [['', 'Verification']],
      };
    case 'm4g3':
      return {
        gameId,
        data: {
          metrics: m4g3.METRICS.map((m) => ({ id: m.id, label: m.label, target: m.target, dir: m.dir, failure: m.failure })),
          toggles: m4g3.TOGGLES.map((t) => ({ id: t.id, label: t.label })),
          sliders: m4g3.SLIDERS.map((s) => ({ id: s.id, label: s.label })),
        },
        copy: { notYetPrefix: m4g3.NOT_YET_PREFIX },
        conceptRules: [['', 'Human oversight']],
      };
  }
}

/** Every explainable item id per game (the per-game mistake table, ids by position). */
function itemIds(gameId: GameId): string[] {
  switch (gameId) {
    case 'm1g1':
      return [...m1g1.TRAIN_EMAILS.map((e) => e[0]), ...m1g1.TEST_EMAILS.map((e) => e[0])];
    case 'm1g2':
      return m1g2.SENTENCES.flatMap((s, i) => (s[1] === 0 ? [`s${i}`] : []));
    case 'm2g1':
      return m2g1.ROUNDS.map((r) => r.id);
    case 'm2g2':
      return m2g2.FORGES.flatMap((f, k) => f.blocks.map((_, i) => `f${k + 1}.b${i}`));
    case 'm3g1':
      return m3g1.RESUME.flatMap((l, i) => (l[1] === 0 ? [`l${i}`] : []));
    case 'm3g2':
      return ['audit'];
    case 'm4g1':
      return [...m4g1.CITATIONS.map((c) => c[0]), 'ask'];
    case 'm4g2':
      return m4g2.ANSWERS.map((a) => a[0]);
    case 'm4g3':
      return ['ship'];
  }
}

const conceptByRules = (rules: readonly ConceptRule[], itemId: string): Concept | undefined =>
  rules.find(([prefix]) => itemId.startsWith(prefix))?.[1];

const readContent = (gameId: GameId): unknown =>
  JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, `${gameId}.json`), 'utf8'));

if (process.env.GLITCH_WRITE_EXPLAIN_CONTENT === '1') {
  fs.mkdirSync(CONTENT_DIR, { recursive: true });
  for (const g of GAME_IDS) {
    fs.writeFileSync(path.join(CONTENT_DIR, `${g}.json`), `${JSON.stringify(build(g), null, 2)}\n`);
  }
}

describe('explain content parity (api v3 JSON ⇔ web v3 data.ts)', () => {
  it('ships exactly one file per game', () => {
    const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.json')).sort();
    expect(files).toEqual(GAME_IDS.map((g) => `${g}.json`));
  });

  it.each(GAME_IDS)('%s.json deep-equals the rebuild from the web v3 data', (gameId) => {
    expect(readContent(gameId)).toEqual(build(gameId));
  });

  it.each(GAME_IDS)('%s concept rules agree with conceptOf for every item', (gameId) => {
    const { conceptRules } = build(gameId);
    const ids = itemIds(gameId);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(conceptByRules(conceptRules, id)).toBe(conceptOf(gameId, id));
    }
    for (const [, concept] of conceptRules) {
      expect(CONCEPTS_BY_GAME[gameId]).toContain(concept);
    }
  });

  it('keeps the {n} placeholder in the m3g2 failure templates', () => {
    const copy = build('m3g2').copy;
    expect(copy.gapFail).toContain('{n}');
    expect(copy.accuracyFail).toContain('{n}');
  });
});
