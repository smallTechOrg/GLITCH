// Stepped RN Animated drivers + frame cycling, all disabled under reduced motion.
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform } from 'react-native';
import { steps, type StepTiming } from './stepped';
import { useReducedMotion } from './useReducedMotion';

const NATIVE = Platform.OS !== 'web';

export interface StepAnimationOptions extends StepTiming {
  loop?: boolean;
  play?: boolean; // default true
  delayMs?: number;
  /** Value shown when not animating (reduced motion / play=false). Default 1 for one-shots, 0 for loops. */
  restValue?: number;
  /** Change this to replay a one-shot animation (e.g. on every new bubble text). */
  trigger?: unknown;
}

/** Animated.Value going 0→1 in `steps` discrete jumps over `durationMs`. */
export function useStepAnimation(o: StepAnimationOptions): Animated.Value {
  const reduced = useReducedMotion();
  const rest = o.restValue ?? (o.loop ? 0 : 1);
  const v = useRef(new Animated.Value(rest)).current;
  const play = o.play ?? true;
  useEffect(() => {
    if (reduced || !play) {
      v.setValue(rest);
      return;
    }
    v.setValue(0);
    const anim = Animated.timing(v, {
      toValue: 1,
      duration: o.durationMs,
      delay: o.delayMs ?? 0,
      easing: steps(o.steps),
      useNativeDriver: NATIVE,
    });
    const run = o.loop ? Animated.loop(anim) : anim;
    run.start();
    return () => run.stop();
  }, [reduced, play, o.durationMs, o.steps, o.loop, o.delayMs, o.trigger, rest, v]);
  return v;
}

/** Integer frame index cycling 0..count-1 at `fps`; 0 when disabled or reduced motion. */
export function useFrameCycle(count: number, fps: number, enabled = true): number {
  const reduced = useReducedMotion();
  const [f, setF] = useState(0);
  useEffect(() => {
    if (!enabled || reduced || count <= 1 || fps <= 0) {
      setF(0);
      return;
    }
    const id = setInterval(() => setF((n) => (n + 1) % count), 1000 / fps);
    return () => clearInterval(id);
  }, [count, fps, enabled, reduced]);
  return f;
}

/** True for `holdMs` every `everyMs` (idle blink). Always false under reduced motion. */
export function usePulse(everyMs: number, holdMs: number, enabled = true): boolean {
  const reduced = useReducedMotion();
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!enabled || reduced) {
      setOn(false);
      return;
    }
    let t: ReturnType<typeof setTimeout> | undefined;
    const id = setInterval(() => {
      setOn(true);
      t = setTimeout(() => setOn(false), holdMs);
    }, everyMs);
    return () => {
      clearInterval(id);
      if (t) clearTimeout(t);
    };
  }, [everyMs, holdMs, enabled, reduced]);
  return on;
}

/** Bob: translateY 0 → -px → 0 in 2 steps (v3 `@keyframes bob`). */
export function bobTransform(v: Animated.Value, px: number): { transform: { translateY: Animated.AnimatedInterpolation<number> }[] } {
  return { transform: [{ translateY: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -px, 0] }) }] };
}
