import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { OrderList } from '@/components/admin/commerce/order-list';
import { PaymentList } from '@/components/admin/commerce/payment-list';
import { SettlementList } from '@/components/admin/commerce/settlement-list';
import { Segmented } from '@/components/ui/segmented';

type Tab = 'orders' | 'payments' | 'settlements';
const TABS: { value: Tab; label: string }[] = [
  { value: 'orders', label: '주문' },
  { value: 'payments', label: '결제' },
  { value: 'settlements', label: '정산' },
];

/**
 * 관리자 거래 탭: 주문 | 결제 | 정산.
 * 대시보드 딥링크(tab·status)는 고른 보기와 상태 필터의 처음 값이 되고, 값이 바뀌면 목록을 새로 그린다.
 */
export default function AdminCommerceScreen() {
  const params = useLocalSearchParams<{ tab?: string; status?: string }>();
  const linked = TABS.find((o) => o.value === params.tab)?.value;
  const linkKey = `${params.tab ?? ''}|${params.status ?? ''}`;
  const [tab, setTab] = useState<Tab>(linked ?? 'orders');
  const [seen, setSeen] = useState(linkKey);
  // 새 딥링크로 들어오면 그 보기로 바꾼다
  if (seen !== linkKey) {
    setSeen(linkKey);
    if (linked) setTab(linked);
  }

  const segment = <Segmented label="보기" value={tab} onChange={setTab} options={TABS} />;
  const status = linked === tab ? params.status : undefined;
  const key = `${tab}|${linkKey}`;

  if (tab === 'payments') return <PaymentList key={key} header={segment} status={status} />;
  if (tab === 'settlements') return <SettlementList key={key} header={segment} status={status} />;
  return <OrderList key={key} header={segment} status={status} />;
}
