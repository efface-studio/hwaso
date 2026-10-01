import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { answerPushPrompt, usePushPrompt } from '@/lib/push-prompt';
import { useTheme } from '@/theme';

/**
 * 알림 권한 안내 시트: 무엇을 알려 주는지 짧게 말하고, '알림 켜기'를 누를 때만 시스템 권한 창을 띄운다.
 * 바깥을 누르거나 '나중에'를 누르면 묻지 않고 닫는다 (알림 설정에서 언제든 켤 수 있다).
 */
export function PushPromptHost() {
  const t = useTheme();
  const { t: tr } = useTranslation('common');
  const insets = useSafeAreaInsets();
  const reason = usePushPrompt((s) => s.reason);
  if (!reason) return null;
  const later = () => void answerPushPrompt(false);
  return (
    <Modal visible transparent animationType={t.senior ? 'none' : 'slide'} onRequestClose={later}>
      <Pressable accessibilityLabel={tr('pushPrompt.later')} style={styles.backdrop} onPress={later} />
      <View
        accessibilityViewIsModal
        style={[
          styles.panel,
          { backgroundColor: t.colors.surface, paddingBottom: Math.max(insets.bottom, 16) },
        ]}
      >
        <Text variant="h3" accessibilityRole="header">
          {tr('pushPrompt.title')}
        </Text>
        <Text color="muted">{tr(`pushPrompt.reason.${reason}`)}</Text>
        <Text variant="small" color="muted">
          {tr('pushPrompt.hint')}
        </Text>
        <View style={styles.actions}>
          <Button
            title={tr('pushPrompt.allow')}
            size="lg"
            block
            onPress={() => void answerPushPrompt(true)}
          />
          <Button title={tr('pushPrompt.later')} variant="ghost" block onPress={later} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  panel: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, gap: 8 },
  actions: { gap: 4, marginTop: 12 },
});
