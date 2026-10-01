import { create } from 'zustand';
import { deleteBiometricSecret, getBiometricSecret, secure, setBiometricSecret } from './secure';

/** Face ID 본인 확인 키: ID 는 일반 키체인, 비밀값은 생체 인증을 거쳐야 꺼낼 수 있는 키체인 항목 */
const BIO_KEY_ID = 'hwaso.reauth.keyId';
const BIO_SECRET = 'hwaso.reauth.secret';

interface ReauthState {
  /** 본인 확인 창이 떠 있으면 결과를 받을 함수 */
  pending: ((token: string | null) => void) | null;
}

export const useReauth = create<ReauthState>(() => ({ pending: null }));

let inflight: Promise<string | null> | null = null;

/**
 * 서버가 REAUTH_REQUIRED 로 막은 요청(결제·정산 계좌 변경·비밀번호 변경·탈퇴 등)에서 api-client 가 부른다.
 * 본인 확인 창(ReauthHost)을 띄우고 재인증 토큰을 돌려준다. 닫으면 null. 동시에 여러 요청이 와도 창은 하나.
 */
export function requestReauth(): Promise<string | null> {
  inflight ??= new Promise<string | null>((resolve) => {
    useReauth.setState({ pending: resolve });
  }).finally(() => {
    inflight = null;
    useReauth.setState({ pending: null });
  });
  return inflight;
}

export const biometricKey = {
  async id(): Promise<string | null> {
    return secure.get(BIO_KEY_ID);
  },
  /** 생체 인증 창을 띄워 비밀값을 꺼낸다. 취소·실패·키 변경(얼굴 재등록)이면 null */
  async unlock(prompt: string): Promise<{ keyId: string; secret: string } | null> {
    const keyId = await secure.get(BIO_KEY_ID);
    if (!keyId) return null;
    const secret = await getBiometricSecret(BIO_SECRET, prompt).catch(() => null);
    return secret ? { keyId, secret } : null;
  },
  async save(keyId: string, secret: string) {
    await setBiometricSecret(BIO_SECRET, secret);
    await secure.set(BIO_KEY_ID, keyId);
  },
  async clear() {
    await secure.remove(BIO_KEY_ID);
    await deleteBiometricSecret(BIO_SECRET).catch(() => undefined);
  },
};
