import {
  CATEGORY_GROUPS,
  categorySchema,
  type AdminCategoryRow,
  type CategoryGroup,
  type CategoryInput,
} from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useAdminAction } from '@/components/admin/admin-list';
import { AdminRow, RowSection } from '@/components/admin/row';
import { StatusText } from '@/components/admin/status';
import { AppRefreshControl } from '@/components/ui/app-refresh-control';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { SelectField } from '@/components/ui/inputs';
import { RadioList } from '@/components/ui/radio';
import { Sheet } from '@/components/ui/sheet';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { actionSheet } from '@/lib/action-sheet';
import { CATEGORY_GROUP_LABEL } from '@/lib/admin';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

/** 스키마 기본 메시지가 영어인 항목은 한국어로 바꿔 보여준다 */
const FIELD_MESSAGE: Record<string, string | undefined> = {
  name: '이름을 1~40자로 입력해주세요.',
  sortOrder: '0~9999 사이 숫자로 입력해주세요.',
  parentId: '상위 카테고리를 다시 골라주세요.',
};

const NONE = 'none';

function Form({
  initial,
  parents,
  onClose,
}: {
  initial: AdminCategoryRow | null;
  parents: AdminCategoryRow[];
  onClose: () => void;
}) {
  const t = useTheme();
  const [name, setName] = useState(initial?.name ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [group, setGroup] = useState<CategoryGroup>(initial?.group ?? 'ART');
  const [parentId, setParentId] = useState<string>(initial?.parentId ?? NONE);
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAdminAction(
    (v: CategoryInput) => (initial ? api.admin.updateCategory(initial.id, v) : api.admin.createCategory(v)),
    '저장했어요',
    ['categories'],
  );

  const submit = () => {
    const r = categorySchema.safeParse({
      name,
      slug,
      group,
      parentId: parentId === NONE ? null : parentId,
      sortOrder: sortOrder === '' ? 0 : Number(sortOrder),
      isActive,
    });
    if (!r.success) {
      const next: Record<string, string> = {};
      for (const issue of r.error.issues) {
        const key = String(issue.path[0]);
        if (next[key]) continue;
        next[key] = FIELD_MESSAGE[key] ?? issue.message;
      }
      return setErrors(next);
    }
    setErrors({});
    save.mutate([r.data], { onSuccess: onClose });
  };

  const parentOptions = [
    { value: NONE, label: '없음 (1단계)' },
    ...parents.filter((p) => p.id !== initial?.id).map((p) => ({ value: p.id, label: p.name })),
  ];

  return (
    <Sheet title={initial ? '카테고리 수정' : '새 카테고리'} onClose={onClose}>
      <Field
        label="이름"
        maxLength={40}
        value={name}
        onChangeText={setName}
        error={errors.name}
        returnKeyType="next"
      />
      <Field
        label="주소"
        maxLength={40}
        value={slug}
        onChangeText={(v) => setSlug(v.toLowerCase())}
        error={errors.slug}
        hint={`영문 소문자·숫자·하이픈 2~40자 · /category/${slug || 'slug'}`}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="ascii-capable"
      />
      <View style={styles.section}>
        <Text variant="label" color="muted" accessibilityRole="header">
          분류
        </Text>
        <RadioList
          label="분류"
          value={group}
          onChange={setGroup}
          options={CATEGORY_GROUPS.map((g) => ({ value: g, label: CATEGORY_GROUP_LABEL[g] }))}
        />
      </View>
      <SelectField
        label="상위 카테고리"
        value={parentId}
        onChange={setParentId}
        options={parentOptions}
        error={errors.parentId}
      />
      <Field
        label="순서"
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={4}
        value={sortOrder}
        onChangeText={(v) => setSortOrder(v.replace(/[^\d]/g, ''))}
        error={errors.sortOrder}
        hint="작을수록 앞에 보여요."
      />
      <View style={[styles.switchRow, { minHeight: t.touch }]}>
        <Text style={{ flex: 1 }}>사이트에 표시</Text>
        <Switch
          style={{ alignSelf: 'center' }}
          value={isActive}
          onValueChange={setIsActive}
          trackColor={{ true: t.colors.primary }}
          accessibilityLabel="사이트에 표시"
        />
      </View>
      <Button title="저장" block loading={save.isPending} onPress={submit} />
    </Sheet>
  );
}

/** 카테고리 한 줄: 이름 · 주소와 작품 수 · 숨김이면 상태 표시. 하위는 들여 쓴다 */
function CategoryRow({ c, child, onPress }: { c: AdminCategoryRow; child?: boolean; onPress: () => void }) {
  return (
    <AdminRow
      leading={child ? <View style={styles.indent} /> : undefined}
      title={
        <Text variant={child ? 'body' : 'bodyStrong'} numberOfLines={1}>
          {c.name}
        </Text>
      }
      detail={`/${c.slug} · 작품 ${c.productCount}`}
      status={c.isActive ? undefined : <StatusText label="숨김" tone="neutral" />}
      accessibilityLabel={`${child ? '하위 ' : ''}${c.name}${c.isActive ? '' : ', 숨김'}, 작품 ${c.productCount}개`}
      accessibilityHint="수정 또는 삭제"
      onPress={onPress}
    />
  );
}

/** 카테고리: 2단계 트리. 작품이 있는 카테고리는 삭제 대신 숨김으로 관리 */
export default function CategoriesScreen() {
  const t = useTheme();
  const q = useQuery({ queryKey: ['admin', 'categories'], queryFn: api.admin.categories });
  const pull = usePullRefresh(q.refetch);
  /** undefined: 닫힘 · null: 새 카테고리 · 행: 수정 */
  const [edit, setEdit] = useState<AdminCategoryRow | null | undefined>(undefined);
  const del = useAdminAction((id: string) => api.admin.deleteCategory(id), '삭제했어요', ['categories']);
  const data = q.data;
  const parents = data?.filter((c) => !c.parentId) ?? [];

  const menu = (c: AdminCategoryRow) =>
    actionSheet(c.name, [
      { label: '수정', onPress: () => setEdit(c) },
      {
        label: '삭제',
        destructive: true,
        onPress: () =>
          Alert.alert(
            `${c.name} 카테고리를 삭제할까요?`,
            c.productCount > 0 ? '작품이 있는 카테고리는 숨김으로 관리하는 것을 권장해요.' : undefined,
            [
              { text: '취소', style: 'cancel' },
              { text: '삭제', style: 'destructive', onPress: () => del.mutate([c.id]) },
            ],
          ),
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
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: t.colors.background }}
        contentContainerStyle={styles.body}
        refreshControl={<AppRefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
      >
        <Text variant="small" color="muted" style={styles.intro}>
          작품이 있는 카테고리는 삭제 대신 숨김으로 관리해 주세요.
        </Text>
        {pull.refreshing || q.isPending ? (
          <Loading variant="plain-list" />
        ) : !data ? (
          <Empty
            kind="error"
            title="불러오지 못했어요"
            action={{ title: '다시 시도', onPress: () => void q.refetch() }}
          />
        ) : parents.length === 0 ? (
          <Empty title="카테고리가 없어요." action={{ title: '새 카테고리', onPress: () => setEdit(null) }} />
        ) : (
          parents.map((p) => (
            <RowSection key={p.id}>
              <CategoryRow c={p} onPress={() => menu(p)} />
              {data
                .filter((c) => c.parentId === p.id)
                .map((c) => (
                  <CategoryRow key={c.id} c={c} child onPress={() => menu(c)} />
                ))}
            </RowSection>
          ))
        )}
      </ScrollView>
      {edit !== undefined && (
        <Form key={edit?.id ?? 'new'} initial={edit} parents={parents} onClose={() => setEdit(undefined)} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: 48 },
  intro: { paddingHorizontal: 16, paddingTop: 8 },
  indent: { width: 8 },
  section: { gap: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
