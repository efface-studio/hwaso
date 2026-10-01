import * as Clipboard from 'expo-clipboard';

/** 계좌번호처럼 민감한 값은 붙여 넣을 시간을 준 뒤 클립보드에서 지운다 (다른 앱이 읽지 못하게) */
const CLEAR_AFTER_MS = 2 * 60_000;

export async function copySensitive(text: string) {
  await Clipboard.setStringAsync(text);
  setTimeout(() => {
    // 그사이 다른 것을 복사했으면 건드리지 않는다
    void Clipboard.getStringAsync()
      .then((cur) => (cur === text ? Clipboard.setStringAsync('') : undefined))
      .catch(() => undefined);
  }, CLEAR_AFTER_MS);
}
