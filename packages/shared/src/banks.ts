/**
 * 정산 계좌 은행 목록 (금융결제원 은행 코드 기준). name 은 정산 정보(bankName)에 그대로 저장된다.
 * color 는 로고 대신 쓰는 원형 배지의 대표 색(근사값), mark 는 배지에 들어갈 약칭.
 * 공식 로고 이미지를 받으면 앱에서 code 로 이미지를 찾아 배지 대신 쓴다.
 */
export type BankGroup = 'bank' | 'mutual' | 'foreign';

export interface Bank {
  code: string;
  name: string;
  mark: string;
  color: string;
  /** 배지 글자색 (밝은 대표색이면 어둡게) */
  fg: string;
  group: BankGroup;
}

const W = '#FFFFFF';
const D = '#1A1A1A';

export const BANK_GROUP_LABEL: Record<BankGroup, string> = {
  bank: '은행',
  mutual: '상호금융·저축은행',
  foreign: '해외 은행 (국내 지점)',
};

export const BANKS: Bank[] = [
  // 시중·인터넷은행
  { code: '004', name: 'KB국민은행', mark: 'KB', color: '#FFBC00', fg: D, group: 'bank' },
  { code: '088', name: '신한은행', mark: '신한', color: '#0046FF', fg: W, group: 'bank' },
  { code: '020', name: '우리은행', mark: '우리', color: '#0067AC', fg: W, group: 'bank' },
  { code: '081', name: '하나은행', mark: '하나', color: '#009490', fg: W, group: 'bank' },
  { code: '011', name: 'NH농협은행', mark: 'NH', color: '#1BA84D', fg: W, group: 'bank' },
  { code: '003', name: 'IBK기업은행', mark: 'IBK', color: '#004B9B', fg: W, group: 'bank' },
  { code: '090', name: '카카오뱅크', mark: 'kakao', color: '#FFE300', fg: D, group: 'bank' },
  { code: '092', name: '토스뱅크', mark: 'toss', color: '#0064FF', fg: W, group: 'bank' },
  { code: '089', name: '케이뱅크', mark: 'K', color: '#1E2B6F', fg: W, group: 'bank' },
  { code: '023', name: 'SC제일은행', mark: 'SC', color: '#0473EA', fg: W, group: 'bank' },
  { code: '027', name: '한국씨티은행', mark: 'citi', color: '#056DAE', fg: W, group: 'bank' },
  { code: '002', name: 'KDB산업은행', mark: 'KDB', color: '#00549F', fg: W, group: 'bank' },
  { code: '007', name: 'Sh수협은행', mark: 'Sh', color: '#0068B7', fg: W, group: 'bank' },
  // 지방은행
  { code: '031', name: 'iM뱅크(대구)', mark: 'iM', color: '#00A0E2', fg: W, group: 'bank' },
  { code: '032', name: '부산은행', mark: 'BNK', color: '#D7182A', fg: W, group: 'bank' },
  { code: '039', name: '경남은행', mark: 'BNK', color: '#C8102E', fg: W, group: 'bank' },
  { code: '034', name: '광주은행', mark: 'JB', color: '#004097', fg: W, group: 'bank' },
  { code: '037', name: '전북은행', mark: 'JB', color: '#1D4F91', fg: W, group: 'bank' },
  { code: '035', name: '제주은행', mark: '제주', color: '#0079C1', fg: W, group: 'bank' },
  { code: '071', name: '우체국', mark: '우체국', color: '#E60012', fg: W, group: 'bank' },
  // 상호금융·저축은행
  { code: '012', name: '지역농·축협', mark: '농협', color: '#1BA84D', fg: W, group: 'mutual' },
  { code: '030', name: '수협중앙회', mark: '수협', color: '#0068B7', fg: W, group: 'mutual' },
  { code: '045', name: '새마을금고', mark: 'MG', color: '#00A0E9', fg: W, group: 'mutual' },
  { code: '048', name: '신협', mark: '신협', color: '#0062AE', fg: W, group: 'mutual' },
  { code: '064', name: '산림조합', mark: '산림', color: '#3A8D3F', fg: W, group: 'mutual' },
  { code: '050', name: '저축은행', mark: 'SB', color: '#5B6770', fg: W, group: 'mutual' },
  // 해외 은행 (국내 지점 — 국내 계좌 이체 가능)
  { code: '054', name: 'HSBC', mark: 'HSBC', color: '#DB0011', fg: W, group: 'foreign' },
  { code: '055', name: '도이치은행', mark: 'DB', color: '#0018A8', fg: W, group: 'foreign' },
  { code: '057', name: 'JP모간체이스', mark: 'JPM', color: '#117ACA', fg: W, group: 'foreign' },
  { code: '060', name: 'BOA(뱅크오브아메리카)', mark: 'BofA', color: '#012169', fg: W, group: 'foreign' },
  { code: '061', name: 'BNP파리바', mark: 'BNP', color: '#00915A', fg: W, group: 'foreign' },
  { code: '059', name: 'MUFG(미쓰비시UFJ)', mark: 'MUFG', color: '#E60012', fg: W, group: 'foreign' },
  { code: '058', name: '미즈호은행', mark: 'MHBK', color: '#002F87', fg: W, group: 'foreign' },
  { code: '062', name: '중국공상은행(ICBC)', mark: 'ICBC', color: '#C8102E', fg: W, group: 'foreign' },
  { code: '063', name: '중국은행(BOC)', mark: 'BOC', color: '#B81C22', fg: W, group: 'foreign' },
  { code: '067', name: '중국건설은행(CCB)', mark: 'CCB', color: '#0066B3', fg: W, group: 'foreign' },
];

export const bankByName = (name: string | null | undefined): Bank | undefined =>
  BANKS.find((b) => b.name === name);
