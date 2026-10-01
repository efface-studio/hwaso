import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * 일반 항목: 기기 잠금이 풀려 있을 때만 읽히고, 백업·기기 이전으로 다른 기기에 옮겨지지 않는다 (iOS).
 * 예전 항목(기본 서비스 'app', WHEN_UNLOCKED)과 섞이지 않게 서비스 이름을 따로 쓴다 — 읽을 때 옮겨 담는다.
 * (iOS SecureStore 는 이미 있는 항목에 쓰면 값만 바꾸고 접근성은 그대로 두기 때문)
 */
const STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: 'hwaso.v2',
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/** 생체 인증으로 보호하는 항목: 기기 암호가 설정돼 있어야 하고, 얼굴·지문을 다시 등록하면 무효가 된다 (iOS biometryCurrentSet) */
const BIOMETRIC_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: 'hwaso.biometric',
  keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
  requireAuthentication: true,
};

/** 예전 방식(기본 옵션)으로 저장된 값을 새 옵션으로 옮긴다. 실패하면 예전 값을 그대로 두고 다음에 다시 시도한다 */
async function migrateLegacy(key: string): Promise<string | null> {
  const legacy = await SecureStore.getItemAsync(key);
  if (legacy == null) return null;
  try {
    await SecureStore.setItemAsync(key, legacy, STORE_OPTIONS);
    await SecureStore.deleteItemAsync(key);
  } catch {
    // 기기가 잠겨 있을 때 등 — 값은 돌려주고 옮기기는 다음 읽기에서
  }
  return legacy;
}

/**
 * 작은 값 저장소: iOS Keychain / Android Keystore (SecureStore).
 * 웹 미리보기에는 SecureStore 가 없어 localStorage 로 대신한다 (개발용).
 */
export const secure = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
    const value = await SecureStore.getItemAsync(key, STORE_OPTIONS);
    if (value != null) return value;
    return migrateLegacy(key);
  },
  async set(key: string, value: string) {
    if (Platform.OS === 'web') return globalThis.localStorage?.setItem(key, value);
    await SecureStore.setItemAsync(key, value, STORE_OPTIONS);
    // 예전 항목이 남아 있으면 지워 두 값이 어긋나지 않게 한다
    await SecureStore.deleteItemAsync(key).catch(() => undefined);
  },
  async remove(key: string) {
    if (Platform.OS === 'web') return globalThis.localStorage?.removeItem(key);
    await SecureStore.deleteItemAsync(key, STORE_OPTIONS);
    await SecureStore.deleteItemAsync(key).catch(() => undefined);
  },
};

/** 이 기기에서 생체 인증 보호 항목을 쓸 수 있는지 (생체 인증 등록·기기 암호 설정 여부) */
export function canUseBiometricSecret(): boolean {
  if (Platform.OS === 'web') return false;
  try {
    return SecureStore.canUseBiometricAuthentication();
  } catch {
    return false;
  }
}

/**
 * 생체 인증으로 보호해 저장한다 (Android 는 저장할 때도 생체 인증 창이 뜬다).
 * 기기 암호가 없거나 생체 인증을 쓸 수 없으면 예외를 던진다.
 */
export async function setBiometricSecret(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') throw new Error('생체 인증 보호 저장소는 앱에서만 쓸 수 있어요.');
  await SecureStore.setItemAsync(key, value, BIOMETRIC_OPTIONS);
}

/**
 * 생체 인증 창(prompt)을 띄워 값을 꺼낸다. 없으면 null.
 * 사용자가 취소하거나 인증에 실패하거나, 생체 정보가 바뀌어 항목이 무효가 되면 예외를 던진다.
 */
export async function getBiometricSecret(key: string, prompt: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  return SecureStore.getItemAsync(key, { ...BIOMETRIC_OPTIONS, authenticationPrompt: prompt });
}

export async function deleteBiometricSecret(key: string): Promise<void> {
  if (Platform.OS === 'web') return;
  await SecureStore.deleteItemAsync(key, BIOMETRIC_OPTIONS);
}
