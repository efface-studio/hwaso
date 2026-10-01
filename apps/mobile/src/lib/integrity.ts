import type { IntegrityFlag } from '@shop/shared';
import Constants from 'expo-constants';
import { Alert, Platform } from 'react-native';
import { create } from 'zustand';
import { getIntegrityFlags } from '../../modules/device-integrity';
import i18n from '@/i18n';
import { api } from './api';

/** 이번 실행에서 감지한 기기 위험 (탈옥·루팅·디버거·후킹·에뮬레이터·변조) */
export const useIntegrity = create<{ flags: IntegrityFlag[] }>(() => ({ flags: [] }));

let checked = false;

/** 알리고 기록할 신호 — 에뮬레이터는 사용자 위험이 아니다 (심사·개발 기기) */
const USER_RISKS = new Set<IntegrityFlag>(['jailbroken', 'debugger', 'hooked', 'tampered']);

/**
 * 기기 무결성 확인: 로그인한 뒤 실행마다 한 번.
 * 위험이 보이면 알리고 서버에 기록한다 — 사용은 막지 않는다 (경고만, docs/SECURITY.md).
 */
export async function checkIntegrity() {
  if (checked || Platform.OS === 'web' || __DEV__) return;
  checked = true;
  const flags = await getIntegrityFlags().catch((): IntegrityFlag[] => []);
  const risks = flags.filter((f) => USER_RISKS.has(f));
  useIntegrity.setState({ flags: risks });
  if (!risks.length) return;
  void api.me
    .reportIntegrity({
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      flags: risks,
      appVersion: Constants.expoConfig?.version ?? '',
    })
    .catch(() => undefined);
  Alert.alert(i18n.t('my:security.warningTitle'), i18n.t('my:security.warningMessage'));
}
