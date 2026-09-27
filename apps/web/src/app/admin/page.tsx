'use client';

import { formatPrice } from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { AdminPage } from '@/components/admin/admin-shell';
import { Skeleton } from '@/components/ui/display';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

function Card({
  label,
  value,
  sub,
  href,
  alert,
}: {
  label: string;
  value: string | number;
  sub?: string;
  href?: string;
  alert?: boolean;
}) {
  const body = (
    <>
      <span className="text-caption text-muted">{label}</span>
      <span className={cn('tabular text-h2', alert && 'text-destructive')}>
        {typeof value === 'number' ? value.toLocaleString('ko-KR') : value}
      </span>
      {sub && <span className="text-caption text-muted">{sub}</span>}
    </>
  );
  const cls = 'flex flex-col gap-0.5 rounded-sm border border-border bg-background p-4';
  return href ? (
    <Link href={href} className={cn(cls, 'hover:border-foreground')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** 14일 추이: 막대(거래액) + 숫자(주문·가입). 차트 라이브러리 없이 SVG 로 */
function Trend({ series }: { series: { date: string; signups: number; orders: number; gmv: number }[] }) {
  const max = Math.max(1, ...series.map((s) => s.gmv));
  const w = 100 / series.length;
  return (
    <div className="rounded-sm border border-border bg-background p-4">
      <p className="mb-3 text-label">최근 14일 거래액</p>
      <svg
        viewBox="0 0 100 40"
        className="h-40 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label="최근 14일 거래액 막대 그래프"
      >
        {series.map((s, i) => {
          const h = (s.gmv / max) * 36;
          return (
            <rect
              key={s.date}
              x={i * w + w * 0.15}
              y={40 - h}
              width={w * 0.7}
              height={h}
              className="fill-primary"
            >
              <title>{`${s.date} · ${formatPrice(s.gmv)} · 주문 ${s.orders} · 가입 ${s.signups}`}</title>
            </rect>
          );
        })}
      </svg>
      <div
        className="mt-2 grid text-center text-[10px] text-muted"
        style={{ gridTemplateColumns: `repeat(${series.length}, 1fr)` }}
      >
        {series.map((s) => (
          <span key={s.date} className="tabular">
            {s.date.slice(8)}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <tbody>
          {series.map((s) => (
            <tr key={s.date}>
              <td>{s.date}</td>
              <td>{s.gmv}</td>
              <td>{s.orders}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminDashboardPage() {
  const { data: d } = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: api.admin.dashboard,
    refetchInterval: 60_000,
  });
  return (
    <AdminPage title="대시보드" description="오늘 기준은 한국 시간 0시부터예요. 1분마다 갱신돼요.">
      {!d ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <>
          <section aria-label="처리 대기" className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card
              label="환불 요청"
              value={d.issues.refundRequests}
              href="/admin/orders?status=REFUND_REQUESTED"
              alert={d.issues.refundRequests > 0}
            />
            <Card
              label="미처리 신고"
              value={d.issues.openReports}
              href="/admin/reports"
              alert={d.issues.openReports > 0}
            />
            <Card
              label="인증서 검수 대기"
              value={d.products.pendingCertificates}
              href="/admin/products?verification=PENDING"
            />
            <Card label="판매자 인증 대기" value={d.sellers.pendingVerification} href="/admin/sellers" />
          </section>
          <section aria-label="거래" className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card
              label="오늘 거래액"
              value={formatPrice(d.orders.gmvToday)}
              sub={`결제 ${d.orders.today}건`}
            />
            <Card label="30일 거래액" value={formatPrice(d.orders.gmv30d)} />
            <Card
              label="결제 대기"
              value={d.orders.paymentPending}
              href="/admin/orders?status=PAYMENT_PENDING"
            />
            <Card label="발송 대기" value={d.orders.toShip} href="/admin/orders?status=PAID" />
          </section>
          <section aria-label="경매·회원·정산" className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card
              label="진행 중 경매"
              value={d.auctions.live}
              sub={`오늘 마감 ${d.auctions.endingToday} · 예정 ${d.auctions.scheduled}`}
              href="/admin/auctions"
            />
            <Card
              label="회원"
              value={d.users.total}
              sub={`오늘 가입 ${d.users.today} · 정지 ${d.users.suspended}`}
              href="/admin/users"
            />
            <Card label="판매 중 작품" value={d.products.active} href="/admin/products" />
            <Card
              label="정산 예정"
              value={formatPrice(d.settlements.scheduledAmount)}
              sub={`보류 ${formatPrice(d.settlements.heldAmount)}`}
              href="/admin/settlements"
            />
          </section>
          <Trend series={d.series} />
          {d.issues.unpaidAuctions > 0 && (
            <p className="text-small text-muted">
              최근 30일 낙찰 후 미결제 {d.issues.unpaidAuctions}건 — 경매 목록에서 확인하세요.
            </p>
          )}
        </>
      )}
    </AdminPage>
  );
}
