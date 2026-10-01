import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { HwasoMark } from '@/components/brand/hwaso-mark';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { closeWelcome, useWelcome } from '@/stores/welcome';
import { useTheme } from '@/theme';

/**
 * 가입 축하 팝업: 가입(이메일)·가입 마무리(소셜 첫 동의) 직후 한 번.
 * '둘러보기'나 바깥을 누르면 닫고 있던 화면을 그대로 둔다 (가입 마무리는 가드가 홈으로, 이메일 가입은 보던 화면으로 돌아와 있다)
 */
export function WelcomeHost() {
  const t = useTheme();
  const { t: tr } = useTranslation('common');
  const reduceMotion = useReducedMotion();
  const nickname = useWelcome((s) => s.nickname);
  if (nickname === null) return null;
  return (
    <Modal
      visible
      transparent
      animationType={t.senior || reduceMotion ? 'none' : 'fade'}
      onRequestClose={closeWelcome}
    >
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel={tr('action.close')}
          style={StyleSheet.absoluteFill}
          onPress={closeWelcome}
        />
        <View
          accessibilityViewIsModal
          style={[styles.panel, { backgroundColor: t.colors.surface, borderRadius: t.radius.lg }]}
        >
          <HwasoMark size={56} />
          <Text variant="h2" accessibilityRole="header" style={styles.center}>
            {tr('welcome.title')}
          </Text>
          <Text color="muted" style={styles.center}>
            {tr('welcome.body', { nickname })}
          </Text>
          <Button title={tr('welcome.browse')} size="lg" block onPress={closeWelcome} style={styles.action} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  panel: { width: '100%', maxWidth: 360, padding: 24, gap: 10, alignItems: 'center' },
  center: { textAlign: 'center' },
  action: { alignSelf: 'stretch', marginTop: 10 },
});
