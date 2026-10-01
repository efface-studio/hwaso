import type { ReviewDto, ReviewSummaryDto } from '@shop/shared';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { formatDate } from '@/i18n/format';
import { actionSheet } from '@/lib/action-sheet';
import { mediaUrl } from '@/lib/media';
import { requireLogin } from '@/lib/require-login';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const t = useTheme();
  const { t: tr } = useTranslation('product');
  return (
    <Text
      accessibilityLabel={tr('review.stars', { rating: value.toFixed(1) })}
      style={{ fontSize: size, lineHeight: size + 4 }}
    >
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
  const { t: tr } = useTranslation('product');
  const max = Math.max(1, ...s.distribution);
  return (
    <View style={styles.summary}>
      <View style={{ alignItems: 'center', gap: 2 }}>
        <Text variant="h1">{s.ratingAvg.toFixed(1)}</Text>
        <Stars value={s.ratingAvg} />
        <Text variant="caption" color="muted">
          {tr('review.count', { count: s.ratingCount })}
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

/** 후기 한 건. 다른 사람이 쓴 후기는 오른쪽 위 메뉴에서 신고할 수 있다 */
export function ReviewItem({ r }: { r: ReviewDto }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['product', 'common']);
  const mine = useAuthStore((s) => s.user?.id === r.author.id);
  const menu = () =>
    actionSheet(tr('review.menuTitle', { name: r.author.nickname }), [
      {
        label: tr('common:action.report'),
        destructive: true,
        onPress: () =>
          requireLogin() && router.push({ pathname: '/report', params: { type: 'REVIEW', id: r.id } }),
      },
    ]);
  return (
    <View style={[styles.item, { borderColor: t.colors.borderSoft }]}>
      <View style={styles.row}>
        <Avatar avatarKey={r.author.avatarKey} name={r.author.nickname} size={32} />
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">{r.author.nickname}</Text>
          <Text variant="caption" color="muted">
            {r.direction === 'BUYER_TO_SELLER' ? tr('review.buyer') : tr('review.seller')} ·{' '}
            {formatDate(r.createdAt)}
          </Text>
        </View>
        <Stars value={r.rating} />
        {!mine && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('review.more')}
            hitSlop={8}
            onPress={menu}
            style={[styles.more, { minWidth: t.touch, minHeight: t.touch }]}
          >
            <Icon ios="ellipsis" android="more_horiz" color="muted" size={18} />
          </Pressable>
        )}
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
              accessibilityLabel={tr('review.photo')}
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
  more: { alignItems: 'center', justifyContent: 'center', marginVertical: -8, marginRight: -12 },
});
