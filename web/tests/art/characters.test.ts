// A2 characters: every id renders at contract size, v3 geometry is exact, frames differ
// where they should, output is deterministic.
import { CHAR_H, CHAR_W, NOVA_H, type CharFrame, type FrameBuffer } from '@/contracts/art';
import { HERO_IDS, NPC_IDS, type CharacterId } from '@/contracts/ids';
import { CHAR_PAL, NOVA_THINK_COLORS, drawCharacter, thinkTick } from '@/art/characters';
import { spriteBuffer } from '@/art/Sprite';
import { HEROES, NPCS } from '@/content/heroes';
import { PAL } from '@/pixel/palette';

const ALL: readonly CharacterId[] = [...HERO_IDS, ...NPC_IDS];
const PEOPLE = ALL.filter((id) => id !== 'n');

const opaque = (fb: FrameBuffer): number => {
  let n = 0;
  for (let i = 3; i < fb.data.length; i += 4) if ((fb.data[i] ?? 0) > 0) n++;
  return n;
};
/** FNV-1a over RGBA bytes — a compact deterministic fingerprint for snapshots. */
const hash = (fb: FrameBuffer): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < fb.data.length; i++) h = Math.imul(h ^ (fb.data[i] ?? 0), 0x01000193) >>> 0;
  return `${fb.w}x${fb.h}:${h.toString(16).padStart(8, '0')}`;
};
const same = (a: FrameBuffer, b: FrameBuffer): boolean => hash(a) === hash(b);

describe('drawCharacter — sizes and coverage', () => {
  it.each(PEOPLE)('%s renders a non-empty 24×32 framebuffer for every frame', (id) => {
    for (const f of ['idle', 'blink', 'talk', 'think'] as CharFrame[]) {
      const fb = drawCharacter(id, f);
      expect([fb.w, fb.h]).toEqual([CHAR_W, CHAR_H]);
      expect(opaque(fb)).toBeGreaterThan(200);
    }
  });

  it('NOVA renders a non-empty 24×28 framebuffer for every frame and tick', () => {
    for (const f of ['idle', 'blink', 'talk', 'think'] as CharFrame[]) {
      for (const t of [0, 1, 2]) {
        const fb = drawCharacter('n', f, t);
        expect([fb.w, fb.h]).toEqual([CHAR_W, NOVA_H]);
        expect(opaque(fb)).toBeGreaterThan(150);
      }
    }
  });

  it('defaults to the idle frame', () => {
    for (const id of ALL) expect(same(drawCharacter(id), drawCharacter(id, 'idle', 0))).toBe(true);
  });

  it('head crop and outlined variants (Sprite) are non-empty', () => {
    for (const id of ALL) {
      const head = spriteBuffer(id, 'idle', 0, false, 'head');
      expect([head.w, head.h]).toEqual([14, 14]);
      expect(opaque(head)).toBeGreaterThan(50);
      const o = spriteBuffer(id, 'idle', 0, true, 'full');
      expect(o.w).toBe(CHAR_W + 2);
      expect(o.get(0, 0)).toBe('');
    }
  });
});

describe('drawCharacter — v3 drawChar geometry', () => {
  it('paints skin, eyes, blush, mouth, top and shoes where v3 does (KABIR, no accessory)', () => {
    const fb = drawCharacter('k');
    const look = NPCS.k.look!;
    expect(fb.get(8, 9)).toBe(look.skin);
    expect(fb.get(9, 8)).toBe(PAL.k);
    expect(fb.get(14, 9)).toBe(PAL.k);
    expect(fb.get(8, 10)).toBe(CHAR_PAL.blush);
    expect(fb.get(11, 11)).toBe(CHAR_PAL.mouth);
    expect(fb.get(11, 12)).toBe(look.skin);
    expect(fb.get(7, 15)).toBe(look.top);
    expect(fb.get(8, 29)).toBe(CHAR_PAL.shoe);
    expect(fb.get(7, 2)).toBe(look.hair); // short hair
    expect(fb.get(0, 0)).toBe('');
  });

  it('draws each hero accessory and hair style', () => {
    expect(drawCharacter('scout').get(7, 7)).toBe(PAL.y); // goggles frame
    expect(drawCharacter('scout').get(8, 8)).toBe(PAL.c); // lens
    expect(drawCharacter('chrono').get(11, 14)).toBe(PAL.y); // cape clasp
    expect(drawCharacter('chrono').get(5, 26)).toBe(CHAR_PAL.cape);
    expect(drawCharacter('chrono').get(12, 1)).toBe(HEROES.chrono.hair); // spiky crest
    expect(drawCharacter('guard').get(1, 18)).toBe(PAL.r); // shield boss
    expect(drawCharacter('guard').get(10, 1)).toBe(PAL.y); // helmet crest
    expect(drawCharacter('oracle').get(21, 21)).toBe(PAL.y); // orb
    expect(drawCharacter('oracle').get(20, 20)).toBe('#ffffff');
    expect(drawCharacter('oracle').get(10, 0)).toBe(HEROES.oracle.hair); // hat crown
    expect(drawCharacter('z').get(5, 10)).toBe(NPCS.z.look!.hair); // long hair
    expect(drawCharacter('d').get(11, 0)).toBe(NPCS.d.look!.hair); // bun
  });
});

