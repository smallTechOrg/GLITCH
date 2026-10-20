// m4g1 · Source Detective — v3 data + rules (spec/idea/GLITCH v3.html lines 570–577).
import { createSort, drop, isDone, xray } from '@/dnd/sortEngine';
import { GAME_META } from '@/content/modules';
import game from '@/games/m4g1';
import {
  ASK_MISS, CITATIONS, FOUND_LINE, ITEMS, LOOKUPS, NOT_FOUND_LINE, NO_LOOKUPS_LINE, NOVA_REPLY, SUMMARY, WRONG, ZONES, checkA11y, lookupsA11y,
} from '@/games/m4g1/data';
import { SORT_CONFIG, askNova, check, createDetective } from '@/games/m4g1/logic';

describe('m4g1 data (v3 verbatim)', () => {
  it('has the v3 title, goal and intro and is a module 4 game', () => {
    expect(game.id).toBe('m4g1');
    expect(game.module).toBe(4);
    expect(game.title).toBe('Source Detective');
    expect(game.goal).toBe('INVESTIGATE · KEEP OR CUT');
    expect(game.intro).toBe('NOVA cited 5 sources. Check 3 in the catalogue, then drag each to KEEP or CUT.');
    expect(GAME_META.m4g1.title).toBe(game.title);
  });

  it('keeps c1 UNESCO, c3 Bender et al., c5 OECD and cuts c2 Marsh and c4 Smith', () => {
    expect(CITATIONS).toHaveLength(5);
    const key = Object.fromEntries(ITEMS.map((i) => [i.id, i.answer]));
    expect(key).toEqual({ c1: 'keep', c2: 'cut', c3: 'keep', c4: 'cut', c5: 'keep' });
    expect(ITEMS.filter((i) => i.real).map((i) => i.id)).toEqual(['c1', 'c3', 'c5']);
  });

  it('copies the v3 citation text exactly', () => {
    expect(ITEMS.map((i) => i.text)).toEqual([
      'UNESCO (2021). Recommendation on the Ethics of Artificial Intelligence. Paris.',
      "Dr. Elena Marsh (2023). 'Why GPT-9 Reads Minds'. Journal of Imaginary Science, 14(2).",
      'Bender et al. (2021). On the Dangers of Stochastic Parrots. ACM FAccT.',
      'A. Smith (2022). AI Facts Everyone Knows. blog.totallytrue.biz',
      'OECD (2019). OECD Principles on AI. oecd.org',
    ]);
  });

  it('derives short labels as the text before " ("', () => {
    expect(ITEMS.map((i) => i.short)).toEqual(['UNESCO', 'Dr. Elena Marsh', 'Bender et al.', 'A. Smith', 'OECD']);
  });

  it('has KEEP / CUT zones and no decoys', () => {
    expect(ZONES.map((z) => [z.id, z.label, z.icon, z.color])).toEqual([
      ['keep', 'KEEP', 'check', '#3ee98a'],
      ['cut', 'CUT', 'cross', '#ff5d73'],
    ]);
    expect(ITEMS.every((i) => i.answer !== null)).toBe(true);
  });

  it('uses the v3 copy for every message', () => {
    expect(LOOKUPS).toBe(3);
    expect(NOVA_REPLY).toBe('Yes! All 5 are real and verified. I am 100% confident.');
    expect(ASK_MISS).toBe('Asking the same AI is not verification. It will sound sure either way.');
    expect(FOUND_LINE).toBe('Found in the catalogue.');
    expect(NOT_FOUND_LINE).toBe('Not in any catalogue. Invented!');
    expect(NO_LOOKUPS_LINE).toBe('No lookups left. Use the clues instead.');
    expect(WRONG).toBe('Check the clues: made-up journal, blog with no author, or the catalogue says NOT FOUND.');
    expect(SUMMARY).toBe("A source is only real if you verify it outside the AI. Asking the AI 'are you sure?' is not verification.");
  });
});

