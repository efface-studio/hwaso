'use client';

import { broadcastSchema, type BroadcastInput } from '@shop/shared';
import { useState } from 'react';
import { useAdminAction } from '@/components/admin/admin-list';
import { AdminPage } from '@/components/admin/admin-shell';
import { Button } from '@/components/ui/button';
import { RadioGroup } from '@/components/ui/choice';
import { Field, Input, Textarea } from '@/components/ui/field';
import { api } from '@/lib/api';

export default function AdminBroadcastPage() {
  const [b, setB] = useState<BroadcastInput>({ title: '', body: '', link: null, audience: 'all' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const send = useAdminAction((v: BroadcastInput) => api.admin.broadcast(v), '알림을 보내기 시작했어요', [
    'audit',
  ]);
  const submit = () => {
    const r = broadcastSchema.safeParse(b);
    if (!r.success)
      return setErrors(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
    if (!confirm('정말 보낼까요? 보낸 알림은 취소할 수 없어요.')) return;
    send.mutate(r.data, {
      onSuccess: (res) => {
        alert(`${(res as { recipients: number }).recipients.toLocaleString('ko-KR')}명에게 보내요.`);
        setB({ ...b, title: '', body: '' });
      },
    });
  };
  return (
    <AdminPage
      title="전체 알림"
      description="점검·정책 변경 같은 운영 안내에만 쓰세요. 알림함에 쌓이고 푸시로도 전달돼요 (계정·운영 알림은 끌 수 없어요)."
    >
      <div className="flex max-w-xl flex-col gap-4 rounded-sm border border-border bg-background p-5">
        <RadioGroup
          aria-label="받는 사람"
          value={b.audience}
          onValueChange={(audience) => setB({ ...b, audience })}
          options={[
            { value: 'all', label: '전체 회원' },
            { value: 'sellers', label: '판매자' },
            { value: 'buyers', label: '판매자가 아닌 회원' },
          ]}
        />
        <Field label="제목" required error={errors.title}>
          {(p) => (
            <Input
              {...p}
              maxLength={60}
              value={b.title}
              onChange={(e) => setB({ ...b, title: e.target.value })}
            />
          )}
        </Field>
        <Field label="내용" required error={errors.body}>
          {(p) => (
            <Textarea
              {...p}
              rows={3}
              maxLength={200}
              value={b.body}
              onChange={(e) => setB({ ...b, body: e.target.value })}
            />
          )}
        </Field>
        <Field label="누르면 이동할 경로 (선택)" error={errors.link} hint="예) /notices">
          {(p) => (
            <Input
              {...p}
              value={b.link ?? ''}
              onChange={(e) => setB({ ...b, link: e.target.value || null })}
            />
          )}
        </Field>
        <Button loading={send.isPending} onClick={submit}>
          보내기
        </Button>
      </div>
    </AdminPage>
  );
}
