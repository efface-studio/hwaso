import { Redirect } from 'expo-router';

/** 앱 첫 화면 = 홈 탭 */
export default function Index() {
  return <Redirect href="/home" />;
}
