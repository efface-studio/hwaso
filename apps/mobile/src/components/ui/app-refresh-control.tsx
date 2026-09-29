import { RefreshControl, type RefreshControlProps } from 'react-native';
import { useTheme } from '@/theme';

/** 당겨서 새로고침 표시 — 앱 메인 색 (iOS tintColor, Android colors) */
export function AppRefreshControl(props: RefreshControlProps) {
  const t = useTheme();
  return (
    <RefreshControl
      tintColor={t.colors.primary}
      colors={[t.colors.primary]}
      progressBackgroundColor={t.colors.surface}
      {...props}
    />
  );
}
