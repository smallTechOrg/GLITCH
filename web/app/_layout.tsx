// Root layout (scaffold-owned): fonts, store hydration gate, TopBar, wipe transition, toasts.
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Slot, usePathname, useSegments } from 'expo-router';
import { useFonts } from 'expo-font';
import { FONT_ASSETS } from '@/theme/fonts';
import { showsTopBar } from '@/contracts/routes';
import { hydrateStore, useGlitchStore } from '@/state/store';
import { LoadingScreen } from '@/ui/LoadingScreen';
import { ScreenWipe } from '@/ui/ScreenWipe';
import { ToastHost } from '@/ui/ToastHost';
import { TopBar } from '@/screens/TopBar';
import { AppEffects } from '@/screens/AppEffects';

export default function RootLayout(): React.JSX.Element {
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);
  const hydrated = useGlitchStore((s) => s.hydrated);
  const segments = useSegments() as string[];
  const pathname = usePathname();

  useEffect(() => {
    void hydrateStore();
  }, []);

  const ready = (fontsLoaded || !!fontError) && hydrated;
  return (
    <View style={styles.root}>
      {ready ? (
        <>
          {showsTopBar(segments) ? <TopBar /> : null}
          <AppEffects />
          <ScreenWipe routeKey={pathname}>
            <Slot />
          </ScreenWipe>
        </>
      ) : (
        <LoadingScreen />
      )}
      <ToastHost />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: '100%', backgroundColor: 'transparent' },
});
