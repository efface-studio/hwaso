/** packages/shared INTEGRITY_FLAGS 와 같은 값 (네이티브 모듈은 워크스페이스 패키지에 의존하지 않는다) */
export const INTEGRITY_FLAG_VALUES = ['jailbroken', 'debugger', 'hooked', 'emulator', 'tampered'] as const;

export type IntegrityFlag = (typeof INTEGRITY_FLAG_VALUES)[number];

export interface DeviceIntegrityNativeModule {
  /** 감지한 위험 신호 이름 목록. 검사마다 예외는 네이티브에서 삼키므로 실패해도 빈 배열에 가깝다 */
  getIntegrityFlagsAsync(): Promise<string[]>;
}
