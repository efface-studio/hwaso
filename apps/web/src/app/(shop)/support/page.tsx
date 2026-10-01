import { COMPANY, POLICIES, POLICY_SLUGS } from '@shop/shared';
import { ChevronRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '고객센터',
  description: '화소 고객센터 연락처, 공지사항, 약관·정책과 계정 삭제 안내.',
  alternates: { canonical: '/support' },
};

const LINKS: [string, string][] = [
  ['/notices', '공지사항'],
  ...POLICY_SLUGS.map((slug): [string, string] => [POLICIES[slug].path, POLICIES[slug].title]),
  ['/account-deletion', '계정 삭제 안내'],
];

/** 로그인 없이 볼 수 있는 고객센터 (앱 스토어 심사의 지원 URL) */
export default function SupportPage() {
  return (
    <div className="page-x mx-auto max-w-2xl py-8 md:py-12">
      <h1 className="text-h1">고객센터</h1>

      <section aria-labelledby="support-contact" className="mt-8">
        <h2 id="support-contact" className="text-h3">
          문의하기
        </h2>
        <dl className="mt-4 grid grid-cols-[88px_1fr] gap-x-4 gap-y-3 text-body">
          <dt className="text-muted">전화</dt>
          <dd>
            <a href={`tel:${COMPANY.phone}`} className="tabular font-semibold hover:underline">
              {COMPANY.phone}
            </a>
            <p className="text-small text-muted">{COMPANY.hours}</p>
          </dd>
          <dt className="text-muted">이메일</dt>
          <dd>
            <a href={`mailto:${COMPANY.email}`} className="font-semibold hover:underline">
              {COMPANY.email}
            </a>
          </dd>
        </dl>
      </section>

      <nav aria-labelledby="support-links" className="mt-10">
        <h2 id="support-links" className="text-h3">
          안내 · 정책
        </h2>
        <ul className="mt-3">
          {LINKS.map(([href, label]) => (
            <li key={href}>
              <Link
                href={href}
                className="flex h-14 items-center justify-between border-b border-border-soft hover:bg-background-soft"
              >
                <span className="text-body">{label}</span>
                <ChevronRight className="size-4 text-faint" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
