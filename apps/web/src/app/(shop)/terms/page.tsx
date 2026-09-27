import type { Metadata } from 'next';

export const metadata: Metadata = { title: '이용약관', alternates: { canonical: '/terms' } };

const ARTICLES: [string, string][] = [
  [
    '제1조 (목적)',
    '이 약관은 화소(畫所, 이하 “서비스”)이 제공하는 미술품·컬렉터블 거래 중개 및 온라인 경매 서비스의 이용 조건과 절차, 회원과 서비스의 권리·의무를 정합니다.',
  ],
  [
    '제2조 (서비스의 성격)',
    '서비스는 회원 간 거래를 중개하는 통신판매중개자이며, 거래 당사자가 아닙니다. 상품 정보·인증서·출처 정보는 판매자가 제공하며, “플랫폼 검수 완료” 표시가 있는 항목만 서비스가 원본과 실물을 대조했습니다.',
  ],
  [
    '제3조 (회원가입과 계정)',
    '회원은 정확한 정보로 가입해야 하며 계정을 타인에게 양도하거나 대여할 수 없습니다. 판매자는 정산을 위해 본인인증과 정산 계좌 등록을 해야 합니다.',
  ],
  [
    '제4조 (경매)',
    '입찰은 취소할 수 없으며, 입찰 금액·최고 입찰자·종료 시각은 서버 기록을 기준으로 합니다. 종료 직전 입찰 시 경매가 자동 연장될 수 있습니다. 낙찰자는 정해진 기한 안에 결제해야 하며, 미결제가 반복되면 입찰이 제한될 수 있습니다.',
  ],
  [
    '제5조 (결제와 정산)',
    '결제 금액은 서비스가 주문 정보로 계산하며, 구매 확정 후 판매 대금에서 수수료를 뺀 금액을 판매자에게 정산합니다.',
  ],
  [
    '제6조 (금지 행위)',
    '위작·가품·도난품 판매, 허위 정보 등록, 자전 거래 등 경매 조작, 저작권 침해, 서비스 외부 거래 유도는 금지되며 적발 시 게시물 삭제·이용 제한 조치를 합니다.',
  ],
  [
    '제7조 (회원 탈퇴)',
    '회원은 언제든 탈퇴할 수 있습니다. 다만 진행 중인 거래·경매가 있으면 완료 후 탈퇴할 수 있으며, 거래 기록은 관련 법령에 따라 익명으로 보관됩니다.',
  ],
];

export default function TermsPage() {
  return (
    <article className="page-x mx-auto max-w-2xl py-8 md:py-12">
      <h1 className="text-h1">이용약관</h1>
      <p className="mt-2 text-small text-muted">시행일 2026년 10월 1일</p>
      <div className="mt-8 flex flex-col gap-6">
        {ARTICLES.map(([title, body]) => (
          <section key={title}>
            <h2 className="text-h3">{title}</h2>
            <p className="mt-2 text-body text-foreground-2">{body}</p>
          </section>
        ))}
      </div>
    </article>
  );
}
