// Recap rules (mistake-recap.md): dedupe by mistakeKey in first-occurrence order, ×n, max 5
// rows + "+n more", fetched explanation text else canned message, SHIELDED.
import { RECAP_MAX_ROWS, buildRecap } from '@/features/recap/logic';
import { sm } from './fixtures';

describe('buildRecap', () => {
  it('no mistakes → no rows, nothing more', () => {
    expect(buildRecap([], {})).toEqual({ rows: [], more: 0 });
  });

  it('one row per distinct mistake with item, labels and the canned why', () => {
    const r = buildRecap([sm(1), sm(2)], {});
    expect(r.more).toBe(0);
    expect(r.rows).toEqual([
      { key: 'e1|ok', itemText: 'Email 1', answerLabel: 'NOT SPAM', correctLabel: 'SPAM', why: 'Canned 1.', shielded: false, count: 1 },
      { key: 'e2|ok', itemText: 'Email 2', answerLabel: 'NOT SPAM', correctLabel: 'SPAM', why: 'Canned 2.', shielded: false, count: 1 },
    ]);
  });

  it('the same wrong drop twice → one row ×2, kept at its first position', () => {
    const r = buildRecap([sm(1), sm(2), sm(1, { at: '2026-10-20T10:01:00.000Z' })], {});
    expect(r.rows.map((x) => [x.key, x.count])).toEqual([['e1|ok', 2], ['e2|ok', 1]]);
  });

  it('same item, different answer → two rows (key is itemId|answer)', () => {
    const r = buildRecap([sm(1), sm(1, { answer: 'spam', answerLabel: 'SPAM' })], {});
    expect(r.rows.map((x) => x.key)).toEqual(['e1|ok', 'e1|spam']);
  });

  it('six different mistakes → 5 rows + 1 more', () => {
    const r = buildRecap([1, 2, 3, 4, 5, 6].map((i) => sm(i)), {});
    expect(RECAP_MAX_ROWS).toBe(5);
    expect(r.rows).toHaveLength(5);
    expect(r.rows.map((x) => x.key)).toEqual(['e1|ok', 'e2|ok', 'e3|ok', 'e4|ok', 'e5|ok']);
    expect(r.more).toBe(1);
  });

  it('duplicates do not count toward the 5-row cap', () => {
    const r = buildRecap([sm(1), sm(1), sm(2), sm(3), sm(4), sm(5)], {});
    expect(r.rows).toHaveLength(5);
    expect(r.more).toBe(0);
  });

  it('uses the fetched explanation text for its key, canned for the others; blank text falls back', () => {
    const r = buildRecap([sm(1), sm(2), sm(3)], { 'e2|ok': { text: 'Prizes are a spam feature.', tip: 'Look for prizes.' }, 'e3|ok': { text: '  ', tip: '' } });
    expect(r.rows.map((x) => x.why)).toEqual(['Canned 1.', 'Prizes are a spam feature.', 'Canned 3.']);
  });

  it('SHIELDED when any occurrence of the key was shielded', () => {
    const r = buildRecap([sm(1, { shielded: true }), sm(2), sm(2, { shielded: true }), sm(3)], {});
    expect(r.rows.map((x) => x.shielded)).toEqual([true, true, false]);
  });

  it('free-write weak prompts render as rows with lever labels', () => {
    const r = buildRecap([sm(0, { gameId: 'm2g2', itemId: 'fw.fw1', answer: 'weak', correct: 'strong', concept: 'Prompt engineering', itemText: 'Write a prompt for a poster.', answerLabel: '2/5 LEVERS', correctLabel: '4+/5 LEVERS', explain: false })], {});
    expect(r.rows[0]).toMatchObject({ answerLabel: '2/5 LEVERS', correctLabel: '4+/5 LEVERS' });
  });
});
