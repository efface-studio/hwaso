import 'i18next';
import type { resources } from './resources';

// t('common:action.ok') 처럼 키를 타입으로 확인한다 (한국어 원문 기준)
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: (typeof resources)['ko'];
  }
}
