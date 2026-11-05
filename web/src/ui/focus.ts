// Visible 3 px white focus ring on web (v3 line 133) for any focusable element.
import { useCallback, useState } from 'react';
import type { ViewStyle } from 'react-native';
import { colors } from '../theme/tokens';

export const FOCUS_RING: ViewStyle = { outlineWidth: 3, outlineStyle: 'solid', outlineColor: colors.focus, outlineOffset: 2 };

export function useFocusRing(): { focused: boolean; onFocus: () => void; onBlur: () => void; ring: ViewStyle | null } {
  const [focused, setFocused] = useState(false);
  const onFocus = useCallback(() => setFocused(true), []);
  const onBlur = useCallback(() => setFocused(false), []);
  return { focused, onFocus, onBlur, ring: focused ? FOCUS_RING : null };
}
