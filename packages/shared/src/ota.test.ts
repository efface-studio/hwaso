import { describe, expect, it } from 'vitest';
import { otaPatchSchema, otaPublishSchema, otaRollbackSchema } from './ota';

const asset = {
  hash: 'n4bQgYhMfWWaL-qgxVrQFaO_TxsrC4Is0V1sFbDwCgg',
  key: '5d41402abc4b2a76b9719d911017c592',
  contentType: 'application/javascript',
  fileExtension: '',
  url: 'https://cdn.hwaso.kr/ota/abc',
};

describe('ota schemas', () => {
  it('fills publish defaults', () => {
    const v = otaPublishSchema.parse({
      platform: 'ios',
      runtimeVersion: '1.0.0',
      launchAsset: asset,
      assets: [],
    });
    expect(v).toMatchObject({ channel: 'production', message: '', critical: false, rolloutPercent: 100 });
  });

  it('rejects padded hashes, uppercase md5, bad channels and unknown fields', () => {
    const base = { platform: 'ios', runtimeVersion: '1', launchAsset: asset, assets: [] };
    expect(
      otaPublishSchema.safeParse({ ...base, launchAsset: { ...asset, hash: `${asset.hash}=` } }).success,
    ).toBe(false);
    expect(
      otaPublishSchema.safeParse({ ...base, launchAsset: { ...asset, key: asset.key.toUpperCase() } })
        .success,
    ).toBe(false);
    expect(otaPublishSchema.safeParse({ ...base, channel: 'Prod' }).success).toBe(false);
    expect(otaPublishSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
    expect(otaPublishSchema.safeParse({ ...base, platform: 'web' }).success).toBe(false);
  });

  it('patch and rollback bounds', () => {
    expect(otaPatchSchema.safeParse({ rolloutPercent: 0 }).success).toBe(false);
    expect(otaPatchSchema.safeParse({ rolloutPercent: 100, status: 'ROLLED_BACK' }).success).toBe(true);
    expect(
      otaRollbackSchema.parse({ platform: 'android', runtimeVersion: '1', target: 'embedded' }).channel,
    ).toBe('production');
    expect(
      otaRollbackSchema.safeParse({ platform: 'android', runtimeVersion: '1', target: 'x' }).success,
    ).toBe(false);
  });
});
