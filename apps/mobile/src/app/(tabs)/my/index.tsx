import type { MeDto } from '@shop/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { AppRefreshControl } from '@/components/ui/app-refresh-control';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ThemePicker } from '@/components/theme-picker';
import { Text } from '@/components/ui/text';
import { Skeleton, SkeletonFrame } from '@/components/ui/skeleton';
import { api, logout } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { usePrefs } from '@/stores/prefs';
import { useTheme } from '@/theme';

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={[styles.row, { borderColor: t.colors.borderSoft, minHeight: t.touch + 12 }]}>
      <View style={{ flex: 1 }}>
        <Text>{label}</Text>
        {description && (
          <Text variant="caption" color="muted">
            {description}
          </Text>
        )}
      </View>
      {children}
    </View>
  );
}

/** 상단 프로필: 사진·닉네임·이메일·소개, 팔로워·팔로잉·후기·거래 수, 프로필 수정·보기 */
/** 새로고침 중: 마이 화면 모양 그대로 (프로필 · 숫자 네 칸 · 버튼 두 개 · 메뉴 묶음) */
function MySkeleton() {
  const t = useTheme();
  const rows = (n: number) =>
    Array.from({ length: n }, (_, i) => (
      <View key={i} style={[styles.row, { borderColor: t.colors.borderSoft, minHeight: t.touch + 12 }]}>
        <Skeleton width={`${40 + ((i * 17) % 25)}%`} height={16} />
      </View>
    ));
  return (
    <SkeletonFrame>
      <View style={styles.profile}>
        <View style={styles.identity}>
          <Skeleton width={64} height={64} radius={32} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="45%" height={22} />
            <Skeleton width="65%" height={14} />
          </View>
        </View>
        <View style={[styles.stats, { borderColor: t.colors.borderSoft }]}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.stat, { gap: 6 }]}>
              <Skeleton width={24} height={16} />
              <Skeleton width={36} height={12} />
            </View>
          ))}
        </View>
        <View style={styles.actions}>
          <Skeleton height={36} radius={t.radius.sm} style={{ flex: 1 }} />
          <Skeleton height={36} radius={t.radius.sm} style={{ flex: 1 }} />
        </View>
      </View>
      <View style={styles.group}>
        <Skeleton width={40} height={14} />
      </View>
      {rows(5)}
      <View style={styles.group}>
        <Skeleton width={56} height={14} />
      </View>
      {rows(3)}
    </SkeletonFrame>
  );
}

