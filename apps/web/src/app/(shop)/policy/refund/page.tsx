import { POLICIES } from '@shop/shared';
import type { Metadata } from 'next';
import { PolicyArticle } from '@/components/layout/policy-article';

export const metadata: Metadata = {
  title: POLICIES.refund.title,
  alternates: { canonical: POLICIES.refund.path },
};

export default function RefundPolicyPage() {
  return <PolicyArticle doc={POLICIES.refund} />;
}
