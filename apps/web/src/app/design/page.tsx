'use client';

import { palette, typography } from '@shop/tokens';
import { Bell, Heart, Share2 } from 'lucide-react';
import { useState } from 'react';
import { ThemeSelect } from '@/components/layout/theme-select';
import { Avatar } from '@/components/ui/avatar';
import { Button, IconButton } from '@/components/ui/button';
import { Checkbox, RadioGroup, Switch } from '@/components/ui/choice';
import { Dialog, Sheet } from '@/components/ui/dialog';
import { Alert, Badge, EmptyState, Progress, Skeleton } from '@/components/ui/display';
import { Field, Input, PriceInput, Textarea } from '@/components/ui/field';
import { DropdownMenu, Tooltip } from '@/components/ui/menu';
import { Accordion, Breadcrumb, Pagination } from '@/components/ui/navigation';
import { Select } from '@/components/ui/select';
import { Table } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/stores/toast';

// Tailwind 는 정적 클래스명만 감지한다
const TYPE_CLASS: Record<keyof typeof typography, string> = {
  display: 'text-display',
  h1: 'text-h1',
  h2: 'text-h2',
  h3: 'text-h3',
  body: 'text-body',
  bodyStrong: 'text-body-strong',
  small: 'text-small',
  caption: 'text-caption',
  label: 'text-label',
  price: 'text-price',
  priceLg: 'text-price-lg',
};

