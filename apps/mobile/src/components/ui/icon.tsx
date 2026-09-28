import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { useTheme, type Theme } from '@/theme';

/** 시스템 아이콘: iOS 는 SF Symbols, Android·웹은 Material Symbols (expo-symbols) */
export function Icon({
  ios,
  android,
  color = 'foreground',
  size,
}: {
  ios: SFSymbol;
  android: AndroidSymbol;
  color?: keyof Theme['colors'];
  size?: number;
}) {
  const t = useTheme();
  return (
    <SymbolView
      name={{ ios, android, web: android }}
      tintColor={t.colors[color]}
      size={size ?? (t.senior ? 26 : 22)}
    />
  );
}
