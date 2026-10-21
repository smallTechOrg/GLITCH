// Sort engine = v3 sortGame semantics (game-runtime.md → Sort engine), incl. tap-to-select.
import {
  DEFAULT_WRONG, FOCUS_DIM_LINE, clearFlash, createSort, drop, dropSelected, focus, isDone, placedIn, poolItems,
  remaining, select, wrongMessage, wrongMistake, xray, xrayLine, zoneFull, type SortConfig,
} from '@/dnd/sortEngine';

const spam: SortConfig = {
  items: [
    { id: 'e1', answer: 'spam', text: 'WIN a FREE prize!!! Click now' },
    { id: 'e2', answer: 'ok', text: "Lunch at 1? I'm outside" },
    { id: 'e3', answer: 'spam', text: 'Account locked. Verify your password here' },
  ],
  zones: [
    { id: 'spam', label: 'SPAM' },
    { id: 'ok', label: 'NOT SPAM' },
  ],
};

const forge: SortConfig = {
  cap: 1,
  items: [
    { id: 'b0', answer: null, text: 'Help me study.' },
    { id: 'b1', answer: 'task', text: 'Make a 3-day study plan for my Maths test.' },
    { id: 'b2', answer: 'task', text: 'A second task block (test-only).' },
    { id: 'b3', answer: null, text: 'You know what I mean.' },
  ],
  zones: [{ id: 'task', label: 'TASK' }],
  wrong: (it) => (it.answer == null ? 'That block is too vague. Look for a specific one.' : 'That block is a different part of a prompt. Check the slot name.'),
};

describe('sortEngine.drop', () => {
  it('places an item dropped on its answer zone', () => {
    const r = drop(createSort(spam), 'e1', 'spam');
    expect(r.result).toBe('placed');
    expect(placedIn(r.state, 'spam').map((i) => i.id)).toEqual(['e1']);
    expect(poolItems(r.state).map((i) => i.id)).toEqual(['e2', 'e3']);
  });

  it('reports a wrong zone as wrong and leaves the item in the pool', () => {
    const s = createSort(spam);
    const r = drop(s, 'e2', 'spam');
    expect(r.result).toBe('wrong');
    expect(poolItems(r.state)).toHaveLength(3);
    expect(wrongMessage(r.state, 'e2', 'spam')).toBe(DEFAULT_WRONG);
  });

  it('ignores already placed, unknown items and unknown zones', () => {
    const s = drop(createSort(spam), 'e1', 'spam').state;
    expect(drop(s, 'e1', 'spam').result).toBe('ignored');
    expect(drop(s, 'nope', 'spam').result).toBe('ignored');
    expect(drop(s, 'e2', 'bin').result).toBe('ignored');
  });

  it('treats any decoy drop as wrong with the game message', () => {
    const s = createSort(forge);
    expect(drop(s, 'b0', 'task').result).toBe('wrong');
    expect(wrongMessage(s, 'b0', 'task')).toBe('That block is too vague. Look for a specific one.');
  });

  it('rejects a second item in a capacity-1 zone as wrong', () => {
    const s = drop(createSort(forge), 'b1', 'task').state;
    expect(zoneFull(s, 'task')).toBe(true);
    expect(drop(s, 'b2', 'task').result).toBe('wrong');
    expect(wrongMessage(s, 'b2', 'task')).toBe('That block is a different part of a prompt. Check the slot name.');
  });

  it('is done when every non-decoy is placed, even with decoys left in the pool', () => {
    let s = createSort({ ...forge, cap: undefined });
    expect(isDone(s)).toBe(false);
    s = drop(s, 'b1', 'task').state;
    s = drop(s, 'b2', 'task').state;
    expect(isDone(s)).toBe(true);
    expect(poolItems(s).map((i) => i.id)).toEqual(['b0', 'b3']);
  });

  it('rejects configs whose answers reference unknown zones or duplicate ids', () => {
    expect(() => createSort({ items: [{ id: 'x', answer: 'nowhere', text: 'x' }], zones: [] })).toThrow();
    expect(() => createSort({ items: [{ id: 'x', answer: null, text: 'x' }, { id: 'x', answer: null, text: 'y' }], zones: [] })).toThrow();
  });
});

