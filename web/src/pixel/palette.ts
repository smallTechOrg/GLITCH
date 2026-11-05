// Sprite palette for string-grid art — v3 `PAL` (line 160) + `PAL.v` (line 207).
export const PAL = {
  k: '#16122b', w: '#f4f4ff', g: '#9aa0c8', G: '#5a6090', r: '#ff5d73', R: '#b02a45', o: '#ffa63d',
  y: '#ffd23b', Y: '#b88a00', l: '#8ef06a', e: '#3ee98a', E: '#1c8f55', c: '#5eead4', b: '#4cc9ff',
  B: '#2a6bd6', p: '#b794ff', P: '#6a44c2', m: '#ff6bb5', n: '#8b5a3c', N: '#5a341f', d: '#2b2f63',
  s: '#d7a47c', v: '#6a44c2',
} as const;

export type PalKey = keyof typeof PAL;
export type Palette = Readonly<Record<string, string>>;

export const isPalKey = (ch: string): ch is PalKey => Object.prototype.hasOwnProperty.call(PAL, ch);
