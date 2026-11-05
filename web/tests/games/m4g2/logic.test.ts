// m4g2 · Confidence Court — v3 data + rules (spec/idea/GLITCH v3.html lines 578–580).
import { createSort, drop, focus, isDone, xray } from '@/dnd/sortEngine';
import game from '@/games/m4g2';
import { ANSWERS, HEADING, ITEMS, SUBHEAD, SUMMARY, WRONG, ZONES, verdictLine } from '@/games/m4g2/data';
import { ANSWER_KEY, SORT_CONFIG } from '@/games/m4g2/logic';

describe('m4g2 data (v3 verbatim)', () => {
  it('has the v3 title, goal and intro and is a module 4 game', () => {
    expect(game.id).toBe('m4g2');
    expect(game.module).toBe(4);
    expect(game.title).toBe('Confidence Court');
    expect(game.goal).toBe('SORT · TRUST OR VERIFY');
    expect(game.intro).toBe('Each NOVA answer has a confidence score and evidence. Ignore the score. Judge the evidence.');
  });

  it('trusts a1, a4, a6 and verifies a2, a3, a5', () => {
    expect(ANSWER_KEY).toEqual([
      ['a1', 'trust'], ['a2', 'verify'], ['a3', 'verify'], ['a4', 'trust'], ['a5', 'verify'], ['a6', 'trust'],
    ]);
  });

  it('a6 has the lowest confidence (76%) yet is TRUST — the score is not the evidence', () => {
    const lowest = [...ITEMS].sort((a, b) => a.confidence - b.confidence)[0]!;
    expect(lowest.id).toBe('a6');
    expect(lowest.confidence).toBe(76);
    expect(lowest.answer).toBe('trust');
    // every VERIFY answer is more confident than a6
    expect(ITEMS.filter((i) => i.answer === 'verify').every((i) => i.confidence > 76)).toBe(true);
  });

  it('copies statements, confidence and evidence exactly', () => {
    expect(ANSWERS.map(([id, s, c, e]) => [id, s, c, e])).toEqual([
      ['a1', 'Water boils at 100°C at sea level.', 99, 'Matches 3 textbooks'],
      ['a2', 'The Eiffel Tower was built in 1925.', 97, 'Encyclopaedia says 1889'],
      ['a3', "Dr. Rao's 2022 study proves this.", 95, 'Study not found in any database'],
      ['a4', 'Your essay has 412 words.', 90, 'Word counter agrees: 412'],
      ['a5', 'This medicine is safe with your prescription.', 98, 'No source cited. High stakes'],
      ['a6', 'The capital of Australia is Canberra.', 76, 'Matches atlas and government site'],
    ]);
    expect(verdictLine(99, 'Matches 3 textbooks')).toBe('CONFIDENCE 99% · EVIDENCE: Matches 3 textbooks');
  });

  it('short labels are the first 26 characters of the statement', () => {
    expect(ITEMS.map((i) => i.short)).toEqual([
      'Water boils at 100°C at se',
      'The Eiffel Tower was built',
      "Dr. Rao's 2022 study prove",
      'Your essay has 412 words.',
      'This medicine is safe with',
      'The capital of Australia i',
    ]);
    for (const i of ITEMS) expect(i.short.length).toBeLessThanOrEqual(26);
  });

  it('screen-reader text includes the confidence and the evidence', () => {
    expect(ITEMS[1]!.text).toBe('The Eiffel Tower was built in 1925. CONFIDENCE 97% · EVIDENCE: Encyclopaedia says 1889');
  });

  it('has TRUST / VERIFY zones and the v3 copy', () => {
    expect(ZONES.map((z) => [z.id, z.label, z.icon, z.color])).toEqual([
      ['trust', 'TRUST', 'check', '#3ee98a'],
      ['verify', 'VERIFY', 'scan', '#ffa63d'],
    ]);
    expect(HEADING).toBe('THE COURT OF EVIDENCE');
    expect(SUBHEAD).toBe('TRUST = the evidence checks out. VERIFY = needs a human check first.');
    expect(WRONG).toBe('Read the evidence, not the confidence number.');
    expect(SUMMARY).toBe('Confidence is how strongly a pattern fits, not proof. A low-confidence answer with strong evidence beats a confident one with none.');
  });
});

describe('m4g2 sort rules', () => {
  it('the answer key completes the sort', () => {
    let s = createSort(SORT_CONFIG);
    for (const [item, zone] of ANSWER_KEY) {
      const r = drop(s, item, zone);
      expect(r.result).toBe('placed');
      s = r.state;
    }
    expect(isDone(s)).toBe(true);
  });

  it('every opposite drop is wrong and uses the v3 message', () => {
    const s = createSort(SORT_CONFIG);
    for (const [item, zone] of ANSWER_KEY) expect(drop(s, item, zone === 'trust' ? 'verify' : 'trust').result).toBe('wrong');
    expect(SORT_CONFIG.wrong?.(ITEMS[0]!, ZONES[1]!)).toBe(WRONG);
  });

  it('a placed answer cannot be dropped again', () => {
    const s = drop(createSort(SORT_CONFIG), 'a1', 'trust').state;
    expect(drop(s, 'a1', 'verify').result).toBe('ignored');
  });

  it('X-RAY places a1 in TRUST; FOCUS flashes a pair (no decoys)', () => {
    const s = createSort(SORT_CONFIG);
    expect(xray(s).placed?.zone.label).toBe('TRUST');
    expect(focus(s).effect).toEqual({ kind: 'flash', itemId: 'a1', zoneId: 'trust' });
  });
});
