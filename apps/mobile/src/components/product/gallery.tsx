import type { ImageDto } from '@shop/shared';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '@/components/ui/text';
import { mediaUrl } from '@/lib/media';
import { useTheme } from '@/theme';

/** 작품 사진 넘기기. 누르면 전체 화면 확대 보기 */
export function Gallery({
  productId,
  images,
  title,
}: {
  productId: string;
  images: ImageDto[];
  title: string;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation('product');
  const { width: screen } = useWindowDimensions();
  // 태블릿에서는 사진이 화면을 다 차지하지 않게 폭을 제한한다
  const width = Math.min(screen, 720);
  const height = Math.min(width * 1.15, 640);
  const [index, setIndex] = useState(0);
  return (
    <View style={{ alignSelf: 'center', width }}>
      <FlatList
        horizontal
        pagingEnabled
        data={images}
        keyExtractor={(i) => i.key}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        // 한 장씩 넘기므로 처음엔 첫 장만, 이후엔 앞뒤 한 장씩만 그린다 (큰 원본을 한꺼번에 받지 않게)
        initialNumToRender={1}
        windowSize={3}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item, index: i }) => (
          <Pressable
            accessibilityRole="imagebutton"
            accessibilityLabel={tr('gallery.imageA11y', { title, index: i + 1, total: images.length })}
            onPress={() =>
              router.push({ pathname: '/products/[id]/viewer', params: { id: productId, index: String(i) } })
            }
            style={{ width, height, backgroundColor: item.dominantColor }}
          >
            <Image
              source={mediaUrl(item.key, 1600)}
              // 목록 카드에서 이미 받아 둔 작은 이미지를 먼저 보여준다
              placeholder={mediaUrl(item.key, 400)}
              placeholderContentFit="contain"
              style={StyleSheet.absoluteFill}
              contentFit="contain"
              transition={t.senior ? 0 : 150}
            />
          </Pressable>
        )}
      />
      {images.length > 1 && (
        <View style={[styles.counter, { backgroundColor: t.colors.overlay }]} accessibilityElementsHidden>
          <Text variant="caption" style={{ color: '#fff' }}>
            {index + 1} / {images.length}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  counter: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
});
