import { POLICIES } from '@shop/shared';
import type { Metadata } from 'next';
import { PolicyArticle } from '@/components/layout/policy-article';

export const metadata: Metadata = {
  title: '검수·진품 보증 정책',
  alternates: { canonical: '/policy/authenticity' },
};

export default function AuthenticityPolicyPage() {
  return <PolicyArticle doc={POLICIES.authenticity} />;
}
