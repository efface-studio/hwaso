import { router, type Href } from 'expo-router';
import { routingQueue, type LinkAction } from 'expo-router/build/global-state/routingQueue';
import * as WebBrowser from 'expo-web-browser';

/** 뒤로 갈 화면이 없으면(딥링크·푸시로 바로 열린 경우) 홈으로 */
export const goBack = () => (router.canGoBack() ? router.back() : router.replace('/home'));

/**
 * 알림·배너의 앱 경로('/products/…')로 이동. 웹 홈('/')은 앱의 홈 탭이라
 * 위에 쌓인 화면을 닫고 홈으로 돌아간다 (홈이 없으면 지금 화면을 홈으로 바꾼다)
 */
export function openAppPath(path: string) {
  if (path === '/' || path === '/home') router.dismissTo('/home');
  else router.push(path as Href);
}

/** 배너·공지 링크: 앱 경로('/products/…')는 앱 화면으로, 그 밖의 주소는 인앱 브라우저로 연다 */
export function openLink(link: string) {
  if (link.startsWith('/')) openAppPath(link);
  else if (/^https?:\/\//.test(link)) void WebBrowser.openBrowserAsync(link);
}

/** 앞으로 가는 이동(push·navigate·Link) 뒤, 같은 종류의 이동을 무시하는 시간 — 화면 전환 애니메이션보다 조금 길게 */
const FORWARD_LOCK_MS = 600;
const FORWARD_EVENTS = new Set<string | undefined>(['PUSH', 'NAVIGATE', undefined]);

type QueuedAction = Parameters<typeof routingQueue.add>[0];
const isLink = (a: QueuedAction): a is LinkAction => a.type === 'ROUTER_LINK';

/**
 * 연타·더블 탭으로 같은 화면이 여러 개 쌓이지 않게 한다. 앱 시작 때 한 번 부른다.
 * router.push / navigate / <Link> 는 모두 expo-router 의 routingQueue 를 거치므로 그 입구에서 거른다.
 * 뒤로 가기·replace·dismiss·미리 불러오기는 그대로 통과한다.
 */
export function guardRapidNavigation() {
  const add = routingQueue.add.bind(routingQueue);
  let lastForward = 0;
  routingQueue.add = (action) => {
    if (isLink(action) && FORWARD_EVENTS.has(action.payload.options.event)) {
      const now = Date.now();
      if (now - lastForward < FORWARD_LOCK_MS) return;
      lastForward = now;
    }
    add(action);
  };
}
