import { ActionSheetIOS, Alert, Platform } from 'react-native';

export type SheetOption = { label: string; destructive?: boolean; onPress: () => void };

/** OS 기본 선택 메뉴: iOS 액션 시트 / Android 대화상자 */
export function actionSheet(title: string, options: SheetOption[]) {
  if (Platform.OS === 'ios') {
    const labels = [...options.map((o) => o.label), '취소'];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: labels,
        cancelButtonIndex: labels.length - 1,
        destructiveButtonIndex: options.map((o, i) => (o.destructive ? i : -1)).filter((i) => i >= 0),
      },
      (i) => options[i]?.onPress(),
    );
    return;
  }
  Alert.alert(title, undefined, [
    ...options.map((o) => ({
      text: o.label,
      style: o.destructive ? ('destructive' as const) : ('default' as const),
      onPress: o.onPress,
    })),
    { text: '취소', style: 'cancel' as const },
  ]);
}
