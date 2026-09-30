import { requireOptionalNativeModule } from 'expo';
import { useFocusEffect } from 'expo-router';
import type * as ScreenCapture from 'expo-screen-capture';
import { useCallback, useId } from 'react';
import { Platform } from 'react-native';

type ScreenCaptureApi = Pick<typeof ScreenCapture, 'preventScreenCaptureAsync' | 'allowScreenCaptureAsync'>;

let loading: Promise<ScreenCaptureApi | null> | null = null;

/**
 * expo-screen-capture 는 불러오는 순간 네이티브 모듈을 요구한다. 모듈이 없는 바이너리(웹, 추가 전 빌드)에서도
 * 앱이 죽지 않도록 네이티브 모듈이 있을 때만 늦게 불러온다.
 */
function loadScreenCapture(): Promise<ScreenCaptureApi | null> {
  if (!loading) {
    loading =
      Platform.OS === 'web' || !requireOptionalNativeModule('ExpoScreenCapture')
        ? Promise.resolve(null)
        : import('expo-screen-capture').catch(() => null);
  }
  return loading;
}

/**
 * 이 화면이 보이는 동안 스크린샷·화면 녹화를 막는다 (Android FLAG_SECURE — 최근 앱 미리보기도 가려진다, iOS 캡처 가림).
 * 화면마다 고유 키를 써서 여러 화면이 겹쳐도 마지막 화면이 떠날 때만 다시 허용된다 (expo-screen-capture 가 키 집합을 센다).
 * 계좌·결제·비밀번호처럼 민감한 정보가 보이는 화면에서 호출한다.
 */
export function useScreenGuard(active = true) {
  const key = `screen-guard:${useId()}`;

  useFocusEffect(
    useCallback(() => {
      if (!active) return;
      void loadScreenCapture().then((api) => api?.preventScreenCaptureAsync(key).catch(() => undefined));
      return () => {
        void loadScreenCapture().then((api) => api?.allowScreenCaptureAsync(key).catch(() => undefined));
      };
    }, [active, key]),
  );
}
