import type { ArtistCardDto } from '@shop/shared';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { MediaImage } from '@/components/ui/media-image';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

/** 홈 인기 작가 가로 목록 */
export function ArtistRail({ artists }: { artists: ArtistCardDto[] }) {
  const t = useTheme();
  const { t: tr } = useTranslation('home');
  if (!artists.length) return null;
  const size = t.senior ? 104 : 88;
  return (
    <View style={styles.section}>
      <Text variant="h3" style={styles.title} accessibilityRole="header">
        {tr('home.sections.popularArtists')}
      </Text>
      <FlatList
        horizontal
        data={artists}
        keyExtractor={(a) => a.id}
        contentContainerStyle={styles.list}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item: a }) => (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={tr('home.artistA11y', { name: a.name, count: a.productCount })}
            onPress={() => router.push({ pathname: '/artists/[id]', params: { id: a.id } })}
            style={{ width: size, alignItems: 'center', gap: 8 }}
          >
            <View
              style={[
                styles.photo,
                { width: size, height: size, backgroundColor: a.image?.dominantColor ?? t.colors.surface2 },
              ]}
            >
              {a.image && (
                <MediaImage
                  mediaKey={a.image.key}
                  displayWidth={size}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                />
              )}
            </View>
            {/* 이름과 작품 수는 붙여서 한 묶음으로 */}
            <View style={styles.caption}>
              <Text variant="small" numberOfLines={1}>
                {a.name}
              </Text>
              <Text variant="caption" color="muted">
                {tr('home.artistCount', { count: a.productCount })}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: 24 },
  title: { paddingHorizontal: 16, marginBottom: 12 },
  list: { paddingHorizontal: 16, gap: 16 },
  caption: { alignItems: 'center', maxWidth: '100%' },
  photo: { borderRadius: 999, overflow: 'hidden' },
});
