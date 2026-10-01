import { Image } from 'expo-image';
import type { NativeStackNavigationOptions } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import logoDark from '../../assets/header-logo-dark.png';
import logoLight from '../../assets/header-logo.png';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

/** 좌상단 로고 마크 (테마별 원본, 워드마크 없이) */
const LOGO = { light: logoLight, dark: logoDark };

export function HeaderLogo({ onPress }: { onPress?: () => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation('common');
  const logo = (
    <Image
      source={LOGO[t.scheme]}
      style={{ width: Math.round(33 * t.scale), height: Math.round(30 * t.scale) }}
      contentFit="contain"
      accessible={!onPress}
      accessibilityRole="image"
      accessibilityLabel={tr('brand.name')}
    />
  );
  if (!onPress) return logo;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tr('header.refreshHome')}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      {logo}
    </Pressable>
  );
}

function HeaderTitle({ title }: { title: string }) {
  const t = useTheme();
  return (
    <Text
      variant="h2"
      accessibilityRole="header"
      style={{ fontSize: Math.round(22 * t.scale), lineHeight: Math.round(28 * t.scale) }}
    >
      {title}
    </Text>
  );
}

/**
 * 탭 첫 화면 공통 헤더: 큰 제목(large title) 대신 내비게이션 바 한 줄 왼쪽에 제목(홈은 로고)을 둬
 * 상단 여백을 줄인다. 왼쪽 요소는 iOS 26 공유 글래스 배경 없이 띄운다.
 */
export function tabHeaderOptions(
  title: string | null,
  { onLogoPress }: { onLogoPress?: () => void } = {},
): NativeStackNavigationOptions {
  return {
    title: '',
    headerLargeTitle: false,
    headerShadowVisible: false,
    unstable_headerLeftItems: () => [
      {
        type: 'custom',
        element: title ? <HeaderTitle title={title} /> : <HeaderLogo onPress={onLogoPress} />,
        hidesSharedBackground: true,
      },
    ],
  };
}
