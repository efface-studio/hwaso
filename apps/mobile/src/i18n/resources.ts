import ko_common from './locales/ko/common';
import ko_auth from './locales/ko/auth';
import ko_home from './locales/ko/home';
import ko_product from './locales/ko/product';
import ko_order from './locales/ko/order';
import ko_sell from './locales/ko/sell';
import ko_chat from './locales/ko/chat';
import ko_my from './locales/ko/my';
import ko_labels from './locales/ko/labels';
import en_common from './locales/en/common';
import en_auth from './locales/en/auth';
import en_home from './locales/en/home';
import en_product from './locales/en/product';
import en_order from './locales/en/order';
import en_sell from './locales/en/sell';
import en_chat from './locales/en/chat';
import en_my from './locales/en/my';
import en_labels from './locales/en/labels';
import ja_common from './locales/ja/common';
import ja_auth from './locales/ja/auth';
import ja_home from './locales/ja/home';
import ja_product from './locales/ja/product';
import ja_order from './locales/ja/order';
import ja_sell from './locales/ja/sell';
import ja_chat from './locales/ja/chat';
import ja_my from './locales/ja/my';
import ja_labels from './locales/ja/labels';
import zhHans_common from './locales/zh-Hans/common';
import zhHans_auth from './locales/zh-Hans/auth';
import zhHans_home from './locales/zh-Hans/home';
import zhHans_product from './locales/zh-Hans/product';
import zhHans_order from './locales/zh-Hans/order';
import zhHans_sell from './locales/zh-Hans/sell';
import zhHans_chat from './locales/zh-Hans/chat';
import zhHans_my from './locales/zh-Hans/my';
import zhHans_labels from './locales/zh-Hans/labels';
import zhHant_common from './locales/zh-Hant/common';
import zhHant_auth from './locales/zh-Hant/auth';
import zhHant_home from './locales/zh-Hant/home';
import zhHant_product from './locales/zh-Hant/product';
import zhHant_order from './locales/zh-Hant/order';
import zhHant_sell from './locales/zh-Hant/sell';
import zhHant_chat from './locales/zh-Hant/chat';
import zhHant_my from './locales/zh-Hant/my';
import zhHant_labels from './locales/zh-Hant/labels';

/** 언어별 번역 (네임스페이스마다 파일 하나) */
export const resources = {
  ko: {
    common: ko_common,
    auth: ko_auth,
    home: ko_home,
    product: ko_product,
    order: ko_order,
    sell: ko_sell,
    chat: ko_chat,
    my: ko_my,
    labels: ko_labels,
  },
  en: {
    common: en_common,
    auth: en_auth,
    home: en_home,
    product: en_product,
    order: en_order,
    sell: en_sell,
    chat: en_chat,
    my: en_my,
    labels: en_labels,
  },
  ja: {
    common: ja_common,
    auth: ja_auth,
    home: ja_home,
    product: ja_product,
    order: ja_order,
    sell: ja_sell,
    chat: ja_chat,
    my: ja_my,
    labels: ja_labels,
  },
  'zh-Hans': {
    common: zhHans_common,
    auth: zhHans_auth,
    home: zhHans_home,
    product: zhHans_product,
    order: zhHans_order,
    sell: zhHans_sell,
    chat: zhHans_chat,
    my: zhHans_my,
    labels: zhHans_labels,
  },
  'zh-Hant': {
    common: zhHant_common,
    auth: zhHant_auth,
    home: zhHant_home,
    product: zhHant_product,
    order: zhHant_order,
    sell: zhHant_sell,
    chat: zhHant_chat,
    my: zhHant_my,
    labels: zhHant_labels,
  },
} as const;

export const NAMESPACES = [
  'common',
  'auth',
  'home',
  'product',
  'order',
  'sell',
  'chat',
  'my',
  'labels',
] as const;
