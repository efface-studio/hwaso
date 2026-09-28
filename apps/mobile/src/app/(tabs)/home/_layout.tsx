import { router, Stack } from 'expo-router';
import { Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
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
      <Stack.Screen
        name="index"
        options={{
          title: '화소',
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="검색"
              onPress={() => router.push('/search')}
              hitSlop={10}
            >
              <Text variant="bodyStrong">검색</Text>
            </Pressable>
          ),
        }}
      />
    </Stack>
  );
}
