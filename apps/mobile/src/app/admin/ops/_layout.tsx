import { Stack } from 'expo-router';
import { tabHeaderOptions } from '@/components/tab-header';
import { useTheme } from '@/theme';

export default function Layout() {
  const t = useTheme();
  return (
    <Stack screenOptions={{ headerTitleStyle: t.type('h3'), headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={tabHeaderOptions('운영')} />
      <Stack.Screen name="reports" options={{ title: '신고' }} />
      <Stack.Screen name="categories" options={{ title: '카테고리' }} />
      <Stack.Screen name="banners" options={{ title: '배너' }} />
      <Stack.Screen name="notices" options={{ title: '공지사항' }} />
      <Stack.Screen name="coupons" options={{ title: '쿠폰' }} />
      <Stack.Screen name="broadcast" options={{ title: '전체 알림' }} />
      <Stack.Screen name="policy" options={{ title: '경매 정책' }} />
      <Stack.Screen name="audit" options={{ title: '감사 로그' }} />
      <Stack.Screen name="logs" options={{ title: '서버 로그' }} />
      <Stack.Screen name="updates" options={{ title: '앱 업데이트' }} />
    </Stack>
  );
}
