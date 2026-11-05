// Types text at a fixed rate (storytime 22 ms/char); reduced motion shows it at once.
import { useCallback, useEffect, useRef, useState } from 'react';
import { TYPE_MS_PER_CHAR } from './stepped';
import { useReducedMotion } from './useReducedMotion';

export interface Typewriter {
  shown: string;
  done: boolean;
  /** Finish immediately (first Space/Enter/→ while typing). */
  complete(): void;
}

export function useTypewriter(text: string, msPerChar: number = TYPE_MS_PER_CHAR): Typewriter {
  const reduced = useReducedMotion();
  const [n, setN] = useState(reduced ? text.length : 0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = (): void => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => {
    stop();
    if (reduced || !text) {
      setN(text.length);
      return;
    }
    setN(0);
    timer.current = setInterval(() => {
      setN((k) => {
        if (k + 1 >= text.length) stop();
        return Math.min(text.length, k + 1);
      });
    }, msPerChar);
    return stop;
  }, [text, msPerChar, reduced]);
  const complete = useCallback(() => {
    stop();
    setN(text.length);
  }, [text]);
  return { shown: text.slice(0, n), done: n >= text.length, complete };
}
