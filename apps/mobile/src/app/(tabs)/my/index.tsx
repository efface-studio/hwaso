import type { MeDto } from '@shop/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { AppRefreshControl } from '@/components/ui/app-refresh-control';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ThemePicker } from '@/components/theme-picker';
import { RefreshSkeleton } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
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
function ProfileHeader({ user }: { user: MeDto }) {
  const t = useTheme();
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
        accessibilityLabel="프로필 수정"
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
                  인증 판매자
                </Text>
              </View>
            )}
          </View>
          <Text variant="small" color="muted" numberOfLines={1}>
            {user.email.endsWith('.invalid') ? '소셜 계정' : user.email}
          </Text>
          {!!user.profile.bio && (
            <Text variant="small" numberOfLines={2}>
              {user.profile.bio}
            </Text>
          )}
        </View>
      </Pressable>

      <View style={[styles.stats, { borderColor: t.colors.borderSoft }]}>
        {stat('팔로워', String(p?.followerCount ?? '–'), {
          pathname: '/users/[id]/follows',
          params: { id: user.id, type: 'followers' },
        })}
        {stat('팔로잉', String(p?.followingCount ?? '–'), {
          pathname: '/users/[id]/follows',
          params: { id: user.id, type: 'following' },
        })}
        {stat('후기', p ? (p.ratingCount ? `★ ${p.ratingAvg.toFixed(1)}` : '0') : '–', profileHref)}
        {stat('거래', String(p?.tradeCount ?? '–'), profileHref)}
      </View>

      <View style={styles.actions}>
        <View style={{ flex: 1 }}>
          <Button
            title="프로필 수정"
            variant="outline"
            size="sm"
            block
            onPress={() => router.push('/settings/profile')}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title="내 프로필 보기"
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
      <RefreshSkeleton refreshing={refreshing} variant="list">
        {user ? (
          <ProfileHeader user={user} />
        ) : (
          <View style={styles.profile}>
            <Text variant="h3">로그인하고 입찰·구매·채팅을 시작하세요</Text>
            <Button title="로그인" onPress={() => router.push('/login')} block style={{ marginTop: 12 }} />
          </View>
        )}
        {user &&
          (
            [
              [
                '쇼핑',
                [
                  ['/orders', '구매 내역'],
                  ['/my/bids', '입찰·낙찰 내역'],
                  ['/cart', '장바구니'],
                  ['/my/favorites', '관심 작품'],
                  ['/my/recent', '최근 본 작품'],
                ],
              ],
              [
                '커뮤니티',
                [
                  ['/feed', '팔로잉 새 작품'],
                  [{ pathname: '/users/[id]/follows', params: { id: user.id, type: 'following' } }, '팔로잉'],
                  [{ pathname: '/users/[id]', params: { id: user.id } }, '내 프로필 · 받은 후기'],
                ],
              ],
              [
                '계정',
                [
                  ['/notifications', '알림'],
                  ['/addresses', '배송지 관리'],
                  ['/settings', '설정'],
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
          <Row label="고객센터 · 약관">
            <Text color="faint">›</Text>
          </Row>
        </Pressable>
        <Text variant="label" color="muted" style={styles.group}>
          화면
        </Text>
        <ThemePicker value={theme} onChange={setTheme} />
        <Row
          label="큰 글씨 모드 (시니어 모드)"
          description="글자와 버튼을 크게, 글자색을 진하게 하고 움직임을 줄여요."
        >
          <Switch
            value={senior}
            onValueChange={setSenior}
            trackColor={{ true: t.colors.primary }}
            accessibilityLabel="큰 글씨 모드"
          />
        </Row>
        {user && (
          <Button
            title="로그아웃"
            variant="ghost"
            style={{ marginTop: 24 }}
            onPress={() =>
              Alert.alert('로그아웃할까요?', undefined, [
                { text: '취소', style: 'cancel' },
                { text: '로그아웃', style: 'destructive', onPress: () => void logout() },
              ])
            }
          />
        )}
      </RefreshSkeleton>
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
