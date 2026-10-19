// Storytime cutscene player (v3 `cut`, lines 429–451): full-screen slides (title, portrait,
// icons, key, scene), text typing at 22 ms/char (instant under reduced motion), progress
// pips, SKIP ▶▶. Controls: click/tap anywhere, Space, Enter, → = next (first press while
// typing completes the text); ← = previous; Esc or SKIP = finish (+10 XP once, advance).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import type { CharacterId, HeroId, ModuleId } from '../contracts/ids';
import type { IconId } from '../contracts/art';
import { Icon } from '../art/Icon';
import { Scene } from '../art/Scene';
import { Sprite } from '../art/Sprite';
import { characterColor, characterName } from '../content/heroes';
import { getModule, type ModuleDef } from '../content/modules';
import { STORY, STORY_COPY, slideText, type Slide } from '../content/story';
import { advanceTarget, heroOf, isStepDone, isStepStartable } from '../engine/progression';
import { ANIM } from '../a11y/stepped';
import { useStepAnimation } from '../a11y/useStepAnimation';
import { useTypewriter } from '../a11y/useTypewriter';
import { finishStory } from '../state/actions';
import { useGlitchStore } from '../state/store';
import { border, colors, fontSize, layout } from '../theme/tokens';
import { PixelText } from '../ui/PixelText';
import { useFocusRing } from '../ui/focus';
import { STORYTIME } from './copy';
import { LockedScreen } from './LockedScreen';
import { goFlow, isTouchDevice } from './nav';

export type StoryKey = 'next' | 'prev' | 'finish' | null;

/** v3 keydown map: Space/Enter/→ next, ← previous, Esc finish. */
export function storyKeyAction(key: string): StoryKey {
  if (key === ' ' || key === 'Spacebar' || key === 'Enter' || key === 'ArrowRight') return 'next';
  if (key === 'ArrowLeft') return 'prev';
  if (key === 'Escape' || key === 'Esc') return 'finish';
  return null;
}

/**
 * Document-level key handling: Enter/Space on a focused pressable (SKIP, or the slide
 * itself) is already that element's own press, so "next" is not handled twice.
 */
export function storyKeyForTarget(key: string, targetTestId: string | null | undefined): StoryKey {
  const a = storyKeyAction(key);
  if (a === 'next' && (targetTestId === 'story-skip' || targetTestId === 'story-root')) return null;
  return a;
}

/** Hint line under the slide (v3 `.chint`). Touch has no ← key, so it reads just "TAP TO CONTINUE". */
export function storyHint(k: number, touch: boolean): string {
  if (touch) return STORY_COPY.hintTouch;
  return STORY_COPY.hint + (k > 0 ? STORY_COPY.hintBack : '');
}

export function StoryScreen({ mod }: { mod: ModuleId }): React.JSX.Element {
  // Storytime (m<n>s) is startable once its module is open and the hero step is done; replay stays allowed.
  const step = `m${mod}s` as const;
  const open = useGlitchStore((s) => isStepDone(s, step) || isStepStartable(s, step));
  if (!open) return <LockedScreen />;
  return <StoryPlayer mod={mod} />;
}

