// Fonts: Press Start 2P bundled via @expo-google-fonts (no runtime Google Fonts request).
import { PressStart2P_400Regular } from '@expo-google-fonts/press-start-2p';
import { Platform, type TextStyle } from 'react-native';
import { fontSize, lineHeightFor } from './tokens';

export const PIXEL_FONT = 'PressStart2P_400Regular';

/** Map handed to expo-font's useFonts in app/_layout.tsx. */
export const FONT_ASSETS = { [PIXEL_FONT]: PressStart2P_400Regular } as const;

/** READABLE FONT setting: system sans-serif at 16 px for long text. */
export const READABLE_FONT: string | undefined = Platform.select({
  web: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  default: undefined,
});

export const pixelText = (size: number = fontSize.body): TextStyle => ({
  fontFamily: PIXEL_FONT,
  fontSize: size,
  lineHeight: lineHeightFor(size),
});

export const readableText: TextStyle = {
  ...(READABLE_FONT ? { fontFamily: READABLE_FONT } : {}),
  fontSize: 16,
  lineHeight: 26,
};

/** Style for long text (story, items, NOVA reply, tips) honouring the READABLE FONT setting. */
export function longTextStyle(readable: boolean, size: number = fontSize.body): TextStyle {
  return readable ? readableText : pixelText(size);
}
