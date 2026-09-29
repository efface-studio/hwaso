import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { AuctionList } from '@/components/admin/catalog/auction-list';
import { ProductList } from '@/components/admin/catalog/product-list';
import { Segmented } from '@/components/ui/segmented';

type Tab = 'products' | 'auctions';
const TABS: { value: Tab; label: string }[] = [
  { value: 'products', label: '작품 · 검수' },
  { value: 'auctions', label: '경매' },
];

/**
 * 관리자 작품 탭: 작품 · 검수 | 경매.
 * 대시보드 딥링크(tab·status·verification)는 고른 보기와 필터의 처음 값이 되고, 값이 바뀌면 목록을 새로 그린다.
 */
export default function AdminCatalogScreen() {
  const params = useLocalSearchParams<{ tab?: string; status?: string; verification?: string }>();
  const linked = TABS.find((o) => o.value === params.tab)?.value;
  const linkKey = `${params.tab ?? ''}|${params.status ?? ''}|${params.verification ?? ''}`;
  const [tab, setTab] = useState<Tab>(linked ?? 'products');
  const [seen, setSeen] = useState(linkKey);
  // 새 딥링크로 들어오면 그 보기로 바꾼다
  if (seen !== linkKey) {
    setSeen(linkKey);
    if (linked) setTab(linked);
  }

  const segment = <Segmented label="보기" value={tab} onChange={setTab} options={TABS} />;
  const fromLink = linked === tab;

  return tab === 'products' ? (
    <ProductList
      key={`products|${linkKey}`}
      header={segment}
      status={fromLink ? params.status : undefined}
      verification={fromLink ? params.verification : undefined}
    />
  ) : (
    <AuctionList key={`auctions|${linkKey}`} header={segment} status={fromLink ? params.status : undefined} />
  );
}
