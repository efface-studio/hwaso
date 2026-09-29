import { router, Stack } from 'expo-router';
import { tabHeaderOptions } from '@/components/tab-header';
import { useTheme } from '@/theme';

export default function Layout() {
  const t = useTheme();
  return (
    <Stack screenOptions={{ headerTitleStyle: t.type('h3'), headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen
        name="index"
        options={{
          ...tabHeaderOptions('대시보드'),
          // 사용자 앱 마이 탭의 '관리자' 버튼과 짝: 여기서 사용자 앱으로 돌아간다
          unstable_headerRightItems: () => [
            {
              type: 'button',
              label: '사용자 앱',
              icon: { type: 'sfSymbol', name: 'arrow.uturn.backward' },
              onPress: () => router.replace('/home'),
            },
          ],
        }}
      />
    </Stack>
  );
}
