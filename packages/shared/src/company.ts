/**
 * 사업자 정보 (전자상거래법 제10조 표시 의무) — 웹 푸터·앱 고객센터·개인정보 처리방침이 함께 쓴다.
 * 상호·대표자·주소는 실제 값. TODO(사업자 정보) 표시가 남은 항목은 아직 자리표시자다.
 */
const PRIVACY_OFFICER = {
  name: '서지완',
  email: 'xixn2@efface.dev',
} as const;

export const COMPANY = {
  name: '주식회사 이페이스(efface)',
  ceo: '서지완',
  address: '서울특별시 서초구 신반포로42길 14',
  // TODO(사업자 정보): 사업자등록번호·대표 전화
  bizNo: '123-45-67890',
  // TODO(사업자 정보): 통신판매업 신고번호 — 지역(서울강남)은 확정, 번호는 자리표시자
  mailOrderNumber: '제2026-서울강남-0123호',
  /** @deprecated mailOrderNumber 를 쓴다 */
  mailOrderNo: '제2026-서울강남-0123호',
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
