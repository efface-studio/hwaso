import { Stack } from 'expo-router';
import { tabHeaderOptions } from '@/components/tab-header';
import { useTheme } from '@/theme';

export default function Layout() {
  const t = useTheme();
  return (
    <Stack screenOptions={{ headerTitleStyle: t.type('h3'), headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={tabHeaderOptions('거래')} />
    </Stack>
  );
}
