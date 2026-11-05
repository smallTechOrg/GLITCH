// Pixel engine: framebuffer, v3 primitives (identical maths), icons, outline, PNG round trip.
import { decode } from 'fast-png';
import { createFrameBuffer, crop, outline, parseColor, scaleUp } from '@/pixel/framebuffer';
import { band, cir, dith, mtn, px1, rc, rnd, shuf, txt } from '@/pixel/primitives';
import { drawGrid } from '@/pixel/grid';
import { PAL } from '@/pixel/palette';
import { FONT3 } from '@/pixel/font3';
import { base64, clearPixelCache, encodePng, pixelAsset, pixelCacheStats, toDataUri } from '@/pixel/png';
import { IC, V3_ICON_COUNT } from '@/art/icons';
import { iconBuffer } from '@/art/Icon';
import { drawCharacter } from '@/art/characters';
import { drawScene } from '@/art/scenes';
import { SCENE_IDS } from '@/contracts/art';

const count = (fb: { w: number; h: number; get(x: number, y: number): string }, c?: string): number => {
  let n = 0;
  for (let y = 0; y < fb.h; y++) for (let x = 0; x < fb.w; x++) if (c ? fb.get(x, y) === c : fb.get(x, y) !== '') n++;
  return n;
};

describe('framebuffer', () => {
  it('starts transparent and reports set pixels as #rrggbb', () => {
    const fb = createFrameBuffer(4, 3);
    expect(fb.get(0, 0)).toBe('');
    fb.fill(1, 1, 1, 1, '#FF5D73');
    expect(fb.get(1, 1)).toBe('#ff5d73');
    expect(fb.get(9, 9)).toBe('');
  });

  it('rejects non-integer or empty sizes', () => {
    expect(() => createFrameBuffer(0, 3)).toThrow();
    expect(() => createFrameBuffer(2.5, 3)).toThrow();
  });

  it('parses hex and rgba colours and ignores unknown ones', () => {
    expect(parseColor('#abc')).toEqual({ r: 170, g: 187, b: 204, a: 1 });
    expect(parseColor('rgba(0,0,0,.25)')).toEqual({ r: 0, g: 0, b: 0, a: 0.25 });
    expect(parseColor('banana')).toBeNull();
  });

  it('blends translucent fills over opaque pixels like canvas source-over', () => {
    const fb = createFrameBuffer(1, 1);
    fb.fill(0, 0, 1, 1, '#ffffff');
    fb.fill(0, 0, 1, 1, 'rgba(0,0,0,.25)');
    expect(fb.get(0, 0)).toBe('#bfbfbf');
    expect(fb.alpha(0, 0)).toBe(255);
  });
});

