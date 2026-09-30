import type { DeviceInput } from '@shop/shared';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import i18n from '@/i18n';

/** 기기 관리 화면에 보일 이름: "iPhone 16 · iOS" */
export function appDevice(): DeviceInput {
  const os =
    Platform.OS === 'ios'
      ? Device.deviceType === Device.DeviceType.TABLET
        ? 'iPadOS'
        : 'iOS'
      : Platform.OS === 'android'
        ? 'Android'
        : i18n.t('common:device.web');
  return {
    name: [Device.modelName ?? i18n.t('common:device.phone'), os].join(' · ').slice(0, 80),
    platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
  };
}
