import { createHash, createVerify, generateKeyPairSync } from 'node:crypto';
import {
  assetDigests,
  buildManifest,
  inRollout,
  multipartBody,
  rollBackDirective,
  signPart,
} from './ota.protocol';

const asset = (n: number, ext = '.png') => ({
  hash: 'A'.repeat(43),
  key: n.toString(16).padStart(32, '0'),
  contentType: 'image/png',
  fileExtension: ext,
  url: `https://cdn.test/ota/${n}${ext}`,
});

describe('assetDigests', () => {
  it('sha256 base64url(패딩 없음)과 md5 hex', () => {
    const body = Buffer.from('hello');
    const d = assetDigests(body);
    expect(d.hash).toBe(createHash('sha256').update(body).digest('base64url'));
    expect(d.hash).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(d.key).toBe('5d41402abc4b2a76b9719d911017c592');
    expect(d.sha256Hex).toHaveLength(64);
  });
});

describe('inRollout', () => {
  it('100% 는 기기 ID 없이도 받는다', () => {
    expect(inRollout('u1', 100)).toBe(true);
    expect(inRollout('u1', 50)).toBe(false);
  });

  it('같은 업데이트·기기는 항상 같은 결과이고, 비율만큼 나뉜다', () => {
    const clients = Array.from({ length: 2000 }, (_, i) => `client-${i}`);
    const picked = clients.filter((c) => inRollout('update-a', 30, c));
    expect(picked.every((c) => inRollout('update-a', 30, c))).toBe(true);
    expect(picked.length / clients.length).toBeGreaterThan(0.25);
    expect(picked.length / clients.length).toBeLessThan(0.35);
    // 비율을 올리면 기존 대상은 그대로 포함된다
    expect(picked.every((c) => inRollout('update-a', 60, c))).toBe(true);
  });
});

describe('buildManifest', () => {
  it('launchAsset 은 fileExtension 없이, extra 에 expoClient·critical', () => {
    const m = buildManifest({
      id: 'id-1',
      createdAt: new Date('2026-09-30T00:00:00Z'),
      runtimeVersion: '1.0.0',
      critical: true,
      launchAsset: asset(1, ''),
      assets: [asset(2)],
      expoClient: null,
    });
    expect(m.launchAsset).not.toHaveProperty('fileExtension');
    expect(m.assets[0]).toMatchObject({ fileExtension: '.png' });
    expect(m).toMatchObject({
      id: 'id-1',
      createdAt: '2026-09-30T00:00:00.000Z',
      metadata: {},
      extra: { expoClient: {}, critical: true },
    });
  });

  it('되돌리기 지시', () => {
    expect(rollBackDirective(new Date('2026-09-30T00:00:00Z'))).toEqual({
      type: 'rollBackToEmbedded',
      parameters: { commitTime: '2026-09-30T00:00:00.000Z' },
    });
  });
});

describe('signPart / multipartBody', () => {
  it('RSA-SHA256 서명이 공개 키로 검증된다', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const body = JSON.stringify({ a: '한글' });
    const header = signPart(body, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), 'main');
    const m = header.match(/^sig="([^"]+)", keyid="main"$/);
    expect(m).not.toBeNull();
    expect(createVerify('RSA-SHA256').update(body, 'utf8').verify(publicKey, m![1]!, 'base64')).toBe(true);
  });

  it('RFC 2046 형식 (CRLF, 닫는 구분자)', () => {
    const out = multipartBody(
      [
        { name: 'manifest', body: '{"a":1}', signature: 'sig="x", keyid="main"' },
        { name: 'extensions', body: '{}' },
      ],
      'b1',
    );
    expect(out).toBe(
      '--b1\r\n' +
        'content-disposition: form-data; name="manifest"\r\n' +
        'content-type: application/json; charset=utf-8\r\n' +
        'expo-signature: sig="x", keyid="main"\r\n' +
        '\r\n' +
        '{"a":1}\r\n' +
        '--b1\r\n' +
        'content-disposition: form-data; name="extensions"\r\n' +
        'content-type: application/json; charset=utf-8\r\n' +
        '\r\n' +
        '{}\r\n' +
        '--b1--\r\n',
    );
  });
});