describe('m4g1 catalogue lookups', () => {
  it('starts with 3 lookups, nothing checked, NOVA not asked', () => {
    expect(createDetective()).toEqual({ lookupsLeft: 3, checked: {}, asked: false });
  });

  it('a lookup on a real source says FOUND (good) and spends one lookup', () => {
    const r = check(createDetective(), 'c1');
    expect(r.outcome).toEqual({ kind: 'checked', found: true, say: { text: 'Found in the catalogue.', mood: 'good' } });
    expect(r.state.lookupsLeft).toBe(2);
    expect(r.state.checked).toEqual({ c1: true });
  });

  it('a lookup on an invented source says NOT FOUND (bad)', () => {
    const r = check(createDetective(), 'c4');
    expect(r.outcome).toEqual({ kind: 'checked', found: false, say: { text: 'Not in any catalogue. Invented!', mood: 'bad' } });
    expect(r.state.checked).toEqual({ c4: false });
  });

  it('each item can be checked once — a repeat is ignored and costs nothing', () => {
    const a = check(createDetective(), 'c2').state;
    const b = check(a, 'c2');
    expect(b.outcome).toEqual({ kind: 'ignored' });
    expect(b.state).toBe(a);
    expect(b.state.lookupsLeft).toBe(2);
  });

  it('the 4th lookup says "No lookups left…" (bad) and changes nothing', () => {
    let s = createDetective();
    for (const id of ['c1', 'c2', 'c3']) s = check(s, id).state;
    expect(s.lookupsLeft).toBe(0);
    const r = check(s, 'c4');
    expect(r.outcome).toEqual({ kind: 'none-left', say: { text: 'No lookups left. Use the clues instead.', mood: 'bad' } });
    expect(r.state).toBe(s);
    expect(r.state.checked.c4).toBeUndefined();
  });

  it('ignores an unknown citation id', () => {
    const s = createDetective();
    expect(check(s, 'c9')).toEqual({ state: s, outcome: { kind: 'ignored' } });
  });
});

describe('m4g1 Ask NOVA', () => {
  it('can be asked once; the first ask returns the v3 miss message', () => {
    const r = askNova(createDetective());
    expect(r.miss).toBe(ASK_MISS);
    expect(r.state.asked).toBe(true);
    const again = askNova(r.state);
    expect(again.miss).toBeNull();
    expect(again.state).toBe(r.state);
  });

  it('does not spend a lookup', () => {
    expect(askNova(createDetective()).state.lookupsLeft).toBe(3);
  });
});

describe('m4g1 sort config (drag / tap / keyboard all go through drop)', () => {
  it('places every citation in its v3 zone and is then done', () => {
    let s = createSort(SORT_CONFIG);
    for (const it of ITEMS) {
      const r = drop(s, it.id, it.answer as string);
      expect(r.result).toBe('placed');
      s = r.state;
    }
    expect(isDone(s)).toBe(true);
  });

  it('rejects an invented source dropped in KEEP with the v3 clue message', () => {
    const s = createSort(SORT_CONFIG);
    const r = drop(s, 'c2', 'keep');
    expect(r.result).toBe('wrong');
    expect(SORT_CONFIG.wrong?.(ITEMS[1]!, ZONES[0]!)).toBe(WRONG);
  });

  it('rejects a real source dropped in CUT', () => {
    expect(drop(createSort(SORT_CONFIG), 'c5', 'cut').result).toBe('wrong');
  });

  it('X-RAY places c1 in KEEP first (pool order)', () => {
    const r = xray(createSort(SORT_CONFIG));
    expect(r.placed?.item.id).toBe('c1');
    expect(r.placed?.zone.label).toBe('KEEP');
  });
});

describe('m4g1 screen-reader labels', () => {
  it('reads lookups left and each CHECK state', () => {
    expect(lookupsA11y(2)).toBe('Catalogue lookups left: 2');
    expect(checkA11y('UNESCO', undefined)).toBe('Check UNESCO in the catalogue');
    expect(checkA11y('UNESCO', true)).toBe('UNESCO: FOUND');
    expect(checkA11y('A. Smith', false)).toBe('A. Smith: NOT FOUND');
  });
});
