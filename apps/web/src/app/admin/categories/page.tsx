'use client';

import { CATEGORY_GROUPS, categorySchema, type AdminCategoryRow, type CategoryInput } from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useAdminAction } from '@/components/admin/admin-list';
import { AdminPage } from '@/components/admin/admin-shell';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/choice';
import { Badge, Skeleton } from '@/components/ui/display';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

const GROUP = { ART: '미술', HISTORICAL: '고미술·역사', COLLECTIBLES: '컬렉터블' } as const;

function Form({
  initial,
  parents,
  onClose,
}: {
  initial: AdminCategoryRow | null;
  parents: AdminCategoryRow[];
  onClose: () => void;
}) {
  const [c, setC] = useState<CategoryInput>(
    initial
      ? {
          slug: initial.slug,
          name: initial.name,
          group: initial.group,
          parentId: initial.parentId,
          sortOrder: initial.sortOrder,
          isActive: initial.isActive,
        }
      : { slug: '', name: '', group: 'ART', parentId: null, sortOrder: 0, isActive: true },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (p: Partial<CategoryInput>) => setC((v) => ({ ...v, ...p }));
  const save = useAdminAction(
    (v: CategoryInput) => (initial ? api.admin.updateCategory(initial.id, v) : api.admin.createCategory(v)),
    '저장했어요',
    ['categories'],
  );
  const submit = () => {
    const r = categorySchema.safeParse(c);
    if (!r.success)
      return setErrors(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
    save.mutate(r.data, { onSuccess: onClose });
  };
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={initial ? '카테고리 수정' : '새 카테고리'}
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
        <Field label="이름" required error={errors.name}>
          {(p) => <Input {...p} value={c.name} onChange={(e) => set({ name: e.target.value })} />}
        </Field>
        <Field label="주소 (slug)" required error={errors.slug} hint={`/category/${c.slug || 'slug'}`}>
          {(p) => (
            <Input {...p} value={c.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase() })} />
          )}
        </Field>
        <Field label="분류">
          {(p) => (
            <Select
              {...p}
              value={c.group}
              onValueChange={(v) => set({ group: v })}
              options={CATEGORY_GROUPS.map((g) => ({ value: g, label: GROUP[g] }))}
            />
          )}
        </Field>
        <Field label="상위 카테고리" error={errors.parentId}>
          {(p) => (
            <Select
              {...p}
              value={c.parentId ?? 'none'}
              onValueChange={(v) => set({ parentId: v === 'none' ? null : v })}
              options={[
                { value: 'none', label: '없음 (1단계)' },
                ...parents.filter((x) => x.id !== initial?.id).map((x) => ({ value: x.id, label: x.name })),
              ]}
            />
          )}
        </Field>
        <Field label="순서">
          {(p) => (
            <Input
              {...p}
              type="number"
              value={c.sortOrder}
              onChange={(e) => set({ sortOrder: Number(e.target.value) })}
            />
          )}
        </Field>
        <Switch checked={c.isActive} onCheckedChange={(v) => set({ isActive: v })} label="사이트에 표시" />
      </div>
    </Dialog>
  );
}

export default function AdminCategoriesPage() {
  const { data } = useQuery({ queryKey: ['admin', 'categories'], queryFn: api.admin.categories });
  const [edit, setEdit] = useState<AdminCategoryRow | null | undefined>(undefined);
  const del = useAdminAction((id: string) => api.admin.deleteCategory(id), '삭제했어요', ['categories']);
  const parents = data?.filter((c) => !c.parentId) ?? [];
  const Row = ({ c, child }: { c: AdminCategoryRow; child?: boolean }) => (
    <li className="flex items-center gap-3 border-t border-border-soft py-2.5 pr-2 pl-4 first:border-0">
      {/* 좁은 화면: 이름·슬러그는 왼쪽에서 줄바꿈, 작품 수·버튼은 오른쪽에 고정 */}
      <div className={cn('min-w-0 flex-1', child && 'pl-4 md:pl-6')}>
        <span className={cn('mr-2', child ? 'text-muted' : 'font-semibold')}>
          {child ? '└ ' : ''}
          {c.name}
        </span>
        {!c.isActive && <Badge tone="outline">숨김</Badge>}
        <span className="block text-caption break-all text-faint md:inline">/{c.slug}</span>
      </div>
      <span className="shrink-0 text-caption whitespace-nowrap text-muted">작품 {c.productCount}</span>
      <Button size="sm" variant="ghost" onClick={() => setEdit(c)}>
        수정
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => confirm(`${c.name} 카테고리를 삭제할까요?`) && del.mutate(c.id)}
      >
        삭제
      </Button>
    </li>
  );
  return (
    <AdminPage
      title="카테고리"
      description="작품이 있는 카테고리는 삭제 대신 숨김으로 관리하세요."
      actions={
        <Button onClick={() => setEdit(null)}>
          <Plus className="size-4" aria-hidden />새 카테고리
        </Button>
      }
    >
      {!data ? (
        <Skeleton className="h-64" />
      ) : (
        <ul className="rounded-sm border border-border bg-background text-small">
          {parents.map((p) => (
            <li key={p.id}>
              <ul>
                <Row c={p} />
                {data
                  .filter((c) => c.parentId === p.id)
                  .map((c) => (
                    <Row key={c.id} c={c} child />
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {edit !== undefined && (
        <Form key={edit?.id ?? 'new'} initial={edit} parents={parents} onClose={() => setEdit(undefined)} />
      )}
    </AdminPage>
  );
}
