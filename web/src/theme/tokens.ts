// v3 colour tokens (spec/GLITCH v3.html line 4 `:root`) plus the literal colours v3's CSS
// uses (lines 5–135). The ONLY place UI colours are defined (with pixel/palette.ts).
export const colors = {
  bg: '#0d0a24',
  bg2: '#15113a',
  cd: '#1c1648',
  ln: '#3a2f84',
  tx: '#f4f4ff',
  mu: '#9aa0c8',
  ac: '#ffd23b',
  ok: '#3ee98a',
  no: '#ff5d73',
  bl: '#4cc9ff',
  pk: '#ff6bb5',
  // literals used throughout v3's CSS
  deep: '#07051a', // top bar, inputs, shadows
  ink: '#16122b', // dark text on light surfaces
  logoShadow: '#b02a45',
  stepBg: '#120e34',
  okDark: '#1c8f55',
  okStripe: '#2ac272',
  white: '#ffffff',
  black: '#000000',
  sayBg: '#ffffff',
  sayBad: '#ffd9de',
  sayGood: '#d5ffe6',
  paper: '#f4ecd0',
  paperLine: '#fffbe8',
  paperBorder: '#cdbf8f',
  paperTag: '#8a6a2a',
  paperNum: '#b09a50',
  paperNote: '#555555',
  redacted: '#2a2a3a',
  redactedText: '#999999',
  redactedBorder: '#444444',
  cutBg: '#000000',
  cutPipAhead: '#333333',
  cutHint: '#8a8a8a', // v3 #666 raised for ≥4.5:1 on black
  orange: '#ffa63d',
  purple: '#b794ff',
  teal: '#5eead4',
  overlay: 'rgba(7,5,26,0.85)',
  zoneBg: 'rgba(7,5,26,0.6)',
  zoneOver: 'rgba(255,255,255,0.15)',
  focus: '#ffffff',
} as const;

export type ColorToken = keyof typeof colors;

/** Confetti colours (v3 modDoneScreen). */
export const confettiColors = ['#ffd23b', '#ff6bb5', '#4cc9ff', '#3ee98a', '#b794ff'] as const;

export const space = { xs: 4, sm: 6, md: 10, lg: 14, xl: 20, xxl: 30 } as const;

export const border = { width: 3, thin: 2, radius: 0 } as const;

/** v3 hard drop shadows as CSS box-shadow strings (RN ≥0.76 + RNW support `boxShadow`). */
export const shadows = {
  button: `3px 3px 0px ${colors.deep}`,
  card: `0px 0px 0px 3px ${colors.deep}, 6px 6px 0px 3px ${colors.deep}`,
  item: `3px 3px 0px ${colors.deep}`,
  paper: `6px 6px 0px ${colors.deep}`,
  selected: `0px 0px 0px 3px ${colors.ac}`,
} as const;

/** Font sizes: body copy ≥ 12 px (spec/ui.md → Accessibility), line height ≥ 1.9. */
export const fontSize = { tiny: 10, small: 11, body: 12, ui: 12, h3: 14, h2: 18, h1: 28, logo: 16 } as const;
export const lineHeightFor = (size: number): number => Math.ceil(size * 1.9);

export const layout = {
  maxWidth: 960,
  mobileBreakpoint: 640,
  minTouch: 44,
  zoneMinHeight: 64,
  pagePadding: 14,
} as const;
