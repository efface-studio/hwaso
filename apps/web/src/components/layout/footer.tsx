import Link from 'next/link';
import { ThemeSelect } from './theme-select';

export function Footer() {
  return (
    <footer className="mt-20 border-t border-border bg-background-soft pb-24 md:pb-0">
      <div className="page-x mx-auto flex max-w-page flex-col gap-6 py-10 md:flex-row md:justify-between">
        <div className="flex flex-col gap-2 text-small text-muted">
          <p className="text-body-strong text-foreground">Efface Shop</p>
          <p>미술품 · 역사적 제품 · 컬렉터블 마켓플레이스와 실시간 경매</p>
          <p className="text-caption">
            상품 정보와 인증서·출처 정보는 판매자가 제공한 것이며, &lsquo;플랫폼 검수 완료&rsquo; 표시가 있는
            항목만 플랫폼이 확인했습니다.
          </p>
        </div>
        <div className="flex flex-col gap-4 md:items-end">
          <nav aria-label="정책" className="flex gap-4 text-small text-muted">
            <Link href="/notices" className="hover:text-foreground">
              공지사항
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              이용약관
            </Link>
            <Link href="/privacy" className="font-semibold hover:text-foreground">
              개인정보처리방침
            </Link>
          </nav>
          <ThemeSelect />
        </div>
      </div>
    </footer>
  );
}