describe('sortEngine tap-to-select (and keyboard: Enter/Space = press)', () => {
  it('toggles selection on an item and drops it on the next zone press', () => {
    let s = select(createSort(spam), 'e3');
    expect(s.selected).toBe('e3');
    expect(select(s, 'e3').selected).toBeNull();
    const r = dropSelected(s, 'spam');
    expect(r).toMatchObject({ result: 'placed', itemId: 'e3' });
    expect(r.state.selected).toBeNull();
    s = r.state;
    expect(select(s, 'e3').selected).toBeNull(); // placed items are inert
  });

  it('switches selection to another item and clears it after a wrong drop', () => {
    let s = select(createSort(spam), 'e1');
    s = select(s, 'e2');
    expect(s.selected).toBe('e2');
    const r = dropSelected(s, 'spam');
    expect(r.result).toBe('wrong');
    expect(r.state.selected).toBeNull();
  });

  it('ignores a zone press with nothing selected', () => {
    const r = dropSelected(createSort(spam), 'spam');
    expect(r).toMatchObject({ result: 'ignored', itemId: null });
  });
});

describe('sortEngine powers', () => {
  it('X-RAY places the first unplaced non-decoy in pool order with the v3 line', () => {
    let s = createSort(forge);
    const r = xray(s);
    expect(r.placed?.item.id).toBe('b1');
    expect(xrayLine(r.placed!.zone)).toBe('X-RAY: that one goes in TASK.');
    s = drop(createSort(spam), 'e1', 'spam').state;
    expect(xray(s).placed?.item.id).toBe('e2');
  });

  it('X-RAY returns null when nothing is left', () => {
    let s = createSort(spam);
    for (let i = 0; i < 3; i++) s = xray(s).state;
    expect(remaining(s)).toHaveLength(0);
    expect(xray(s).placed).toBeNull();
  });

  it('FOCUS dims decoys first (one per use), then flashes the first remaining pair', () => {
    let s = createSort(forge);
    let r = focus(s);
    expect(r.effect).toEqual({ kind: 'dim', itemId: 'b0' });
    s = r.state;
    r = focus(s);
    expect(r.effect).toEqual({ kind: 'dim', itemId: 'b3' });
    s = r.state;
    r = focus(s);
    expect(r.effect).toEqual({ kind: 'flash', itemId: 'b1', zoneId: 'task' });
    expect(clearFlash(r.state).flash).toBeNull();
    expect(FOCUS_DIM_LINE).toBe('FOCUS: that one is not an answer. Skip it.');
  });

  it('FOCUS returns null when no decoy or pair is left', () => {
    let s = createSort(spam);
    for (let i = 0; i < 3; i++) s = xray(s).state;
    expect(focus(s).effect).toBeNull();
  });
});

describe('sortEngine.wrongMistake (Phase 3)', () => {
  it('builds the payload from cfg.mistake(item, zone); undefined without a builder or for unknown ids', () => {
    const cfg: SortConfig = {
      ...spam,
      mistake: (it, z) => ({ itemId: it.id, answer: z.id, correct: it.answer ?? 'decoy', concept: 'Training data', itemText: it.text, answerLabel: z.label, correctLabel: 'SPAM' }),
    };
    const s = createSort(cfg);
    expect(wrongMistake(s, 'e1', 'ok')).toEqual({ itemId: 'e1', answer: 'ok', correct: 'spam', concept: 'Training data', itemText: 'WIN a FREE prize!!! Click now', answerLabel: 'NOT SPAM', correctLabel: 'SPAM' });
    expect(wrongMistake(s, 'nope', 'ok')).toBeUndefined();
    expect(wrongMistake(s, 'e1', 'nope')).toBeUndefined();
    expect(wrongMistake(createSort(spam), 'e1', 'ok')).toBeUndefined();
  });
});
