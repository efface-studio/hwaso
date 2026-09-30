import { POLICIES } from '@shop/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PolicyArticle } from '@/components/layout/policy-article';

export const metadata: Metadata = { title: '개인정보 처리방침', alternates: { canonical: '/privacy' } };

export default function PrivacyPage() {
  return (
    <PolicyArticle doc={POLICIES.privacy}>
      <p className="mt-10 border-t border-border pt-6 text-small text-muted">
        회원 탈퇴(계정 삭제) 방법과 삭제·보관되는 정보는{' '}
        <Link href="/account-deletion" className="font-semibold text-foreground underline underline-offset-2">
          계정 삭제 안내
        </Link>
        에서 확인할 수 있어요.
      </p>
    </PolicyArticle>
  );
}
