import { router, Stack } from 'expo-router';
import { tabHeaderOptions } from '@/components/tab-header';
import { isAdmin } from '@/lib/admin';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

export default function Layout() {
  const t = useTheme();
  const admin = isAdmin(useAuthStore((s) => s.user));
  return (
    <Stack
      screenOptions={{
        headerTitleStyle: t.type('h3'),
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          ...tabHeaderOptions('마이'),
          // 관리자 계정이면 오른쪽 위에서 관리자 앱으로 넘어간다
          unstable_headerRightItems: admin
            ? () => [
                {
                  type: 'button',
                  label: '관리자',
                  icon: { type: 'sfSymbol', name: 'shield.lefthalf.filled' },
                  variant: 'prominent',
                  tintColor: t.colors.primary,
                  onPress: () => router.push('/admin/dashboard'),
                },
              ]
            : undefined,
        }}
      />
    </Stack>
  );
}
