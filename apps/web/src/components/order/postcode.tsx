'use client';

import { useEffect, useRef, useState } from 'react';
import { Spinner } from '@/components/ui/spinner';

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
      Postcode: new (o: { oncomplete: (d: DaumAddress) => void; width?: string; height?: string }) => {
        embed: (el: HTMLElement) => void;
      };
    };
  }
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

/** 우편번호 검색 (카카오 우편번호 서비스, 키 불필요). 결과는 도로명 주소 + 건물명 */
export function PostcodeSearch({ onSelect }: { onSelect: (zip: string, address: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    let alive = true;
    load()
      .then(() => {
        if (!alive || !box.current) return;
        new window.daum!.Postcode({
          width: '100%',
          height: '100%',
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
  }, [onSelect]);
  return (
    <div className="relative h-[420px] border border-border">
      {state === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner />
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
