// Polite screen-reader announcements ("Placed in SPAM", "Level clear, 3 stars", …).
import { AccessibilityInfo, Platform } from 'react-native';

let region: { textContent: string | null } | null = null;

function webRegion(): { textContent: string | null } | null {
  if (region) return region;
  const doc = (globalThis as { document?: Document }).document;
  if (!doc?.body) return null;
  const el = doc.createElement('div');
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('role', 'status');
  el.setAttribute('data-testid', 'a11y-announcer');
  el.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;';
  doc.body.appendChild(el);
  region = el;
  return region;
}

const log: string[] = [];

export function announce(text: string): void {
  if (!text) return;
  log.push(text);
  if (log.length > 50) log.shift();
  if (Platform.OS === 'web') {
    const r = webRegion();
    if (r) {
      // Clear then set so repeated identical messages are re-announced.
      r.textContent = '';
      setTimeout(() => {
        r.textContent = text;
      }, 30);
    }
    return;
  }
  AccessibilityInfo.announceForAccessibility(text);
}

/** Recent announcements (newest last) — for tests. */
export const announcements = (): readonly string[] => log;
export function clearAnnouncements(): void {
  log.length = 0;
}
