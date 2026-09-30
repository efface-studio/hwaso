import { useState, type ReactNode } from 'react';
import { ScrollView, View, type ViewStyle } from 'react-native';
import { useVisibleHeight } from '@/hooks/use-visible-height';
import { useTheme } from '@/theme';

/**
 * 한 화면짜리 안내 화면 (그림·문구·버튼 등). 내용을 화면에 보이는 영역(헤더 아래 ~ 탭 바 위)의 가운데에 두고,
 * 들어가면 스크롤하지 않는다. 작은 화면에서 넘칠 때만 스크롤된다.
 */
export function CenteredScroll({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  const visibleH = useVisibleHeight();
  const [contentH, setContentH] = useState(0);
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      alwaysBounceVertical={false}
      scrollEnabled={contentH > visibleH + 1}
      style={{ backgroundColor: t.colors.background }}
    >
      <View style={{ minHeight: visibleH, justifyContent: 'center' }}>
        <View style={style} onLayout={(e) => setContentH(e.nativeEvent.layout.height)}>
          {children}
        </View>
      </View>
    </ScrollView>
  );
}
