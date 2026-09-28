import type { ExpoConfig } from 'expo/config';

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
        image: './assets/splash-icon.png',
        imageWidth: 120,
        backgroundColor: '#FFFFFF',
        dark: { image: './assets/splash-icon.png', backgroundColor: '#0A0A0B' },
      },
    ],
    'expo-secure-store',
    'expo-image',
    'expo-font',
    'expo-web-browser',
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

export default config;
