// Ask NOVA why — mount point under the speech bubble (spec/architecture.md → Contracts →
// Phase 3 → Mount points; ask-nova-why.md; spec/ui.md → Tutor NOVA). The exported names and the
// props interface below are FROZEN (the Game Frame depends on them).
//
// chip (`ask-nova-why`) → tap → panel `nova-why-panel`: NOVA thinking (`nova-why-thinking`, static
// under reduced motion) → the answer (`nova-why-text`, `nova-why-tip`, `nova-why-cost`, DEMO tag
// for the fake provider) or the failure line + the canned miss message (`nova-why-offline`).
// One request per mistake: the first tap locks the chip, and the per-page memo/in-flight map
// (./explain) answers repeats without a network call. The game is never blocked.
import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { announce } from '../../a11y/announce';
import { NOVA_THINK_FPS } from '../../a11y/stepped';
import { useFrameCycle } from '../../a11y/useStepAnimation';
import { useReducedMotion } from '../../a11y/useReducedMotion';
import { Sprite } from '../../art/Sprite';
import type { ExplainData } from '../../contracts/api';
import type { SessionMistake } from '../../contracts/game';
import { mistakeKey } from '../../contracts/game';
import { border, colors, fontSize, shadows } from '../../theme/tokens';
import { PixelButton } from '../../ui/PixelButton';
import { PixelText } from '../../ui/PixelText';
import { Tag } from '../../ui/Tag';
import { TUTOR } from './copy';
import { askNovaWhy } from './explain';

/** A fetched explanation, kept for this run so the recap can reuse it. */
export interface Explanation {
  text: string;
  tip: string;
}

export interface AskNovaWhyProps {
  /**
   * The latest recorded mistake of this run (its `explain` is never `false` — the frame does
   * not mount the component for those). Carries gameId, variationId ('v3' or the served case
   * file id), itemId/answer (the request ids) and `message`, the canned miss line shown on
   * any failure. The frame re-keys the component per mistake and unmounts it on restart.
   */
  mistake: SessionMistake;
  /**
   * True while the bubble still shows this mistake's line and < ASK_WINDOW_MS has passed
   * (the frame runs the timer). Not opened + !chipVisible → render null. Once tapped, the
   * panel stays open regardless of chipVisible until CLOSE or the next mistake (re-key).
   */
  chipVisible: boolean;
  /** Called once per received explanation with `mistakeKey(mistake)` (itemId|answer). */
  onExplained(key: string, e: Explanation): void;
}

type Phase =
  | { kind: 'chip' }
  | { kind: 'loading' }
  | { kind: 'answer'; data: ExplainData; free: boolean }
  | { kind: 'fail'; line: string }
  | { kind: 'closed' };

