import { requireOptionalNativeModule } from 'expo';
import type { DeviceIntegrityNativeModule } from './DeviceIntegrity.types';

/**
 * 네이티브 모듈이 없는 바이너리(모듈 추가 전 빌드에 OTA 로 새 JS 가 내려온 경우 등)에서도 죽지 않게
 * requireOptionalNativeModule 로 읽는다 — 없으면 null.
 */
export default requireOptionalNativeModule<DeviceIntegrityNativeModule>('DeviceIntegrity');
