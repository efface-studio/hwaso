import { POLICIES } from '@shop/shared';
import type { Metadata } from 'next';
import { PolicyArticle } from '@/components/layout/policy-article';

export const metadata: Metadata = { title: '개인정보 처리방침', alternates: { canonical: '/privacy' } };

export default function PrivacyPage() {
  return <PolicyArticle doc={POLICIES.privacy} />;
}
