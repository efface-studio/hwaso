import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import type { ImageSourcePropType } from 'react-native';
import { TAB_BAR_SCALE } from '@/theme';

/** 탭 아이콘 크기 (pt). 시스템 SF Symbol(약 25pt)보다 작게 그린다 (태블릿은 탭 바 배율만큼 크게) */
const TAB_ICON_SIZE = Math.round(20 * TAB_BAR_SCALE);

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
 * 탭 바는 먼저 SF Symbol 로 그리고, 다음 프레임에 모든 탭을 한 번에 이미지로 바꾼다.
 * iOS 26 탭 바는 처음부터 이 이미지로 만들면 선택되지 않은 탭의 라벨을 아래로 밀어 그리고,
 * 탭마다 따로 바꾸면 SF Symbol 과 이미지가 섞여 라벨 높이가 어긋난다 (시뮬레이터에서 재현·확인).
 */
export function useTabIconSet<S extends IconSet>(set: S) {
  const [icons, setIcons] = useState<Partial<Record<keyof S, TabIcon>>>({});
  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    const entries = Object.entries(set);
    void Promise.all(entries.map(([, [off, on]]) => Promise.all([load(off), load(on)]))).then((loaded) => {
      if (cancelled || loaded.some(([d, s]) => !d || !s)) return;
      // SF Symbol 로 한 번 그려진 뒤에 바꾼다 (캐시가 있어도 첫 프레임은 SF Symbol)
      frame = requestAnimationFrame(() => setIcons(fromCache(set) ?? {}));
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [set]);
  return icons;
}

export const useTabIcons = () => useTabIconSet(TAB_ICONS);

/**
 * 탭 아이콘 이미지를 미리 만들어 둔다 (탭 바가 SF Symbol → 이미지로 바로 바뀌게).
 * 앱을 켤 때는 사용자 탭만 — 관리자 탭은 관리자 계정일 때만 따로 부른다.
 */
export function preloadTabIcons(set: IconSet = TAB_ICONS) {
  for (const [off, on] of Object.values(set)) {
    void load(off).catch(() => undefined);
    void load(on).catch(() => undefined);
  }
}
