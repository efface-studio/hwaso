'use client';

import { ApiError } from '@shop/api-client';
import { bannerSchema, type AdminBannerRow, type BannerInput } from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { dt, useAdminAction } from '@/components/admin/admin-list';
import { AdminPage } from '@/components/admin/admin-shell';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/choice';
import { Badge, Skeleton } from '@/components/ui/display';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import { mediaUrl } from '@/lib/media';
import { toast } from '@/stores/toast';

const local = (iso: string) =>
  new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

function Form({ initial, onClose }: { initial: AdminBannerRow | null; onClose: () => void }) {
  const [b, setB] = useState<BannerInput>(
    initial ?? {
      title: '',
      subtitle: '',
      tone: 'dark',
      imageKey: '',
      link: '/',
      placement: 'home',
      sortOrder: 0,
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      isActive: true,
    },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const set = (p: Partial<BannerInput>) => setB((v) => ({ ...v, ...p }));
  const save = useAdminAction(
    (v: BannerInput) => (initial ? api.admin.updateBanner(initial.id, v) : api.admin.createBanner(v)),
    '배너를 저장했어요',
    ['banners'],
  );
  const submit = () => {
    const r = bannerSchema.safeParse(b);
    if (!r.success)
      return setErrors(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
    save.mutate(r.data, { onSuccess: onClose });
  };
  const upload = async (f?: File) => {
    if (!f) return;
    setUploading(true);
    try {
      set({ imageKey: (await api.market.uploadImage(f, f.name)).key });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '이미지를 올리지 못했습니다.');
    } finally {
      setUploading(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={initial ? '배너 수정' : '새 배너'}
      className="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button loading={save.isPending} disabled={uploading} onClick={submit}>
            저장
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          {b.imageKey ? (
            <img src={mediaUrl(b.imageKey, 800)} alt="" className="aspect-[3/1] w-full object-cover" />
          ) : (
            <div className="aspect-[3/1] w-full bg-surface-2" />
          )}
          <Button variant="outline" size="sm" loading={uploading} onClick={() => file.current?.click()}>
            {b.imageKey ? '이미지 바꾸기' : '이미지 올리기'}
          </Button>
          {errors.imageKey && <p className="text-small text-destructive">이미지를 올려주세요.</p>}
          <input
            ref={file}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
        <Field label="제목" required error={errors.title}>
          {(p) => (
            <Input {...p} maxLength={60} value={b.title} onChange={(e) => set({ title: e.target.value })} />
          )}
        </Field>
        <Field label="부제" error={errors.subtitle}>
          {(p) => (
            <Input
              {...p}
              maxLength={120}
              value={b.subtitle}
              onChange={(e) => set({ subtitle: e.target.value })}
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="링크" required error={errors.link} hint="/로 시작하는 사이트 안 경로">
            {(p) => <Input {...p} value={b.link} onChange={(e) => set({ link: e.target.value })} />}
          </Field>
          <Field label="글자 색">
            {(p) => (
              <Select
                {...p}
                value={b.tone}
                onValueChange={(v) => set({ tone: v })}
                options={[
                  { value: 'dark', label: '흰 글자 (어두운 이미지)' },
                  { value: 'light', label: '검은 글자 (밝은 이미지)' },
                ]}
              />
            )}
          </Field>
          <Field label="시작" error={errors.startsAt}>
            {(p) => (
              <Input
                {...p}
                type="datetime-local"
                value={local(b.startsAt)}
                onChange={(e) => set({ startsAt: new Date(e.target.value).toISOString() })}
              />
            )}
          </Field>
          <Field label="종료" error={errors.endsAt}>
            {(p) => (
              <Input
                {...p}
                type="datetime-local"
                value={local(b.endsAt)}
                onChange={(e) => set({ endsAt: new Date(e.target.value).toISOString() })}
              />
            )}
          </Field>
          <Field label="순서">
            {(p) => (
              <Input
                {...p}
                type="number"
                value={b.sortOrder}
                onChange={(e) => set({ sortOrder: Number(e.target.value) })}
              />
            )}
          </Field>
          <div className="flex items-end">
            <Switch checked={b.isActive} onCheckedChange={(v) => set({ isActive: v })} label="노출" />
          </div>
        </div>
      </div>
    </Dialog>
  );
}

export default function AdminBannersPage() {
  const { data } = useQuery({ queryKey: ['admin', 'banners'], queryFn: api.admin.banners });
  const [edit, setEdit] = useState<AdminBannerRow | null | undefined>(undefined);
  const del = useAdminAction((id: string) => api.admin.deleteBanner(id), '삭제했어요', ['banners']);
  return (
    <AdminPage
      title="배너"
      description="홈 상단에 순서대로 노출돼요 (최대 8개)."
      actions={
        <Button onClick={() => setEdit(null)}>
          <Plus className="size-4" aria-hidden />새 배너
        </Button>
      }
    >
      {!data ? (
        <Skeleton className="h-64" />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {data.map((b) => (
            <li key={b.id} className="overflow-hidden rounded-sm border border-border bg-background">
              <img src={mediaUrl(b.imageKey, 800)} alt="" className="aspect-[3/1] w-full object-cover" />
              <div className="flex items-start gap-2 p-3 text-small">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-semibold">
                    {b.title}{' '}
                    <Badge tone={b.live ? 'primary' : 'outline'}>
                      {b.live ? '노출 중' : b.isActive ? '기간 외' : '꺼짐'}
                    </Badge>
                  </p>
                  <p className="text-caption text-muted">
                    {b.link} · {dt(b.startsAt)} ~ {dt(b.endsAt)} · 순서 {b.sortOrder}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setEdit(b)}>
                  수정
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => confirm('배너를 삭제할까요?') && del.mutate(b.id)}
                >
                  삭제
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {edit !== undefined && (
        <Form key={edit?.id ?? 'new'} initial={edit} onClose={() => setEdit(undefined)} />
      )}
    </AdminPage>
  );
}
