import React from 'react';
import { Redirect } from 'expo-router';
import { WELCOME_HREF } from '@/contracts/routes';
import { useGlitchStore } from '@/state/store';
import { HomeScreen } from '@/screens/HomeScreen';

export default function IndexRoute(): React.JSX.Element {
  const onboarded = useGlitchStore((s) => s.profile.onboarded);
  if (!onboarded) return <Redirect href={WELCOME_HREF} />;
  return <HomeScreen />;
}
