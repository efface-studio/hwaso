import { AndroidConfig, withAndroidManifest, withInfoPlist, type ConfigPlugin } from 'expo/config-plugins';

/**
 * modules/device-integrity 가 동작하는 데 필요한 네이티브 설정.
 * - iOS: 탈옥 스토어 URL 스킴을 canOpenURL 로 확인할 수 있게 LSApplicationQueriesSchemes 에 추가
 * - Android: 루팅 관리 앱 패키지를 볼 수 있게 <queries> 추가 (Android 11+ 패키지 가시성),
 *   서명 인증서 허용 목록을 <application> meta-data 로 넣는다 (비어 있으면 변조 검사를 하지 않는다)
 */
export type DeviceIntegrityPluginOptions = {
  /** 허용하는 서명 인증서 SHA-256 (콜론 있는 16진수 그대로 가능). Play 앱 서명 키·업로드 키 지문 */
  androidSigningCertSha256?: string[];
};

const IOS_JAILBREAK_SCHEMES = ['cydia', 'sileo', 'zbra', 'filza'];

/** DeviceIntegrityModule.kt ROOT_PACKAGES 와 같은 목록 */
const ANDROID_ROOT_PACKAGES = [
  'com.topjohnwu.magisk',
  'io.github.vvb2060.magisk',
  'me.weishu.kernelsu',
  'me.bmax.apatch',
  'eu.chainfire.supersu',
  'com.noshufou.android.su',
  'com.koushikdutta.superuser',
  'com.thirdparty.superuser',
  'com.yellowes.su',
];

/** DeviceIntegrityModule.kt SIGNING_CERT_META_KEY 와 같은 이름 */
const SIGNING_CERT_META_KEY = 'expo.modules.deviceintegrity.SIGNING_CERT_SHA256';

function normalizeSha256(value: string): string {
  const hex = value.replace(/[:\s]/g, '').toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(hex)) {
    throw new Error(`with-device-integrity: 올바른 SHA-256 지문이 아니에요 (${value})`);
  }
  return hex;
}

const withDeviceIntegrity: ConfigPlugin<DeviceIntegrityPluginOptions | void> = (config, options) => {
  const certs = (options?.androidSigningCertSha256 ?? []).map(normalizeSha256);

  config = withInfoPlist(config, (c) => {
    const current = Array.isArray(c.modResults.LSApplicationQueriesSchemes)
      ? c.modResults.LSApplicationQueriesSchemes
      : [];
    c.modResults.LSApplicationQueriesSchemes = [...new Set([...current, ...IOS_JAILBREAK_SCHEMES])];
    return c;
  });

  return withAndroidManifest(config, (c) => {
    const manifest = c.modResults.manifest;

    const queries = manifest.queries?.length ? manifest.queries : [{}];
    const first = queries[0]!;
    const existing = new Set((first.package ?? []).map((p) => p.$['android:name']));
    first.package = [
      ...(first.package ?? []),
      ...ANDROID_ROOT_PACKAGES.filter((name) => !existing.has(name)).map((name) => ({
        $: { 'android:name': name },
      })),
    ];
    manifest.queries = queries;

    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(c.modResults);
    if (certs.length) {
      AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, SIGNING_CERT_META_KEY, certs.join(','));
    } else {
      AndroidConfig.Manifest.removeMetaDataItemFromMainApplication(app, SIGNING_CERT_META_KEY);
    }
    return c;
  });
};

export default withDeviceIntegrity;
