// PLACEHOLDER (slice A1 replaces with the full v3 course map, quest box, stats, badges).
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { stepHref } from '../contracts/routes';
import { displayName } from '../contracts/state';
import { MODULES, stepsOf } from '../content/modules';
import { useGlitchStore } from '../state/store';
import { colors, fontSize } from '../theme/tokens';
import { Card } from '../ui/Card';
import { Page } from '../ui/Page';
import { PixelButton } from '../ui/PixelButton';
import { PixelText } from '../ui/PixelText';
import { PlaceholderNote } from './PlaceholderNote';

export function HomeScreen(): React.JSX.Element {
  const nickname = useGlitchStore((s) => s.profile.nickname);
  const steps = useGlitchStore((s) => s.steps);
  return (
    <Page testID="home-screen">
      <PixelText size={fontSize.tiny} color={colors.ac}>WELCOME BACK</PixelText>
      <PixelText testID="home-greeting" size={fontSize.h2} color={colors.ac} accessibilityRole="header">{displayName(nickname)}</PixelText>
      <PlaceholderNote what="Home" />
      {MODULES.map((m) => (
        <Card key={m.id} testID={`module-card-${m.id}`} accent={m.color} style={styles.card}>
          <PixelText size={fontSize.h3} bold>{`MODULE ${m.id} · ${m.title}`}</PixelText>
          <View style={styles.steps}>
            {stepsOf(m.id).map((s) => (
              <PixelButton key={s.id} testID={`step-${s.id}`} variant="small" label={`${s.kind} · ${s.label}${steps[s.id] ? ' · DONE' : ''}`} onPress={() => router.navigate(stepHref(s.id))} />
            ))}
          </View>
        </Card>
      ))}
    </Page>
  );
}

const styles = StyleSheet.create({
  card: { marginVertical: 10 },
  steps: { gap: 6, marginTop: 10 },
});
