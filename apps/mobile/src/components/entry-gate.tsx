import { router, usePathname, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';
import { afterInteractiveLogin } from '@/lib/quick-login';
import { useAuthStore } from '@/stores/auth';
import { useEntry } from '@/stores/entry';

/** 루트 가드가 화면 목록을 바꾼 다음 프레임에 이동한다 (바뀌기 전에 보내면 없는 화면으로 간다) */
const nextFrame = (fn: () => void) => requestAnimationFrame(fn);

/**
 * 첫 화면 선택(app/index.tsx) 이후의 이동:
 * - 로그인·세션 복구가 끝나면 미뤄 둔 딥링크·알림 화면을 연다 (동의가 남았으면 동의 뒤에)
 * - 로그인하지 않은 채 로그인해야 하는 링크가 오면 로그인 화면을 띄운다
 * - 로그아웃·세션 만료로 로그인이 풀리면 로그인 화면을 첫 화면으로 (둘러보기는 다시 고른다)
 * - 로그인 화면에서 직접 로그인했으면 빠른 로그인 안내를 한 번
 */
export function EntryGate() {
  const ready = useAuthStore((s) => s.ready);
  const signedIn = useAuthStore((s) => !!s.user);
  const consentPending = useAuthStore((s) => !!s.user?.consentRequired);
  const pending = useEntry((s) => s.pending);
  const interactive = useEntry((s) => s.interactiveLogin);
  const pathname = usePathname();
  const wasSignedIn = useRef(false);

  useEffect(() => {
    if (!ready) return;
    const was = wasSignedIn.current;
    wasSignedIn.current = signedIn;
    if (signedIn) {
      if (consentPending || !pending) return;
      useEntry.setState({ pending: null });
      nextFrame(() => router.push(pending as Href));
    } else if (was) {
      useEntry.setState({ guest: false, pending: null });
      nextFrame(() => router.replace('/login'));
    } else if (pending && pathname !== '/login' && pathname !== '/') {
      // 첫 화면('/')이면 index 가 로그인 화면으로 보낸다
      nextFrame(() => router.push('/login'));
    }
    // 경로가 바뀔 때마다 다시 돌지 않게 pathname 은 넣지 않는다 (링크가 올 때의 값만 본다)
  }, [ready, signedIn, consentPending, pending]);

  useEffect(() => {
    if (!signedIn || consentPending || !interactive) return;
    useEntry.setState({ interactiveLogin: null });
    // 빠른 로그인으로 들어왔으면 이미 켜져 있다. 화면 전환이 끝난 뒤 묻는다
    if (interactive === 'quick') return;
    const timer = setTimeout(() => void afterInteractiveLogin().catch(() => undefined), 700);
    return () => clearTimeout(timer);
  }, [signedIn, consentPending, interactive]);

  return null;
}
