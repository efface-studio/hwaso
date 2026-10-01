import { router } from 'expo-router';
import { useAuthStore } from '@/stores/auth';

/**
 * 로그인이 필요한 동작(관심·팔로우·입찰·구매·채팅·문의·신고) 앞에서 부른다.
 * 로그인했으면 true, 아니면 로그인 화면을 띄우고 false.
 * 로그인에 성공하면 루트 가드가 로그인 화면을 스택에서 빼므로 보던 화면으로 그대로 돌아온다.
 */
export function requireLogin(): boolean {
  if (useAuthStore.getState().user) return true;
  router.push('/login');
  return false;
}