function ProfileHeader({ user }: { user: MeDto }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['my', 'common']);
  // 공개 프로필 화면과 같은 캐시 (수정 후 돌아와도 최신 숫자)
  const pub = useQuery({ queryKey: ['user', user.id], queryFn: () => api.market.user(user.id) });
  const p = pub.data;
  const stat = (label: string, value: string, href: Href) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${value}`}
      onPress={() => router.push(href)}
      style={({ pressed }) => [styles.stat, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Text variant="bodyStrong">{value}</Text>
      <Text variant="caption" color="muted">
        {label}
      </Text>
    </Pressable>
  );
  const profileHref: Href = { pathname: '/users/[id]', params: { id: user.id } };
  return (
    <View style={styles.profile}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr('myTab.editProfile')}
        onPress={() => router.push('/settings/profile')}
        style={({ pressed }) => [styles.identity, { opacity: pressed ? 0.7 : 1 }]}
      >
        <Avatar avatarKey={user.profile.avatarKey} name={user.profile.nickname} size={64} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.nameRow}>
            <Text variant="h2" numberOfLines={1} style={{ flexShrink: 1 }}>
              {user.profile.nickname}
            </Text>
            {p?.verified && (
              <View style={[styles.badge, { backgroundColor: t.colors.primarySoft }]}>
                <Text variant="caption" color="primary" style={{ fontWeight: '600' }}>
                  {tr('myTab.verifiedSeller')}
                </Text>
              </View>
            )}
          </View>
          <Text variant="small" color="muted" numberOfLines={1}>
            {user.email.endsWith('.invalid') ? tr('myTab.socialAccount') : user.email}
          </Text>
          {!!user.profile.bio && (
            <Text variant="small" numberOfLines={2}>
              {user.profile.bio}
            </Text>
          )}
        </View>
      </Pressable>

      <View style={[styles.stats, { borderColor: t.colors.borderSoft }]}>
        {stat(tr('people.followers'), String(p?.followerCount ?? '–'), {
          pathname: '/users/[id]/follows',
          params: { id: user.id, type: 'followers' },
        })}
        {stat(tr('people.following'), String(p?.followingCount ?? '–'), {
          pathname: '/users/[id]/follows',
          params: { id: user.id, type: 'following' },
        })}
        {stat(
          tr('people.reviews'),
          p ? (p.ratingCount ? `★ ${p.ratingAvg.toFixed(1)}` : '0') : '–',
          profileHref,
        )}
        {stat(tr('people.trades'), String(p?.tradeCount ?? '–'), profileHref)}
      </View>

      <View style={styles.actions}>
        <View style={{ flex: 1 }}>
          <Button
            title={tr('myTab.editProfile')}
            variant="outline"
            size="sm"
            block
            onPress={() => router.push('/settings/profile')}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title={tr('myTab.viewProfile')}
            variant="outline"
            size="sm"
            block
            onPress={() => router.push(profileHref)}
          />
        </View>
      </View>
    </View>
  );
}

export default function MyScreen() {
  const t = useTheme();
  const user = useAuthStore((s) => s.user);
  const { theme, senior, setTheme, setSenior } = usePrefs();
  const { t: tr } = useTranslation(['my', 'common']);
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  // 당겨서 새로고침: 내 계정(프로필 사진·닉네임 등)과 팔로워·후기 숫자
  const refresh = async () => {
    if (!user) return;
    setRefreshing(true);
    try {
      const [me] = await Promise.all([
        api.auth.me(),
        qc.invalidateQueries({ queryKey: ['user', user.id] }),
        // 스켈레톤이 한순간 깜빡이지 않게
        new Promise((r) => setTimeout(r, 600)),
      ]);
      useAuthStore.getState().setUser(me);
    } catch {
      // 네트워크 오류는 화면을 그대로 두고 다음 새로고침에 맡긴다
    } finally {
      setRefreshing(false);
    }
  };
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={styles.body}
      refreshControl={
        user ? <AppRefreshControl refreshing={refreshing} onRefresh={() => void refresh()} /> : undefined
      }
    >
      {refreshing ? (
        <MySkeleton />
      ) : (
        <>
          {user ? (
            <ProfileHeader user={user} />
          ) : (
            <View style={styles.profile}>
              <Text variant="h3">{tr('myTab.loginPrompt')}</Text>
              <Button
                title={tr('myTab.login')}
                onPress={() => router.push('/login')}
                block
                style={{ marginTop: 12 }}
              />
            </View>
          )}
          {user &&
            (
              [
                [
                  tr('myTab.group.shopping'),
                  [
                    ['/orders', tr('myTab.menu.orders')],
                    ['/my/bids', tr('myTab.menu.bids')],
                    ['/cart', tr('myTab.menu.cart')],
                    ['/my/favorites', tr('myTab.menu.favorites')],
                    ['/my/recent', tr('myTab.menu.recent')],
                  ],
                ],
                [
                  tr('myTab.group.community'),
                  [
                    ['/feed', tr('myTab.menu.feed')],
                    [
                      { pathname: '/users/[id]/follows', params: { id: user.id, type: 'following' } },
                      tr('myTab.menu.following'),
                    ],
                    [{ pathname: '/users/[id]', params: { id: user.id } }, tr('myTab.menu.profileReviews')],
                  ],
                ],
                [
                  tr('myTab.group.account'),
                  [
                    ['/notifications', tr('myTab.menu.notifications')],
                    ['/addresses', tr('myTab.menu.addresses')],
                    ['/settings', tr('myTab.menu.settings')],
                  ],
                ],
              ] as [string, [Href, string][]][]
            ).map(([group, rows]) => (
              <View key={group}>
                <Text variant="label" color="muted" style={styles.group}>
                  {group}
                </Text>
                {rows.map(([href, label]) => (
                  <Pressable key={label} accessibilityRole="link" onPress={() => router.push(href)}>
                    <Row label={label}>
                      <Text color="faint">›</Text>
                    </Row>
                  </Pressable>
                ))}
              </View>
            ))}
          <Pressable accessibilityRole="link" onPress={() => router.push('/support')}>
            <Row label={tr('myTab.menu.support')}>
              <Text color="faint">›</Text>
            </Row>
          </Pressable>
          <Text variant="label" color="muted" style={styles.group}>
            {tr('myTab.group.display')}
          </Text>
          <ThemePicker value={theme} onChange={setTheme} />
          <Row label={tr('myTab.senior.label')} description={tr('myTab.senior.description')}>
            <Switch
              style={{ alignSelf: 'center' }}
              value={senior}
              onValueChange={setSenior}
              trackColor={{ true: t.colors.primary }}
              accessibilityLabel={tr('myTab.senior.a11y')}
            />
          </Row>
          {user && (
            <Button
              title={tr('myTab.logout')}
              variant="ghost"
              style={{ marginTop: 24 }}
              onPress={() =>
                Alert.alert(tr('myTab.logoutConfirm'), undefined, [
                  { text: tr('common:action.cancel'), style: 'cancel' },
                  { text: tr('myTab.logout'), style: 'destructive', onPress: () => void logout() },
                ])
              }
            />
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 48 },
  profile: { paddingTop: 8, gap: 16 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  stats: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  actions: { flexDirection: 'row', gap: 8 },
  group: { marginTop: 28, marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
  },
});
