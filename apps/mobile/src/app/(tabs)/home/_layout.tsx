import { Stack } from 'expo-router';
import { tabHeaderOptions } from '@/components/tab-header';
import { useTheme } from '@/theme';

export default function Layout() {
  const t = useTheme();
  return (
    <Stack screenOptions={{ headerTitleStyle: t.type('h3'), headerShadowVisible: false }}>
      {/* 로고만 둬 상단 여백을 줄인다. 헤더는 반투명 — 콘텐츠가 헤더 뒤로 비쳐 스크롤된다.
          검색·알림 버튼은 화면(index)에서 붙인다 (그 자리에서 검색하는 상태를 화면이 가진다) */}
      <Stack.Screen
        name="index"
        options={{
          ...tabHeaderOptions(null),
          headerTransparent: true,
          // 배경색 30% + 부드러운 스크롤 가장자리 효과 (블러와 함께 쓰면 효과가 겹친다)
          headerStyle: { backgroundColor: `${t.colors.background}4D` },
          scrollEdgeEffects: { top: 'soft' },
        }}
      />
    </Stack>
  );
}
