'use client';

import { noticeSchema, type NoticeDto, type NoticeInput } from '@shop/shared';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { AdminList, dt, useAdminAction, useAdminList } from '@/components/admin/admin-list';
import { AdminPage } from '@/components/admin/admin-shell';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/choice';
import { Badge } from '@/components/ui/display';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/field';
import { api } from '@/lib/api';

const local = (iso: string) =>
  new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

function Editor({ initial, onClose }: { initial: NoticeDto | null; onClose: () => void }) {
  const [n, setN] = useState<NoticeInput>(
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
  const save = useAdminAction(
    (v: NoticeInput) => (initial ? api.admin.updateNotice(initial.id, v) : api.admin.createNotice(v)),
    '공지를 저장했어요',
    ['notices'],
  );
  const submit = () => {
    const r = noticeSchema.safeParse(n);
    if (!r.success)
      return setErrors(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
    save.mutate(r.data, { onSuccess: onClose });
  };
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={initial ? '공지 수정' : '새 공지'}
      className="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button loading={save.isPending} onClick={submit}>
            저장
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="제목" required error={errors.title}>
          {(p) => (
            <Input
              {...p}
              maxLength={120}
              value={n.title}
              onChange={(e) => setN({ ...n, title: e.target.value })}
            />
          )}
        </Field>
        <Field label="내용" required error={errors.body} hint="줄바꿈은 그대로 보여요.">
          {(p) => (
            <Textarea
              {...p}
              rows={12}
              value={n.body}
              onChange={(e) => setN({ ...n, body: e.target.value })}
            />
          )}
        </Field>
        <div className="flex flex-wrap items-end gap-4">
          <Field label="게시 시각" hint="미래로 정하면 그때 공개돼요.">
            {(p) => (
              <Input
                {...p}
                type="datetime-local"
                value={local(n.publishedAt ?? new Date().toISOString())}
                onChange={(e) => setN({ ...n, publishedAt: new Date(e.target.value).toISOString() })}
              />
            )}
          </Field>
          <Switch
            checked={n.isPinned}
            onCheckedChange={(v) => setN({ ...n, isPinned: v })}
            label="상단 고정"
          />
        </div>
      </div>
    </Dialog>
  );
}

function Notices() {
  const list = useAdminList<NoticeDto>('notices', api.admin.notices);
  const [edit, setEdit] = useState<NoticeDto | null | undefined>(undefined);
  const del = useAdminAction((id: string) => api.admin.deleteNotice(id), '삭제했어요', ['notices']);
  const now = Date.now();
  return (
    <>
      <AdminList
        list={list}
        rowKey={(n) => n.id}
        searchPlaceholder="제목"
        toolbar={
          <Button onClick={() => setEdit(null)}>
            <Plus className="size-4" aria-hidden />새 공지
          </Button>
        }
        columns={[
          {
            key: 'title',
            header: '제목',
            cell: (n) => (
              <button type="button" onClick={() => setEdit(n)} className="text-left hover:underline">
                {n.isPinned && (
                  <Badge tone="primary" className="mr-1.5">
                    고정
                  </Badge>
                )}
                {n.title}
              </button>
            ),
          },
          {
            key: 'state',
            header: '상태',
            cell: (n) => (Date.parse(n.publishedAt) > now ? <Badge tone="outline">예약</Badge> : '게시'),
          },
          { key: 'published', header: '게시', cell: (n) => dt(n.publishedAt) },
          { key: 'updated', header: '수정', cell: (n) => dt(n.updatedAt) },
          {
            key: 'act',
            header: '',
            cell: (n) => (
              <span className="flex">
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/notices/${n.id}`} target="_blank">
                    보기
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => confirm('공지를 삭제할까요?') && del.mutate(n.id)}
                >
                  삭제
                </Button>
              </span>
            ),
          },
        ]}
      />
      {edit !== undefined && (
        <Editor key={edit?.id ?? 'new'} initial={edit} onClose={() => setEdit(undefined)} />
      )}
    </>
  );
}

export default function AdminNoticesPage() {
  return (
    <AdminPage title="공지사항" description="고정 공지가 먼저, 나머지는 게시일 순으로 보여요.">
      <Suspense>
        <Notices />
      </Suspense>
    </AdminPage>
  );
}
