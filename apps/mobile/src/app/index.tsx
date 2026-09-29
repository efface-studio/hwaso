import { Redirect } from 'expo-router';
import { useAuthStore } from '@/stores/auth';

/** 앱 첫 화면 = 로그인했으면 홈 탭, 아니면 로그인 */
export default function Index() {
  const signedIn = !!useAuthStore((s) => s.user);
  return <Redirect href={signedIn ? '/home' : '/login'} />;
}
