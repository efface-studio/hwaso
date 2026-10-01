import { ApiError } from '@shop/api-client';
import * as LocalAuthentication from 'expo-local-authentication';
import { Alert, Platform } from 'react-native';
import { isDemoActive } from '@/demo/demo-fetch';
import i18n from '@/i18n';
import { useAuthStore } from '@/stores/auth';
import { getIntegrityFlags } from '../../modules/device-integrity';
import { api } from './api';
import { appDevice } from './device';
import {
  canUseBiometricSecret,
  deleteBiometricSecret,
  getBiometricSecret,
  secure,
  setBiometricSecret,
} from './secure';

/**
 * Face ID·지문 빠른 로그인 (docs/AUTH.md §9).
 * 서버가 준 자격 ID 는 일반 키체인, secret 은 생체 인증을 거쳐야 꺼낼 수 있는 키체인 항목(얼굴·지문을 다시 등록하면 무효)에 둔다.
 * 비밀번호는 기기에 저장하지 않는다.
 */
const INSTALL_ID_KEY = 'hwaso.installId';
const CRED_KEY = 'hwaso.quickLogin.id';
const SECRET_KEY = 'hwaso.quickLogin.secret';
/** 안내 창을 이미 보여준 계정 (계정마다 한 번) */
const OFFERED_KEY = 'hwaso.quickLogin.offered';

export type BiometricKind = 'face' | 'touch' | 'fingerprint' | 'biometric';

/** 앱 설치마다 한 번 만드는 기기 ID — 비밀이 아니라 자격을 이 설치에 묶는 데 쓴다 */
export async function installId(): Promise<string> {
  const saved = await secure.get(INSTALL_ID_KEY);
  if (saved) return saved;
  const native = (globalThis as { expo?: { uuidv4?: () => string } }).expo?.uuidv4;
  const id =
    native?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  await secure.set(INSTALL_ID_KEY, id);
  return id;
}

