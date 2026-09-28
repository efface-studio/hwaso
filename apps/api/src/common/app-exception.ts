import { HttpException } from '@nestjs/common';
import { ERROR_MESSAGES, type ErrorCode } from '@shop/shared';

const STATUS: Partial<Record<ErrorCode, number>> = {
  VALIDATION_FAILED: 400,
  UNAUTHORIZED: 401,
  INVALID_TOKEN: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  DEMO_DISABLED: 403,
  SELF_BID: 403,
  SELLER_REQUIRED: 403,
  ACCOUNT_RESTRICTED: 403,
  EMAIL_NOT_VERIFIED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  NICKNAME_TAKEN: 409,
  ACCOUNT_EXISTS: 409,
  AUCTION_NOT_LIVE: 409,
  AUCTION_ENDED: 409,
  ALREADY_HIGHEST: 409,
  PRODUCT_IN_USE: 409,
  PRODUCT_NOT_EDITABLE: 409,
  OUT_OF_STOCK: 409,
  INVALID_TRANSITION: 409,
  BUY_NOW_UNAVAILABLE: 409,
  SELF_PURCHASE: 403,
  NOT_FOR_SALE: 409,
  COUPON_ALREADY_USED: 409,
  PAYMENT_EXPIRED: 409,
  PAYMENT_NOT_CONFIGURED: 503,
  REFUND_FAILED: 502,
  ACCOUNT_LOCKED: 423,
  RATE_LIMITED: 429,
  CHAT_TOO_FAST: 429,
  CHAT_DUPLICATE: 429,
  AUCTION_BUSY: 503,
  INTERNAL: 500,
};

/**
 * 도메인 에러. code 와 사용자에게 보여줄 한국어 메시지를 담는다.
 * 기본 상태 코드는 code 로 정해지며(없으면 400), 필요 시 덮어쓴다.
 */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message?: string,
    readonly details?: Record<string, unknown>,
    status?: number,
  ) {
    super(message ?? ERROR_MESSAGES[code], status ?? STATUS[code] ?? 400);
  }
}
