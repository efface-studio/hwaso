import type { ImageSourcePropType } from 'react-native';
import type { DemoSnapshot } from '../types';

/**
 * 시연이 꺼진 배포 빌드에서 snapshot·media 대신 번들에 들어가는 빈 모듈 (metro.config.js).
 * 이 빌드에서는 시연 모드가 켜지지 않아 실제로 읽히지 않는다.
 */
export const SNAPSHOT: DemoSnapshot = { takenAt: new Date(0).toISOString(), credential: '', entries: {} };
export const DEMO_MEDIA: Record<string, ImageSourcePropType> = {};
