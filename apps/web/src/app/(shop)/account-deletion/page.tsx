import { COMPANY } from '@shop/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: '계정 삭제 안내',
  description: '화소 계정(회원 탈퇴)을 앱·웹·이메일로 삭제하는 방법과 삭제·보관되는 정보를 안내합니다.',
  alternates: { canonical: '/account-deletion' },
};

/** 제목·본문만 넣는 메일 링크 — 개인정보는 주소에 넣지 않고 사용자가 본문에 직접 적는다 */
const MAIL_HREF = `mailto:${COMPANY.email}?subject=${encodeURIComponent('[계정 삭제 요청]')}`;

const DELETED = [
  '이메일, 비밀번호, 본인인증 정보(연계정보 해시값, 마스킹된 이름·휴대폰 번호)',
  '닉네임, 프로필 사진, 소개, 거래 지역',
  '연결된 소셜 로그인 계정, 푸시 알림 토큰',
  '배송지, 관심 작품, 최근 본 작품, 장바구니, 팔로우',
  '판매 중이거나 등록 대기 중인 작품 (비공개 후 삭제)',
];

const RETAINED: [string, string, string][] = [
  ['계약·청약철회, 대금 결제·재화 공급에 관한 기록', '5년', '전자상거래법'],
  ['소비자 불만·분쟁 처리에 관한 기록', '3년', '전자상거래법'],
  ['서비스 접속 기록 (로그인 일시, IP 주소)', '3개월', '통신비밀보호법'],
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-h3">{title}</h2>
      {children}
    </section>
  );
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-body text-foreground-2 marker:text-muted">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ol>
  );
}

/** 로그인 없이 볼 수 있는 계정 삭제 안내 (앱 스토어 심사의 계정 삭제 URL) */
export default function AccountDeletionPage() {
  return (
    <article className="page-x mx-auto max-w-2xl py-8 md:py-12">
      <h1 className="text-h1">계정 삭제 안내</h1>
      <p className="mt-3 text-body text-foreground-2">
        화소 회원은 언제든 계정을 삭제(회원 탈퇴)할 수 있어요. 앱이나 웹에서 바로 삭제할 수 있고, 로그인할 수
        없다면 이메일로 요청할 수 있어요.
      </p>

      <div className="mt-10 flex flex-col gap-10">
        <Section title="앱에서 삭제하기">
          <Steps
            items={[
              '화소 앱을 열고 로그인해주세요.',
              <>
                하단의 <strong className="font-semibold text-foreground">마이</strong> 탭 ›{' '}
                <strong className="font-semibold text-foreground">설정</strong> ›{' '}
                <strong className="font-semibold text-foreground">회원 탈퇴</strong>를 눌러주세요.
              </>,
              '비밀번호, 이메일 인증번호 또는 연결된 소셜 계정으로 본인 확인을 해주세요.',
              '안내를 확인한 뒤 ‘탈퇴하기’를 누르면 바로 삭제돼요.',
            ]}
          />
        </Section>

        <Section title="웹에서 삭제하기">
          <Steps
            items={[
              <>
                화소 웹사이트에{' '}
                <Link
                  href="/login?next=%2Fmy%2Fsettings"
                  className="text-primary underline underline-offset-2"
                >
                  로그인
                </Link>
                해주세요.
              </>,
              <>
                <strong className="font-semibold text-foreground">마이</strong> ›{' '}
                <Link
                  href="/my/settings"
                  className="font-semibold text-foreground underline underline-offset-2"
                >
                  설정
                </Link>{' '}
                화면 맨 아래 <strong className="font-semibold text-foreground">회원 탈퇴</strong>를
                눌러주세요.
              </>,
              '본인 확인 후 ‘탈퇴하기’를 누르면 바로 삭제돼요.',
            ]}
          />
        </Section>

        <Section title="로그인할 수 없거나 앱이 없을 때">
          <p className="text-body text-foreground-2">
            아래 내용을 적어 고객센터 이메일로 보내주세요. 가입한 이메일로 보내면 더 빠르게 확인할 수 있어요.
          </p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-body text-foreground-2 marker:text-muted">
            <li>제목: [계정 삭제 요청]</li>
            <li>가입한 이메일 주소 또는 로그인에 쓴 소셜 계정 종류(카카오·네이버·구글·Apple)</li>
            <li>닉네임</li>
          </ul>
          <p className="text-body">
            <a
              href={MAIL_HREF}
              className="font-semibold text-primary underline underline-offset-2 hover:opacity-80"
            >
              {COMPANY.email}
            </a>
          </p>
          <p className="text-small text-muted">
            본인 확인을 위해 추가 정보를 요청할 수 있으며, 비밀번호는 절대 묻지 않아요.
          </p>
        </Section>

        <Section title="처리 기간">
          <p className="text-body text-foreground-2">
            앱·웹에서 탈퇴하면 즉시 처리돼요. 이메일로 요청하면 본인 확인 후 지체 없이, 늦어도 요청일로부터
            7일 이내에 삭제하고 결과를 메일로 알려드려요.
          </p>
          <p className="text-small text-muted">
            진행 중인 거래(결제·배송·정산 대기)나 경매(진행 중인 경매, 최고 입찰)가 있으면 완료된 뒤에 삭제할
            수 있어요.
          </p>
        </Section>

        <Section title="삭제되는 정보">
          <ul className="flex list-disc flex-col gap-1 pl-5 text-body text-foreground-2 marker:text-muted">
            {DELETED.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
          <p className="text-small text-muted">
            작성한 후기와 거래 상대방과 나눈 대화는 상대방의 기록 보존을 위해 ‘탈퇴회원’으로 표시되어 남을 수
            있어요.
          </p>
        </Section>

        <Section title="법령에 따라 보관되는 정보">
          <p className="text-body text-foreground-2">
            아래 기록은 관련 법령에 따라 회원 정보와 분리해 정해진 기간 동안 보관한 뒤 지체 없이 파기해요.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-small">
              <thead className="bg-background-soft text-left text-muted">
                <tr>
                  <th scope="col" className="h-10 px-3 font-medium">
                    보관 항목
                  </th>
                  <th scope="col" className="h-10 px-3 font-medium">
                    보관 기간
                  </th>
                  <th scope="col" className="h-10 px-3 font-medium">
                    근거
                  </th>
                </tr>
              </thead>
              <tbody>
                {RETAINED.map(([item, period, law]) => (
                  <tr key={item} className="border-t border-border-soft">
                    <td className="px-3 py-3">{item}</td>
                    <td className="tabular px-3 py-3 whitespace-nowrap">{period}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{law}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <p className="border-t border-border pt-6 text-small text-muted">
          자세한 내용은{' '}
          <Link href="/privacy" className="font-semibold text-foreground underline underline-offset-2">
            개인정보 처리방침
          </Link>
          을 확인해주세요. 문의: 고객센터{' '}
          <a href={`tel:${COMPANY.phone}`} className="tabular hover:underline">
            {COMPANY.phone}
          </a>{' '}
          ({COMPANY.hours})
        </p>
      </div>
    </article>
  );
}
