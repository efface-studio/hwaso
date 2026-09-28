import { MAX_PRODUCT_IMAGES, type ImageDto } from '@shop/shared';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { mediaUrl } from '@/lib/media';
import { pickImages, uploadAsset } from '@/lib/upload';
import { useTheme } from '@/theme';

/**
 * 작품 사진: 촬영·앨범(여러 장), 업로드 진행, 순서 변경(첫 장이 대표), 삭제.
 * 형식·크기는 서버가 실제 디코딩으로 다시 검증한다.
 */
export function PhotoManager({
  images,
  onChange,
  locked,
}: {
  images: ImageDto[];
  onChange: (next: ImageDto[]) => void;
  locked?: boolean;
}) {
  const t = useTheme();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const left = MAX_PRODUCT_IMAGES - images.length;

  const add = async (source: 'camera' | 'library') => {
    const assets = await pickImages(source, left);
    if (!assets.length) return;
    setProgress({ done: 0, total: assets.length });
    const uploaded: ImageDto[] = [];
    let failed = 0;
    // 순서를 지키려고 한 장씩 올린다
    for (const a of assets) {
      try {
        uploaded.push(await uploadAsset(a));
      } catch {
        failed++;
      }
      setProgress((p) => p && { ...p, done: p.done + 1 });
    }
    setProgress(null);
    onChange([...images, ...uploaded].slice(0, MAX_PRODUCT_IMAGES));
    if (failed)
      Alert.alert(
        `${failed}장을 올리지 못했어요`,
        '사진 형식(JPG·PNG·HEIC)과 크기(20MB 이하)를 확인해주세요.',
      );
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= images.length) return;
    const next = [...images];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };

  return (
    <View style={{ gap: 12 }}>
      {!locked && (
        <View style={styles.actions}>
          <Button
            title="사진 찍기"
            variant="outline"
            style={{ flex: 1 }}
            disabled={left <= 0 || !!progress}
            onPress={() => void add('camera')}
          />
          <Button
            title="앨범에서 선택"
            variant="outline"
            style={{ flex: 1 }}
            disabled={left <= 0 || !!progress}
            onPress={() => void add('library')}
          />
        </View>
      )}
      <Text variant="small" color="muted" accessibilityLiveRegion="polite">
        {progress
          ? `사진 올리는 중 ${progress.done}/${progress.total}`
          : `${images.length}/${MAX_PRODUCT_IMAGES}장 · 첫 번째 사진이 대표 사진이에요. 정면·뒷면·서명·손상 부위를 찍어주세요.`}
      </Text>
      <View style={styles.grid}>
        {images.map((img, i) => (
          <View
            key={img.key}
            style={[styles.cell, { backgroundColor: img.dominantColor || t.colors.surface2 }]}
          >
            <Image source={mediaUrl(img.key, 400)} style={StyleSheet.absoluteFill} contentFit="cover" />
            {i === 0 && (
              <View style={[styles.badge, { backgroundColor: t.colors.primary }]}>
                <Text variant="caption" color="primaryForeground">
                  대표
                </Text>
              </View>
            )}
            {!locked && (
              <View style={[styles.tools, { backgroundColor: t.colors.overlay }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${i + 1}번째 사진 앞으로`}
                  disabled={i === 0}
                  onPress={() => move(i, -1)}
                  hitSlop={6}
                >
                  <Text variant="small" style={{ color: '#fff', opacity: i === 0 ? 0.4 : 1 }}>
                    ◀
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${i + 1}번째 사진 삭제`}
                  onPress={() => onChange(images.filter((x) => x.key !== img.key))}
                  hitSlop={6}
                >
                  <Text variant="small" style={{ color: '#fff' }}>
                    ✕
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${i + 1}번째 사진 뒤로`}
                  disabled={i === images.length - 1}
                  onPress={() => move(i, 1)}
                  hitSlop={6}
                >
                  <Text variant="small" style={{ color: '#fff', opacity: i === images.length - 1 ? 0.4 : 1 }}>
                    ▶
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: '31.5%', aspectRatio: 1, overflow: 'hidden', borderRadius: 4 },
  badge: { position: 'absolute', top: 4, left: 4, paddingHorizontal: 6, borderRadius: 4 },
  tools: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 4,
  },
});
