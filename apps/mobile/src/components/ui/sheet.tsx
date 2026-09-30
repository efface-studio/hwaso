import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

/** OS 기본 pageSheet (iOS 는 아래로 끌어 닫기, Android 는 뒤로 가기) */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation('common');
  return (
    // 큰 글씨 모드는 움직임을 줄인다
    <Modal
      visible
      animationType={t.senior ? 'none' : 'slide'}
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <ScrollView
        style={{ backgroundColor: t.colors.background }}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.head}>
          <Text variant="h2" accessibilityRole="header" style={{ flex: 1 }}>
            {title}
          </Text>
          <Button title={tr('action.close')} variant="ghost" size="sm" onPress={onClose} />
        </View>
        {children}
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center' },
});