describe('drawCharacter — frames', () => {
  it('blink closes the eyes to the bottom row', () => {
    const fb = drawCharacter('k', 'blink');
    expect(fb.get(9, 8)).toBe(NPCS.k.look!.skin);
    expect(fb.get(9, 9)).toBe(PAL.k);
  });

  it('SCOUT blink shutters the goggle lenses', () => {
    expect(drawCharacter('scout', 'blink').get(8, 8)).toBe(PAL.Y);
  });

  it('talk opens the mouth to 2×2', () => {
    for (const id of PEOPLE) {
      const fb = drawCharacter(id, 'talk');
      expect(fb.get(11, 12)).toBe(CHAR_PAL.mouth);
      expect(fb.get(12, 12)).toBe(CHAR_PAL.mouth);
    }
  });

  it('idle, blink and talk all differ for every character', () => {
    for (const id of ALL) {
      const [i, b, t] = (['idle', 'blink', 'talk'] as CharFrame[]).map((f) => drawCharacter(id, f));
      expect(same(i!, b!)).toBe(false);
      expect(same(i!, t!)).toBe(false);
      expect(same(b!, t!)).toBe(false);
    }
  });

  it("'think' on a person is their idle frame", () => {
    for (const id of PEOPLE) expect(same(drawCharacter(id, 'think', 1), drawCharacter(id))).toBe(true);
  });

  it('tick is ignored outside NOVA think', () => {
    for (const id of ALL) expect(same(drawCharacter(id, 'idle', 2), drawCharacter(id, 'idle', 0))).toBe(true);
  });
});

describe('NOVA (v3 drawNova)', () => {
  it('idle matches v3: red antenna light, teal eyes with white glints, chest light', () => {
    const fb = drawCharacter('n');
    expect(fb.get(11, 1)).toBe(PAL.r);
    expect(fb.get(8, 11)).toBe(PAL.c);
    expect(fb.get(9, 12)).toBe('#ffffff');
    expect(fb.get(14, 12)).toBe('#ffffff');
    expect(fb.get(11, 21)).toBe(PAL.c);
    expect(fb.get(7, 10)).toBe(CHAR_PAL.novaVisor);
  });

  it('think cycles the antenna light through 3 colours and scans the eyes', () => {
    const frames = [0, 1, 2].map((t) => drawCharacter('n', 'think', t));
    expect(frames.map((f) => f.get(11, 1))).toEqual([...NOVA_THINK_COLORS]);
    expect(new Set(NOVA_THINK_COLORS).size).toBe(3);
    expect(frames[0]!.get(8, 12)).toBe('#ffffff');
    expect(frames[1]!.get(9, 12)).toBe('#ffffff');
    expect(frames[2]!.get(10, 12)).toBe('#ffffff');
    expect(new Set(frames.map(hash)).size).toBe(3);
  });

  it('think ticks wrap modulo 3 (including negatives and fractions)', () => {
    expect(thinkTick(3)).toBe(0);
    expect(thinkTick(-1)).toBe(2);
    expect(thinkTick(4.7)).toBe(1);
    expect(thinkTick(Number.NaN)).toBe(0);
    expect(same(drawCharacter('n', 'think', 5), drawCharacter('n', 'think', 2))).toBe(true);
  });

  it('blink flattens the eyes; talk lights a 2×2 voice light', () => {
    const b = drawCharacter('n', 'blink');
    expect(b.get(8, 11)).toBe(CHAR_PAL.novaVisor);
    expect(b.get(8, 13)).toBe(PAL.c);
    const t = drawCharacter('n', 'talk');
    expect([t.get(11, 13), t.get(12, 14)]).toEqual([PAL.c, PAL.c]);
    expect(drawCharacter('n').get(11, 13)).toBe(CHAR_PAL.novaVisor);
  });
});

describe('determinism', () => {
  it('renders identical bytes on repeated calls', () => {
    for (const id of ALL) expect(hash(drawCharacter(id, 'talk', 1))).toBe(hash(drawCharacter(id, 'talk', 1)));
  });

  it('matches the recorded fingerprints', () => {
    const out: Record<string, string> = {};
    for (const id of ALL) {
      for (const f of ['idle', 'blink', 'talk'] as CharFrame[]) out[`${id}:${f}`] = hash(drawCharacter(id, f));
    }
    for (const t of [0, 1, 2]) out[`n:think:${t}`] = hash(drawCharacter('n', 'think', t));
    expect(out).toMatchSnapshot();
  });
});
