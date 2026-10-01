import { Alert } from 'react-native';
import i18n from '@/i18n';

/**
 * 가입 축하 (이메일 가입·소셜 가입 마무리 직후 한 번) — OS 기본 알림창으로 띄운다.
 * 가입 직후 화면 전환이 끝난 뒤에 띄워야 iOS 가 알림창을 버리지 않는다.
 */
export function showWelcome(nickname: string) {
  setTimeout(() => {
    Alert.alert(i18n.t('common:welcome.title'), i18n.t('common:welcome.body', { nickname }), [
      { text: i18n.t('common:welcome.browse') },
    ]);
  }, 600);
}
