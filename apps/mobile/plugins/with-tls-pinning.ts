import fs from 'node:fs';
import path from 'node:path';
import {
  withAndroidManifest,
  withDangerousMod,
  withInfoPlist,
  type ConfigPlugin,
  type IOSConfig,
} from 'expo/config-plugins';

type PlistObject = { [key: string]: IOSConfig.InfoPlist[string] };

/**
 * TLS 인증서 고정 (네이티브 설정이라 OTA 로 바꿀 수 없다 — 바꾸려면 새 바이너리).
 * CA 의 공개키(SPKI) SHA-256 을 고정한다: 인증서가 갱신돼도 같은 CA 에서 발급되면 그대로 통과한다.
 * - iOS: Info.plist NSAppTransportSecurity.NSPinnedDomains (NSPinnedCAIdentities — 체인의 CA 중 하나와 맞으면 통과)
 * - Android: res/xml/network_security_config.xml 의 <pin-set> (expiration 이 지나면 고정을 풀어 앱이 멈추지 않게 한다)
 *   디버그 빌드는 Metro(LAN IP, http) 연결 때문에 평문 통신을 허용하는 설정을 debug 소스셋에 따로 둔다.
 */
export type TlsPinningOptions = {
  /** 고정할 도메인 (하위 도메인 포함). localhost·IP 는 건너뛴다 */
  domains: string[];
  /** CA 공개키 SHA-256 (base64) */
  spkiSha256: string[];
  /** Android pin-set 만료일 YYYY-MM-DD */
  expiration: string;
};

const RESOURCE_NAME = 'network_security_config';
/** 로컬 개발 서버 — 릴리스는 쓰지 않지만 막을 이유도 없다 */
const LOCAL_CLEARTEXT_HOSTS = ['localhost', '127.0.0.1', '10.0.2.2'];

function isIpOrLocal(host: string): boolean {
  return host === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
}

/** 다른 도메인의 하위 도메인이면 뺀다 (includeSubdomains 로 이미 덮인다) */
function normalizeDomains(domains: string[]): string[] {
  const hosts = [...new Set(domains.map((d) => d.trim().toLowerCase()).filter((d) => d && !isIpOrLocal(d)))];
  return hosts.filter((h) => !hosts.some((other) => other !== h && h.endsWith(`.${other}`))).sort();
}

function validate(options: TlsPinningOptions): { domains: string[]; pins: string[] } {
  const domains = normalizeDomains(options.domains);
  const pins = [...new Set(options.spkiSha256)];
  for (const pin of pins) {
    if (!/^[A-Za-z0-9+/]{43}=$/.test(pin)) {
      throw new Error(`with-tls-pinning: SPKI SHA-256 base64 가 아니에요 (${pin})`);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.expiration)) {
    throw new Error(`with-tls-pinning: expiration 은 YYYY-MM-DD 형식이어야 해요 (${options.expiration})`);
  }
  // Android 는 백업 핀(2개 이상)을 권장한다. 하나만 두면 CA 교체 때 앱이 통신하지 못한다
  if (domains.length && pins.length < 2) {
    throw new Error('with-tls-pinning: 백업을 위해 SPKI 핀을 2개 이상 넣어 주세요.');
  }
  return { domains, pins };
}

function networkSecurityConfigXml(
  domains: string[],
  pins: string[],
  expiration: string,
  allowCleartext: boolean,
): string {
  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<!-- plugins/with-tls-pinning.ts 가 만든다 (직접 수정 금지) -->',
    '<network-security-config>',
    `  <base-config cleartextTrafficPermitted="${allowCleartext}">`,
    '    <trust-anchors>',
    '      <certificates src="system" />',
    '    </trust-anchors>',
    '  </base-config>',
    '  <domain-config cleartextTrafficPermitted="true">',
    ...LOCAL_CLEARTEXT_HOSTS.map((h) => `    <domain includeSubdomains="false">${h}</domain>`),
    '  </domain-config>',
  ];
  if (domains.length) {
    lines.push(
      '  <domain-config cleartextTrafficPermitted="false">',
      ...domains.map((d) => `    <domain includeSubdomains="true">${d}</domain>`),
      `    <pin-set expiration="${expiration}">`,
      ...pins.map((p) => `      <pin digest="SHA-256">${p}</pin>`),
      '    </pin-set>',
      '  </domain-config>',
    );
  }
  lines.push('</network-security-config>', '');
  return lines.join('\n');
}

const withTlsPinning: ConfigPlugin<TlsPinningOptions> = (config, options) => {
  const { domains, pins } = validate(options);

  config = withInfoPlist(config, (c) => {
    const current = c.modResults.NSAppTransportSecurity;
    // 기존 ATS 설정(NSAllowsLocalNetworking 등)은 그대로 두고 NSPinnedDomains 만 바꾼다
    const ats: PlistObject =
      current && typeof current === 'object' && !Array.isArray(current) ? { ...current } : {};
    const pinned: PlistObject = {};
    for (const domain of domains) {
      pinned[domain] = {
        NSIncludesSubdomains: true,
        NSPinnedCAIdentities: pins.map((pin) => ({ 'SPKI-SHA256-BASE64': pin })),
      };
    }
    if (domains.length) ats.NSPinnedDomains = pinned;
    else delete ats.NSPinnedDomains;
    c.modResults.NSAppTransportSecurity = ats;
    return c;
  });

  config = withAndroidManifest(config, (c) => {
    const app = c.modResults.manifest.application?.[0];
    if (!app) throw new Error('with-tls-pinning: AndroidManifest 에 <application> 이 없어요.');
    app.$['android:networkSecurityConfig'] = `@xml/${RESOURCE_NAME}`;
    return c;
  });

  return withDangerousMod(config, [
    'android',
    (c) => {
      const appDir = path.join(c.modRequest.platformProjectRoot, 'app', 'src');
      const write = (sourceSet: 'main' | 'debug', allowCleartext: boolean) => {
        const dir = path.join(appDir, sourceSet, 'res', 'xml');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
          path.join(dir, `${RESOURCE_NAME}.xml`),
          networkSecurityConfigXml(domains, pins, options.expiration, allowCleartext),
        );
      };
      write('main', false);
      write('debug', true);
      return c;
    },
  ]);
};

export default withTlsPinning;
