import { Redirect } from 'expo-router';
import { useAuthStore } from '@/stores/auth';

/** 앱 첫 화면 = 홈 탭 (로그인하지 않아도 둘러볼 수 있다). 약관 동의가 남은 계정만 동의 화면으로 */
export default function Index() {
  const consentPending = !!useAuthStore((s) => s.user?.consentRequired);
  return <Redirect href={consentPending ? '/consent' : '/home'} />;
}
