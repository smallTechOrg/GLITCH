// Parity between the web OFFLINE check and the backend demo provider (api heuristics/levers.py).
// The expected verdicts below were produced by running the backend's evaluate_levers() on this
// exact corpus; the tips are read from the backend source on disk so drift fails this test.
import fs from 'fs';
import path from 'path';
import { checkLevers } from '@/features/freewrite/levers';
import { ALL_LEVERS_TIP, LEVER_TIP } from '@/features/freewrite/data';
import type { LeverMap } from '@/contracts/state';

const L = (s: string): LeverMap => ({
  task: s.includes('T'),
  context: s.includes('C'),
  role: s.includes('R'),
  format: s.includes('F'),
  limit: s.includes('L'),
});

// [prompt, levers hit per backend: T C R F L]
const CORPUS: [string, string][] = [
  ['Act as a friendly science teacher. Explain photosynthesis to my 10-year-old brother, who loves plants. Use 3 short bullet points. Keep it under 80 words.', 'TCRFL'],
  ['plants', ''],
  ['Tell me about plants', ''],
  ['Tell me about green plants', 'T'],
  ['rewrite this paragraph about the moon please', 'F'],
  ['mystery shortcut listen', ''],
  ['remake the overlisted tableau', ''],
  ['As an amazing tutor, help me revise fractions for my grade 6 test', 'TCR'],
  ['You are a coach. Give me 5 drills in a numbered list.', 'TRF'],
  ['Write a poem about rain, no more than 8 lines', 'TFL'],
  ['explain café culture to my friend in 3 sentences', 'TCL'],
  ['Explain naïvely: myself mytable 3words', 'TL'],
  ["Write a résumé summary in 2 paragraphs because I'm applying", 'TCFL'],
  ['Describe the water cycle in ٣ points for my class', 'TCL'],
  ['Explain_this plan_b to me now please', ''],
  ['pretend you are a pirate and describe treasure maps for kids', 'TR'],
  ['Make a Q&A about volcanoes, max 100 words', 'TFL'],
  ['compare cats and dogs as a friend would, briefly', 'TR'],
  ['Summarize WWI in a table within 50 words', 'TFL'],
  ['Plan my 3-day trip; I am 14 years old', 'TC'],
];

describe('offline check matches the backend demo provider', () => {
  it.each(CORPUS)('%s', (prompt, hits) => {
    expect(checkLevers(prompt)).toEqual(L(hits));
  });
});

describe('canned tips match the backend', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../../../api/src/glitch_api/heuristics/levers.py'), 'utf8');

  it.each(Object.entries(LEVER_TIP))('%s tip is verbatim', (lever, tip) => {
    const m = new RegExp(`"${lever}":\\s*"([^"]*)"`).exec(src);
    expect(m?.[1]).toBe(tip);
  });

  it('all-five tip is verbatim', () => {
    expect(/ALL_FIVE_TIP: Final = "([^"]*)"/.exec(src)?.[1]).toBe(ALL_LEVERS_TIP);
  });
});
