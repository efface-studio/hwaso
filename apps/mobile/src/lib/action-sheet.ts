import { ActionSheetIOS, Platform } from 'react-native';
import { create } from 'zustand';
import i18n from '@/i18n';

export type SheetOption = { label: string; destructive?: boolean; onPress: () => void };

/** Android·웹에서 띄울 선택 메뉴 — 루트의 ActionSheetHost 가 그린다 */
export const useActionSheet = create<{ sheet: { title: string; options: SheetOption[] } | null }>(() => ({
  sheet: null,
}));

/**
 * 선택 메뉴: iOS 는 OS 액션 시트, Android·웹은 하단 시트(ActionSheetHost).
 * Android Alert 는 버튼이 3개까지라 쓰지 않는다
 */
export function actionSheet(title: string, options: SheetOption[]) {
  if (Platform.OS === 'ios') {
    const labels = [...options.map((o) => o.label), i18n.t('common:action.cancel')];
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
  useActionSheet.setState({ sheet: { title, options } });
}
