// Settings (replaces v3 LOG OUT; course-shell.md → Settings): nickname, READABLE FONT toggle,
// privacy note, and a two-tap "Reset progress" (keeps streak, nickname, settings, device id).
import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { spaceActivates } from '../a11y/spaceActivates';
import { NICKNAME_MAX } from '../contracts/state';
import { resetProgress } from '../state/actions';
import { useGlitchStore } from '../state/store';
import { pixelText } from '../theme/fonts';
import { border, colors, fontSize, layout } from '../theme/tokens';
import { Card } from '../ui/Card';
import { Page } from '../ui/Page';
import { PixelButton } from '../ui/PixelButton';
import { PixelText } from '../ui/PixelText';
import { useFocusRing } from '../ui/focus';
import { SETTINGS } from './copy';

export function SettingsScreen(): React.JSX.Element {
  const nickname = useGlitchStore((s) => s.profile.nickname);
  const readable = useGlitchStore((s) => s.settings.readableFont);
  const [name, setName] = useState(nickname ?? '');
  const [focused, setFocused] = useState(false);
  const [saved, setSaved] = useState(false);
  const [armed, setArmed] = useState(false);
  const [wasReset, setWasReset] = useState(false);
  const toggleFocus = useFocusRing();

  const save = (): void => {
    useGlitchStore.getState().setNickname(name);
    setName(useGlitchStore.getState().profile.nickname ?? '');
    setSaved(true);
  };
  const toggleReadable = (): void => useGlitchStore.getState().setReadableFont(!readable);
  const reset = (): void => {
    if (!armed) {
      setArmed(true);
      setWasReset(false);
      return;
    }
    resetProgress();
    setArmed(false);
    setWasReset(true);
  };

  return (
    <Page testID="settings-screen">
      <PixelText size={fontSize.h2} color={colors.ac} bold accessibilityRole="header" style={styles.title}>{SETTINGS.title}</PixelText>

      <Card style={styles.card}>
        <PixelText size={fontSize.small} color={colors.ac} nativeID="settings-nick-label">{SETTINGS.nickname}</PixelText>
        <PixelText long size={fontSize.small} color={colors.mu}>{SETTINGS.nicknameHelp}</PixelText>
        <TextInput
          testID="settings-nickname-input"
          value={name}
          onChangeText={(t) => {
            setName(t);
            setSaved(false);
          }}
          maxLength={NICKNAME_MAX}
          accessibilityLabel={SETTINGS.nickname}
          aria-labelledby="settings-nick-label"
          autoComplete="off"
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={save}
          style={[pixelText(fontSize.ui), styles.input, focused ? styles.inputFocus : null]}
        />
        <View style={styles.row}>
          <PixelButton testID="settings-save" variant="primary" label={SETTINGS.save} onPress={save} />
          {saved ? (
            <PixelText testID="settings-saved" size={fontSize.tiny} color={colors.ok} accessibilityLiveRegion="polite">{SETTINGS.nicknameSaved}</PixelText>
          ) : null}
        </View>
      </Card>

      <Card style={styles.card}>
        <Pressable
          testID="settings-readable-font"
          onPress={toggleReadable}
          onFocus={toggleFocus.onFocus}
          onBlur={toggleFocus.onBlur}
          accessibilityRole="switch"
          accessibilityLabel={SETTINGS.readable}
          accessibilityHint={SETTINGS.readableHelp}
          accessibilityState={{ checked: readable }}
          aria-checked={readable}
          {...spaceActivates(toggleReadable)}
          style={[styles.toggle, readable ? styles.toggleOn : null, toggleFocus.ring]}
        >
          <PixelText size={fontSize.small} style={styles.flex}>{SETTINGS.readable}</PixelText>
          <View style={[styles.tag, { backgroundColor: readable ? colors.okDark : colors.no }]}>
            <PixelText size={fontSize.tiny} color={readable ? colors.white : colors.ink}>{readable ? SETTINGS.on : SETTINGS.off}</PixelText>
          </View>
        </Pressable>
        <PixelText long size={fontSize.small} color={colors.mu}>{SETTINGS.readableHelp}</PixelText>
      </Card>

      <Card style={styles.card}>
        <PixelText size={fontSize.small} color={colors.ac}>{SETTINGS.privacyTitle}</PixelText>
        <PixelText testID="settings-privacy" long size={fontSize.small} color={colors.tx}>{SETTINGS.privacy}</PixelText>
      </Card>

      <Card style={styles.card}>
        <PixelButton
          testID="settings-reset"
          label={armed ? SETTINGS.resetConfirm : SETTINGS.reset}
          color={colors.no}
          onPress={reset}
          accessibilityHint={SETTINGS.resetHelp}
        />
        <PixelText long size={fontSize.small} color={colors.mu}>{SETTINGS.resetHelp}</PixelText>
        {wasReset ? (
          <PixelText testID="settings-reset-done" size={fontSize.tiny} color={colors.ok} accessibilityLiveRegion="polite">{SETTINGS.resetDone}</PixelText>
        ) : null}
      </Card>
    </Page>
  );
}

const styles = StyleSheet.create({
  title: { marginVertical: 12 },
  card: { marginVertical: 8, gap: 8 },
  input: { color: colors.tx, backgroundColor: colors.deep, borderWidth: border.width, borderColor: colors.ln, padding: 12, minHeight: layout.minTouch },
  inputFocus: { borderColor: colors.ac },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, minHeight: layout.minTouch, backgroundColor: colors.cd, borderWidth: border.width, borderColor: colors.ln },
  toggleOn: { borderColor: colors.ok },
  flex: { flex: 1 },
  tag: { paddingVertical: 2, paddingHorizontal: 6 },
});
