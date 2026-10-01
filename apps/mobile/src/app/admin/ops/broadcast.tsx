import { broadcastSchema, type BroadcastInput } from '@shop/shared';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useAdminAction } from '@/components/admin/admin-list';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { FormScroll } from '@/components/ui/form-scroll';
import { Icon } from '@/components/ui/icon';
import { RadioList } from '@/components/ui/radio';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

/** zod 기본 문구(영문) 대신 보여줄 안내 */
const FIELD_MSG: Record<string, string> = {
  title: '제목을 1~60자로 입력해주세요.',
  body: '내용을 1~200자로 입력해주세요.',
  link: '/로 시작하는 사이트 안 경로를 입력해주세요.',
};

const hasRecipients = (v: unknown): v is { recipients: number } =>
  typeof v === 'object' && v !== null && 'recipients' in v && typeof v.recipients === 'number';

/** 전체 알림: 받는 사람 · 알림 내용 · 미리보기 순서로 정해 알림함과 푸시로 보낸다 (취소 불가) */
export default function AdminBroadcastScreen() {
  const t = useTheme();
  const [b, setB] = useState<BroadcastInput>({ title: '', body: '', link: null, audience: 'all' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (p: Partial<BroadcastInput>) => setB((v) => ({ ...v, ...p }));
  const send = useAdminAction((v: BroadcastInput) => api.admin.broadcast(v), null, ['audit']);

  const submit = () => {
    const r = broadcastSchema.safeParse(b);
    if (!r.success) {
      const next: Record<string, string> = {};
      for (const i of r.error.issues) {
        const k = String(i.path[0]);
        next[k] ??= FIELD_MSG[k] ?? i.message;
      }
      return setErrors(next);
    }
    setErrors({});
    Alert.alert('정말 보낼까요?', '보낸 알림은 취소할 수 없어요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '보내기',
        style: 'destructive',
        onPress: () =>
          send.mutate([r.data], {
            onSuccess: (res) => {
              Alert.alert(
                hasRecipients(res)
                  ? `${res.recipients.toLocaleString('ko-KR')}명에게 보내요.`
                  : '알림을 보내기 시작했어요.',
              );
              set({ title: '', body: '' });
            },
          }),
      },
    ]);
  };

  return (
    <FormScroll
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={styles.body}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="interactive"
    >
      <Text variant="small" color="muted">
        점검·정책 변경 같은 운영 안내에만 쓰세요. 알림함에 쌓이고 푸시로도 전달돼요 (계정·운영 알림은 끌 수
        없어요).
      </Text>

      <View style={styles.section}>
        <Text variant="label" color="muted" accessibilityRole="header">
          받는 사람
        </Text>
        <RadioList
          label="받는 사람"
          value={b.audience}
          onChange={(audience) => set({ audience })}
          options={[
            { value: 'all', label: '전체 회원' },
            { value: 'sellers', label: '판매자' },
            { value: 'buyers', label: '판매자가 아닌 회원' },
          ]}
        />
      </View>

      <View style={styles.section}>
        <Text variant="label" color="muted" accessibilityRole="header">
          알림 내용
        </Text>
        <Field
          label="제목"
          counter
          maxLength={60}
          value={b.title}
          onChangeText={(title) => set({ title })}
          error={errors.title}
        />
        <Field
          label="내용"
          counter
          multiline
          maxLength={200}
          value={b.body}
          onChangeText={(body) => set({ body })}
          error={errors.body}
          style={styles.multiline}
        />
        <Field
          label="누르면 이동할 경로 (선택)"
          value={b.link ?? ''}
          onChangeText={(v) => set({ link: v.trim() ? v : null })}
          error={errors.link}
          hint="예) /notices"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
      </View>

      <View style={styles.section}>
        <Text variant="label" color="muted" accessibilityRole="header">
          미리보기
        </Text>
        <View
          accessible
          accessibilityLabel={`알림 미리보기: ${b.title || '제목'}, ${b.body || '내용'}`}
          style={[styles.preview, { backgroundColor: t.colors.surface2, borderRadius: t.radius.lg }]}
        >
          <View style={[styles.appIcon, { backgroundColor: t.colors.primary, borderRadius: t.radius.md }]}>
            <Icon ios="bell.fill" android="notifications" color="primaryForeground" size={18} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={styles.previewHead}>
              <Text variant="caption" color="muted" style={{ flex: 1 }}>
                화소
              </Text>
              <Text variant="caption" color="faint">
                지금
              </Text>
            </View>
            <Text variant="bodyStrong" color={b.title ? 'foreground' : 'faint'} numberOfLines={1}>
              {b.title || '제목'}
            </Text>
            <Text variant="small" color={b.body ? 'foreground' : 'faint'} numberOfLines={4}>
              {b.body || '내용'}
            </Text>
          </View>
        </View>
      </View>

      <Button title="보내기" block size="lg" loading={send.isPending} onPress={submit} />
    </FormScroll>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 48, gap: 28 },
  section: { gap: 16 },
  multiline: { minHeight: 96, textAlignVertical: 'top', paddingTop: 12, paddingBottom: 12 },
  preview: { flexDirection: 'row', gap: 12, padding: 14 },
  appIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  previewHead: { flexDirection: 'row', alignItems: 'center' },
});
