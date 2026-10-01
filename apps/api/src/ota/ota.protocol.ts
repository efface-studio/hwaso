import { createHash, createSign, randomBytes } from 'node:crypto';
import type { OtaAsset } from '@shop/shared';

/**
 * Expo Updates 프로토콜 v1 의 순수 함수들 (https://docs.expo.dev/technical-specs/expo-updates-1/).
 * DB·HTTP 와 무관하게 테스트한다 (ota.protocol.test.ts).
 */

/** 파일 내용 → 매니페스트 에셋 식별자. hash: sha256 base64url(패딩 없음), key: md5 hex */
export function assetDigests(body: Buffer): { hash: string; key: string; sha256Hex: string } {
  const sha = createHash('sha256').update(body).digest();
  return {
    hash: sha.toString('base64url'),
    key: createHash('md5').update(body).digest('hex'),
    sha256Hex: sha.toString('hex'),
  };
}

/**
 * 점진 배포 대상 여부. 같은 업데이트·같은 기기는 항상 같은 결과가 나오도록 해시로 고른다.
 * 기기 ID(eas-client-id)가 없으면 100% 배포만 받는다.
 */
export function inRollout(updateId: string, percent: number, clientId?: string): boolean {
  if (percent >= 100) return true;
  if (!clientId) return false;
  const bucket = createHash('sha256').update(`${updateId}:${clientId}`).digest().readUInt32BE(0) % 100;
  return bucket < percent;
}

export interface ManifestSource {
  id: string;
  createdAt: Date;
  runtimeVersion: string;
  critical: boolean;
  launchAsset: OtaAsset;
  assets: OtaAsset[];
  expoClient: Record<string, unknown> | null;
}

/** 매니페스트 JSON. launchAsset 에는 fileExtension 을 넣지 않는다 */
export function buildManifest(src: ManifestSource) {
  const { hash, key, contentType, url } = src.launchAsset;
  return {
    id: src.id,
    createdAt: src.createdAt.toISOString(),
    runtimeVersion: src.runtimeVersion,
    launchAsset: { hash, key, contentType, url },
    assets: src.assets.map((a) => ({
      hash: a.hash,
      key: a.key,
      contentType: a.contentType,
      fileExtension: a.fileExtension,
      url: a.url,
    })),
    metadata: {},
    extra: { expoClient: src.expoClient ?? {}, critical: src.critical },
  };
}

/** 내장 번들로 되돌리기 지시 */
export const rollBackDirective = (commitTime: Date) => ({
  type: 'rollBackToEmbedded',
  parameters: { commitTime: commitTime.toISOString() },
});

/** expo-signature 헤더 값 (구조화 필드 딕셔너리). 서명: RSA-SHA256 PKCS#1 v1.5, base64 */
export function signPart(body: string, privateKeyPem: string, keyId: string): string {
  const sig = createSign('RSA-SHA256').update(body, 'utf8').sign(privateKeyPem, 'base64');
  return `sig="${sig}", keyid="${keyId}"`;
}

export interface MultipartPart {
  name: 'manifest' | 'directive' | 'extensions';
  body: string;
  /** expo-signature 헤더 값 */
  signature?: string;
}

export const newBoundary = () => `ota-${randomBytes(16).toString('hex')}`;

/** RFC 2046 multipart/mixed 본문. 줄바꿈은 CRLF, 구분자 앞 CRLF 는 구분자에 속한다 */
export function multipartBody(parts: MultipartPart[], boundary: string): string {
  const chunks = parts.map((p) => {
    const headers = [
      `content-disposition: form-data; name="${p.name}"`,
      'content-type: application/json; charset=utf-8',
      ...(p.signature ? [`expo-signature: ${p.signature}`] : []),
    ];
    return `--${boundary}\r\n${headers.join('\r\n')}\r\n\r\n${p.body}\r\n`;
  });
  return `${chunks.join('')}--${boundary}--\r\n`;
}
