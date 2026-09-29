import type { ExpoConfig } from 'expo/config';
import { withAppDelegate, withInfoPlist, type ConfigPlugin } from 'expo/config-plugins';

/**
 * 앱 설정. 환경마다 달라지는 값은 EXPO_PUBLIC_* / 빌드 환경 변수로 넣는다 (eas.json 프로필).
 * 권한 문구는 App Store·Play 심사에서 그대로 보이므로 사용 목적을 구체적으로 적는다.
 */
const APP_LINK_HOST = process.env.APP_LINK_HOST ?? 'hwaso.kr';
const PRIMARY = '#2F7A58';

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
      NSFaceIDUsageDescription: '앱 잠금을 Face ID 로 해제할 때 사용해요.',
      CFBundleAllowMixedLocalizations: true,
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
