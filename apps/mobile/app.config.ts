import type { ExpoConfig } from 'expo/config';
import { withAppDelegate, withInfoPlist, type ConfigPlugin } from 'expo/config-plugins';

/**
 * 앱 설정. 환경마다 달라지는 값은 EXPO_PUBLIC_* / 빌드 환경 변수로 넣는다 (eas.json 프로필).
 * 권한 문구는 App Store·Play 심사에서 그대로 보이므로 사용 목적을 구체적으로 적는다.
 */
const APP_LINK_HOST = process.env.APP_LINK_HOST ?? 'hwaso.kr';
const PRIMARY = '#2F7A58';

/**
 * App Store 개인정보 매니페스트(PrivacyInfo.xcprivacy)에 적는 수집 항목 — 모두 계정에 연결되고(Linked),
 * 추적(Tracking)에는 쓰지 않으며, 앱 기능 제공 목적이다. App Store Connect 의 "앱 개인정보" 답변과 맞춘다.
 */
const COLLECTED_DATA = [
  'EmailAddress', // 가입·로그인·알림 메일
  'Name', // 배송 수령인·정산 예금주·본인인증
  'PhoneNumber', // 배송 연락처·본인인증
  'PhysicalAddress', // 배송지
  'PaymentInfo', // 결제는 토스페이먼츠·포트원 결제창에서 (앱은 카드 정보를 저장하지 않는다)
  'PhotosorVideos', // 작품·후기·채팅·프로필 사진
  'EmailsOrTextMessages', // 채팅 메시지
  'OtherUserContent', // 작품 설명·후기·문의
  'UserID', // 회원 식별자
  'DeviceID', // 푸시 토큰
  'PurchaseHistory', // 주문·입찰 내역
  'CustomerSupport', // 신고·문의
].map((type) => ({
  NSPrivacyCollectedDataType: `NSPrivacyCollectedDataType${type}`,
  NSPrivacyCollectedDataTypeLinked: true,
  NSPrivacyCollectedDataTypeTracking: false,
  NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
}));

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
    // iPhone 전용 (iPad 화면은 심사 대상이 되지 않게 지원하지 않는다)
    supportsTablet: false,
    usesAppleSignIn: true,
    associatedDomains: [`applinks:${APP_LINK_HOST}`],
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      NSCameraUsageDescription: '판매할 작품이나 채팅으로 보낼 사진을 촬영하려면 카메라 접근이 필요해요.',
      NSPhotoLibraryUsageDescription:
        '판매할 작품 사진과 채팅 사진을 앨범에서 고르려면 사진 접근이 필요해요.',
      NSFaceIDUsageDescription: '앱 잠금을 Face ID 로 해제할 때 사용해요.',
      CFBundleAllowMixedLocalizations: true,
    },
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      // 필수 사유 API: React Native·Expo 모듈이 쓰는 항목 (설정 저장·파일 캐시·경과 시간·저장 공간 확인)
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
          NSPrivacyAccessedAPITypeReasons: ['C617.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
          NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
          NSPrivacyAccessedAPITypeReasons: ['E174.1'],
        },
      ],
      NSPrivacyCollectedDataTypes: COLLECTED_DATA,
    },
  },
  android: {
    package: 'dev.efface.hwaso',
    versionCode: 1,
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
    blockedPermissions: ['android.permission.RECORD_AUDIO', 'android.permission.ACCESS_FINE_LOCATION'],
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
    ['expo-local-authentication', { faceIDPermission: '앱 잠금을 Face ID 로 해제할 때 사용해요.' }],
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
