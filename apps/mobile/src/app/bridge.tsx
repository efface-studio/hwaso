import { useEffect } from 'react';
import { goBack } from '@/lib/nav';

/**
 * 웹 브리지 복귀 딥링크(hwaso://bridge). 결과는 인앱 브라우저 세션이 가져가므로,
 * 라우터가 이 경로를 따로 열었으면 원래 화면(없으면 홈)으로 되돌린다.
 */
export default function BridgeReturn() {
  useEffect(() => {
    goBack();
  }, []);
  return null;
}
