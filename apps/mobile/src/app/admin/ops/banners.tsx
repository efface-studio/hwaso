import { ApiError } from '@shop/api-client';
import { bannerSchema, type AdminBannerRow, type BannerInput } from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, View } from 'react-native';
import { useAdminAction } from '@/components/admin/admin-list';
import { AdminRow, RowSeparator } from '@/components/admin/row';
import { StatusText } from '@/components/admin/status';
import { AppRefreshControl } from '@/components/ui/app-refresh-control';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { DateTimeField } from '@/components/ui/inputs';
import { RadioList } from '@/components/ui/radio';
import { Sheet } from '@/components/ui/sheet';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { List } from '@/components/ui/list';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { actionSheet } from '@/lib/action-sheet';
import { dt } from '@/lib/admin';
import { api } from '@/lib/api';
import { mediaUrl } from '@/lib/media';
import { pickImages, uploadAsset } from '@/lib/upload';
import { useTheme } from '@/theme';

/** 순서는 비워 둘 수 있게 편집 중에만 null 을 허용한다 */
type Draft = Omit<BannerInput, 'sortOrder'> & { sortOrder: number | null };

const DAY = 86_400_000;

/** 목록 썸네일 크기와, 구분선을 글자 시작점까지 들일 값 */
const THUMB = { width: 64, height: 40 };
const THUMB_INSET = 16 + THUMB.width + 12;

/** zod 기본 문구(영문) 대신 보여줄 안내 — 스키마에 직접 쓴 문구(refine 등)는 그대로 쓴다 */
const FIELD_MSG: Record<string, string> = {
  title: '제목을 1~60자로 입력해주세요.',
  subtitle: '부제는 120자까지 쓸 수 있어요.',
  imageKey: '이미지를 올려주세요.',
  link: '/로 시작하는 사이트 안 경로를 입력해주세요.',
  sortOrder: '순서는 0~999 사이로 정해주세요.',
};

const blank = (): Draft => ({
  title: '',
  subtitle: '',
  tone: 'dark',
  imageKey: '',
  link: '/',
  placement: 'home',
  sortOrder: 0,
  startsAt: new Date().toISOString(),
  endsAt: new Date(Date.now() + 30 * DAY).toISOString(),
  isActive: true,
});

/** 목록 행(id·live 포함)에서 입력값만 골라낸다 — 스키마가 strictObject 라 다른 키가 있으면 거절된다 */
const fromRow = (b: AdminBannerRow): Draft => ({
  title: b.title,
  subtitle: b.subtitle,
  tone: b.tone,
  imageKey: b.imageKey,
  link: b.link,
  placement: b.placement,
  sortOrder: b.sortOrder,
  startsAt: b.startsAt,
  endsAt: b.endsAt,
  isActive: b.isActive,
});

/** 입력 묶음 제목 */
function SectionTitle({ children }: { children: string }) {
  return (
    <Text variant="label" color="muted" accessibilityRole="header">
      {children}
    </Text>
  );
}

