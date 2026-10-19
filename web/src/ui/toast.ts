// Toast queue (spec: one at a time, 2.3 s each, polite live region). Usable outside React.
import { create } from 'zustand';

export const TOAST_MS = 2300;

export interface ToastItem {
  id: number;
  text: string;
}

interface ToastState {
  current: ToastItem | null;
  queue: ToastItem[];
}

export const useToastStore = create<ToastState>(() => ({ current: null, queue: [] }));

let seq = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

function showNext(): void {
  const { queue } = useToastStore.getState();
  const [next, ...rest] = queue;
  if (!next) {
    timer = null;
    useToastStore.setState({ current: null });
    return;
  }
  useToastStore.setState({ current: next, queue: rest });
  timer = setTimeout(showNext, TOAST_MS);
}

/** Queue a toast. */
export function toast(text: string): void {
  if (!text) return;
  const item = { id: ++seq, text };
  useToastStore.setState((s) => ({ queue: [...s.queue, item] }));
  if (!timer) showNext();
}

/** Tests only. */
export function resetToasts(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  useToastStore.setState({ current: null, queue: [] });
}
