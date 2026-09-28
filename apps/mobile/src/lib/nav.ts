import { router, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

/** 뒤로 갈 화면이 없으면(딥링크·푸시로 바로 열린 경우) 홈으로 */
export const goBack = () => (router.canGoBack() ? router.back() : router.replace('/home'));

/** 배너·공지 링크: 앱 경로('/products/…')는 앱 화면으로, 그 밖의 주소는 인앱 브라우저로 연다 */
export function openLink(link: string) {
  if (link.startsWith('/')) router.push(link as Href);
  else if (/^https?:\/\//.test(link)) void WebBrowser.openBrowserAsync(link);
}
