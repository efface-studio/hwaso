import { Redirect } from 'expo-router';

/**
 * 소셜 로그인 복귀 딥링크(hwaso://auth/callback). 인앱 브라우저가 결과를 가져가므로
 * 앱이 이 경로로 직접 열린 경우(브라우저 세션이 끊긴 경우)에는 홈으로 보낸다.
 */
export default function AuthCallback() {
  return <Redirect href="/home" />;
}
