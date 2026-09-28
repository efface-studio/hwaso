import type { ReviewDto, ReviewSummaryDto } from '@shop/shared';
import { Image } from 'expo-image';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/ui/avatar';
import { Text } from '@/components/ui/text';
import { mediaUrl } from '@/lib/media';
import { useTheme } from '@/theme';

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const t = useTheme();
  return (
    <Text accessibilityLabel={`별점 ${value.toFixed(1)}점`} style={{ fontSize: size, lineHeight: size + 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Text key={n} style={{ color: n <= Math.round(value) ? t.colors.warning : t.colors.border }}>
          ★
        </Text>
      ))}
    </Text>
  );
}

/** 평점 요약: 평균·개수·별점별 막대 */
export function ReviewSummary({ s }: { s: ReviewSummaryDto }) {
  const t = useTheme();
  const max = Math.max(1, ...s.distribution);
  return (
    <View style={styles.summary}>
      <View style={{ alignItems: 'center', gap: 2 }}>
        <Text variant="h1">{s.ratingAvg.toFixed(1)}</Text>
        <Stars value={s.ratingAvg} />
        <Text variant="caption" color="muted">
          후기 {s.ratingCount}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        {[5, 4, 3, 2, 1].map((n) => (
          <View key={n} style={styles.bar}>
            <Text variant="caption" color="muted" style={{ width: 14 }}>
              {n}
            </Text>
            <View style={[styles.track, { backgroundColor: t.colors.surface2 }]}>
              <View
                style={{
                  width: `${(s.distribution[n - 1]! / max) * 100}%`,
                  height: '100%',
                  backgroundColor: t.colors.warning,
                }}
              />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export function ReviewItem({ r }: { r: ReviewDto }) {
  const t = useTheme();
  return (
    <View style={[styles.item, { borderColor: t.colors.borderSoft }]}>
      <View style={styles.row}>
        <Avatar avatarKey={r.author.avatarKey} name={r.author.nickname} size={32} />
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">{r.author.nickname}</Text>
          <Text variant="caption" color="muted">
            {r.direction === 'BUYER_TO_SELLER' ? '구매자' : '판매자'} ·{' '}
            {new Date(r.createdAt).toLocaleDateString('ko-KR')}
          </Text>
        </View>
        <Stars value={r.rating} />
      </View>
      <Text>{r.comment}</Text>
      {r.images.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {r.images.map((img) => (
            <Image
              key={img.key}
              source={mediaUrl(img.key, 400)}
              style={{ width: 72, height: 72, borderRadius: 4, backgroundColor: img.dominantColor }}
              contentFit="cover"
              accessibilityLabel="후기 사진"
            />
          ))}
        </ScrollView>
      )}
      <Text variant="caption" color="muted" numberOfLines={1}>
        {r.productTitle}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', gap: 20, padding: 16 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  item: {
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
