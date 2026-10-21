// "NOVA REPLIES" (or "CLASSIC ANSWER" offline) console box with light formatting and the
// "DEMO NOVA" tag when the server used the demo provider.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, fontSize } from '../../theme/tokens';
import { PixelText } from '../../ui/PixelText';
import { Tag } from '../../ui/Tag';
import { Terminal } from '../../ui/Terminal';
import { COPY } from './data';
import { formatReply } from './logic';

export interface ReplyBoxProps {
  label: string;
  reply: string;
  demo: boolean;
}

export function ReplyBox({ label, reply, demo }: ReplyBoxProps): React.JSX.Element {
  const lines = formatReply(reply);
  return (
    <Terminal variant="out" testID="fw-reply">
      <View style={styles.head}>
        <PixelText size={fontSize.tiny} color={colors.ac} accessibilityRole="header">{label}</PixelText>
        {demo ? <Tag label={COPY.demoTag} variant="soon" testID="fw-demo-tag" /> : null}
      </View>
      <View testID="fw-reply-text" style={styles.body}>
        {lines.map((l, i) => (
          <PixelText key={i} long>{l}</PixelText>
        ))}
      </View>
    </Terminal>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 6 },
  body: { gap: 4 },
});
