import { Redirect } from 'expo-router';
import { useAuthStore } from '@/stores/auth';
import { useEntry } from '@/stores/entry';

/**
 * 앱 첫 화면. 로그인하지 않았으면 로그인 화면부터 (아래 "둘러보기"로 로그인 없이 들어간다 — App Store 5.1.1).
 * 로그인했거나 이번 실행에서 둘러보기를 골랐으면 홈. 약관 동의가 남은 계정은 동의 화면으로.
 * 세션 복구가 끝날 때까지는 아무것도 그리지 않는다 (스플래시가 덮고 있다)
 */
export default function Index() {
  const ready = useAuthStore((s) => s.ready);
  const signedIn = useAuthStore((s) => !!s.user);
  const consentPending = useAuthStore((s) => !!s.user?.consentRequired);
  const guest = useEntry((s) => s.guest);
  if (!ready) return null;
  if (consentPending) return <Redirect href="/consent" />;
  return <Redirect href={signedIn || guest ? '/home' : '/login'} />;
}
