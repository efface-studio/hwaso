import { Stack } from 'expo-router';
import { useTheme } from '@/theme';

export default function Layout() {
  const t = useTheme();
  return (
    <Stack
      screenOptions={{
        headerLargeTitle: true,
        headerTitleStyle: t.type('h3'),
        headerLargeTitleShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: '채팅' }} />
    </Stack>
  );
}
