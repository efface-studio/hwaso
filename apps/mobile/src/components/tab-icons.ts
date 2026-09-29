import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import type { ImageSourcePropType } from 'react-native';

/** 탭 아이콘 크기 (pt). 시스템 SF Symbol(약 25pt)보다 작게 그린다 */
const TAB_ICON_SIZE = 20;

type IoniconName = keyof typeof Ionicons.glyphMap;
type IconSet = Record<string, readonly [IoniconName, IoniconName]>;

const TAB_ICONS = {
  home: ['home-outline', 'home'],
  auctions: ['hammer-outline', 'hammer'],
  sell: ['add-circle-outline', 'add-circle'],
  chat: ['chatbubble-outline', 'chatbubble'],
  my: ['person-outline', 'person'],
} as const satisfies IconSet;

/** 관리자 탭 (요약 · 회원 · 작품 · 거래 · 운영) */
export const ADMIN_TAB_ICONS = {
  dashboard: ['stats-chart-outline', 'stats-chart'],
  members: ['people-outline', 'people'],
  catalog: ['images-outline', 'images'],
  commerce: ['receipt-outline', 'receipt'],
  ops: ['construct-outline', 'construct'],
} as const satisfies IconSet;

export type TabName = keyof typeof TAB_ICONS;
export type TabIcon = { default: ImageSourcePropType; selected: ImageSourcePropType };

/** 한 번 만든 아이콘 이미지는 앱이 켜져 있는 동안 다시 쓴다 (관리자 앱을 다시 열 때 등) */
const cache = new Map<IoniconName, ImageSourcePropType>();

async function load(name: IoniconName) {
  const hit = cache.get(name);
  if (hit) return hit;
  const src = await Ionicons.getImageSource(name, TAB_ICON_SIZE, 'white');
  if (src) cache.set(name, src);
  return src;
}

/** 캐시에 모두 있으면 바로 만든다 (첫 렌더부터 이미지로) */
function fromCache<S extends IconSet>(set: S) {
  const out: Partial<Record<keyof S, TabIcon>> = {};
  for (const [tab, [off, on]] of Object.entries(set)) {
    const d = cache.get(off);
    const s = cache.get(on);
    if (!d || !s) return null;
    out[tab as keyof S] = { default: d, selected: s };
  }
  return out;
}

/**
 * 탭 아이콘 이미지 (선형 · 선택 시 채움). 템플릿 이미지로 쓰므로 색은 탭 바가 입힌다.
 * 폰트 아이콘을 이미지로 만드는 동안은 비어 있다 — 호출하는 쪽에서 SF Symbol 로 대신한다.
 * 탭마다 따로 바꾸면 이미지(20pt)와 SF Symbol(약 25pt)이 섞여 라벨 높이가 어긋나므로, 전부 준비된 뒤 한 번에 바꾼다.
 * 보통은 preloadTabIcons() 로 캐시가 채워져 있어 첫 렌더부터 이미지다.
 */
export function useTabIconSet<S extends IconSet>(set: S) {
  const [icons, setIcons] = useState<Partial<Record<keyof S, TabIcon>>>(() => fromCache(set) ?? {});
  useEffect(() => {
    if (fromCache(set)) return;
    let cancelled = false;
    const entries = Object.entries(set);
    void Promise.all(entries.map(([, [off, on]]) => Promise.all([load(off), load(on)]))).then((loaded) => {
      if (cancelled || loaded.some(([d, s]) => !d || !s)) return;
      setIcons(fromCache(set) ?? {});
    });
    return () => {
      cancelled = true;
    };
  }, [set]);
  return icons;
}

export const useTabIcons = () => useTabIconSet(TAB_ICONS);

/**
 * 앱을 켤 때 사용자·관리자 탭 아이콘을 미리 만들어 둔다.
 * 탭 바가 대체 SF Symbol 로 먼저 그려진 뒤 이미지로 바뀌면 iOS 가 일부 탭의 라벨 위치를 다시 잡지 않아
 * 글자가 아래로 밀리므로, 탭 바가 처음부터 최종 아이콘으로 그려지게 한다.
 */
export function preloadTabIcons() {
  for (const set of [TAB_ICONS, ADMIN_TAB_ICONS] as IconSet[])
    for (const [off, on] of Object.values(set)) {
      void load(off).catch(() => undefined);
      void load(on).catch(() => undefined);
    }
}
