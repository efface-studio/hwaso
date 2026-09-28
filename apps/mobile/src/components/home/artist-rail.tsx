import type { ArtistDto } from '@shop/shared';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { mediaUrl } from '@/lib/media';
import { useTheme } from '@/theme';

/** 홈 인기 작가 가로 목록 */
export function ArtistRail({ artists }: { artists: ArtistDto[] }) {
  const t = useTheme();
  if (!artists.length) return null;
  const size = t.senior ? 104 : 88;
  return (
    <View style={styles.section}>
      <Text variant="h3" style={styles.title} accessibilityRole="header">
        인기 작가
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
            accessibilityLabel={`${a.name}, 작품 ${a.productCount}점`}
            onPress={() => router.push({ pathname: '/artists/[id]', params: { id: a.id } })}
            style={{ width: size, alignItems: 'center', gap: 6 }}
          >
            <View
              style={[
                styles.photo,
                { width: size, height: size, backgroundColor: a.image?.dominantColor ?? t.colors.surface2 },
              ]}
            >
              {a.image && (
                <Image
                  source={mediaUrl(a.image.key, 400)}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                />
              )}
            </View>
            <Text variant="small" numberOfLines={1}>
              {a.name}
            </Text>
            <Text variant="caption" color="muted">
              작품 {a.productCount}
            </Text>
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
  photo: { borderRadius: 999, overflow: 'hidden' },
});
