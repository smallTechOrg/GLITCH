// Navigation helpers for the shell (routes come only from contracts/routes.ts).
import { Platform } from 'react-native';
import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { HOME_HREF, completeHref, stepHref } from '../contracts/routes';
import type { FlowTarget } from '../engine/progression';

export function goTo(href: Href): void {
  router.navigate(href);
}

export function goHome(): void {
  router.navigate(HOME_HREF);
}

/** v3 `advance()` target → route. */
export function goFlow(t: FlowTarget): void {
  router.navigate(t.kind === 'step' ? stepHref(t.step) : completeHref(t.mod));
}

/** Touch-first device (native, or a coarse pointer on web) — storytime hint reads "TAP TO CONTINUE". */
export function isTouchDevice(): boolean {
  if (Platform.OS !== 'web') return true;
  const mm = (globalThis as { matchMedia?: (q: string) => { matches: boolean } }).matchMedia;
  return typeof mm === 'function' ? mm('(pointer: coarse)').matches : false;
}
