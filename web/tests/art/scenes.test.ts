// A2 scenes: every scene id renders at 192×80 (and other sizes), v3 composition spot
// checks, ambient frames differ where the spec says, deterministic output.
import { SCENE_H, SCENE_IDS, SCENE_W, type FrameBuffer, type SceneId } from '@/contracts/art';
import { SC, drawScene } from '@/art/scenes';
import { AMBIENT_PAL, AMBIENT_SCENES, ambientFrame, cityWindowLit, labScreenLit } from '@/art/ambient';
import { sceneBuffer } from '@/art/Scene';
import { PAL } from '@/pixel/palette';
import { rnd } from '@/pixel/primitives';

const opaque = (fb: FrameBuffer): number => {
  let n = 0;
  for (let i = 3; i < fb.data.length; i += 4) if ((fb.data[i] ?? 0) > 0) n++;
  return n;
};
const count = (fb: FrameBuffer, c: string): number => {
  let n = 0;
  for (let y = 0; y < fb.h; y++) for (let x = 0; x < fb.w; x++) if (fb.get(x, y) === c) n++;
  return n;
};
const hash = (fb: FrameBuffer): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < fb.data.length; i++) h = Math.imul(h ^ (fb.data[i] ?? 0), 0x01000193) >>> 0;
  return `${fb.w}x${fb.h}:${h.toString(16).padStart(8, '0')}`;
};

describe('drawScene — sizes and coverage', () => {
  it('has a painter for every SceneId', () => {
    expect(Object.keys(SC).sort()).toEqual([...SCENE_IDS].sort());
  });

  it.each(SCENE_IDS)('%s renders a mostly-opaque 192×80 framebuffer on both frames', (id) => {
    for (const f of [0, 1] as const) {
      const fb = drawScene(id, undefined, undefined, f);
      expect([fb.w, fb.h]).toEqual([SCENE_W, SCENE_H]);
      expect(opaque(fb)).toBeGreaterThan(SCENE_W * SCENE_H * 0.9);
      expect(fb.get(0, 0)).not.toBe('');
    }
  });

  it('renders at other sizes without throwing (compositions clip like v3 canvas)', () => {
    for (const id of SCENE_IDS) {
      for (const [w, h] of [[64, 20], [320, 120], [1, 1]] as const) {
        const fb = drawScene(id, w, h);
        expect([fb.w, fb.h]).toEqual([w, h]);
        expect(opaque(fb)).toBeGreaterThan(0);
      }
    }
  });

  it('rejects invalid sizes and unknown ids', () => {
    expect(() => drawScene('lab', 0, 80)).toThrow();
    expect(() => drawScene('nope' as SceneId)).toThrow(/unknown scene/);
  });

  it('works through the Scene filters (locked greyscale stays opaque)', () => {
    const fb = sceneBuffer('city', SCENE_W, SCENE_H, 0, 'locked');
    const c = fb.get(1, 1);
    expect(c.slice(1, 3)).toBe(c.slice(3, 5));
    expect(c.slice(3, 5)).toBe(c.slice(5, 7));
  });
});

describe('v3 SC compositions (frame 0)', () => {
  it('meadow: sky band, grass, tree trunk', () => {
    const fb = drawScene('meadow');
    expect(fb.get(0, 0)).toBe('#2f8fff');
    expect(fb.get(5, 78)).toBe('#2a7f44');
    expect(fb.get(10, 60)).toBe(PAL.N); // tree(10,60) trunk
  });

  it('lab: wall, grid line, TRAIN label, screen cells follow v3 rnd', () => {
    const fb = drawScene('lab');
    expect(fb.get(1, 1)).toBe('#0d2531');
    expect(fb.get(0, 1)).toBe('#123546');
    expect(fb.get(86, 40)).toBe(PAL.c); // 'T' of TRAIN
    for (let j = 0; j < 6; j++) { // row 6 is partly under the TRAIN label
      for (let i = 0; i < 15; i++) {
        expect(fb.get(66 + i * 4, 12 + j * 5)).toBe(rnd(i * 3 + j * 11) > 0.5 ? PAL.e : '#031318');
      }
    }
  });

  it('forge: brick wall, furnace mouth, anvil', () => {
    const fb = drawScene('forge');
    expect(['#3a2620', '#33211b', '#2a1a16']).toContain(fb.get(1, 1));
    expect(fb.get(67, 17)).toBe('#3b2c28'); // hood overlaps the furnace top
    expect(count(fb, '#120907')).toBeGreaterThan(100); // furnace mouth surround
    expect(fb.get(30, 52)).toBe(PAL.k);
    expect(count(fb, '#fff2a8')).toBeGreaterThan(200);
  });

  it('city: night band, moon, HIRE sign', () => {
    const fb = drawScene('city');
    expect(fb.get(77, 25)).toBe('#ff2e9a');
    expect(fb.get(82, 28)).toBe(PAL.m); // 'H'
    expect(fb.get(155, 12)).toBe('#fff6c8'); // lit crescent edge (gap between buildings)
    expect(fb.get(160, 12)).toBe('#0f0a30'); // moon shadow
    expect(fb.get(96, 50)).toBe('#3a2a7a'); // sign pole
  });

  it('news: cork board, desk, lamp, NEWS label', () => {
    const fb = drawScene('news');
    expect(fb.get(59, 11)).toBe('#d9c79a');
    expect(fb.get(50, 49)).toBe(PAL.N);
    expect(fb.get(125, 40)).toBe(PAL.y);
    expect(fb.get(88, 1)).toBe(PAL.r); // 'N'
  });

  it('title: dark sky, skyline, 12 glitch lines in pink/teal', () => {
    const fb = drawScene('title');
    expect(fb.get(1, 79)).toBe('#060414');
    expect(count(fb, PAL.m) + count(fb, PAL.c)).toBeGreaterThan(100);
  });
});

