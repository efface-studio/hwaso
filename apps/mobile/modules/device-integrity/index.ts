import DeviceIntegrityModule from './src/DeviceIntegrityModule';
import { INTEGRITY_FLAG_VALUES, type IntegrityFlag } from './src/DeviceIntegrity.types';

export { INTEGRITY_FLAG_VALUES, type IntegrityFlag } from './src/DeviceIntegrity.types';

function isIntegrityFlag(value: unknown): value is IntegrityFlag {
  return typeof value === 'string' && (INTEGRITY_FLAG_VALUES as readonly string[]).includes(value);
}

/**
 * 기기 무결성 신호 (탈옥·루팅 / 디버거 / 후킹 도구 / 에뮬레이터 / 앱 변조).
 * 경고용 휴리스틱이라 우회될 수 있고, 절대 예외를 던지지 않는다 — 모듈이 없거나(웹·구버전 바이너리) 실패하면 [].
 */
export async function getIntegrityFlags(): Promise<IntegrityFlag[]> {
  if (!DeviceIntegrityModule) return [];
  try {
    const raw = await DeviceIntegrityModule.getIntegrityFlagsAsync();
    const found = new Set(Array.isArray(raw) ? raw.filter(isIntegrityFlag) : []);
    return INTEGRITY_FLAG_VALUES.filter((flag) => found.has(flag));
  } catch {
    return [];
  }
}
