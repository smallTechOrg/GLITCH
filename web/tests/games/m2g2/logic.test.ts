// m2g2 · Prompt Forge — v3 invariants (spec/capabilities/v3-games.md → m2g2, v3 lines 541–548).
import { createSort, drop, isDone, remaining } from '@/dnd/sortEngine';
import game from '@/games/m2g2';
import {
  ANOTHER_FORGE_LINE, BUILT_EXPLANATION, FORGES, FORGE_SUBHEAD, NEXT_FORGE_LABEL, SLOTS, SLOT_CAPACITY, WIN_SUMMARY, WRONG_DECOY, WRONG_SLOT,
} from '@/games/m2g2/data';
import { FIRST_STAGE, builtPrompt, forgeConfig, nextStage } from '@/games/m2g2/logic';

describe('m2g2 data (v3 verbatim)', () => {
  it('has v3 title, goal and intro', () => {
    expect(game).toMatchObject({ id: 'm2g2', module: 2, title: 'Prompt Forge', goal: 'BUILD · ASSEMBLE THE PROMPT', intro: 'Build a strong prompt by dragging blocks into the right slots.' });
  });

  it('has five capacity-1 slots with v3 ids, labels, icons and colours, in order', () => {
    expect(SLOT_CAPACITY).toBe(1);
    expect(SLOTS).toEqual([
      { id: 'task', label: 'TASK', icon: 'target', color: '#ffd23b' },
      { id: 'ctx', label: 'CONTEXT', icon: 'globe', color: '#4cc9ff' },
      { id: 'role', label: 'ROLE', icon: 'mask', color: '#ff6bb5' },
      { id: 'fmt', label: 'FORMAT', icon: 'doc', color: '#3ee98a' },
      { id: 'lim', label: 'LIMIT', icon: 'clock', color: '#ffa63d' },
    ]);
  });

  it('has two forges with v3 titles and canned NOVA replies', () => {
    expect(FORGES.map((f) => f.title)).toEqual(['FORGE 1 · STUDY PLAN', 'FORGE 2 · EMAIL TO A TEACHER']);
    expect(FORGES[0]!.out).toBe('DAY 1 · Algebra basics · 90 min · DAY 2 · Practice sets · 120 min · DAY 3 · Mock test · 150 min');
    expect(FORGES[1]!.out).toBe('Subject: Extension request · Dear Mr. Rao, I was ill on Monday and have finished two of four sections...');
  });

  it.each([0, 1])('forge %i has 8 blocks: exactly one per slot plus 3 decoys at b0, b6, b7', (k) => {
    const f = FORGES[k]!;
    expect(f.blocks).toHaveLength(8);
    const answers = f.blocks.map((b) => b[1]);
    expect(answers.filter((a) => a === null)).toHaveLength(3);
    expect([0, 6, 7].every((i) => answers[i] === null)).toBe(true);
    for (const s of SLOTS) expect(answers.filter((a) => a === s.id)).toHaveLength(1);
  });

  it('keeps the v3 copy', () => {
    expect(FORGE_SUBHEAD).toBe('Drag each block into its slot. Some blocks are too vague to use.');
    expect(WRONG_DECOY).toBe('That block is too vague. Look for a specific one.');
    expect(WRONG_SLOT).toBe('That block is a different part of a prompt. Check the slot name.');
    expect(BUILT_EXPLANATION).toBe('Specific task, context, role, format and limit: that is why the answer is useful.');
    expect(NEXT_FORGE_LABEL).toBe('Next forge ▶');
    expect(ANOTHER_FORGE_LINE).toBe('Another forge. Same levers.');
    expect(WIN_SUMMARY).toBe('A strong prompt is specific, gives context, sets a role and audience, picks a format, adds limits, and then you iterate.');
  });
});

describe('m2g2 forge config + sort semantics', () => {
  const cfg = forgeConfig(FORGES[0]!);

  it('maps blocks to items b0…b7 and slots to zones with cap 1', () => {
    expect(cfg.items.map((i) => i.id)).toEqual(['b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7']);
    expect(cfg.items[1]).toEqual({ id: 'b1', answer: 'task', text: 'Make a 3-day study plan for my Maths test.' });
    expect(cfg.zones.map((z) => z.id)).toEqual(['task', 'ctx', 'role', 'fmt', 'lim']);
    expect(cfg.cap).toBe(1);
  });

  it('a decoy dropped in ANY slot is wrong with the vague-block message', () => {
    const s = createSort(cfg);
    for (const d of ['b0', 'b6', 'b7']) {
      for (const z of cfg.zones) {
        const r = drop(s, d, z.id);
        expect(r.result).toBe('wrong');
        expect(cfg.wrong!(cfg.items.find((i) => i.id === d)!, z)).toBe(WRONG_DECOY);
      }
    }
  });

  it('a real block in the wrong slot is wrong with the slot message', () => {
    const s = createSort(cfg);
    expect(drop(s, 'b1', 'ctx').result).toBe('wrong');
    expect(cfg.wrong!(cfg.items[1]!, cfg.zones[1]!)).toBe(WRONG_SLOT);
  });

  it('is done with the 3 decoys still in the pool', () => {
    let s = createSort(cfg);
    for (const it of cfg.items) if (it.answer) s = drop(s, it.id, it.answer).state;
    expect(isDone(s)).toBe(true);
    expect(remaining(s)).toHaveLength(0);
  });

  it('a capacity-1 slot rejects a second item', () => {
    // Synthetic second TASK block to exercise the cap with the forge config.
    const c2 = { ...cfg, items: [...cfg.items, { id: 'b8', answer: 'task', text: 'extra' }] };
    let s = createSort(c2);
    s = drop(s, 'b1', 'task').state;
    expect(drop(s, 'b8', 'task').result).toBe('wrong');
  });

  it('YOUR PROMPT joins the placed blocks in slot order, whatever the placement order', () => {
    let s = createSort(cfg);
    for (const id of ['b5', 'b3', 'b1', 'b4', 'b2']) s = drop(s, id, cfg.items.find((i) => i.id === id)!.answer!).state;
    expect(builtPrompt(s)).toBe(
      "Make a 3-day study plan for my Maths test. I have 3 hours a day and I'm weak at algebra. Act as a patient Maths tutor for a 14-year-old. Give it as a table: Day, Topic, Time. Keep it under 120 words.",
    );
  });

  it('YOUR PROMPT of an empty board is empty', () => {
    expect(builtPrompt(createSort(cfg))).toBe('');
  });
});

describe('m2g2 stage machine', () => {
  it('forge 1 → built 1 → forge 2 → built 2 → FORGE 3 (free write)', () => {
    expect(FIRST_STAGE).toEqual({ kind: 'forge', k: 0 });
    expect(nextStage({ kind: 'built', k: 0, prompt: 'x' })).toEqual({ kind: 'forge', k: 1 });
    expect(nextStage({ kind: 'built', k: 1, prompt: 'x' })).toEqual({ kind: 'free' });
  });

  it('only a built stage advances', () => {
    expect(nextStage({ kind: 'forge', k: 0 })).toEqual({ kind: 'forge', k: 0 });
    expect(nextStage({ kind: 'free' })).toEqual({ kind: 'free' });
  });
});
