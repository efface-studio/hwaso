import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '검수·진품 보증 정책',
  alternates: { canonical: '/policy/authenticity' },
};

const ARTICLES: [string, string][] = [
  [
    '1. 판매자 제공 정보',
    '작가·제작 연도·재료·크기·상태·소장 이력(프로비넌스)·감정서 등 상품 정보는 판매자가 제공합니다. 판매자는 사실과 다른 정보를 등록하지 않을 책임이 있으며, 알고 있는 손상·수리·복원 이력을 모두 밝혀야 합니다.',
  ],
  [
    '2. 플랫폼 검수',
    '‘플랫폼 검수 완료’ 표시는 화소가 감정서·보증서 원본과 실물 사진을 대조하고, 필요한 경우 외부 감정 기관의 의견을 확인한 항목에만 붙습니다. 검수 표시가 없는 항목은 판매자 정보만으로 판단해 주세요.',
  ],
  [
    '3. 위작·가품 의심 신고',
    '작품 상세의 신고 기능이나 고객센터로 위작·가품·도난품 의심 신고를 받습니다. 신고가 접수되면 판매를 일시 중지하고 판매자에게 소명 자료를 요청하며, 확인 결과는 신고자에게 알려 드립니다.',
  ],
  [
    '4. 구매 후 진위 문제',
    '구매 확정 전에 작품이 상품 정보와 다르거나 위작으로 확인되면 전액 환불합니다. 공인 감정 기관에서 위작 판정을 받은 경우 구매 확정 후라도 판정일로부터 30일 안에 신청하면 판매자 책임으로 환불을 진행하며, 화소는 판매자 정산을 보류하는 방식으로 이를 보장합니다.',
  ],
  [
    '5. 판매자 제재',
    '위작·가품 판매가 확인된 판매자는 즉시 판매가 중지되고 정산이 보류되며, 재발 방지를 위해 영구 이용 제한될 수 있습니다.',
  ],
];

export default function AuthenticityPolicyPage() {
  return (
    <article className="page-x mx-auto max-w-2xl py-8 md:py-12">
      <h1 className="text-h1">검수·진품 보증 정책</h1>
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
