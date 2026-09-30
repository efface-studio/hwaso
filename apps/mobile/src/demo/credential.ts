/**
 * 시연 로그인 확인값. 비밀번호를 앱에 두지 않고 이메일과 묶은 해시만 비교한다
 * (기록 스크립트는 node:crypto, 앱은 ./sha256 으로 같은 값을 만든다).
 */
export const demoCredential = (email: string, password: string, sha256: (s: string) => string) =>
  sha256(`hwaso-demo:${email.trim().toLowerCase()}:${password}`);
