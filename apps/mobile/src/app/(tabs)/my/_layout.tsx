import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { tabHeaderOptions } from '@/components/tab-header';
import { isAdmin } from '@/lib/admin';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

export default function Layout() {
  const t = useTheme();
  const { t: tr } = useTranslation(['my', 'common']);
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
          ...tabHeaderOptions(tr('common:tabs.my')),
          // 관리자 계정이면 오른쪽 위에서 관리자 앱으로 넘어간다
          unstable_headerRightItems: admin
            ? () => [
                {
                  type: 'button',
                  label: tr('myTab.admin'),
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
