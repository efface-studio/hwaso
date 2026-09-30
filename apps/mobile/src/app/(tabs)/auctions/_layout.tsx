import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { tabHeaderOptions } from '@/components/tab-header';
import { useTheme } from '@/theme';

export default function Layout() {
  const t = useTheme();
  const { t: tr } = useTranslation('common');
  return (
    <Stack
      screenOptions={{
        headerTitleStyle: t.type('h3'),
      }}
    >
      <Stack.Screen name="index" options={tabHeaderOptions(tr('tabs.auctions'))} />
    </Stack>
  );
}
