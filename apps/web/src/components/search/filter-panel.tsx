'use client';

import {
  CONDITION_LABEL,
  ITEM_CONDITIONS,
  SALE_TYPE_LABEL,
  SALE_TYPES,
  type CategoryNode,
  type FacetsDto,
  type ItemCondition,
  type SaleType,
} from '@shop/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Switch } from '@/components/ui/choice';
import { PriceInput } from '@/components/ui/field';
import { cn } from '@/lib/cn';

export interface FilterValue {
  category?: string;
  saleType: SaleType[];
  minPrice?: number;
  maxPrice?: number;
  condition: ItemCondition[];
  era: string[];
  material: string[];
  region: string[];
  verifiedOnly: boolean;
}

interface FilterPanelProps {
  value: FilterValue;
  onChange: (patch: Partial<FilterValue>) => void;
  categories: CategoryNode[];
  facets?: FacetsDto;
  /** 카테고리 페이지에서는 카테고리 선택을 링크로 보여준다 */
  categoryAsLinks?: boolean;
}

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3 border-b border-border py-5 first:pt-0">
      <legend className="mb-3 text-label font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 items-center rounded-sm border px-3 text-label transition-colors',
        selected
          ? 'border-foreground bg-foreground text-background'
          : 'border-border hover:border-foreground',
      )}
    >
      {children}
    </button>
  );
}

const PRICE_PRESETS: { label: string; min?: number; max?: number }[] = [
  { label: '50만원 이하', max: 500_000 },
  { label: '50만–300만원', min: 500_000, max: 3_000_000 },
  { label: '300만–1,000만원', min: 3_000_000, max: 10_000_000 },
  { label: '1,000만원 이상', min: 10_000_000 },
];

export function FilterPanel({ value, onChange, categories, facets, categoryAsLinks }: FilterPanelProps) {
  const [min, setMin] = useState<number | null>(value.minPrice ?? null);
  const [max, setMax] = useState<number | null>(value.maxPrice ?? null);
  useEffect(() => {
    setMin(value.minPrice ?? null);
    setMax(value.maxPrice ?? null);
  }, [value.minPrice, value.maxPrice]);

  return (
    <div className="flex flex-col">
      <Group title="카테고리">
        <ul className="flex flex-col gap-1">
          {categories.map((g) => (
            <li key={g.slug}>
              <CategoryItem
                node={g}
                value={value.category}
                onChange={onChange}
                asLink={categoryAsLinks}
                depth={0}
              />
              <ul className="mt-1 ml-3 flex flex-col gap-0.5">
                {g.children.map((c) => (
                  <li key={c.slug}>
                    <CategoryItem
                      node={c}
                      value={value.category}
                      onChange={onChange}
                      asLink={categoryAsLinks}
                      depth={1}
                    />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Group>

      <Group title="판매 방식">
        <div className="flex flex-wrap gap-2">
          {SALE_TYPES.map((t) => (
            <Chip
              key={t}
              selected={value.saleType.includes(t)}
              onClick={() => onChange({ saleType: toggle(value.saleType, t) })}
            >
              {SALE_TYPE_LABEL[t]}
            </Chip>
          ))}
        </div>
      </Group>

      <Group title="가격">
        <div className="flex flex-wrap gap-2">
          {PRICE_PRESETS.map((p) => (
            <Chip
              key={p.label}
              selected={value.minPrice === p.min && value.maxPrice === p.max}
              onClick={() => onChange({ minPrice: p.min, maxPrice: p.max })}
            >
              {p.label}
            </Chip>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <PriceInput
            aria-label="최소 가격"
            placeholder="최소"
            value={min}
            onValueChange={setMin}
            className="h-10"
          />
          <span className="text-muted">~</span>
          <PriceInput
            aria-label="최대 가격"
            placeholder="최대"
            value={max}
            onValueChange={setMax}
            className="h-10"
          />
        </div>
        <button
          type="button"
          onClick={() => onChange({ minPrice: min ?? undefined, maxPrice: max ?? undefined })}
          className="h-10 rounded-sm border border-border-strong text-label hover:bg-surface-2"
        >
          가격 적용
        </button>
      </Group>

      <Group title="상태">
        <div className="flex flex-wrap gap-2">
          {ITEM_CONDITIONS.map((c) => (
            <Chip
              key={c}
              selected={value.condition.includes(c)}
              onClick={() => onChange({ condition: toggle(value.condition, c) })}
            >
              {CONDITION_LABEL[c].replace(/ \(.*\)$/, '')}
            </Chip>
          ))}
        </div>
      </Group>

      {!!facets?.eras.length && (
        <Group title="시대">
          <div className="flex flex-wrap gap-2">
            {facets.eras.slice(0, 12).map((f) => (
              <Chip
                key={f.value}
                selected={value.era.includes(f.value)}
                onClick={() => onChange({ era: toggle(value.era, f.value) })}
              >
                {f.value}
              </Chip>
            ))}
          </div>
        </Group>
      )}

      {!!facets?.materials.length && (
        <Group title="소재">
          <div className="flex flex-wrap gap-2">
            {facets.materials.slice(0, 12).map((f) => (
              <Chip
                key={f.value}
                selected={value.material.includes(f.value)}
                onClick={() => onChange({ material: toggle(value.material, f.value) })}
              >
                {f.value}
              </Chip>
            ))}
          </div>
        </Group>
      )}

      {!!facets?.regions.length && (
        <Group title="지역">
          <div className="flex flex-wrap gap-2">
            {facets.regions.slice(0, 10).map((f) => (
              <Chip
                key={f.value}
                selected={value.region.includes(f.value)}
                onClick={() => onChange({ region: toggle(value.region, f.value) })}
              >
                {f.value}
              </Chip>
            ))}
          </div>
        </Group>
      )}

      <div className="py-5">
        <Switch
          checked={value.verifiedOnly}
          onCheckedChange={(v) => onChange({ verifiedOnly: v })}
          label="플랫폼 검수 완료만 보기"
          description="운영팀이 감정서와 실물을 대조한 작품"
        />
      </div>
    </div>
  );
}

function CategoryItem({
  node,
  value,
  onChange,
  asLink,
  depth,
}: {
  node: CategoryNode;
  value?: string;
  onChange: (patch: Partial<FilterValue>) => void;
  asLink?: boolean;
  depth: number;
}) {
  const selected = value === node.slug;
  const cls = cn(
    'flex min-h-9 w-full items-center text-left',
    depth === 0 ? 'text-label font-semibold' : 'text-small',
    selected
      ? 'text-foreground underline underline-offset-4'
      : depth === 0
        ? 'text-foreground'
        : 'text-muted hover:text-foreground',
  );
  if (asLink) {
    return (
      <Link href={`/category/${node.slug}`} aria-current={selected ? 'page' : undefined} className={cls}>
        {node.name}
      </Link>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cls}
      onClick={() => onChange({ category: selected ? undefined : node.slug })}
    >
      {node.name}
    </button>
  );
}
