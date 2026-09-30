import i18n from './index';

/** 공용 스키마(@shop/shared)의 한국어 오류 문구 → 지금 언어의 문구. 모르는 문구는 그대로 돌려준다 */
const SCHEMA_MESSAGE = {
  '계좌번호를 확인해주세요.': 'accountNumber',
  '은행을 선택해주세요.': 'bank',
  '사유를 입력해주세요.': 'reason',
  '사유를 5자 이상 입력해주세요.': 'reasonMin',
  '사진을 1장 이상 올려주세요.': 'photos',
  '상품명은 2자 이상 입력해주세요.': 'titleMin',
  '판매 가격을 입력해주세요.': 'price',
  '예약 판매 시작일을 입력해주세요.': 'reserveStart',
  '시작가는 1,000원 이상이어야 합니다.': 'startPrice',
  '입찰 단위는 100원 이상이어야 합니다.': 'bidIncrement',
  '종료 시간은 시작 시간 이후여야 합니다.': 'endAfterStart',
  '즉시 구매가는 시작가보다 높아야 합니다.': 'buyNowAboveStart',
} as const;

export function schemaMessage(message: string): string {
  const key = SCHEMA_MESSAGE[message as keyof typeof SCHEMA_MESSAGE];
  return key ? i18n.t(`common:validation.${key}`) : message;
}
