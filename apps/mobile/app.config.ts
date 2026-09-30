import type { ExpoConfig } from 'expo/config';
import { withAppDelegate, withInfoPlist, type ConfigPlugin } from 'expo/config-plugins';

/**
 * 앱 설정. 환경마다 달라지는 값은 EXPO_PUBLIC_* / 빌드 환경 변수로 넣는다 (eas.json 프로필).
 * 권한 문구는 App Store·Play 심사에서 그대로 보이므로 사용 목적을 구체적으로 적는다.
 */
const APP_LINK_HOST = process.env.APP_LINK_HOST ?? 'hwaso.kr';
const PRIMARY = '#2F7A58';

/** URL 환경 변수에서 호스트만 뽑는다 (없거나 잘못된 값이면 건너뛴다) */
function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * TLS 인증서 고정 대상 (하위 도메인 포함). 운영(hwaso.kr)·개발 서버(hwaso.efface.dev)는 항상 넣고,
 * 빌드 환경의 API·미디어·웹 주소 호스트를 더한다. localhost·IP 는 플러그인이 뺀다.
 */
const PINNED_DOMAINS = [
  'hwaso.kr',
  'hwaso.efface.dev',
  APP_LINK_HOST,
  hostOf(process.env.EXPO_PUBLIC_API_URL),
  hostOf(process.env.EXPO_PUBLIC_WS_URL),
  hostOf(process.env.EXPO_PUBLIC_MEDIA_URL),
  hostOf(process.env.EXPO_PUBLIC_WEB_URL),
].filter((h): h is string => !!h);

/**
 * 고정할 CA 공개키 (SPKI SHA-256, base64). Cloudflare 가 발급에 쓰는 CA 들이라 인증서가 갱신·교체돼도 통과한다.
 * 루트는 macOS SystemRootCertificates 에서, Root YE·YE2 는 hwaso.efface.dev 실제 체인에서 계산했다 (2026-09-30).
 * 계산: openssl x509 -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64
 * 바꾸려면 새 바이너리가 필요하다 (OTA 불가). Android 는 TLS_PIN_EXPIRATION 이 지나면 고정을 풀어 통신이 끊기지 않게 한다.
 */
const TLS_PINS = [
  // Let's Encrypt
  'C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=', // ISRG Root X1
  'diGVwiVYbubAI3RW4hB9xU8e/CH2GnkuvVFZE8zmgzI=', // ISRG Root X2
  'sCkq5UWXjg+7mKu9lMhhYF5bGLsy7VI/UNW3tccdR7w=', // ISRG Root YE (X2 교차 서명, 현재 체인)
  's/tdAOmUzd8syaTuqfgGvFcn6DzA5Cmb+Vby1ST+U3Y=', // Let's Encrypt YE2 (현재 중간 인증서 — 루트가 이미 덮지만 체인 확인용)
  // Google Trust Services
  'hxqRlPTu1bMS/0DITB1SSu0vd4u/8l8TjPgfaAp63Gc=', // GTS Root R1
  'Vfd95BwDeSQo+NUYxVEEIlvkOlWY2SalKK1lPhzOx78=', // GTS Root R2
  'QXnt2YHvdHR3tJYmQIr0Paosp6t/nggsEGD4QJZ3Q0g=', // GTS Root R3
  'mEflZT5enoR1FuXLgYYGqnVEoZvmf9c2bVBpiOjYQ0c=', // GTS Root R4
  'K87oWBWM9UZfyddvDfoxL+8lpNyoUB2ptGtn0fv6G2Q=', // GlobalSign Root CA (GTS R1·R4 교차 서명, 2028-01-28 만료)
  // SSL.com
  '0cRTd+vc1hjNFlHcLgLCHXUeWqn80bNDH/bs9qMTSPo=', // SSL.com Root Certification Authority RSA
  'oyD01TTXvpfBro3QSZc1vIlcMjrdLTiL/M9mLCPX+Zo=', // SSL.com Root Certification Authority ECC
  'K89VOmb1cJAN3TK6bf4ezAbJGC1mLcG2Dh97dnwr3VQ=', // SSL.com TLS RSA Root CA 2022
  'G/ANXI8TwJTdF+AFBM8IiIUPEv0Gf6H5LA/b9guG4yE=', // SSL.com TLS ECC Root CA 2022
];
const TLS_PIN_EXPIRATION = '2027-12-31';

/**
 * Android 서명 인증서 SHA-256 허용 목록 (쉼표 구분, 콜론 포함 가능). 비어 있으면 변조 검사를 하지 않는다.
 * Play 앱 서명을 쓰면 Play Console > 앱 무결성 의 "앱 서명 키 인증서" 지문을 넣는다 (eas.json env).
 */
const ANDROID_SIGNING_CERT_SHA256 = String(process.env.ANDROID_SIGNING_CERT_SHA256 ?? '')
  .split(',')
  .map((s: string) => s.trim())
  .filter(Boolean);