/** 내부용 디자인 시스템 카탈로그 (검색엔진 비노출). 토큰·컴포넌트를 라이트/다크에서 확인한다. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-border py-8">
      <h2 className="text-h2">{title}</h2>
      {children}
    </section>
  );
}

export default function DesignPage() {
  const [price, setPrice] = useState<number | null>(1_050_000);
  const [checked, setChecked] = useState(true);
  const [on, setOn] = useState(false);
  const [sale, setSale] = useState<'FIXED' | 'AUCTION'>('AUCTION');
  const [sort, setSort] = useState<string>('latest');
  const [dialog, setDialog] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [page, setPage] = useState(3);

  return (
    <div className="page-x mx-auto max-w-page py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-h1">Design System</h1>
        <ThemeSelect />
      </div>

      <Section title="Color">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          {Object.keys(palette.light).map((k) => {
            const cssVar = `--${k.replace(/([a-z])([A-Z0-9])/g, '$1-$2').toLowerCase()}`;
            return (
              <div key={k} className="flex flex-col gap-1.5">
                <div
                  className="h-14 rounded-sm border border-border"
                  style={{ background: `var(${cssVar})` }}
                />
                <span className="text-caption text-muted">{k}</span>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Typography">
        <div className="flex flex-col gap-3">
          {(Object.keys(typography) as (keyof typeof typography)[]).map((k) => (
            <div key={k} className="flex items-baseline gap-6">
              <span className="w-24 shrink-0 text-caption text-muted">{k}</span>
              <span className={`${TYPE_CLASS[k]} tabular`}>
                {k.startsWith('price') ? '1,050,000원' : '이중섭, 황소 — 작품은 화면의 주인공'}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Button">
        <div className="flex flex-wrap items-center gap-2">
          <Button>입찰하기</Button>
          <Button variant="secondary">구매하기</Button>
          <Button variant="outline">관심상품</Button>
          <Button variant="ghost">취소</Button>
          <Button variant="destructive">삭제</Button>
          <Button variant="link">자세히 보기</Button>
          <Button loading>처리 중</Button>
          <Button disabled>비활성</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <IconButton label="관심상품">
            <Heart className="size-5" aria-hidden />
          </IconButton>
          <IconButton label="공유">
            <Share2 className="size-5" aria-hidden />
          </IconButton>
        </div>
      </Section>

      <Section title="Form">
        <div className="grid max-w-xl gap-4">
          <Field label="상품명" required hint="작품명을 정확히 적어주세요.">
            {(p) => <Input {...p} placeholder="예) 무제 (Untitled)" />}
          </Field>
          <Field label="이메일" error="올바른 이메일 주소를 입력해주세요.">
            {(p) => <Input {...p} defaultValue="collector@" />}
          </Field>
          <Field label="판매 가격" required>
            {(p) => <PriceInput {...p} value={price} onValueChange={setPrice} />}
          </Field>
          <Field label="정렬">
            {(p) => (
              <Select
                {...p}
                value={sort}
                onValueChange={setSort}
                options={[
                  { value: 'latest', label: '최신순' },
                  { value: 'price_asc', label: '낮은 가격순' },
                  { value: 'ending_soon', label: '마감 임박순' },
                ]}
              />
            )}
          </Field>
          <Field label="설명">{(p) => <Textarea {...p} placeholder="작품 상태, 제작 배경 등" />}</Field>
          <Checkbox checked={checked} onCheckedChange={setChecked} label="서비스 이용약관에 동의합니다" />
          <Switch
            checked={on}
            onCheckedChange={setOn}
            label="연장 경매"
            description="종료 30초 전 입찰 시 30초 연장"
          />
          <RadioGroup
            aria-label="판매 방식"
            value={sale}
            onValueChange={setSale}
            options={[
              { value: 'FIXED', label: '즉시 구매', description: '정해진 가격에 바로 판매' },
              { value: 'AUCTION', label: '경매', description: '실시간 입찰로 판매' },
            ]}
          />
        </div>
      </Section>

      <Section title="Badge · Alert · Avatar · Progress">
        <div className="flex flex-wrap gap-2">
          <Badge tone="live">LIVE</Badge>
          <Badge tone="primary">플랫폼 검수 완료</Badge>
          <Badge tone="outline">검수 중</Badge>
          <Badge>즉시 구매</Badge>
          <Badge tone="solid">경매</Badge>
          <Badge tone="destructive">마감 임박</Badge>
        </div>
        <div className="grid max-w-xl gap-2">
          <Alert title="판매자 제공 정보">인증서 정보는 플랫폼이 확인하지 않았습니다.</Alert>
          <Alert tone="success" title="입찰 성공">
            현재 최고 입찰자입니다.
          </Alert>
          <Alert tone="warning" title="종료 임박">
            경매가 5분 후 종료됩니다.
          </Alert>
          <Alert tone="destructive" title="입찰 실패">
            최소 입찰가는 1,060,000원입니다.
          </Alert>
        </div>
        <div className="flex items-center gap-3">
          <Avatar avatarKey={null} name="컬렉터" size="sm" />
          <Avatar avatarKey={null} name="컬렉터" />
          <Avatar avatarKey={null} name="컬렉터" size="lg" />
        </div>
        <div className="max-w-xl">
          <Progress value={62} label="업로드 진행률" />
        </div>
      </Section>

      <Section title="Overlay">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setDialog(true)}>
            Dialog
          </Button>
          <Button variant="outline" onClick={() => setSheet(true)}>
            Sheet
          </Button>
          <Button variant="outline" onClick={() => toast.success('관심상품에 저장했습니다')}>
            Toast
          </Button>
          <Button variant="outline" onClick={() => toast.error('입찰에 실패했습니다. 다시 시도해주세요.')}>
            Error toast
          </Button>
          <DropdownMenu
            trigger={<Button variant="outline">Dropdown</Button>}
            items={[
              { label: '수정', onSelect: () => toast.show('수정') },
              { label: '판매 중지', onSelect: () => toast.show('판매 중지') },
              { label: '삭제', destructive: true, onSelect: () => toast.show('삭제') },
            ]}
          />
          <Tooltip content="새 알림 3개">
            <IconButton label="알림">
              <Bell className="size-5" aria-hidden />
            </IconButton>
          </Tooltip>
        </div>
        <Dialog
          open={dialog}
          onOpenChange={setDialog}
          title="입찰 확인"
          description="입찰은 취소할 수 없습니다."
          footer={
            <>
              <Button variant="ghost" onClick={() => setDialog(false)}>
                취소
              </Button>
              <Button onClick={() => setDialog(false)}>1,060,000원 입찰</Button>
            </>
          }
        />
        <Sheet open={sheet} onOpenChange={setSheet} title="필터" footer={<Button block>결과 보기</Button>}>
          <p className="text-body text-muted">
            모바일에서는 하단 시트, 데스크톱에서는 측면 드로어로 사용합니다.
          </p>
        </Sheet>
      </Section>

      <Section title="Navigation">
        <Breadcrumb
          items={[
            { href: '/', label: '홈' },
            { href: '/category/painting', label: '회화' },
            { label: '무제 (Untitled)' },
          ]}
        />
        <Tabs defaultValue="live">
          <TabsList>
            <TabsTrigger value="live">진행 중</TabsTrigger>
            <TabsTrigger value="scheduled">시작 예정</TabsTrigger>
            <TabsTrigger value="ended">종료</TabsTrigger>
          </TabsList>
          <TabsContent value="live" className="py-4 text-body text-muted">
            진행 중인 경매
          </TabsContent>
          <TabsContent value="scheduled" className="py-4 text-body text-muted">
            시작 예정 경매
          </TabsContent>
          <TabsContent value="ended" className="py-4 text-body text-muted">
            종료된 경매
          </TabsContent>
        </Tabs>
        <Pagination page={page} totalPages={12} onPageChange={setPage} />
        <Accordion
          defaultOpen={['info']}
          items={[
            { id: 'info', title: '작품 정보', content: '캔버스에 유채, 53.0 × 45.5 cm, 1972' },
            { id: 'ship', title: '배송 · 반품', content: '전문 미술품 운송 (무료)' },
          ]}
        />
      </Section>

      <Section title="Skeleton · Table · Empty">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="aspect-[4/5] rounded-none" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          ))}
        </div>
        <Table
          columns={[
            {
              key: 'no',
              header: '주문번호',
              cell: (r: { no: string; status: string; amount: string }) => r.no,
            },
            { key: 'status', header: '상태', cell: (r) => <Badge>{r.status}</Badge> },
            {
              key: 'amount',
              header: '금액',
              cell: (r) => <span className="tabular">{r.amount}</span>,
              className: 'text-right',
            },
          ]}
          rows={[
            { no: '20260928-0001', status: '결제 완료', amount: '1,050,000원' },
            { no: '20260928-0002', status: '배송 중', amount: '320,000원' },
          ]}
          rowKey={(r) => r.no}
        />
        <EmptyState title="관심상품이 없습니다" description="마음에 드는 작품의 하트를 눌러 저장하세요." />
      </Section>
    </div>
  );
}
