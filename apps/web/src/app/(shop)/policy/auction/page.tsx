import { POLICIES } from '@shop/shared';
import type { Metadata } from 'next';
import { PolicyArticle } from '@/components/layout/policy-article';

export const metadata: Metadata = { title: '경매 운영 정책', alternates: { canonical: '/policy/auction' } };

export default function AuctionPolicyPage() {
  return <PolicyArticle doc={POLICIES.auction} />;
}