/** 배너 편집 시트: 이미지 · 내용 · 노출 묶음 */
function BannerForm({ initial, onClose }: { initial: AdminBannerRow | null; onClose: () => void }) {
  const t = useTheme();
  const [b, setB] = useState<Draft>(() => (initial ? fromRow(initial) : blank()));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const set = (p: Partial<Draft>) => setB((v) => ({ ...v, ...p }));
  const save = useAdminAction(
    (v: BannerInput) => (initial ? api.admin.updateBanner(initial.id, v) : api.admin.createBanner(v)),
    '배너를 저장했어요',
    ['banners'],
  );

  const upload = async () => {
    const asset = (await pickImages('library', 1))[0];
    if (!asset) return;
    setUploading(true);
    try {
      set({ imageKey: (await uploadAsset(asset)).key });
      setErrors(({ imageKey: _, ...rest }) => rest);
    } catch (e) {
      Alert.alert('이미지를 올리지 못했어요', e instanceof ApiError ? e.message : undefined);
    } finally {
      setUploading(false);
    }
  };

  const submit = () => {
    const r = bannerSchema.safeParse({ ...b, sortOrder: b.sortOrder ?? 0 });
    if (!r.success) {
      const next: Record<string, string> = {};
      for (const i of r.error.issues) {
        const k = String(i.path[0]);
        next[k] ??= i.code === 'custom' ? i.message : (FIELD_MSG[k] ?? i.message);
      }
      return setErrors(next);
    }
    setErrors({});
    save.mutate([r.data], { onSuccess: onClose });
  };

  return (
    <Sheet title={initial ? '배너 수정' : '새 배너'} onClose={onClose}>
      <View style={styles.section}>
        <SectionTitle>이미지</SectionTitle>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={b.imageKey ? '배너 이미지 바꾸기' : '배너 이미지 올리기'}
          accessibilityState={{ busy: uploading }}
          disabled={uploading}
          onPress={() => void upload()}
          style={[
            styles.preview,
            {
              backgroundColor: t.colors.surface2,
              borderRadius: t.radius.md,
              borderColor: errors.imageKey ? t.colors.destructive : t.colors.border,
            },
          ]}
        >
          {b.imageKey ? (
            <Image
              source={mediaUrl(b.imageKey, 800)}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              accessible={false}
            />
          ) : (
            <Text variant="small" color="muted">
              3:1 비율 이미지를 권장해요
            </Text>
          )}
          {uploading && (
            <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: '#00000066' }]}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
        </Pressable>
        <Button
          title={b.imageKey ? '이미지 바꾸기' : '이미지 올리기'}
          variant="outline"
          size="sm"
          loading={uploading}
          onPress={() => void upload()}
        />
        {errors.imageKey && (
          <Text variant="small" color="destructive" accessibilityLiveRegion="polite">
            {errors.imageKey}
          </Text>
        )}
      </View>

      <View style={styles.section}>
        <SectionTitle>내용</SectionTitle>
        <Field
          label="제목"
          counter
          maxLength={60}
          value={b.title}
          onChangeText={(title) => set({ title })}
          error={errors.title}
        />
        <Field
          label="부제"
          counter
          maxLength={120}
          value={b.subtitle}
          onChangeText={(subtitle) => set({ subtitle })}
          error={errors.subtitle}
        />
        <Field
          label="링크"
          value={b.link}
          onChangeText={(link) => set({ link })}
          error={errors.link}
          hint="사이트 안 경로 (예: /auctions)"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <View style={styles.field}>
          <Text variant="label">글자 색</Text>
          <RadioList
            label="글자 색"
            value={b.tone}
            onChange={(tone) => set({ tone })}
            options={[
              { value: 'dark', label: '흰 글자 (어두운 이미지)' },
              { value: 'light', label: '검은 글자 (밝은 이미지)' },
            ]}
          />
        </View>
      </View>

      <View style={styles.section}>
        <SectionTitle>노출 설정</SectionTitle>
        <DateTimeField
          label="시작"
          value={new Date(b.startsAt)}
          onChange={(d) => set({ startsAt: d.toISOString() })}
          error={errors.startsAt}
        />
        <DateTimeField
          label="종료"
          value={new Date(b.endsAt)}
          onChange={(d) => set({ endsAt: d.toISOString() })}
          error={errors.endsAt}
        />
        <Field
          label="순서"
          value={b.sortOrder != null ? String(b.sortOrder) : ''}
          onChangeText={(v) => {
            const d = v.replace(/\D/g, '');
            set({ sortOrder: d ? Number(d) : null });
          }}
          error={errors.sortOrder}
          hint="작을수록 앞에 보여요 (0~999)"
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={3}
          placeholder="0"
        />
        <View style={[styles.switchRow, { minHeight: t.touch }]}>
          <Text style={{ flex: 1 }}>노출</Text>
          <Switch
            style={{ alignSelf: 'center' }}
            value={b.isActive}
            onValueChange={(isActive) => set({ isActive })}
            trackColor={{ true: t.colors.primary }}
            accessibilityLabel="노출"
          />
        </View>
      </View>
      <Button title="저장" block loading={save.isPending} disabled={uploading} onPress={submit} />
    </Sheet>
  );
}