const config: ExpoConfig = {
  name: '화소',
  slug: 'hwaso',
  scheme: 'hwaso',
  version: '1.0.0',
  orientation: 'default',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  backgroundColor: '#FFFFFF',
  primaryColor: PRIMARY,
  ios: {
    bundleIdentifier: 'dev.efface.hwaso',
    buildNumber: '1',
    supportsTablet: true,
    usesAppleSignIn: true,
    associatedDomains: [`applinks:${APP_LINK_HOST}`],
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      NSCameraUsageDescription: '판매할 작품이나 채팅으로 보낼 사진을 촬영하려면 카메라 접근이 필요해요.',
      NSPhotoLibraryUsageDescription:
        '판매할 작품 사진과 채팅 사진을 앨범에서 고르려면 사진 접근이 필요해요.',
      NSFaceIDUsageDescription:
        '앱 잠금 해제와 결제·계좌 변경 같은 중요한 작업을 확인할 때 Face ID 를 사용해요.',
      CFBundleAllowMixedLocalizations: true,
    },
  },
  android: {
    package: 'dev.efface.hwaso',
    versionCode: 1,
    // 토큰·설정이 adb backup·클라우드 백업으로 다른 기기에 옮겨지지 않게 한다
    allowBackup: false,
    adaptiveIcon: {
      backgroundImage: './assets/android-icon-background.png',
      foregroundImage: './assets/android-icon-foreground.png',
      monochromeImage: './assets/android-icon-monochrome.png',
      backgroundColor: '#16B364',
    },
    predictiveBackGestureEnabled: true,
    permissions: [
      'android.permission.CAMERA',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.USE_BIOMETRIC',
    ],
    blockedPermissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.ACCESS_FINE_LOCATION',
      // expo-screen-capture 의 스크린샷 감지용 권한 — 쓰지 않는다 (캡처 차단만 쓴다)
      'android.permission.READ_MEDIA_IMAGES',
    ],
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'https', host: APP_LINK_HOST }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  web: { favicon: './assets/favicon.png', bundler: 'metro', output: 'single' },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        // 타일 없는 마크 (웹 헤더와 같은 원본). 앱 아이콘 타일을 그대로 쓰면 배경 위에 상자로 보인다
        image: './assets/splash-icon.png',
        imageWidth: 160,
        backgroundColor: '#FFFFFF',
        dark: { image: './assets/splash-icon-dark.png', backgroundColor: '#0A0A0B' },
      },
    ],
    'expo-secure-store',
    'expo-image',
    'expo-font',
    'expo-web-browser',
    'expo-apple-authentication',
    [
      'expo-image-picker',
      {
        photosPermission: '판매할 작품 사진과 채팅 사진을 앨범에서 고르려면 사진 접근이 필요해요.',
        cameraPermission: '판매할 작품이나 채팅으로 보낼 사진을 촬영하려면 카메라 접근이 필요해요.',
        microphonePermission: false,
      },
    ],
    ['expo-notifications', { color: PRIMARY }],
    // 앱이 지원하는 언어 (iOS 설정 > 앱 > 언어 에서 앱별로 고를 수 있다)
    ['expo-localization', { supportedLocales: ['ko', 'en', 'ja', 'zh-Hans', 'zh-Hant'] }],
    [
      'expo-local-authentication',
      { faceIDPermission: '앱 잠금 해제와 결제·계좌 변경 같은 중요한 작업을 확인할 때 Face ID 를 사용해요.' },
    ],
    [
      './plugins/with-tls-pinning',
      { domains: PINNED_DOMAINS, spkiSha256: TLS_PINS, expiration: TLS_PIN_EXPIRATION },
    ],
    ['./plugins/with-device-integrity', { androidSigningCertSha256: ANDROID_SIGNING_CERT_SHA256 }],
  ],
  experiments: { typedRoutes: true },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
};

/**
 * iOS 27 부터 UIScene 생명주기를 쓰지 않는 앱은 실행 직후 UIKit 이 중단시킨다 (실기기에서 앱이 바로 꺼짐).
 * Expo 가 제공하는 ExpoAppSceneDelegate 로 창을 만들고 React Native 를 시작하도록 바꾼다.
 * - Info.plist: 씬 매니페스트 (창 하나, SceneDelegate)
 * - AppDelegate: ExpoReactNativeFactoryProvider 를 따르고, 창 생성·RN 시작은 씬 델리게이트에 맡긴다
 * - SceneDelegate: 앱 타깃 안의 하위 클래스로 둬 링크 단계에서 클래스가 빠지지 않게 한다
 */
const withSceneLifecycle: ConfigPlugin = (config) => {
  config = withInfoPlist(config, (c) => {
    c.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return c;
  });

  return withAppDelegate(config, (c) => {
    if (c.modResults.language !== 'swift')
      throw new Error('with-scene-lifecycle: Swift AppDelegate 만 지원해요.');
    let src = c.modResults.contents;
    if (src.includes('class SceneDelegate')) return c;

    const start =
      /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/;
    if (!start.test(src) || !src.includes('class AppDelegate: ExpoAppDelegate {'))
      throw new Error('with-scene-lifecycle: AppDelegate 템플릿이 예상과 달라요. 플러그인을 확인해 주세요.');

    src = src
      .replace(
        'class AppDelegate: ExpoAppDelegate {',
        'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {',
      )
      .replace(
        start,
        '\n    // 창 생성과 React Native 시작은 SceneDelegate(ExpoAppSceneDelegate)가 한다 (iOS 27 씬 생명주기)\n',
      )
      .concat(
        '\n/// iOS 27 씬 생명주기 — Expo 기본 구현을 그대로 쓴다 (Info.plist 의 UISceneDelegateClassName)\nclass SceneDelegate: ExpoAppSceneDelegate {}\n',
      );
    c.modResults.contents = src;
    return c;
  });
};

export default withSceneLifecycle(config);