function StoryPlayer({ mod }: { mod: ModuleId }): React.JSX.Element {
  const m = getModule(mod);
  const slides = STORY[mod];
  const [hero] = useState<HeroId>(() => heroOf(useGlitchStore.getState(), mod));
  const [k, setK] = useState(0);
  const slide = slides[k] ?? slides[0]!;
  const tw = useTypewriter(slideText(slide));
  const finished = useRef(false);
  const [touch] = useState(isTouchDevice);

  const fin = useCallback((): void => {
    if (finished.current) return;
    finished.current = true;
    finishStory(mod, new Date());
    goFlow(advanceTarget(useGlitchStore.getState(), mod));
  }, [mod]);

  const next = useCallback((): void => {
    if (!tw.done) {
      tw.complete();
      return;
    }
    if (k < slides.length - 1) setK(k + 1);
    else fin();
  }, [tw, k, slides.length, fin]);

  const prev = useCallback((): void => {
    if (k > 0) setK(k - 1);
  }, [k]);

  // Keyboard (web): document-level like v3's document.onkeydown.
  const handlers = useRef({ next, prev, fin });
  handlers.current = { next, prev, fin };
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const doc = (globalThis as { document?: Document }).document;
    if (!doc) return;
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as { getAttribute?: (n: string) => string | null } | null;
      const a = storyKeyForTarget(e.key, target?.getAttribute?.('data-testid'));
      if (!a) return;
      e.preventDefault();
      if (a === 'next') handlers.current.next();
      else if (a === 'prev') handlers.current.prev();
      else handlers.current.fin();
    };
    doc.addEventListener('keydown', onKey);
    return () => doc.removeEventListener('keydown', onKey);
  }, []);

  const skipFocus = useFocusRing();
  return (
    <Pressable
      testID="story-root"
      onPress={next}
      accessibilityRole="button"
      accessibilityLabel={STORYTIME.rootLabel}
      accessibilityHint={storyHint(k, touch)}
      style={[styles.cut, { borderColor: m.color }]}
    >
      <View style={styles.top}>
        <View testID="story-progress" accessible accessibilityLabel={STORYTIME.progress(k + 1, slides.length)} style={styles.pips}>
          {slides.map((_, j) => (
            <View key={j} style={[styles.pip, j < k ? styles.pipDone : j === k ? { backgroundColor: m.color } : styles.pipAhead]} />
          ))}
        </View>
        <Pressable
          testID="story-skip"
          onPress={(e) => {
            e.stopPropagation?.();
            fin();
          }}
          onFocus={skipFocus.onFocus}
          onBlur={skipFocus.onBlur}
          accessibilityRole="button"
          accessibilityLabel="Skip storytime"
          style={[styles.skip, skipFocus.ring]}
        >
          <PixelText size={fontSize.tiny} color={colors.white}>{STORY_COPY.skip}</PixelText>
        </Pressable>
      </View>
      <View style={styles.stage}>
        <SlideView slide={slide} m={m} hero={hero} text={tw.shown} done={tw.done} />
      </View>
      <PixelText size={fontSize.tiny} color={colors.cutHint} style={styles.hint}>{storyHint(k, touch)}</PixelText>
    </Pressable>
  );
}

interface SlideViewProps {
  slide: Slide;
  m: ModuleDef;
  hero: HeroId;
  text: string;
  done: boolean;
}

function TypedText({ text, color = colors.tx }: { text: string; color?: string }): React.JSX.Element {
  return (
    <PixelText testID="story-text" long size={fontSize.body} color={color} accessibilityLiveRegion="polite" style={styles.typed}>
      {text}
    </PixelText>
  );
}

