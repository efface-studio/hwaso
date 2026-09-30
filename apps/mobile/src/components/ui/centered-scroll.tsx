import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ScrollView, View, type ViewStyle } from 'react-native';
import { useVisibleBottom } from '@/hooks/use-visible-bottom';
import { useTheme } from '@/theme';

/**
 * 한 화면짜리 안내 화면 (그림·문구·버튼 등). 내용을 화면에 보이는 영역(헤더 아래 ~ 탭 바 위)의 가운데에 두고,
 * 들어가면 스크롤하지 않는다. 작은 화면에서 넘칠 때만 스크롤된다.
 */
export function CenteredScroll({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  const visibleBottom = useVisibleBottom();
  const box = useRef<View>(null);
  const [visibleH, setVisibleH] = useState<number | null>(null);
  const [contentH, setContentH] = useState(0);

  // 내용 틀이 화면의 어디서 시작하는지 재서, 보이는 영역 높이를 구한다
  const measure = useCallback(() => {
    box.current?.measureInWindow((_x, y) => setVisibleH(Math.max(0, visibleBottom - y)));
  }, [visibleBottom]);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      alwaysBounceVertical={false}
      scrollEnabled={visibleH !== null && contentH > visibleH + 1}
      style={{ backgroundColor: t.colors.background }}
    >
      <View
        ref={box}
        onLayout={measure}
        style={{
          minHeight: visibleH ?? undefined,
          justifyContent: 'center',
          opacity: visibleH === null ? 0 : 1,
        }}
      >
        <View style={style} onLayout={(e) => setContentH(e.nativeEvent.layout.height)}>
          {children}
        </View>
      </View>
    </ScrollView>
  );
}
