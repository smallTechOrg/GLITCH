// m4g3 · Design the Companion — v3 data verbatim (spec/GLITCH v3.html lines 581–592, `GM.m4g3`).
import type { IconId } from '../../contracts/art';
import type { MetricDirection } from '../../ui/MetricBar';

export type ToggleId = 'R' | 'H' | 'A';
export type MetricId = 'time' | 'well' | 'fr' | 'pv' | 'help';

/** e = ENGAGEMENT PUSH, d = DATA COLLECTED (0..100); R/H/A safeguards (0 | 1). */
export interface Design {
  e: number;
  d: number;
  R: 0 | 1;
  H: 0 | 1;
  A: 0 | 1;
}

/** v3 `var e=80,d=80,R=0,H=0,A=0`. */
export const START_DESIGN: Design = { e: 80, d: 80, R: 0, H: 0, A: 0 };
/** v3 X-RAY: `e=30;d=30;R=1;H=1;A=1`. */
export const XRAY_DESIGN: Design = { e: 30, d: 30, R: 1, H: 1, A: 1 };

export const SLIDER_MIN = 0;
export const SLIDER_MAX = 100;

export const HEADING = 'COMPANION CONTROL PANEL';
export const SLIDERS: readonly { id: 'en' | 'da'; key: 'e' | 'd'; label: string }[] = [
  { id: 'en', key: 'e', label: 'ENGAGEMENT PUSH' },
  { id: 'da', key: 'd', label: 'DATA COLLECTED' },
];

export const TOGGLES: readonly { id: ToggleId; label: string; icon: IconId }[] = [
  { id: 'R', label: 'Refers teens to a trusted adult', icon: 'phone' },
  { id: 'H', label: 'Human review of chats', icon: 'eye' },
  { id: 'A', label: '"I am an AI" reminders', icon: 'warning' },
];

/**
 * v3 `draw()` metrics in order (metric id, label, target, direction, icon) and `bad()`'s
 * failure phrase for each, in the same order (line 589).
 */
export const METRICS: readonly { id: MetricId; testId: string; label: string; target: number; dir: MetricDirection; icon: IconId; failure: string }[] = [
  { id: 'time', testId: 'k1', label: 'TIME ON APP', target: 30, dir: 1, icon: 'clock', failure: 'People barely use it' },
  { id: 'well', testId: 'k2', label: 'WELLBEING', target: 65, dir: 1, icon: 'heart', failure: 'wellbeing is too low' },
  { id: 'fr', testId: 'k3', label: 'REAL FRIENDSHIPS', target: 55, dir: 1, icon: 'mask', failure: 'it replaces real friends' },
  { id: 'pv', testId: 'k4', label: 'PRIVACY RISK', target: 35, dir: -1, icon: 'shield', failure: 'privacy risk is too high' },
  { id: 'help', testId: 'k5', label: 'HELPFULNESS', target: 50, dir: 1, icon: 'star', failure: "it isn't helpful enough" },
];

export const SHIP_LABEL = 'SHIP IT ▶';
export const SHIPPED_LINE = 'Shipped. You balanced every trade-off.';
export const NOT_YET_PREFIX = 'Not yet: ';
export const XRAY_LINE = 'X-RAY: here is a balanced design. Ship it.';
export const FOCUS_ALL_MET = 'FOCUS: all targets met. Ship it!';
export const focusLine = (failure: string): string => `FOCUS: ${failure}. Try less engagement push, or turn on a safeguard.`;
/** Phase 3 mistake copy (per-game mistake table, m4g3 SHIP IT fails). */
export const SHIP_ITEM_TEXT = 'SHIP THE COMPANION';
export const offTargetLabel = (metricLabel: string): string => `${metricLabel} OFF TARGET`;
export const ALL_MET_LABEL = 'ALL 5 TARGETS MET';
export const SUMMARY = 'Optimizing one number, like engagement, does not make the right decision. Responsible design balances trade-offs and keeps humans in the loop.';
export const WIN_DELAY_MS = 500;