function SlideView({ slide, m, hero, text, done }: SlideViewProps): React.JSX.Element {
  switch (slide.t) {
    case 'title':
      return (
        <View style={styles.titleSlide}>
          <View style={StyleSheet.absoluteFill}>
            <Scene id={m.scene} ambient />
          </View>
          <View style={styles.titleText}>
            <PixelText size={fontSize.small} color={m.color}>{slide.h}</PixelText>
            <PixelText size={fontSize.h1} color={colors.ac} bold accessibilityRole="header" style={styles.center}>{slide.s}</PixelText>
            <PixelText testID="story-text" long size={fontSize.body} color={colors.white} style={styles.center}>{slide.x}</PixelText>
          </View>
          <View style={styles.chars}>
            <Sprite id={hero} scale={7} animate="bob" />
          </View>
        </View>
      );
    case 'portrait':
      return (
        <View style={styles.portrait}>
          <Sprite id={slide.w} scale={10} outlined animate={done ? 'none' : 'talk'} />
          <View style={styles.ptext}>
            <PixelText size={fontSize.h3} bold color={characterColor(slide.w)}>{characterName(slide.w)}</PixelText>
            <TypedText text={text} />
          </View>
        </View>
      );
    case 'icons':
      return (
        <View style={styles.iconsSlide}>
          <View style={styles.iconGrid}>
            {slide.ic.map((ic, j) => (
              <PopIcon key={`${ic}-${j}`} name={ic} caption={slide.cap[j] ?? ''} delayMs={j * 120} />
            ))}
          </View>
          <TypedText text={text} />
        </View>
      );
    case 'key':
      return (
        <View style={styles.keySlide}>
          <View style={styles.keyBan}>
            <View style={StyleSheet.absoluteFill}>
              <Scene id={m.scene} filter="dim" />
            </View>
            <View style={styles.kb}>
              <PixelText size={fontSize.tiny} color={colors.ac}>{STORY_COPY.keyIdea}</PixelText>
              <PixelText size={fontSize.h2} bold color={colors.white} accessibilityRole="header" style={styles.center}>{slide.k}</PixelText>
              <Icon name={m.icon} scale={8} outlined />
            </View>
          </View>
          <TypedText text={text} />
        </View>
      );
    case 'scene':
    default: {
      const who: CharacterId = slide.w;
      const scale = slide.big ? 8 : 6;
      return (
        <View style={styles.sceneSlide}>
          <View style={[styles.sceneBan, slide.big ? styles.sceneBig : null]}>
            <View style={StyleSheet.absoluteFill}>
              <Scene id={m.scene} ambient />
            </View>
            <View style={styles.chars}>
              <Sprite id={hero} scale={scale} />
              <Sprite id={who} scale={scale} animate={done ? 'bob' : 'talk'} />
            </View>
          </View>
          <View style={styles.dlg}>
            <PixelText size={fontSize.small} bold color={characterColor(who)}>{characterName(who)}</PixelText>
            <TypedText text={text} />
            {done ? <PixelText size={fontSize.tiny} color={colors.ac} style={styles.nx}>{STORY_COPY.next}</PixelText> : null}
          </View>
        </View>
      );
    }
  }
}

function PopIcon({ name, caption, delayMs }: { name: IconId; caption: string; delayMs: number }): React.JSX.Element {
  const v = useStepAnimation({ ...ANIM.pop, delayMs });
  return (
    <Animated.View style={[styles.ii, { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] }]}>
      <Icon name={name} scale={6} outlined />
      <PixelText size={fontSize.tiny} color={colors.white}>{caption}</PixelText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cut: { flex: 1, minHeight: '100%', backgroundColor: colors.cutBg, padding: layout.pagePadding, gap: 12, borderTopWidth: border.width },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  pip: { flexGrow: 1, flexBasis: 10, maxWidth: 40, height: 6 },
  pipDone: { backgroundColor: colors.white },
  pipAhead: { backgroundColor: colors.cutPipAhead },
  skip: { minHeight: layout.minTouch, minWidth: layout.minTouch, justifyContent: 'center', paddingHorizontal: 10, borderWidth: border.thin, borderColor: colors.white },
  stage: { flex: 1, width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', justifyContent: 'center' },
  hint: { textAlign: 'center' },
  center: { textAlign: 'center' },
  typed: { minHeight: 60 },
  titleSlide: { height: 420, borderWidth: border.width, borderColor: colors.ln, overflow: 'hidden' },
  titleText: { position: 'absolute', top: 30, left: 12, right: 12, alignItems: 'center', gap: 10 },
  chars: { position: 'absolute', bottom: 8, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 30 },
  portrait: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 24 },
  ptext: { flex: 1, minWidth: 240, gap: 10 },
  iconsSlide: { gap: 20 },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14 },
  ii: { alignItems: 'center', gap: 6, width: 90 },
  keySlide: { gap: 16 },
  keyBan: { height: 280, borderWidth: border.width, borderColor: colors.ln, overflow: 'hidden' },
  kb: { position: 'absolute', top: 0, bottom: 0, left: 12, right: 12, alignItems: 'center', justifyContent: 'center', gap: 12 },
  sceneSlide: { gap: 0 },
  sceneBan: { height: 300, borderWidth: border.width, borderColor: colors.ln, overflow: 'hidden' },
  sceneBig: { height: 360 },
  dlg: { backgroundColor: colors.deep, borderWidth: border.width, borderColor: colors.white, borderTopWidth: 0, padding: 14, gap: 8 },
  nx: { alignSelf: 'flex-end' },
});
