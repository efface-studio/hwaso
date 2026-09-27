import type { DeviceInput } from '@shop/shared';

/** 기기 관리 화면에 보일 이름: "Chrome · Windows" */
export function webDevice(): DeviceInput {
  if (typeof navigator === 'undefined') return { name: '웹 브라우저', platform: 'web' };
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Whale\//.test(ua)
      ? 'Whale'
      : /SamsungBrowser/.test(ua)
        ? 'Samsung Internet'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Firefox\//.test(ua)
            ? 'Firefox'
            : /Safari\//.test(ua)
              ? 'Safari'
              : '브라우저';
  const os = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return { name: [browser, os].filter(Boolean).join(' · '), platform: 'web' };
}
