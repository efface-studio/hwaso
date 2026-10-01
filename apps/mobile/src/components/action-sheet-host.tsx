import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { useActionSheet } from '@/lib/action-sheet';
import { useTheme } from '@/theme';
import { readable } from '@/hooks/use-layout';

/** Android·웹 선택 메뉴: 아래에서 올라오는 시트 (선택지 수 제한 없음). 큰 글씨 모드는 움직임 없이 */
export function ActionSheetHost() {
  const t = useTheme();
  const { t: tr } = useTranslation('common');
  const insets = useSafeAreaInsets();
  const sheet = useActionSheet((s) => s.sheet);
  const close = () => useActionSheet.setState({ sheet: null });
  if (!sheet) return null;
  const row = [styles.row, { minHeight: t.touch, borderColor: t.colors.borderSoft }];
  return (
    <Modal visible transparent animationType={t.senior ? 'none' : 'slide'} onRequestClose={close}>
      {/* 배경은 화면 전체, 패널은 아래 — 넓은 화면(아이패드)에서는 본문 폭으로 가운데 */}
      <View style={styles.root}>
        <Pressable
          accessibilityLabel={tr('action.close')}
          style={[StyleSheet.absoluteFill, styles.backdrop]}
          onPress={close}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.panel,
            readable,
            { backgroundColor: t.colors.surface, paddingBottom: Math.max(insets.bottom, 8) },
          ]}
        >
          <Text variant="small" color="muted" style={styles.title}>
            {sheet.title}
          </Text>
          {sheet.options.map((o) => (
            <Pressable
              key={o.label}
              accessibilityRole="button"
              onPress={() => {
                close();
                o.onPress();
              }}
              style={({ pressed }) => [...row, pressed && { backgroundColor: t.colors.surface2 }]}
            >
              <Text color={o.destructive ? 'destructive' : 'foreground'}>{o.label}</Text>
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" onPress={close} style={row}>
            <Text color="muted">{tr('action.cancel')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.4)' },
  panel: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 8 },
  title: { paddingHorizontal: 20, paddingVertical: 10 },
  row: {
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
