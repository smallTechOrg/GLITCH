// PLACEHOLDER (slice A1 replaces with the full v3 title banner): GLITCH title, optional
// nickname, Start / Skip → onboarded → Home.
import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { HOME_HREF } from '../contracts/routes';
import { NICKNAME_MAX } from '../contracts/state';
import { Scene } from '../art/Scene';
import { useGlitchStore } from '../state/store';
import { pixelText } from '../theme/fonts';
import { border, colors, fontSize } from '../theme/tokens';
import { Card } from '../ui/Card';
import { Page } from '../ui/Page';
import { PixelButton } from '../ui/PixelButton';
import { PixelText } from '../ui/PixelText';
import { PlaceholderNote } from './PlaceholderNote';

export function WelcomeScreen(): React.JSX.Element {
  const [name, setName] = useState('');
  const setNickname = useGlitchStore((s) => s.setNickname);
  const setOnboarded = useGlitchStore((s) => s.setOnboarded);
  const finish = (n: string | null): void => {
    setNickname(n);
    setOnboarded();
    router.replace(HOME_HREF);
  };
  return (
    <Page testID="welcome-screen">
      <View style={styles.banner}>
        <Scene id="title" />
        <View style={styles.titleWrap}>
          <PixelText size={fontSize.h1} color={colors.ac} style={styles.title} accessibilityRole="header">GLITCH</PixelText>
          <PixelText size={fontSize.small} color={colors.white}>AN AI LITERACY ADVENTURE</PixelText>
        </View>
      </View>
      <Card style={styles.card}>
        <PixelText long color={colors.mu} style={styles.center}>Spot what AI gets wrong. Pick a hero. Win the game.</PixelText>
        <PixelText size={fontSize.tiny} color={colors.mu} nativeID="nick-label">Your nickname</PixelText>
        <TextInput
          testID="welcome-nickname-input"
          value={name}
          onChangeText={setName}
          maxLength={NICKNAME_MAX}
          placeholder="Type a nickname"
          placeholderTextColor={colors.mu}
          accessibilityLabel="Your nickname"
          autoComplete="off"
          onSubmitEditing={() => finish(name)}
          style={[pixelText(fontSize.ui), styles.input]}
        />
        <PixelButton testID="welcome-start" variant="primary" fullWidth label="▶ Start playing" onPress={() => finish(name)} />
        <PixelButton testID="welcome-skip" fullWidth label="Skip" onPress={() => finish(null)} />
        <PixelText size={fontSize.tiny} color={colors.mu} style={[styles.center, styles.foot]}>Saved on this device only. No account needed.</PixelText>
      </Card>
      <PlaceholderNote what="Welcome" />
    </Page>
  );
}

const styles = StyleSheet.create({
  banner: { height: 260, borderWidth: border.width, borderColor: colors.ln, overflow: 'hidden', marginTop: 14 },
  titleWrap: { position: 'absolute', top: 26, left: 0, right: 0, alignItems: 'center', gap: 8 },
  title: { textShadowColor: colors.logoShadow, textShadowOffset: { width: 4, height: 4 }, textShadowRadius: 0 },
  card: { marginVertical: 20, alignSelf: 'center', width: '100%', maxWidth: 440, gap: 6 },
  input: { color: colors.tx, backgroundColor: colors.deep, borderWidth: border.width, borderColor: colors.ln, padding: 12, marginVertical: 6 },
  center: { textAlign: 'center' },
  foot: { marginTop: 18 },
});
