// Contract parity with P2-D1: serverSamples.json is the served `data` the API's own validators
// produce (api/src/glitch_api/scenarios/schemas → parse_candidate) for each game's v3 exemplar
// (index 0) and fake-provider case files 1–3. Regenerate after a server schema change with:
//   cd api && uv run python -c "import json,sys;from glitch_api.scenarios.schemas import GAMES,parse_candidate;from glitch_api.scenarios import fake_gen;json.dump({g:[parse_candidate(g,s.v3_llm)]+[parse_candidate(g,fake_gen.fake_scenario(g,n)) for n in (1,2,3)] for g,s in GAMES.items()},sys.stdout,indent=1)" > ../web/tests/features/variations/serverSamples.json
// Every sample must parse on the client, and the v3 exemplar must map back onto v3 data.
import { CONTENT_GAME_IDS, parseScenario } from '@/features/variations';
import { TEST_EMAILS, TRAIN_EMAILS } from '@/games/m1g1/data';
import { SENTENCES } from '@/games/m1g2/data';
import { RESUME } from '@/games/m3g1/data';
import { CITATIONS } from '@/games/m4g1/data';
import { ANSWERS } from '@/games/m4g2/data';
import samples from './serverSamples.json';

const S = samples as Record<string, unknown[]>;

describe('client parsers accept what the server serves', () => {
  it.each(CONTENT_GAME_IDS)('%s: every server sample parses', (g) => {
    const list = S[g] ?? [];
    expect(list.length).toBeGreaterThanOrEqual(4);
    for (const d of list) expect(parseScenario(g, d)).not.toBeNull();
  });

  it('the server v3 exemplars map back onto the v3 data', () => {
    const m1g1 = parseScenario('m1g1', S.m1g1?.[0]);
    expect(m1g1?.gameId === 'm1g1' && m1g1.scenario).toEqual({ train: TRAIN_EMAILS, test: TEST_EMAILS });
    const m1g2 = parseScenario('m1g2', S.m1g2?.[0]);
    expect(m1g2?.gameId === 'm1g2' && m1g2.scenario).toEqual({ sentences: SENTENCES });
    const m3g1 = parseScenario('m3g1', S.m3g1?.[0]);
    expect(m3g1?.gameId === 'm3g1' && m3g1.scenario).toEqual({ resume: RESUME, candidate: 'ANAYA' });
    // The server's v3 exemplar drops the two web addresses (generated content has no links).
    const m4g1 = parseScenario('m4g1', S.m4g1?.[0]);
    expect(m4g1?.gameId === 'm4g1' && m4g1.scenario.citations.map((c) => [c[0], c[2]])).toEqual(CITATIONS.map((c) => [c[0], c[2]]));
    const m4g2 = parseScenario('m4g2', S.m4g2?.[0]);
    expect(m4g2?.gameId === 'm4g2' && m4g2.scenario).toEqual({ answers: ANSWERS });
  });

  it('fake-provider case files differ from v3 and from each other (replay shows new lines)', () => {
    for (const g of CONTENT_GAME_IDS) {
      const texts = (S[g] ?? []).map((d) => JSON.stringify(d));
      expect(new Set(texts).size).toBe(texts.length);
    }
  });
});
