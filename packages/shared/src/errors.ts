/** API 에러 코드. 서버는 이 코드와 사용자용 한국어 메시지를 함께 보낸다 (docs/API.md). */
export const ERROR_MESSAGES = {
  VALIDATION_FAILED: '입력값을 확인해주세요.',
  UNAUTHORIZED: '로그인이 필요합니다.',
  FORBIDDEN: '권한이 없습니다.',
  NOT_FOUND: '요청한 정보를 찾을 수 없습니다.',
  CONFLICT: '이미 처리되었거나 현재 상태에서 할 수 없는 요청입니다.',
  RATE_LIMITED: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
  INTERNAL: '잠시 문제가 발생했습니다. 다시 시도해주세요.',

  INVALID_CREDENTIALS: '이메일 또는 비밀번호가 올바르지 않습니다.',
  ACCOUNT_LOCKED: '로그인 시도가 많아 잠시 잠겼습니다. 15분 후 다시 시도해주세요.',
  ACCOUNT_RESTRICTED: '이용이 제한된 계정입니다. 고객센터에 문의해주세요.',
  ACCOUNT_EXISTS: '이미 이 이메일로 가입된 계정이 있습니다. 이메일로 로그인한 뒤 설정에서 연결해주세요.',
  EMAIL_NOT_VERIFIED: '이메일 인증 후 이용할 수 있습니다.',
  INVALID_CODE: '인증번호가 올바르지 않습니다.',
  CODE_EXPIRED: '인증번호가 만료되었습니다. 다시 요청해주세요.',
  CODE_ATTEMPTS_EXCEEDED: '인증 시도 횟수를 초과했습니다. 인증번호를 다시 요청해주세요.',
  INVALID_TOKEN: '인증 정보가 만료되었습니다. 다시 로그인해주세요.',
  NICKNAME_TAKEN: '이미 사용 중인 닉네임입니다.',
  PROVIDER_NOT_CONFIGURED: '현재 사용할 수 없는 로그인 방식입니다.',
  SOCIAL_ALREADY_LINKED: '이미 다른 계정에 연결된 소셜 계정입니다.',
  LAST_LOGIN_METHOD: '마지막 로그인 수단은 해제할 수 없습니다. 비밀번호를 먼저 설정해주세요.',
  IDENTITY_REQUIRED: '본인인증 후 이용할 수 있습니다.',
  IDENTITY_ALREADY_USED: '이미 다른 계정에서 본인인증에 사용된 명의입니다.',
  IDENTITY_FAILED: '본인인증에 실패했습니다. 다시 시도해주세요.',
  ACCOUNT_HAS_ACTIVE_TRADES:
    '진행 중인 거래나 경매가 있어 탈퇴할 수 없습니다. 거래를 마친 뒤 다시 시도해주세요.',

  SELLER_REQUIRED: '판매자 등록 후 이용할 수 있습니다.',
  PRODUCT_NOT_EDITABLE: '현재 상태에서는 상품 정보를 수정할 수 없습니다.',
  PRODUCT_IN_USE: '진행 중인 주문이나 경매가 있어 처리할 수 없습니다.',
  OUT_OF_STOCK: '품절된 상품입니다.',
  INVALID_IMAGE: '지원하지 않는 이미지입니다. JPG, PNG, WebP, HEIC 파일을 올려주세요.',
  IMAGE_TOO_LARGE: '이미지 용량은 20MB 이하여야 합니다.',

  AUCTION_NOT_LIVE: '진행 중인 경매가 아닙니다.',
  AUCTION_ENDED: '경매가 종료되었습니다.',
  AUCTION_BUSY: '입찰이 몰리고 있습니다. 잠시 후 다시 시도해주세요.',
  BID_TOO_LOW: '입찰가가 최소 입찰가보다 낮습니다.',
  BID_NOT_ALIGNED: '입찰 단위에 맞는 금액을 입력해주세요.',
  BID_TOO_HIGH: '입찰가가 너무 높습니다. 금액을 다시 확인해주세요.',
  BID_EXCEEDS_BUY_NOW: '즉시 구매가 이상입니다. 즉시 구매를 이용해주세요.',
  SELF_BID: '본인 상품에는 입찰할 수 없습니다.',
  ALREADY_HIGHEST: '이미 최고 입찰자입니다.',
  BUY_NOW_UNAVAILABLE: '즉시 구매를 할 수 없는 경매입니다.',
  INVALID_TRANSITION: '현재 상태에서 할 수 없는 요청입니다.',

  PAYMENT_AMOUNT_MISMATCH: '결제 금액이 주문 금액과 다릅니다. 결제가 취소되었습니다.',
  PAYMENT_FAILED: '결제에 실패했습니다. 다시 시도해주세요.',
  COUPON_INVALID: '사용할 수 없는 쿠폰입니다.',
} as const;

export type ErrorCode = keyof typeof ERROR_MESSAGES;

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; details?: Record<string, unknown> };
}
