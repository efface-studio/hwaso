import type { TypographyToken } from '@shop/tokens';
import { Text as RNText, type TextProps } from 'react-native';
import { useTheme, type Colors } from '@/theme';

/** 토큰 글자 스타일 + 색. 시니어 모드에서는 크기가 자동으로 커진다 */
export function Text({
  variant = 'body',
  color = 'foreground',
  style,
  ...props
}: TextProps & { variant?: TypographyToken; color?: keyof Colors }) {
  const t = useTheme();
  return <RNText {...props} style={[t.type(variant), { color: t.colors[color] }, style]} />;
}
