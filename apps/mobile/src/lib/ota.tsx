import * as Updates from 'expo-updates';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AppState } from 'react-native';

/** 앱으로 돌아올 때마다 확인하지 않는다 — 마지막 확인 뒤 이만큼 지나야 다시 묻는다 */
const RECHECK_MS = 15 * 60_000;

/** 서버가 매니페스트 extra.critical 로 표시한 업데이트 (docs/MOBILE_RELEASE.md 「OTA 업데이트」) */
function isCritical(update: Updates.UseUpdatesReturnType['downloadedUpdate']): boolean {
  const extra: unknown = update?.manifest && 'extra' in update.manifest ? update.manifest.extra : undefined;
  return typeof extra === 'object' && extra !== null && 'critical' in extra && extra.critical === true;
}

/**
 * OTA 업데이트: 실행할 때(네이티브가 확인)와 앱으로 돌아올 때 새 JS 번들을 조용히 받아 두고, 다음 실행 때 적용한다.
 * 긴급 업데이트만 받는 즉시 알리고 다시 시작한다. 개발 빌드·설정이 없는 빌드에서는 아무것도 하지 않는다.
 */
export function OtaSync() {
  const { t: tr } = useTranslation();
  const { isUpdatePending, downloadedUpdate, isStartupProcedureRunning } = Updates.useUpdates();
  const lastCheck = useRef(Date.now());
  const busy = useRef(false);
  const alerted = useRef(false);

  useEffect(() => {
    if (!Updates.isEnabled || __DEV__) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || busy.current || Date.now() - lastCheck.current < RECHECK_MS) return;
      busy.current = true;
      lastCheck.current = Date.now();
      // 실패해도 조용히 넘어간다 — 다음에 돌아올 때 다시 확인한다
      void Updates.checkForUpdateAsync()
        .then((r) => (r.isAvailable || r.isRollBackToEmbedded ? Updates.fetchUpdateAsync() : undefined))
        .catch(() => undefined)
        .finally(() => (busy.current = false));
    });
    return () => sub.remove();
  }, []);

  const critical = isUpdatePending && !isStartupProcedureRunning && isCritical(downloadedUpdate);
  useEffect(() => {
    if (!critical || alerted.current) return;
    alerted.current = true;
    Alert.alert(tr('update.criticalTitle'), tr('update.criticalMessage'), [
      { text: tr('update.restart'), onPress: () => void Updates.reloadAsync().catch(() => undefined) },
    ]);
  }, [critical, tr]);

  return null;
}