/** 노출 중이면 강조, 기간 밖·꺼짐은 흐린 글자 */
function statusOf(b: AdminBannerRow) {
  if (b.live) return <StatusText label="노출 중" tone="positive" />;
  return <StatusText label={b.isActive ? '기간 외' : '꺼짐'} tone="neutral" />;
}

/** 배너 한 줄: 썸네일 · 제목 · 링크와 순서 · 노출 상태 · 기간 */
function BannerRow({ b, onPress }: { b: AdminBannerRow; onPress: () => void }) {
  const t = useTheme();
  const state = b.live ? '노출 중' : b.isActive ? '기간 외' : '꺼짐';
  return (
    <AdminRow
      leading={
        <Image
          source={mediaUrl(b.imageKey, 400)}
          style={[styles.thumb, { backgroundColor: t.colors.surface2 }]}
          contentFit="cover"
          accessible={false}
        />
      }
      title={b.title}
      detail={`${b.link} · 순서 ${b.sortOrder}`}
      status={statusOf(b)}
      meta={`${dt(b.startsAt)} ~ ${dt(b.endsAt)}`}
      dimmed={!b.isActive}
      accessibilityLabel={`${b.title}, ${state}, ${b.link}, ${dt(b.startsAt)}부터 ${dt(b.endsAt)}까지`}
      accessibilityHint="수정하거나 삭제해요"
      onPress={onPress}
    />
  );
}

/** 배너: 홈 상단 배너 목록 (페이지 없음). 행을 누르면 수정·삭제 */
export default function AdminBannersScreen() {
  const t = useTheme();
  const q = useQuery({ queryKey: ['admin', 'banners'], queryFn: api.admin.banners });
  const pull = usePullRefresh(q.refetch);
  // undefined: 닫힘, null: 새 배너, 행: 수정
  const [edit, setEdit] = useState<AdminBannerRow | null | undefined>(undefined);
  const del = useAdminAction((id: string) => api.admin.deleteBanner(id), '삭제했어요', ['banners']);
  const items = pull.refreshing ? [] : (q.data ?? []);

  const menu = (b: AdminBannerRow) =>
    actionSheet(b.title, [
      { label: '수정', onPress: () => setEdit(b) },
      {
        label: '삭제',
        destructive: true,
        onPress: () =>
          Alert.alert('배너를 삭제할까요?', undefined, [
            { text: '취소', style: 'cancel' },
            { text: '삭제', style: 'destructive', onPress: () => del.mutate([b.id]) },
          ]),
      },
    ]);

  return (
    <>
      <Stack.Screen
        options={{
          unstable_headerRightItems: () => [
            {
              type: 'button',
              label: '추가',
              icon: { type: 'sfSymbol', name: 'plus' },
              onPress: () => setEdit(null),
            },
          ],
        }}
      />
      <List
        style={{ backgroundColor: t.colors.background }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.list}
        data={items}
        keyExtractor={(b) => b.id}
        ListHeaderComponent={
          <Text variant="caption" color="muted" style={styles.intro}>
            홈 화면 상단에 최대 8개까지 보여요.
          </Text>
        }
        ListEmptyComponent={
          q.isPending || pull.refreshing ? (
            <Loading variant="home" />
          ) : (
            <Empty
              kind={q.error ? 'error' : 'generic'}
              title={q.error ? '불러오지 못했어요' : '등록된 배너가 없어요.'}
            />
          )
        }
        ItemSeparatorComponent={() => <RowSeparator inset={THUMB_INSET} />}
        renderItem={({ item: b }) => <BannerRow b={b} onPress={() => menu(b)} />}
        refreshControl={<AppRefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
      />
      {edit !== undefined && (
        <BannerForm key={edit?.id ?? 'new'} initial={edit} onClose={() => setEdit(undefined)} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  list: { flexGrow: 1, paddingBottom: 32 },
  intro: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 },
  thumb: { ...THUMB, borderRadius: 6 },
  section: { gap: 14, marginTop: 6 },
  field: { gap: 6 },
  preview: {
    width: '100%',
    aspectRatio: 3,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { alignItems: 'center', justifyContent: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
