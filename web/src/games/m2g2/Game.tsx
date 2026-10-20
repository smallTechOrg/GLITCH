// m2g2 · Prompt Forge — render + wiring only (v3 GM.m2g2, lines 541–548).
// FORGE 1 → PROMPT BUILT → FORGE 2 → PROMPT BUILT → FORGE 3 · FREE WRITE (slice E's round).
// Hearts and the 2 power uses live in the frame, so they carry across all three forges.
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { GameApi } from '../../contracts/game';
import { SortBoard } from '../../dnd/SortBoard';
import { FreeWriteRound } from '../../features/freewrite/FreeWriteRound';
import { colors, fontSize } from '../../theme/tokens';
import { PixelButton } from '../../ui/PixelButton';
import { PixelText } from '../../ui/PixelText';
import { Terminal } from '../../ui/Terminal';
import {
  ANOTHER_FORGE_LINE, BUILT_EXPLANATION, FORGES, FORGE_SUBHEAD, NEXT_FORGE_LABEL, NOVA_REPLIES, PROMPT_BUILT, WIN_SUMMARY, YOUR_PROMPT,
  type Forge,
} from './data';
import { FIRST_STAGE, builtPrompt, forgeConfig, nextStage, type Stage } from './logic';

export function PromptForgeGame({ api }: { api: GameApi }): React.JSX.Element {
  const [stage, setStage] = useState<Stage>(FIRST_STAGE);
  const apiRef = useRef(api);
  apiRef.current = api;

  // On the PROMPT BUILT screen there is nothing for X-RAY / FOCUS to act on (not consumed).
  // Forge boards and the free-write round register their own handlers on mount (child
  // effects run first), so this effect must only register for the built stage.
  useEffect(() => {
    if (stage.kind === 'built') api.registerPowers({ scan: () => false, hint: () => false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  if (stage.kind === 'free') {
    return (
      <View testID="m2g2-forge-3" style={styles.wrap}>
        <FreeWriteRound api={api} onPassed={() => apiRef.current.win(WIN_SUMMARY)} />
      </View>
    );
  }

  const forge = FORGES[stage.k] as Forge;

  if (stage.kind === 'built') {
    return (
      <View testID={`m2g2-built-${stage.k + 1}`} style={styles.wrap}>
        <PixelText size={fontSize.h3} color={colors.ac} bold accessibilityRole="header">{PROMPT_BUILT}</PixelText>
        <Terminal label={YOUR_PROMPT} text={stage.prompt} testID="m2g2-your-prompt" />
        <Terminal label={NOVA_REPLIES} text={forge.out} variant="out" testID="m2g2-nova-replies" />
        <PixelText long size={fontSize.small} color={colors.mu}>{BUILT_EXPLANATION}</PixelText>
        <PixelButton
          label={NEXT_FORGE_LABEL}
          variant="primary"
          testID="m2g2-next-forge"
          disabled={api.over}
          fullWidth
          onPress={() => {
            if (apiRef.current.over) return;
            apiRef.current.say(ANOTHER_FORGE_LINE, 'good');
            setStage(nextStage(stage));
          }}
        />
      </View>
    );
  }

  return (
    <View testID={`m2g2-forge-${stage.k + 1}`} style={styles.wrap}>
      <SortBoard
        key={`forge-${stage.k}`}
        cfg={forgeConfig(forge, stage.k + 1)}
        api={api}
        onDone={(s) => setStage({ kind: 'built', k: stage.k, prompt: builtPrompt(s) })}
        header={
          <View style={styles.head}>
            <PixelText size={fontSize.h3} color={colors.ac} bold accessibilityRole="header">{forge.title}</PixelText>
            <PixelText long size={fontSize.small} color={colors.mu}>{FORGE_SUBHEAD}</PixelText>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  head: { gap: 6 },
});
