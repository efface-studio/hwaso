import Link from 'next/link';
import { BrandBanner } from '@/components/brand/brand-banner';
import { SeniorQuickToggle } from './senior-toggle';
import { ThemeSelect } from './theme-select';

// 전자상거래법 표시 사항. 실제 사업자 정보가 나오면 여기 값만 바꾼다 (현재는 임시 값)
const COMPANY = {
  name: '주식회사 화소',
  ceo: '홍길동',
  address: '서울특별시 종로구 인사동길 12, 3층 (관훈동)',
  bizNo: '123-45-67890',
  mailOrderNo: '제2026-서울종로-0123호',
  phone: '1588-0000',
  hours: '평일 10:00–18:00 (점심 12:30–13:30, 주말·공휴일 휴무)',
  email: 'help@hwaso.kr',
  privacyOfficer: '김화소',
  hosting: 'Amazon Web Services, Inc.',
} as const;

const FOOTER_LINKS = [
  ['/notices', '공지사항'],
  ['/terms', '이용약관'],
  ['/privacy', '개인정보처리방침'],
  ['/policy/auction', '경매 운영 정책'],
  ['/policy/authenticity', '검수·진품 보증 정책'],
] as const;

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-20 border-t border-border bg-background-soft pb-24 md:pb-0">
      <div className="page-x mx-auto flex max-w-page flex-col gap-6 py-10">
        <div className="flex flex-col gap-6 md:flex-row md:justify-between">
          <div className="flex flex-col gap-3">
            <BrandBanner transparent className="-ml-3 w-[220px]" />
            <div className="text-small">
              <p className="text-body-strong">
                고객센터{' '}
                <a href={`tel:${COMPANY.phone}`} className="tabular hover:underline">
                  {COMPANY.phone}
                </a>
              </p>
              <p className="text-caption text-muted">{COMPANY.hours}</p>
              <p className="text-caption text-muted">
                이메일{' '}
                <a href={`mailto:${COMPANY.email}`} className="hover:text-foreground hover:underline">
                  {COMPANY.email}
                </a>
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-4 md:items-end">
            <nav aria-label="정책" className="flex flex-wrap gap-x-4 gap-y-2 text-small text-muted">
              {FOOTER_LINKS.map(([href, label]) => (
                <Link
                  key={href}
                  href={href}
                  className={href === '/privacy' ? 'font-semibold text-foreground' : 'hover:text-foreground'}
                >
                  {label}
                </Link>
              ))}
            </nav>
            <div className="flex flex-wrap items-center gap-2">
              <SeniorQuickToggle />
              <ThemeSelect />
            </div>
          </div>
        </div>

        <address className="flex flex-col gap-1 border-t border-border-soft pt-6 text-caption text-muted not-italic">
          <p>
            상호 {COMPANY.name} · 대표 {COMPANY.ceo} · 개인정보보호책임자 {COMPANY.privacyOfficer}
          </p>
          <p>주소 {COMPANY.address}</p>
          <p>
            사업자등록번호 <span className="tabular">{COMPANY.bizNo}</span>{' '}
            <a
              href={`https://www.ftc.go.kr/bizCommPop.do?wrkr_no=${COMPANY.bizNo.replaceAll('-', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              사업자정보 확인
            </a>{' '}
            · 통신판매업 신고 {COMPANY.mailOrderNo}
          </p>
          <p>호스팅 서비스 제공 {COMPANY.hosting}</p>
        </address>

        <div className="flex flex-col gap-2 text-caption text-muted">
          <p>
            화소는 통신판매중개자로서 통신판매의 당사자가 아니며, 판매자가 등록한 상품 정보와 거래에 대한
            책임은 각 판매자에게 있습니다. 단, &lsquo;플랫폼 검수 완료&rsquo; 표시가 있는 항목은 화소가 직접
            확인했습니다.
          </p>
          <p>
            고객님의 안전한 거래를 위해 결제 대금은 구매 확정 시까지 토스페이먼츠 구매안전서비스(에스크로)로
            보호됩니다. 거래 분쟁은 고객센터 또는 한국소비자원·전자거래분쟁조정위원회를 통해 조정을 신청할 수
            있습니다.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="tabular">© {year} Hwaso Inc. All rights reserved.</p>
            <p>
              Created by{' '}
              <a
                href="https://efface.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-foreground-2 hover:text-foreground hover:underline"
              >
                efface
              </a>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
