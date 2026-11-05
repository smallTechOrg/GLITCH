// Welcome / nickname (replaces v3 login, lines 338–346): v3 title banner with ZARA, KABIR,
// MS. D'SOUZA and NOVA bobbing (staggered 0.25 s), optional nickname, Start / Skip → Home.
import React, { useState } from 'react';
import { StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { HOME_HREF } from '../contracts/routes';
import { NICKNAME_MAX } from '../contracts/state';
import type { NpcId } from '../contracts/ids';
import { Scene } from '../art/Scene';
import { Sprite } from '../art/Sprite';
import { NPCS } from '../content/heroes';
import { completeOnboarding } from '../state/actions';
import { pixelText } from '../theme/fonts';
import { castScale } from '../theme/responsive';
import { border, colors, fontSize } from '../theme/tokens';
import { Card } from '../ui/Card';
import { GlitchLogo } from '../ui/GlitchLogo';
import { Page } from '../ui/Page';
import { PixelButton } from '../ui/PixelButton';
import { PixelText } from '../ui/PixelText';
import { WELCOME } from './copy';

const CAST: readonly NpcId[] = ['z', 'k', 'd', 'n'];

export function WelcomeScreen(): React.JSX.Element {
  const [name, setName] = useState('');
  const [focused, setFocused] = useState(false);
  const scale = castScale(useWindowDimensions().width);
  const finish = (n: string | null): void => {
    completeOnboarding(n);
    router.replace(HOME_HREF);
  };
  return (
    <Page testID="welcome-screen">
      <View style={styles.banner}>
        <Scene id="title" ambient />
        <View style={styles.titleWrap}>
          <GlitchLogo size={fontSize.h1} shadow={4} accessibilityRole="header" testID="welcome-logo" />
          <PixelText size={fontSize.small} color={colors.white}>{WELCOME.subtitle}</PixelText>
        </View>
        <View style={[styles.cast, scale < 4 ? styles.castNarrow : null]}>
          {CAST.map((id, i) => (
            <View key={id} style={styles.castMember}>
              <Sprite id={id} scale={scale} animate="bob" delayMs={i * 250} />
              <View style={styles.nameTag}>
                <PixelText size={fontSize.tiny} color={NPCS[id].color}>{NPCS[id].name}</PixelText>
              </View>
            </View>
          ))}
        </View>
      </View>
      <Card style={styles.card}>
        <PixelText long color={colors.mu} style={[styles.center, styles.tag]}>{WELCOME.tagline}</PixelText>
        <PixelText size={fontSize.tiny} color={colors.mu} nativeID="nick-label">{WELCOME.nicknameLabel}</PixelText>
        <TextInput
          testID="welcome-nickname-input"
          value={name}
          onChangeText={setName}
          maxLength={NICKNAME_MAX}
          placeholder={WELCOME.nicknamePlaceholder}
          placeholderTextColor={colors.mu}
          accessibilityLabel={WELCOME.nicknameLabel}
          aria-labelledby="nick-label"
          autoComplete="off"
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={() => finish(name)}
          style={[pixelText(fontSize.ui), styles.input, focused ? styles.inputFocus : null]}
        />
        <PixelButton testID="welcome-start" variant="primary" fullWidth label={WELCOME.start} onPress={() => finish(name)} />
        <PixelButton testID="welcome-skip" fullWidth label={WELCOME.skip} onPress={() => finish(null)} />
        <PixelText size={fontSize.tiny} color={colors.mu} style={[styles.center, styles.foot]}>{WELCOME.foot}</PixelText>
      </Card>
    </Page>
  );
}

const styles = StyleSheet.create({
  banner: { height: 220, borderWidth: border.width, borderColor: colors.ln, overflow: 'hidden', marginTop: 4 },
  titleWrap: { position: 'absolute', top: 14, left: 0, right: 0, alignItems: 'center', gap: 4, paddingHorizontal: 8 },
  cast: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 20 },
  castNarrow: { gap: 6 },
  castMember: { alignItems: 'center' },
  nameTag: { backgroundColor: colors.overlay, paddingHorizontal: 4 },
  card: { marginTop: 8, alignSelf: 'center', width: '100%', maxWidth: 440, gap: 4 },
  tag: { marginBottom: 4 },
  input: { color: colors.tx, backgroundColor: colors.deep, borderWidth: border.width, borderColor: colors.ln, paddingVertical: 8, paddingHorizontal: 12, minHeight: 44 },
  inputFocus: { borderColor: colors.ac },
  center: { textAlign: 'center' },
  foot: { marginTop: 4 },
});
