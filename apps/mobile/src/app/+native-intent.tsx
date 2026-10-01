import { noteIncomingLink } from '@/lib/entry-link';

/**
 * 유니버설 링크·앱 스킴으로 들어온 경로 (expo-router 가 앱 시작·실행 중 모두 부른다).
 * 경로는 바꾸지 않고, 로그인 화면을 먼저 띄울지·로그인 뒤 열지만 기록한다 (lib/entry-link.ts)
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    noteIncomingLink(path);
  } catch {
    // 기록에 실패해도 링크는 그대로 연다
  }
  return path;
}
