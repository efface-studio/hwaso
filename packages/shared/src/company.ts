/**
 * 사업자 정보 (전자상거래법 제10조 표시 의무) — 웹 푸터·앱 고객센터·개인정보 처리방침이 함께 쓴다.
 * TODO(사업자 정보): 아래 값은 모두 자리표시자다. 사업자 등록·통신판매업 신고 후 실제 값으로 교체한다.
 */
const PRIVACY_OFFICER = {
  // TODO(사업자 정보): 개인정보 보호책임자 실명·연락 이메일
  name: '김화소',
  email: 'privacy@hwaso.kr',
} as const;

export const COMPANY = {
  // TODO(사업자 정보): 상호·대표자·주소·사업자등록번호·대표 전화
  name: '주식회사 화소',
  ceo: '홍길동',
  address: '서울특별시 종로구 인사동길 12, 3층 (관훈동)',
  bizNo: '123-45-67890',
  // TODO(사업자 정보): 통신판매업 신고번호
  mailOrderNumber: '제2026-서울종로-0123호',
  /** @deprecated mailOrderNumber 를 쓴다 */
  mailOrderNo: '제2026-서울종로-0123호',
  phone: '1588-0000',
  hours: '평일 10:00–18:00 (점심 12:30–13:30, 주말·공휴일 휴무)',
  email: 'help@hwaso.kr',
  /** 개인정보 보호책임자 (개인정보 보호법 제31조) */
  privacyOfficer: PRIVACY_OFFICER,
  // TODO(사업자 정보): 실제 호스팅 제공자
  hostingProvider: 'Amazon Web Services, Inc.',
  /** @deprecated hostingProvider 를 쓴다 */
  hosting: 'Amazon Web Services, Inc.',
} as const;
