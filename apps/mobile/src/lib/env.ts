import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * API 주소. 빌드 환경 변수(EXPO_PUBLIC_API_URL)가 우선이고, 개발 중에는 Metro 가 떠 있는 PC 주소를 쓴다
 * (실기기·에뮬레이터에서 localhost 는 기기 자신을 가리키기 때문).
 */
function devHost(): string {
  const hostUri = Constants.expoConfig?.hostUri ?? '';
  const host = hostUri.split(':')[0];
  if (host) return host;
  return Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
}

const apiUrl =
  process.env.EXPO_PUBLIC_API_URL ?? `http://${Platform.OS === 'web' ? 'localhost' : devHost()}:4000/api/v1`;

export const env = {
  apiUrl,
  wsUrl: process.env.EXPO_PUBLIC_WS_URL ?? new URL(apiUrl).origin,
  mediaUrl:
    process.env.EXPO_PUBLIC_MEDIA_URL ??
    `http://${Platform.OS === 'web' ? 'localhost' : devHost()}:9000/shop-media/public`,
  webUrl: process.env.EXPO_PUBLIC_WEB_URL ?? 'https://hwaso.kr',
};
