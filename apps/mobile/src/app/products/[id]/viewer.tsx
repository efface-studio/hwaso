import type { ProductDetailDto } from '@shop/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ZoomableImage } from '@/components/product/zoomable-image';
import { Text } from '@/components/ui/text';
import { mediaUrl } from '@/lib/media';
import { goBack } from '@/lib/nav';

/** 전체 화면 사진 보기 (작품 상세 캐시를 재사용) */
export default function ViewerScreen() {
  const { id, index } = useLocalSearchParams<{ id: string; index?: string }>();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { t: tr } = useTranslation(['product', 'common']);
  const p = useQueryClient().getQueryData<ProductDetailDto>(['product', id]);
  const images = p?.images ?? [];
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }} />
      <FlatList
        horizontal
        pagingEnabled
        data={images}
        initialScrollIndex={Math.min(Number(index ?? 0), Math.max(0, images.length - 1))}
        getItemLayout={(_d, i) => ({ length: width, offset: width * i, index: i })}
        keyExtractor={(i) => i.key}
        renderItem={({ item }) => (
          <View style={{ width, height }}>
            <ZoomableImage uri={mediaUrl(item.key, 1600)} label={p?.title ?? tr('viewer.imageFallback')} />
          </View>
        )}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr('common:action.close')}
        onPress={goBack}
        style={[styles.close, { top: insets.top + 8 }]}
        hitSlop={12}
      >
        <Text variant="h3" style={{ color: '#fff' }}>
          ✕
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  close: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