/** 이 기기에서 쓸 수 있는 생체 인증 종류. 등록이 안 됐거나 쓸 수 없으면 null */
export async function biometricKind(): Promise<BiometricKind | null> {
  if (Platform.OS === 'web' || !canUseBiometricSecret()) return null;
  const [hardware, enrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  if (!hardware || !enrolled) return null;
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  const finger = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
  if (Platform.OS === 'ios') return face ? 'face' : finger ? 'touch' : 'biometric';
  return finger && !face ? 'fingerprint' : 'biometric';
}

export const methodName = (kind: BiometricKind) => i18n.t(`auth:quick.method.${kind}`);

/** 이 기기에 빠른 로그인 자격이 있는지 (secret 은 꺼내지 않는다) */
export async function hasQuickLogin(): Promise<boolean> {
  return !!(await secure.get(CRED_KEY));
}

/** 이 기기의 자격만 지운다 (서버 자격은 그대로 — 만료되거나 계정에서 폐기된다) */
export async function forgetQuickLogin() {
  await secure.remove(CRED_KEY);
  await deleteBiometricSecret(SECRET_KEY).catch(() => undefined);
}

/** 탈옥·루팅·후킹·변조가 보이는 기기에는 오래가는 로그인 자격을 두지 않는다 */
async function riskyDevice(): Promise<boolean> {
  if (__DEV__) return false;
  const flags = await getIntegrityFlags().catch(() => []);
  return flags.some((f) => f !== 'emulator');
}

/**
 * 로그인한 상태에서 켠다. 로그인 10분 뒤라면 서버가 본인 확인을 요구하고, api 클라이언트가 확인 창을 띄운 뒤 다시 보낸다.
 * 'risky' · 'unavailable' 이면 켜지 않는다
 */
export async function enableQuickLogin(): Promise<'on' | 'risky' | 'unavailable'> {
  if (!(await biometricKind())) return 'unavailable';
  if (await riskyDevice()) return 'risky';
  const deviceId = await installId();
  const cred = await api.auth.registerQuickLogin({ deviceId, deviceName: appDevice().name });
  await setBiometricSecret(SECRET_KEY, cred.secret);
  await secure.set(CRED_KEY, cred.credentialId);
  return 'on';
}

/** 끈다: 서버 자격을 지우고(로그인한 경우 — 실패하면 던진다) 이 기기의 자격도 지운다 */
export async function disableQuickLogin() {
  if (useAuthStore.getState().user) await api.auth.removeQuickLogin(await installId());
  await forgetQuickLogin();
}

/** 이 기기에 자격이 있으면 서버에서도 살아 있는지 확인한다. 폐기됐으면(비밀번호 변경 등) 이 기기 자격도 지운다 */
export async function syncQuickLogin(): Promise<boolean> {
  if (!(await hasQuickLogin())) return false;
  const status = await api.auth.quickLoginStatus(await installId());
  if (!status.enabled) await forgetQuickLogin();
  return status.enabled;
}

/**
 * 생체 인증으로 secret 을 꺼내 로그인한다. 서버는 secret 을 새것으로 바꿔 주고(1회용), 앱은 바로 바꿔 저장한다.
 * - 'cancelled': 사용자가 취소했거나 인증하지 못했다
 * - 'invalid': 자격이 없거나 만료·폐기됐거나 얼굴·지문이 바뀌었다 (이 기기 자격을 지운다)
 */
export async function signInWithQuickLogin(prompt: string): Promise<'ok' | 'cancelled' | 'invalid'> {
  const credentialId = await secure.get(CRED_KEY);
  if (!credentialId) return 'invalid';
  let secret: string | null;
  try {
    secret = await getBiometricSecret(SECRET_KEY, prompt);
  } catch {
    return 'cancelled';
  }
  // 생체 정보를 다시 등록하면 키체인 항목이 무효가 되어 읽히지 않는다
  if (!secret) {
    await forgetQuickLogin();
    return 'invalid';
  }
  try {
    const tokens = await api.auth.quickLogin({
      credentialId,
      secret,
      deviceId: await installId(),
      device: appDevice(),
    });
    // 새 secret 을 먼저 저장한다 (Android 는 저장할 때도 지문을 한 번 더 묻는다). 못 하면 다음엔 쓸 수 없으니 끈다
    const saved = await setBiometricSecret(SECRET_KEY, tokens.quickLogin.secret).then(
      () => true,
      () => false,
    );
    await useAuthStore.getState().setSession(tokens);
    if (!saved) void disableQuickLogin().catch(forgetQuickLogin);
    return 'ok';
  } catch (e) {
    if (e instanceof ApiError && e.code === 'QUICK_LOGIN_INVALID') {
      await forgetQuickLogin();
      return 'invalid';
    }
    throw e;
  }
}

async function offeredTo(): Promise<string[]> {
  const raw = await secure.get(OFFERED_KEY);
  return raw ? raw.split(',').filter(Boolean) : [];
}

/**
 * 비밀번호·소셜로 로그인한 직후 한 번: 이 기기에 남은 자격을 지금 세션에 묶고,
 * 아직 켜지 않았으면 계정마다 한 번 빠른 로그인을 켤지 묻는다 (네이티브 Alert)
 */
export async function afterInteractiveLogin() {
  const user = useAuthStore.getState().user;
  if (!user || isDemoActive() || Platform.OS === 'web') return;
  if (await hasQuickLogin()) {
    const status = await api.auth
      .attachQuickLogin(await installId())
      .catch((): { enabled: boolean } | null => null);
    // 다른 계정의 자격이거나 이미 폐기됐으면 이 기기 자격을 지우고 아래에서 다시 묻는다
    if (!status || status.enabled) return;
    await forgetQuickLogin();
  }
  const kind = await biometricKind();
  if (!kind) return;
  const offered = await offeredTo();
  if (offered.includes(user.id)) return;
  await secure.set(OFFERED_KEY, [...offered, user.id].slice(-10).join(','));
  const method = methodName(kind);
  Alert.alert(i18n.t('auth:quick.offerTitle', { method }), i18n.t('auth:quick.offerMessage', { method }), [
    { text: i18n.t('auth:quick.later'), style: 'cancel' },
    {
      text: i18n.t('auth:quick.enable'),
      onPress: () => {
        void enableQuickLogin()
          .then((r) => {
            if (r === 'risky') Alert.alert(i18n.t('my:security.quickLoginRisky'));
          })
          .catch((e: unknown) => {
            if (!(e instanceof ApiError && e.code === 'REAUTH_REQUIRED'))
              Alert.alert(e instanceof ApiError ? e.message : i18n.t('common:state.actionFailed'));
          });
      },
    },
  ]);
}
