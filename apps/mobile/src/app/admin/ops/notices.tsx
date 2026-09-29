import { noticeSchema, type NoticeDto, type NoticeInput } from '@shop/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Switch, View } from 'react-native';
import { AdminList, useAdminAction } from '@/components/admin/admin-list';
import { AdminRow } from '@/components/admin/row';
import { StatusText } from '@/components/admin/status';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { DateTimeField } from '@/components/ui/inputs';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { actionSheet } from '@/lib/action-sheet';
import { dt } from '@/lib/admin';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

/** zod 기본 문구(영문) 대신 보여줄 안내 */
const FIELD_MSG: Record<string, string> = {
  title: '제목을 1~120자로 입력해주세요.',
  body: '내용을 입력해주세요 (20,000자까지).',
  publishedAt: '게시 시각을 확인해주세요.',
};

/** 입력 묶음 제목 */
function SectionTitle({ children }: { children: string }) {
  return (
    <Text variant="label" color="muted" accessibilityRole="header">
      {children}
    </Text>
  );
}

/** 공지 편집 시트: 내용 · 게시 묶음 */
function NoticeForm({ initial, onClose }: { initial: NoticeDto | null; onClose: () => void }) {
  const t = useTheme();
  const [n, setN] = useState<NoticeInput>(() =>
    initial
      ? {
          title: initial.title,
          body: initial.body,
          isPinned: initial.isPinned,
          publishedAt: initial.publishedAt,
        }
      : { title: '', body: '', isPinned: false, publishedAt: new Date().toISOString() },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (p: Partial<NoticeInput>) => setN((v) => ({ ...v, ...p }));
  const save = useAdminAction(
    (v: NoticeInput) => (initial ? api.admin.updateNotice(initial.id, v) : api.admin.createNotice(v)),
    '공지를 저장했어요',
    ['notices'],
  );
  const submit = () => {
    const r = noticeSchema.safeParse(n);
    if (!r.success) {
      const next: Record<string, string> = {};
      for (const i of r.error.issues) {
        const k = String(i.path[0]);
        next[k] ??= FIELD_MSG[k] ?? i.message;
      }
      return setErrors(next);
    }
    setErrors({});
    save.mutate([r.data], { onSuccess: onClose });
  };

  return (
    <Sheet title={initial ? '공지 수정' : '새 공지'} onClose={onClose}>
      <View style={styles.section}>
        <SectionTitle>내용</SectionTitle>
        <Field
          label="제목"
          counter
          maxLength={120}
          value={n.title}
          onChangeText={(title) => set({ title })}
          error={errors.title}
        />
        <Field
          label="내용"
          counter
          multiline
          maxLength={20_000}
          value={n.body}
          onChangeText={(body) => set({ body })}
          error={errors.body}
          hint="줄바꿈은 그대로 보여요."
          style={styles.body}
        />
      </View>
      <View style={styles.section}>
        <SectionTitle>게시</SectionTitle>
        <DateTimeField
          label="게시 시각"
          value={n.publishedAt ? new Date(n.publishedAt) : new Date()}
          onChange={(d) => set({ publishedAt: d.toISOString() })}
          error={errors.publishedAt}
          hint="미래 시각이면 예약 게시돼요"
        />
        <View style={[styles.switchRow, { minHeight: t.touch }]}>
          <Text style={{ flex: 1 }}>상단 고정</Text>
          <Switch
            value={n.isPinned}
            onValueChange={(isPinned) => set({ isPinned })}
            trackColor={{ true: t.colors.primary }}
            accessibilityLabel="상단 고정"
          />
        </View>
      </View>
      <Button title="저장" block loading={save.isPending} onPress={submit} />
    </Sheet>
  );
}

/** 공지 한 줄: 제목 · 게시·수정 일시 · 예약이면 상태, 고정이면 제목 앞 핀 */
function NoticeRow({ n, now, onPress }: { n: NoticeDto; now: number; onPress: () => void }) {
  const scheduled = Date.parse(n.publishedAt) > now;
  return (
    <AdminRow
      title={
        <View style={styles.title}>
          {n.isPinned && <Icon ios="pin.fill" android="push_pin" color="primary" size={13} />}
          <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
            {n.title}
          </Text>
        </View>
      }
      detail={`게시 ${dt(n.publishedAt)} · 수정 ${dt(n.updatedAt)}`}
      status={scheduled ? <StatusText label="예약" tone="warning" /> : undefined}
      accessibilityLabel={`${n.isPinned ? '고정, ' : ''}${n.title}, ${scheduled ? '예약' : '게시'}`}
      accessibilityHint="수정, 보기, 삭제"
      onPress={onPress}
    />
  );
}

/** 공지사항: 목록·검색, 누르면 수정·보기·삭제 */
export default function AdminNoticesScreen() {
  // undefined: 닫힘, null: 새 공지, 행: 수정
  const [edit, setEdit] = useState<NoticeDto | null | undefined>(undefined);
  const del = useAdminAction((id: string) => api.admin.deleteNotice(id), '삭제했어요', ['notices']);
  const now = Date.now();

  const menu = (n: NoticeDto) =>
    actionSheet(n.title, [
      { label: '수정', onPress: () => setEdit(n) },
      { label: '보기', onPress: () => router.push({ pathname: '/notices/[id]', params: { id: n.id } }) },
      {
        label: '삭제',
        destructive: true,
        onPress: () =>
          Alert.alert('공지를 삭제할까요?', undefined, [
            { text: '취소', style: 'cancel' },
            { text: '삭제', style: 'destructive', onPress: () => del.mutate([n.id]) },
          ]),
      },
    ]);

  return (
    <>
      <AdminList<NoticeDto>
        queryKey="notices"
        fetcher={api.admin.notices}
        searchPlaceholder="제목"
        emptyTitle="공지가 없어요."
        headerItems={[
          {
            type: 'button',
            label: '새 공지 작성',
            icon: { type: 'sfSymbol', name: 'plus' },
            onPress: () => setEdit(null),
          },
        ]}
        renderItem={(n) => <NoticeRow n={n} now={now} onPress={() => menu(n)} />}
      />
      {edit !== undefined && (
        <NoticeForm key={edit?.id ?? 'new'} initial={edit} onClose={() => setEdit(undefined)} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  body: { minHeight: 280, textAlignVertical: 'top', paddingTop: 12, paddingBottom: 12 },
  title: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  section: { gap: 14, marginTop: 6 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
