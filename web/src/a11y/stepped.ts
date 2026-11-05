// v3 animations are all CSS `steps(n)`; this is the stepped easing + every v3 timing (spec/ui.md → Animations).

/** CSS `steps(n, end)`: t∈[0,1] → floor(t·n)/n, with t=1 → 1. */
export function steps(n: number): (t: number) => number {
  const k = Math.max(1, Math.floor(n));
  return (t: number) => (t >= 1 ? 1 : t <= 0 ? 0 : Math.floor(t * k) / k);
}

export interface StepTiming {
  durationMs: number;
  steps: number;
}

export const ANIM = {
  wipe: { durationMs: 800, steps: 8 },
  bob: { durationMs: 1200, steps: 2 },
  bobFast: { durationMs: 500, steps: 2 }, // cutscene speaker `.talk`
  pop: { durationMs: 350, steps: 4 },
  shake: { durationMs: 350, steps: 6 },
  confetti: { durationMs: 2400, steps: 14 },
  flash: { durationMs: 500, steps: 2 },
  toastPop: { durationMs: 250, steps: 3 },
  sayPop: { durationMs: 250, steps: 3 },
} as const satisfies Record<string, StepTiming>;

export const TYPE_MS_PER_CHAR = 22; // storytime typing
export const NOVA_THINK_FPS = 6; // 3 frames
export const TALK_FPS = 4;
export const AMBIENT_FPS = 4;
export const BLINK_EVERY_MS = 3000;
export const BLINK_MS = 160;
export const FLASH_HOLD_MS = 2200; // sort FOCUS flash
export const BOB_PX = 4; // v3 translateY(-4px)
