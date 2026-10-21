// App-level side effects (mounted once by app/_layout.tsx after hydration): the daily
// streak/XP check on app start and whenever the app returns to the foreground.
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { runDaily } from '../state/actions';
import { useGlitchStore } from '../state/store';

export function AppEffects(): null {
  const onboarded = useGlitchStore((s) => s.profile.onboarded);
  useEffect(() => {
    if (!onboarded) return;
    runDaily(new Date());
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') runDaily(new Date());
    });
    return () => sub.remove();
  }, [onboarded]);
  return null;
}
