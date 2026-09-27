import type { Metadata } from 'next';

export const metadata: Metadata = { title: '경매 운영 정책', alternates: { canonical: '/policy/auction' } };

const ARTICLES: [string, string][] = [
  [
    '1. 기준 시각',
    '모든 경매의 시작·종료 시각과 입찰 순서는 화소 서버 시각을 기준으로 합니다. 화면의 남은 시간은 서버 시각에 맞춰 보정되며, 네트워크 지연으로 늦게 도착한 입찰은 받지 않을 수 있습니다.',
  ],
  [
    '2. 입찰',
    '입찰은 현재가에 호가 단위 이상을 더한 금액부터 가능하며, 한 번 제출한 입찰은 취소할 수 없습니다. 같은 금액의 입찰이 동시에 들어오면 서버에 먼저 기록된 입찰이 우선합니다. 판매자 본인과 판매자 계정 관계자는 입찰할 수 없습니다.',
  ],
  [
    '3. 마감 직전 자동 연장',
    '자동 연장이 설정된 경매는 종료 30초 안에 입찰이 들어오면 종료 시각이 30초 늘어납니다. 연장은 최초 종료 시각으로부터 최대 30분까지 적용됩니다.',
  ],
  [
    '4. 즉시 구매',
    '즉시 구매가가 설정된 경매는 그 금액으로 바로 낙찰받을 수 있으며, 이때 경매는 즉시 종료됩니다.',
  ],
  [
    '5. 낙찰과 결제',
    '경매가 끝나면 최고 입찰자가 낙찰자가 되고 주문이 자동으로 만들어집니다. 낙찰자는 72시간 안에 결제해야 하며, 기한 안에 결제하지 않으면 낙찰이 취소되고 미결제 이력이 남습니다. 미결제가 반복되면 경매 참여가 제한됩니다.',
  ],
  [
    '6. 경매 취소와 변경',
    '판매자는 입찰이 시작되기 전까지만 경매 조건을 바꾸거나 취소할 수 있습니다. 입찰이 들어온 뒤에는 위작 의심·파손 등 정당한 사유가 확인된 경우에만 화소가 경매를 중단할 수 있으며, 이 경우 입찰자에게 알림으로 안내합니다.',
  ],
  [
    '7. 부정 행위',
    '자전 입찰(판매자 또는 관계자가 가격을 올리는 행위), 다중 계정 사용, 담합, 입찰 후 외부 거래 유도는 금지됩니다. 적발 시 경매를 무효로 하고 계정 이용을 제한하며, 필요한 경우 관계 기관에 알립니다.',
  ],
];

export default function AuctionPolicyPage() {
  return (
    <article className="page-x mx-auto max-w-2xl py-8 md:py-12">
      <h1 className="text-h1">경매 운영 정책</h1>
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
