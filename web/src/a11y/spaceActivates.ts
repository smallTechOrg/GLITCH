// Space-key activation for non-button roles (switch, radio) on web.
// react-native-web's PressResponder only treats Space as a press for role button/menuitem,
// but spec/ui.md requires toggles (and radio cards) to work with Enter AND Space.
// Enter is already handled by Pressable; this adds Space. No-op props on native.
import { Platform } from 'react-native';

type KeyEvt = { nativeEvent: { key: string; repeat?: boolean }; preventDefault?: () => void };

export function spaceActivates(onActivate: (() => void) | undefined, disabled = false): object {
  if (Platform.OS !== 'web') return {};
  return {
    onKeyDown: (e: KeyEvt): void => {
      const k = e.nativeEvent.key;
      if (k !== ' ' && k !== 'Spacebar') return;
      e.preventDefault?.(); // no page scroll
      if (e.nativeEvent.repeat) return; // holding Space must not re-toggle (auto-repeat keydowns)
      if (!disabled && onActivate) onActivate();
    },
  };
}