export function AskNovaWhy({ mistake, chipVisible, onExplained }: AskNovaWhyProps): React.JSX.Element | null {
  const [phase, setPhase] = useState<Phase>({ kind: 'chip' });
  const asked = useRef(false);
  const alive = useRef(true);
  const latest = useRef({ mistake, onExplained });
  latest.current = { mistake, onExplained };

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const ask = (): void => {
    if (asked.current || mistake.explain === false) return; // one request per mistake
    asked.current = true;
    setPhase({ kind: 'loading' });
    void askNovaWhy(mistake).then((o) => {
      if (!alive.current) return;
      if (o.kind === 'ok') {
        const { mistake: m, onExplained: cb } = latest.current;
        // A memo hit made no request, so it cost nothing — same as a server cache hit.
        setPhase({ kind: 'answer', data: o.data, free: o.fromMemo || o.data.cached });
        cb(mistakeKey(m), { text: o.data.text, tip: o.data.tip });
      } else {
        setPhase({ kind: 'fail', line: o.reason === 'noEnergy' ? TUTOR.noEnergy : TUTOR.offline });
      }
    });
  };

  // The panel content is announced politely once, when it arrives.
  useEffect(() => {
    if (phase.kind === 'answer') announce(`${phase.data.text} ${TUTOR.tipPrefix}${phase.data.tip}`);
    else if (phase.kind === 'fail') announce(`${phase.line} ${mistake.message}`);
  }, [phase, mistake.message]);

  const close = (): void => {
    setPhase({ kind: 'closed' });
    focusGameBody();
  };

  if (phase.kind === 'closed') return null;
  if (phase.kind === 'chip') {
    if (!chipVisible || mistake.explain === false) return null;
    return <PixelButton testID="ask-nova-why" variant="small" label={TUTOR.chip} accessibilityHint={TUTOR.chipHint} onPress={ask} />;
  }

  return (
    <View testID="nova-why-panel" accessibilityLabel={TUTOR.panelLabel} style={styles.panel}>
      <View style={styles.head}>
        <Sprite id="n" frame="idle" crop="head" scale={2} />
        {phase.kind === 'answer' && phase.data.provider === 'fake' ? (
          <View accessible accessibilityRole="text" accessibilityLabel={TUTOR.demoLabel}>
            <Tag testID="nova-why-demo-tag" label={TUTOR.demoTag} variant="soon" />
          </View>
        ) : null}
      </View>
      {phase.kind === 'loading' ? <Thinking /> : null}
      {phase.kind === 'answer' ? (
        <View style={styles.body}>
          <PixelText testID="nova-why-text" long size={fontSize.small} color={colors.tx}>{phase.data.text}</PixelText>
          <PixelText testID="nova-why-tip" long size={fontSize.small} color={colors.ac}>{`${TUTOR.tipPrefix}${phase.data.tip}`}</PixelText>
          <PixelText
            testID="nova-why-cost"
            size={fontSize.tiny}
            color={phase.free ? colors.ok : colors.mu}
            accessibilityLabel={phase.free ? TUTOR.costFreeLabel : TUTOR.costPaidLabel}
          >
            {phase.free ? TUTOR.costFree : TUTOR.costPaid}
          </PixelText>
        </View>
      ) : null}
      {phase.kind === 'fail' ? (
        <View testID="nova-why-offline" accessible accessibilityRole="text" accessibilityLabel={`${phase.line} ${mistake.message}`} style={styles.body}>
          <PixelText size={fontSize.tiny} color={colors.ac}>{phase.line}</PixelText>
          <PixelText long size={fontSize.small} color={colors.tx}>{mistake.message}</PixelText>
        </View>
      ) : null}
      <View style={styles.foot}>
        <PixelButton testID="nova-why-close" variant="small" label={TUTOR.close} accessibilityHint={TUTOR.closeHint} onPress={close} />
      </View>
    </View>
  );
}

/** NOVA thinking: cycling dots, or one static frame under reduced motion. Announced once. */
function Thinking(): React.JSX.Element {
  const still = useReducedMotion();
  const dots = useFrameCycle(3, NOVA_THINK_FPS, !still);
  useEffect(() => {
    announce(TUTOR.thinking);
  }, []);
  return (
    <View testID="nova-why-thinking" accessible accessibilityRole="progressbar" accessibilityLabel={TUTOR.thinking} aria-busy style={styles.thinking}>
      <Sprite id="n" frame="think" scale={2} testID={still ? 'nova-why-thinking-static' : 'nova-why-thinking-anim'} />
      <PixelText size={fontSize.tiny} color={colors.bl}>{TUTOR.thinkingShown}</PixelText>
      {still ? null : (
        <View style={styles.dots} accessible={false}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.dot, i <= dots ? styles.dotOn : null]} />
          ))}
        </View>
      )}
    </View>
  );
}

/** CLOSE returns focus to the game body (web; native screen readers keep their own cursor). */
function focusGameBody(): void {
  if (Platform.OS !== 'web') return;
  const doc = (globalThis as { document?: Document }).document;
  const el = doc?.querySelector<HTMLElement>('[data-testid="game-body"]');
  if (!el) return;
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  el.focus();
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.deep,
    borderWidth: border.width,
    borderColor: colors.bl,
    boxShadow: shadows.card,
    padding: 12,
    gap: 8,
    maxHeight: 320,
    overflow: 'hidden',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  body: { gap: 6 },
  foot: { flexDirection: 'row', justifyContent: 'flex-end' },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 6, height: 6, backgroundColor: colors.ln },
  dotOn: { backgroundColor: colors.bl },
});
