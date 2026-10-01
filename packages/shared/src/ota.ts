import './zod-config';
import { z } from 'zod';

// ───── 자체 호스팅 OTA (Expo Updates 프로토콜 v1) — docs/MOBILE_RELEASE.md "OTA 업데이트" ─────

export const OTA_PLATFORMS = ['ios', 'android'] as const;
export type OtaPlatform = (typeof OTA_PLATFORMS)[number];

const otaChannel = z.string().regex(/^[a-z0-9-]{1,40}$/);

/** 번들·에셋 한 개. hash 는 sha256 base64url(패딩 없음), key 는 md5 hex */
export const otaAssetSchema = z.strictObject({
  hash: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  key: z.string().regex(/^[a-f0-9]{32}$/),
  contentType: z.string().min(1).max(100),
  /** ".png" 형태. 번들은 "" 도 허용 */
  fileExtension: z.string().max(16),
  url: z.string().url(),
});
export type OtaAsset = z.infer<typeof otaAssetSchema>;

/** 배포 스크립트가 올리는 업데이트 */
export const otaPublishSchema = z.strictObject({
  platform: z.enum(OTA_PLATFORMS),
  runtimeVersion: z.string().min(1).max(200),
  channel: otaChannel.default('production'),
  message: z.string().max(200).default(''),
  critical: z.boolean().default(false),
  rolloutPercent: z.number().int().min(1).max(100).default(100),
  launchAsset: otaAssetSchema,
  assets: z.array(otaAssetSchema).max(2000),
  expoClient: z.record(z.string(), z.unknown()).optional(),
});
export type OtaPublishInput = z.infer<typeof otaPublishSchema>;

/** 관리자: 점진 배포 비율 조정 · 배포 중단 */
export const otaPatchSchema = z.strictObject({
  rolloutPercent: z.number().int().min(1).max(100).optional(),
  status: z.enum(['ACTIVE', 'ROLLED_BACK']).optional(),
});
export type OtaPatchInput = z.infer<typeof otaPatchSchema>;

/** 관리자: 직전 업데이트 또는 앱 내장 번들로 되돌리기 */
export const otaRollbackSchema = z.strictObject({
  platform: z.enum(OTA_PLATFORMS),
  runtimeVersion: z.string().min(1).max(200),
  channel: otaChannel.default('production'),
  target: z.enum(['previous', 'embedded']),
});
export type OtaRollbackInput = z.infer<typeof otaRollbackSchema>;

export const otaListQuery = z.object({
  platform: z.enum(OTA_PLATFORMS).optional(),
  channel: otaChannel.optional(),
});
export type OtaListQuery = z.infer<typeof otaListQuery>;

export interface OtaUpdateDto {
  id: string;
  platform: OtaPlatform;
  runtimeVersion: string;
  channel: string;
  kind: 'UPDATE' | 'ROLLBACK';
  message: string;
  critical: boolean;
  rolloutPercent: number;
  status: 'ACTIVE' | 'ROLLED_BACK';
  assetCount: number;
  createdAt: string;
}
