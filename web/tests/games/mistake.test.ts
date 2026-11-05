// games/mistake.ts — the shared payload builder (contract bounds: itemText ≤ 160, concept via conceptOf).
import { ITEM_TEXT_MAX, buildMistake, clipItemText } from '@/games/mistake';
import { freeWriteMistake } from '@/games/m2g2/logic';
import { auditMistake, initialOn } from '@/games/m3g2/logic';
import { shipMistake } from '@/games/m4g3/logic';
import { START_DESIGN, XRAY_DESIGN } from '@/games/m4g3/data';
import { lockMistake } from '@/games/m2g1/logic';
import { ROUND_1, THRESHOLD, CAPS_WEIGHT } from '@/games/m2g1/data';

const ITEM_ID = /^[A-Za-z0-9._-]{1,40}$/;
const ANSWER = /^[a-z_]{1,24}$/;

describe('buildMistake', () => {
  it('derives the concept from (gameId, itemId) and defaults explain to true', () => {
    expect(buildMistake('m1g1', { itemId: 't3', answer: 'right', correct: 'wrong', itemText: 'x', answerLabel: 'RIGHT', correctLabel: 'WRONG' })).toEqual({
      itemId: 't3', answer: 'right', correct: 'wrong', concept: 'Generalization', itemText: 'x', answerLabel: 'RIGHT', correctLabel: 'WRONG', explain: true,
    });
    expect(buildMistake('m2g1', { itemId: 'r2', answer: 'missed', correct: 'pass', itemText: 'x', answerLabel: 'a', correctLabel: 'b' }).concept).toBe('Classification');
  });

  it('clips itemText to 160 chars (boundary: exactly 160 is kept as-is)', () => {
    const exact = 'a'.repeat(ITEM_TEXT_MAX);
    expect(clipItemText(exact)).toBe(exact);
    const long = clipItemText('b'.repeat(ITEM_TEXT_MAX + 40));
    expect(long).toHaveLength(ITEM_TEXT_MAX);
    expect(long.endsWith('…')).toBe(true);
  });

  it('every builder emits contract-shaped ids and answers', () => {
    const all = [
      freeWriteMistake({ id: 'fw3', goal: 'Plan a party.' }, 2),
      auditMistake(initialOn()),
      shipMistake(START_DESIGN),
      lockMistake(ROUND_1, 0, CAPS_WEIGHT.start),
    ];
    for (const m of all) {
      expect(m).toBeDefined();
      expect(m!.itemId).toMatch(ITEM_ID);
      expect(m!.answer).toMatch(ANSWER);
      expect(m!.correct).toMatch(ANSWER);
    }
    expect(all[0]).toMatchObject({ itemId: 'fw.fw3', answerLabel: '2/5 LEVERS', explain: false });
  });

  it('passing states produce no payload (error path: nothing to record)', () => {
    expect(shipMistake(XRAY_DESIGN)).toBeUndefined();
    expect(lockMistake(ROUND_1, THRESHOLD.start, CAPS_WEIGHT.start)).toBeUndefined();
  });
});
