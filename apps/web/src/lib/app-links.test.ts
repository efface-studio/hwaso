import { describe, expect, it } from 'vitest';
import { appleAppSiteAssociation, assetLinks } from './app-links';

describe('apple-app-site-association', () => {
  it('is absent until the Apple team id is configured', () => {
    expect(appleAppSiteAssociation({})).toBeNull();
  });

  it('opens only screens the app has, never the app bridge or auth pages', () => {
    const aasa = appleAppSiteAssociation({ APPLE_TEAM_ID: 'ABCDE12345' })!;
    const detail = aasa.applinks.details[0]!;
    expect(detail.appIDs).toEqual(['ABCDE12345.dev.efface.hwaso']);
    const paths = detail.components.map((c) => c['/']);
    expect(paths).toContain('/products/*');
    expect(paths).toContain('/auctions/*');
    const excluded = detail.components.filter((c) => c.exclude).map((c) => c['/']);
    expect(excluded).toEqual(expect.arrayContaining(['/app-bridge/*', '/auth/*']));
    // 제외 규칙이 먼저 와야 한다 (위에서부터 첫 일치)
    expect(detail.components.findIndex((c) => c.exclude)).toBe(0);
  });
});

describe('assetlinks.json', () => {
  it('is absent until a signing fingerprint is configured', () => {
    expect(assetLinks({})).toBeNull();
  });

  it('lists every configured fingerprint for the app package', () => {
    const links = assetLinks({ ANDROID_CERT_SHA256: 'AA:BB, CC:DD ', APP_BUNDLE_ID: 'kr.hwaso.app' })!;
    expect(links[0]!.target).toEqual({
      namespace: 'android_app',
      package_name: 'kr.hwaso.app',
      sha256_cert_fingerprints: ['AA:BB', 'CC:DD'],
    });
  });
});
