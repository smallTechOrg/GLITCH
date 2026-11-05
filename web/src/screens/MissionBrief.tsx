// The instructions: opens before a game the player has not cleared yet, and from the HUD's
// HOW TO PLAY button at any time. Mission, numbered steps, how to clear it, this run's power.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { GameDefinition } from '../contracts/game';
import type { HeroDef } from '../content/heroes';
import { POWER_ICON } from '../content/heroes';
import { Icon } from '../art/Icon';
import { Sprite } from '../art/Sprite';
import type { Adaptation } from '../engine/adapt';
import { border, colors, fontSize, shadows } from '../theme/tokens';
import { PixelButton } from '../ui/PixelButton';
import { PixelText } from '../ui/PixelText';
import { BRIEF } from './copy';

export interface MissionBriefProps {
  def: GameDefinition;
  hero: HeroDef;
  playerName: string;
  adaptation: Adaptation;
  /** The game has already started, so the button goes back to it. */
  resuming: boolean;
  onClose(): void;
}

export function MissionBrief({ def, hero, playerName, adaptation, resuming, onClose }: MissionBriefProps): React.JSX.Element {
  return (
    <View testID="brief" style={styles.layer} accessibilityRole="alert">
      <View style={styles.card}>
        <PixelText size={fontSize.tiny} color={colors.mu}>{BRIEF.heading(playerName)}</PixelText>
        <PixelText testID="brief-mission" size={fontSize.h3} color={colors.ac} bold accessibilityRole="header">{def.goal}</PixelText>

        <PixelText size={fontSize.tiny} color={colors.bl} style={styles.section}>{BRIEF.howTo}</PixelText>
        {def.steps.map((s, i) => (
          <View key={s} style={styles.step}>
            <View style={styles.num}>
              <PixelText size={fontSize.tiny} color={colors.ink} bold>{String(i + 1)}</PixelText>
            </View>
            <PixelText testID={`brief-step-${i}`} long size={fontSize.small} style={styles.flex}>{s}</PixelText>
          </View>
        ))}

        <PixelText size={fontSize.tiny} color={colors.bl} style={styles.section}>{BRIEF.win}</PixelText>
        <View style={styles.step}>
          <Icon name="heart" scale={2} />
          <PixelText testID="brief-win" long size={fontSize.small} style={styles.flex}>{`${BRIEF.winText} ${BRIEF.stars}`}</PixelText>
        </View>
        <View style={styles.step}>
          <Sprite id={hero.id} crop="head" scale={2} />
          <Icon name={POWER_ICON[hero.power]} scale={2} />
          <PixelText testID="brief-power" long size={fontSize.small} style={styles.flex}>
            {BRIEF.power(hero.powerName, adaptation.powerUses)}
            {adaptation.reason ? ` ${BRIEF.adapted(adaptation.reason)}` : ''}
          </PixelText>
        </View>

        <PixelButton testID="brief-start" variant="primary" label={resuming ? BRIEF.resume : BRIEF.start} onPress={onClose} style={styles.go} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200, alignItems: 'center', justifyContent: 'center', padding: 10, backgroundColor: colors.overlay },
  card: { width: '100%', maxWidth: 620, maxHeight: '100%', gap: 8, padding: 16, backgroundColor: colors.cd, borderWidth: border.width, borderColor: colors.ac, boxShadow: shadows.paper },
  section: { marginTop: 6 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  num: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ac },
  flex: { flex: 1 },
  go: { marginTop: 8, alignSelf: 'stretch' },
});
