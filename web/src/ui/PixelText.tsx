// Text in the pixel font. `long` text honours the READABLE FONT setting (system sans 16 px).
import React from 'react';
import { Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';
import { useGlitchStore } from '../state/store';
import { longTextStyle, pixelText } from '../theme/fonts';
import { colors, fontSize } from '../theme/tokens';

export interface PixelTextProps extends TextProps {
  size?: number;
  color?: string;
  long?: boolean;
  /** v3 `b/strong/h*` faux-bold text-shadow. */
  bold?: boolean;
  style?: StyleProp<TextStyle>;
}

export function PixelText({ size = fontSize.body, color = colors.tx, long = false, bold = false, style, ...rest }: PixelTextProps): React.JSX.Element {
  const readable = useGlitchStore((s) => s.settings.readableFont);
  const base = long ? longTextStyle(readable, size) : pixelText(size);
  const shadow: TextStyle | null =
    bold && !(long && readable) ? { textShadowColor: color, textShadowOffset: { width: 1, height: 0 }, textShadowRadius: 0 } : null;
  return <Text {...rest} style={[base, { color }, shadow, style]} />;
}
