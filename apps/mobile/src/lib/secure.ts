import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * 작은 값 저장소: iOS Keychain / Android Keystore (SecureStore).
 * 웹 미리보기에는 SecureStore 가 없어 localStorage 로 대신한다 (개발용).
 */
export const secure = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string) {
    if (Platform.OS === 'web') return globalThis.localStorage?.setItem(key, value);
    await SecureStore.setItemAsync(key, value);
  },
  async remove(key: string) {
    if (Platform.OS === 'web') return globalThis.localStorage?.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  },
};
