import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Platform, StyleSheet, View } from 'react-native';
import { ScreenStack, ScreenStackItem } from 'react-native-screens';
import { Button } from '@/components/ui/button';
import { FormScroll } from '@/components/ui/form-scroll';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

/**
 * OS 기본 pageSheet (iOS 는 아래로 끌어 닫기, Android 는 뒤로 가기).
 * iOS 는 시트 위쪽에 네이티브 스택 한 장을 두어 헤더를 시스템 내비게이션 바로 그린다 —
 * 라우트 모달(`_layout` 의 modal())과 같은 왼쪽 xmark 리퀴드 글래스 버튼 + 가운데 제목.
 * 이미 앱에 들어 있는 react-native-screens 구성 요소만 써서 JS 업데이트(OTA)로 바뀐다.
 */
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
  const close = tr('action.close');
  const titleType = t.type('h3');
  // 시트 내비게이션 바 높이 — 본문을 그만큼 내려 둔다
  const [headerHeight, setHeaderHeight] = useState(DEFAULT_HEADER_HEIGHT);
  return (
    // 큰 글씨 모드는 움직임을 줄인다
    <Modal
      visible
      animationType={t.senior ? 'none' : 'slide'}
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {Platform.OS === 'ios' ? (
        <View style={[styles.fill, { backgroundColor: t.colors.background }]}>
          {/* 헤더만 네이티브 스택으로 — 본문까지 스택 화면에 넣으면 스택 화면이 RN 모달과 따로 터치를 잡아 누르기가 취소된다.
              바 아래 구분선·버튼 그림자는 스택 영역 안에만 그려져 스택을 조금 더 길게 두고, 겹치는 부분은 위에 놓인 본문이 터치를 받는다 */}
          <ScreenStack style={[styles.header, { height: headerHeight + HEADER_OVERHANG }]}>
            <ScreenStackItem
              screenId="sheet"
              activityState={2}
              style={StyleSheet.absoluteFill}
              onHeaderHeightChange={(e) => {
                const h = e.nativeEvent.headerHeight;
                if (h > 0) setHeaderHeight(h);
              }}
              headerConfig={{
                title,
                titleColor: t.colors.foreground,
                titleFontSize: titleType.fontSize,
                titleFontWeight: titleType.fontWeight != null ? String(titleType.fontWeight) : undefined,
                color: t.colors.primary,
                backgroundColor: t.colors.background,
                experimental_userInterfaceStyle: t.dark ? 'dark' : 'light',
                headerLeftBarButtonItems: [
                  {
                    type: 'button',
                    title: close,
                    accessibilityLabel: close,
                    icon: { type: 'sfSymbol', name: 'xmark' },
                    onPress: onClose,
                  },
                ],
              }}
            >
              {null}
            </ScreenStackItem>
          </ScreenStack>
          <FormScroll style={{ marginTop: headerHeight }} contentContainerStyle={styles.body}>
            {children}
          </FormScroll>
        </View>
      ) : (
        <FormScroll style={{ backgroundColor: t.colors.background }} contentContainerStyle={styles.body}>
          <View style={styles.head}>
            <Text variant="h2" accessibilityRole="header" style={{ flex: 1 }}>
              {title}
            </Text>
            <Button title={close} variant="ghost" size="sm" onPress={onClose} />
          </View>
          {children}
        </FormScroll>
      )}
    </Modal>
  );
}

/** 첫 측정 전 바 높이 — iPhone iOS 26 pageSheet 에서 잰 값 (측정되면 바로 바뀐다) */
const DEFAULT_HEADER_HEIGHT = 74;
/** 바 아래로 번지는 구분선·리퀴드 글래스 그림자가 보일 여유 */
const HEADER_OVERHANG = 24;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { position: 'absolute', top: 0, left: 0, right: 0 },
  body: { padding: 20, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center' },
});
