import type { Metadata } from 'next';

export const metadata: Metadata = { title: '개인정보 처리방침', alternates: { canonical: '/privacy' } };

const ROWS: [string, string, string][] = [
  ['회원가입·로그인', '이메일, 비밀번호(암호화), 닉네임', '회원 탈퇴 시까지'],
  ['소셜 로그인', '소셜 서비스 식별자, 이메일, 이름(선택)', '연결 해제 또는 탈퇴 시까지'],
  ['본인인증(PASS)', '연계정보(CI)의 해시값, 마스킹된 이름·휴대폰 번호, 성인 여부', '회원 탈퇴 시까지'],
  ['판매자 정산', '은행, 계좌번호(암호화), 예금주, 상호', '정산 완료 후 5년 (전자상거래법)'],
  ['주문·배송', '받는 분, 연락처, 주소', '거래 완료 후 5년 (전자상거래법)'],
  ['서비스 이용 기록', '접속 IP(마스킹 표시), 기기 정보, 이용 기록', '3개월 (통신비밀보호법)'],
];

export default function PrivacyPage() {
  return (
    <article className="page-x mx-auto max-w-2xl py-8 md:py-12">
      <h1 className="text-h1">개인정보 처리방침</h1>
      <p className="mt-2 text-small text-muted">시행일 2026년 10월 1일</p>
      <section className="mt-8">
        <h2 className="text-h3">수집 항목과 보유 기간</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-small">
            <thead className="bg-background-soft text-left text-muted">
              <tr>
                <th scope="col" className="h-10 px-3 font-medium">
                  목적
                </th>
                <th scope="col" className="h-10 px-3 font-medium">
                  항목
                </th>
                <th scope="col" className="h-10 px-3 font-medium">
                  보유 기간
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([purpose, items, keep]) => (
                <tr key={purpose} className="border-t border-border-soft">
                  <td className="px-3 py-3">{purpose}</td>
                  <td className="px-3 py-3">{items}</td>
                  <td className="px-3 py-3">{keep}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="mt-8">
        <h2 className="text-h3">안전성 확보 조치</h2>
        <p className="mt-2 text-body text-foreground-2">
          비밀번호는 argon2id 로 단방향 암호화하고, 정산 계좌는 AES-256-GCM 으로 암호화합니다. 연계정보(CI)는
          원문을 저장하지 않습니다. 공개 화면에는 이메일·연락처·주소를 노출하지 않으며, 로그에서도 민감 정보를
          가립니다.
        </p>
      </section>
      <section className="mt-8">
        <h2 className="text-h3">이용자의 권리</h2>
        <p className="mt-2 text-body text-foreground-2">
          설정 화면에서 언제든 정보를 열람·수정하고, 로그인된 기기를 관리하며, 탈퇴할 수 있습니다.
        </p>
      </section>
    </article>
  );
}
