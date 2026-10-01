import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { tabHeaderOptions } from '@/components/tab-header';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

export default function Layout() {
  const t = useTheme();
  const { t: tr } = useTranslation(['common', 'sell']);
  const seller = useAuthStore((s) => !!s.user?.isSeller);
  return (
    <Stack
      screenOptions={{
        headerTitleStyle: t.type('h3'),
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          ...tabHeaderOptions(tr('tabs.sell')),
          // 작품 등록은 오른쪽 위 버튼 하나로 (판매자일 때만)
          unstable_headerRightItems: seller
            ? () => [
                {
                  type: 'button',
                  label: tr('sell:tab.register'),
                  icon: { type: 'sfSymbol', name: 'plus' },
                  variant: 'prominent',
                  tintColor: t.colors.primary,
                  onPress: () => router.push('/sell/new'),
                },
              ]
            : undefined,
        }}
      />
    </Stack>
  );
}