describe('ambient frames', () => {
  it('frame 1 differs from frame 0 exactly for the ambient scenes; meadow is static', () => {
    for (const id of SCENE_IDS) {
      const differs = hash(drawScene(id, SCENE_W, SCENE_H, 0)) !== hash(drawScene(id, SCENE_W, SCENE_H, 1));
      expect([id, differs]).toEqual([id, AMBIENT_SCENES.includes(id)]);
    }
  });

  it('lab screen pixels blink (some cells flip, most stay)', () => {
    let flipped = 0;
    for (let j = 0; j < 7; j++) for (let i = 0; i < 15; i++) if (labScreenLit(i, j, 0) !== labScreenLit(i, j, 1)) flipped++;
    expect(flipped).toBeGreaterThan(5);
    expect(flipped).toBeLessThan(60);
  });

  it('forge fire flickers: the flame grows taller on frame 1', () => {
    const a = drawScene('forge', SCENE_W, SCENE_H, 0);
    const b = drawScene('forge', SCENE_W, SCENE_H, 1);
    expect(count(b, '#fff2a8')).toBeGreaterThan(count(a, '#fff2a8'));
  });

  it('city windows twinkle and the HIRE sign flickers', () => {
    let flipped = 0;
    for (let i = 0; i < 16; i++) for (let j = 0; j < 9; j++) for (let k = 0; k < 2; k++) if (cityWindowLit(i, j, k, 0) !== cityWindowLit(i, j, k, 1)) flipped++;
    expect(flipped).toBeGreaterThan(5);
    const b = drawScene('city', SCENE_W, SCENE_H, 1);
    expect(b.get(77, 25)).toBe(AMBIENT_PAL.hireBorderDim);
    expect(b.get(82, 28)).toBe(AMBIENT_PAL.hireTextDim);
  });

  it('news lamp glow pulses', () => {
    expect(drawScene('news', SCENE_W, SCENE_H, 0).get(125, 43)).toBe(PAL.y);
    const b = drawScene('news', SCENE_W, SCENE_H, 1);
    expect(b.get(125, 43)).toBe(AMBIENT_PAL.lampHot);
    expect(b.get(120, 48)).toBe(AMBIENT_PAL.lampPool);
  });

  it('ambientFrame alternates 0/1 and is pinned to 0 under reduced motion', () => {
    expect([0, 1, 2, 3, 7].map((t) => ambientFrame(t, false))).toEqual([0, 1, 0, 1, 1]);
    expect([0, 1, 2, 3, 7].map((t) => ambientFrame(t, true))).toEqual([0, 0, 0, 0, 0]);
    expect(ambientFrame(Number.NaN, false)).toBe(0);
    for (const id of SCENE_IDS) {
      expect(hash(drawScene(id, SCENE_W, SCENE_H, ambientFrame(1, true)))).toBe(hash(drawScene(id)));
    }
  });
});

describe('determinism', () => {
  it('renders identical bytes on repeated calls', () => {
    for (const id of SCENE_IDS) expect(hash(drawScene(id, SCENE_W, SCENE_H, 1))).toBe(hash(drawScene(id, SCENE_W, SCENE_H, 1)));
  });

  it('matches the recorded fingerprints', () => {
    const out: Record<string, string> = {};
    for (const id of SCENE_IDS) for (const f of [0, 1] as const) out[`${id}:${f}`] = hash(drawScene(id, SCENE_W, SCENE_H, f));
    expect(out).toMatchSnapshot();
  });
});
