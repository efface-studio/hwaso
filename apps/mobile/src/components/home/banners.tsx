import type { BannerDto } from '@shop/shared';
import { useIsFocused } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { MediaImage } from '@/components/ui/media-image';
import { Text } from '@/components/ui/text';
import { openLink } from '@/lib/nav';
import { usePrefs } from '@/stores/prefs';
import { useTheme } from '@/theme';

const INTERVAL_MS = 5000;

/** 홈 배너: 좌우로 넘기고 5초마다 자동으로 넘어간다 (큰 글씨 모드에서는 움직임을 줄여 자동 넘김을 끈다) */
export function BannerCarousel({ banners }: { banners: BannerDto[] }) {
  const t = useTheme();
  const { t: tr } = useTranslation('home');
  const senior = usePrefs((s) => s.senior);
  const { width: screen } = useWindowDimensions();
  const width = Math.min(screen, 900);
  const height = Math.round(width * 0.56);
  const list = useRef<FlatList<BannerDto>>(null);
  const [index, setIndex] = useState(0);
  // 다른 탭·화면을 보는 동안에는 자동 넘김을 멈춘다
  const focused = useIsFocused();

  useEffect(() => {
    if (senior || !focused || banners.length < 2) return;
    const id = setInterval(() => {
      setIndex((i) => {
        const next = (i + 1) % banners.length;
        list.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, [banners.length, senior, focused]);

  if (!banners.length) return null;
  return (
    // 넓은 화면에서는 배너 폭으로 가운데 — 넘김(pagingEnabled)은 목록 폭 단위라 목록 폭을 배너 폭과 같게 둔다
    <View style={{ width, alignSelf: 'center' }}>
      <FlatList
        ref={list}
        data={banners}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(b) => b.id}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item: b }) => (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${b.title}. ${b.subtitle}`}
            onPress={() => openLink(b.link)}
            style={{ width, height }}
          >
            <MediaImage
              mediaKey={b.imageKey}
              displayWidth={width}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
            <View
              style={[
                styles.caption,
                { backgroundColor: b.tone === 'dark' ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.55)' },
              ]}
            >
              <Text variant="h2" style={{ color: b.tone === 'dark' ? '#fff' : '#111' }} numberOfLines={2}>
                {b.title}
              </Text>
              {b.subtitle ? (
                <Text
                  variant="small"
                  style={{ color: b.tone === 'dark' ? '#eee' : '#333' }}
                  numberOfLines={2}
                >
                  {b.subtitle}
                </Text>
              ) : null}
            </View>
          </Pressable>
        )}
      />
      {banners.length > 1 && (
        <View
          style={styles.dots}
          accessibilityLabel={tr('home.bannerA11y', { current: index + 1, total: banners.length })}
        >
          {banners.map((b, i) => (
            <View
              key={b.id}
              style={[styles.dot, { backgroundColor: i === index ? t.colors.foreground : t.colors.border }]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  caption: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, gap: 2 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingTop: 8 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