describe('v3 primitives', () => {
  it('rnd matches the v3 formula on fixed seeds', () => {
    expect(rnd(0)).toBeCloseTo(0.1829163520505972, 12);
    expect(rnd(1)).toBeCloseTo(0.25991517580132495, 12);
    expect(rnd(7.3)).toBeCloseTo(0.5881774312656489, 12);
  });

  it('rc rounds every coordinate and clips to the buffer', () => {
    const fb = createFrameBuffer(10, 10);
    rc(fb, 1.4, 1.6, 2.5, 1.2, '#ffffff'); // → x1 y2 w3 h1
    expect(count(fb)).toBe(3);
    expect(fb.get(1, 2)).toBe('#ffffff');
    expect(fb.get(3, 2)).toBe('#ffffff');
    rc(fb, -5, -5, 7, 7, '#ff0000'); // clipped to 2×2
    expect(count(fb, '#ff0000')).toBe(4);
  });

  it('cir draws the v3 span circle (r=2 → 17 px)', () => {
    const fb = createFrameBuffer(9, 9);
    cir(fb, 4, 4, 2, '#ffd23b');
    expect(count(fb)).toBe(17);
    expect(fb.get(4, 2)).toBe('#ffd23b');
    expect(fb.get(2, 2)).toBe('');
  });

  it('band splits the height into equal colour bands', () => {
    const fb = createFrameBuffer(4, 6);
    band(fb, 0, 6, ['#000001', '#000002', '#000003'], 4);
    expect([fb.get(0, 0), fb.get(0, 2), fb.get(0, 5)]).toEqual(['#000001', '#000002', '#000003']);
  });

  it('mtn and dith are deterministic for a seed', () => {
    const a = createFrameBuffer(40, 30);
    const b = createFrameBuffer(40, 30);
    mtn(a, 40, 20, 8, 0.1, 3, '#123456');
    mtn(b, 40, 20, 8, 0.1, 3, '#123456');
    dith(a, 0, 0, 40, 10, '#ffffff', 11, 0.25);
    dith(b, 0, 0, 40, 10, '#ffffff', 11, 0.25);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    expect(count(a)).toBeGreaterThan(0);
  });

  it('txt renders FONT3 glyphs with a 4 px advance and skips unknown characters', () => {
    const fb = createFrameBuffer(12, 5);
    txt(fb, 0, 0, 'A?', '#ffffff');
    const ones = (FONT3.A ?? '').split('').filter((c) => c === '1').length + (FONT3['?'] ?? '').split('').filter((c) => c === '1').length;
    expect(count(fb)).toBe(ones);
    expect(fb.get(1, 0)).toBe('#ffffff'); // A row 0 = 010
    const fb2 = createFrameBuffer(12, 5);
    txt(fb2, 0, 0, 'a', '#ffffff');
    expect(count(fb2)).toBe(0);
  });

  it('px1 and shuf behave like v3', () => {
    const fb = createFrameBuffer(3, 3);
    px1(fb, 1.7, 2.2, '#ffffff');
    expect(fb.get(1, 2)).toBe('#ffffff');
    expect(shuf([1, 2, 3, 4, 5], 7)).toEqual(shuf([1, 2, 3, 4, 5], 7));
    expect(shuf([1, 2, 3, 4, 5], 7).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('icons + grids', () => {
  it('ships the 40 v3 icons plus heart0/star0, all 12×12 with palette keys only', () => {
    expect(V3_ICON_COUNT).toBe(40);
    expect(Object.keys(IC)).toHaveLength(42);
    for (const [name, g] of Object.entries(IC)) {
      expect(g).toHaveLength(12);
      for (const row of g) {
        expect(row).toHaveLength(12);
        for (const ch of row) if (ch !== '.') expect([name, ch, ch in PAL]).toEqual([name, ch, true]);
      }
    }
  });

  it('derives heart0/star0 exactly like v3 (no reds/yellows/white left)', () => {
    expect(IC.heart0.join('')).not.toMatch(/[rRw]/);
    expect(IC.star0.join('')).not.toMatch(/[yYw]/);
    expect(IC.heart0[3]).toBe('kdGddkkddddk');
  });

  it('drawGrid maps palette keys to colours and dots to transparency', () => {
    const fb = drawGrid(IC.heart);
    expect(fb.w).toBe(12);
    expect(fb.get(0, 0)).toBe('');
    expect(fb.get(2, 1)).toBe(PAL.k);
    expect(fb.get(2, 3)).toBe(PAL.w);
  });

  it('outline adds a 1 px white border around opaque pixels (w+2 × h+2)', () => {
    const src = createFrameBuffer(1, 1);
    src.fill(0, 0, 1, 1, '#ff0000');
    const o = outline(src);
    expect([o.w, o.h]).toEqual([3, 3]);
    expect(o.get(1, 1)).toBe('#ff0000');
    expect([o.get(0, 1), o.get(2, 1), o.get(1, 0), o.get(1, 2)]).toEqual(['#ffffff', '#ffffff', '#ffffff', '#ffffff']);
    expect(o.get(0, 0)).toBe('');
    expect(iconBuffer('star', true).w).toBe(14);
  });

  it('crop and scaleUp keep pixels crisp', () => {
    const fb = drawGrid(IC.check);
    const c = crop(fb, 8, 1, 4, 4);
    expect(c.get(2, 0)).toBe(fb.get(10, 1));
    const s = scaleUp(fb, 3);
    expect([s.w, s.h]).toEqual([36, 36]);
    expect(s.get(31, 5)).toBe(fb.get(10, 1));
  });
});

describe('PNG encoding', () => {
  beforeEach(() => clearPixelCache());

  it('round-trips a framebuffer through fast-png', () => {
    const fb = drawGrid(IC.flame);
    const png = decode(encodePng(fb));
    expect([png.width, png.height, png.channels]).toEqual([12, 12, 4]);
    expect(Array.from(png.data as Uint8Array)).toEqual(Array.from(fb.data));
  });

  it('produces a base64 PNG data URI', () => {
    expect(base64(new Uint8Array([77, 97, 110]))).toBe('TWFu');
    expect(base64(new Uint8Array([77, 97]))).toBe('TWE=');
    expect(base64(new Uint8Array([77]))).toBe('TQ==');
    expect(toDataUri(drawGrid(IC.star))).toMatch(/^data:image\/png;base64,iVBORw0KGgo/);
  });

  it('memoises by key and builds each artwork once per scale', () => {
    const build = jest.fn(() => drawGrid(IC.lock));
    const a = pixelAsset('ic:lock', build);
    const b = pixelAsset('ic:lock', build);
    expect(a).toBe(b);
    expect(build).toHaveBeenCalledTimes(1);
    const big = pixelAsset('ic:lock', build, 4);
    expect(big.scale).toBe(4);
    expect(build).toHaveBeenCalledTimes(2);
    expect(pixelCacheStats().size).toBe(2);
  });
});

describe('art stubs (A2 replaces)', () => {
  it('return correctly sized character and scene buffers', () => {
    expect([drawCharacter('scout').w, drawCharacter('scout').h]).toEqual([24, 32]);
    expect([drawCharacter('n', 'think', 2).w, drawCharacter('n').h]).toEqual([24, 28]);
    for (const id of SCENE_IDS) {
      const s = drawScene(id);
      expect([s.w, s.h]).toEqual([192, 80]);
      expect(s.get(0, 0)).not.toBe('');
    }
    expect(drawScene('lab', 64, 20).w).toBe(64);
  });
});
