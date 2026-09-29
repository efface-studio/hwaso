'use client';

import { palette, type ColorScheme } from '@shop/tokens';
import { useEffect, useRef, useState } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { useThemeStore } from '@/stores/theme';

interface DaumAddress {
  zonecode: string;
  roadAddress: string;
  jibunAddress: string;
  buildingName: string;
  apartment: 'Y' | 'N';
}
declare global {
  interface Window {
    daum?: {
      Postcode: new (o: {
        oncomplete: (d: DaumAddress) => void;
        width?: string;
        height?: string;
        theme?: PostcodeTheme;
      }) => {
        embed: (el: HTMLElement) => void;
      };
    };
  }
}

/** 카카오 우편번호 테마 (색은 #RRGGBB 만 받는다) */
interface PostcodeTheme {
  bgColor: string;
  searchBgColor: string;
  contentBgColor: string;
  pageBgColor: string;
  textColor: string;
  queryTextColor: string;
  postcodeTextColor: string;
  emphTextColor: string;
  outlineColor: string;
}

/** 반투명 토큰(#RRGGBBAA)을 바탕색 위에 섞어 불투명 #RRGGBB 로 */
function solid(color: string, over: string): string {
  if (color.length !== 9) return color;
  const a = parseInt(color.slice(7, 9), 16) / 255;
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2]
    .map((i) =>
      Math.round(ch(over, i) * (1 - a) + ch(color, i) * a)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** 사이트 디자인 토큰으로 만든 우편번호 테마 */
function postcodeTheme(scheme: ColorScheme): PostcodeTheme {
  const c = palette[scheme];
  return {
    bgColor: c.surface,
    searchBgColor: c.surface,
    contentBgColor: c.surface,
    pageBgColor: c.surface2,
    textColor: c.foreground,
    queryTextColor: c.foreground,
    postcodeTextColor: c.primary,
    emphTextColor: c.primary,
    outlineColor: solid(c.border, c.surface),
  };
}

/** 지금 화면에 적용된 테마 (data-theme 이 없으면 시스템 설정) */
function currentScheme(): ColorScheme {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') return attr;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const SRC = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
let loading: Promise<void> | null = null;

function load() {
  if (window.daum?.Postcode) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error('postcode load failed'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * 우편번호 검색 (카카오 우편번호 서비스, 키 불필요). 결과는 도로명 주소 + 건물명.
 * 색은 사이트 테마를 따른다 — scheme 을 주면 그 테마로(앱 브리지), 아니면 지금 화면의 테마로.
 */
export function PostcodeSearch({
  onSelect,
  scheme,
}: {
  onSelect: (zip: string, address: string) => void;
  scheme?: ColorScheme;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  // 테마를 바꾸면 새 색으로 다시 그린다
  const preference = useThemeStore((s) => s.preference);
  useEffect(() => {
    let alive = true;
    load()
      .then(() => {
        if (!alive || !box.current) return;
        box.current.replaceChildren();
        new window.daum!.Postcode({
          width: '100%',
          height: '100%',
          theme: postcodeTheme(scheme ?? currentScheme()),
          oncomplete: (d) => {
            const extra = d.buildingName && d.apartment === 'Y' ? ` (${d.buildingName})` : '';
            onSelect(d.zonecode, (d.roadAddress || d.jibunAddress) + extra);
          },
        }).embed(box.current);
        setState('ready');
      })
      .catch(() => alive && setState('error'));
    return () => {
      alive = false;
    };
  }, [onSelect, scheme, preference]);
  return (
    <div className="relative h-[420px] border border-border">
      {state === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner className="size-6 text-muted" />
        </div>
      )}
      {state === 'error' && (
        <p className="p-4 text-small text-destructive">
          주소 검색을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.
        </p>
      )}
      <div ref={box} className="size-full" />
    </div>
  );
}
