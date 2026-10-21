import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { parseModuleId } from '@/contracts/ids';
import { moduleParams } from '@/content/modules';
import { ModuleCompleteScreen } from '@/screens/ModuleCompleteScreen';
import { NotFoundScreen } from '@/screens/NotFoundScreen';

export function generateStaticParams(): { mod: string }[] {
  return moduleParams();
}

export default function Route(): React.JSX.Element {
  const { mod } = useLocalSearchParams<{ mod: string }>();
  const m = parseModuleId(mod);
  return m ? <ModuleCompleteScreen mod={m} /> : <NotFoundScreen />;
}
