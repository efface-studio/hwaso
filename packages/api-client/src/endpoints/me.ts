import type { IntegrityReportInput, Page, SecurityEventDto } from '@shop/shared';
import type { Http } from '../http';

/** 내 계정 보안 */
export const meApi = (http: Http) => ({
  /** 보안 기록 (최신순, 30개씩) */
  securityEvents: (cursor?: string) => http.get<Page<SecurityEventDto>>('/me/security/events', { cursor }),
  /** 기기 무결성 신호 신고 (경고만 남고 이용은 막지 않는다) */
  reportIntegrity: (body: IntegrityReportInput) => http.post<void>('/me/security/integrity', body),
});
