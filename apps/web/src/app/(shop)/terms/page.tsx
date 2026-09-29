import { POLICIES } from '@shop/shared';
import type { Metadata } from 'next';
import { PolicyArticle } from '@/components/layout/policy-article';

export const metadata: Metadata = { title: '이용약관', alternates: { canonical: '/terms' } };

export default function TermsPage() {
  return <PolicyArticle doc={POLICIES.terms} />;
}
