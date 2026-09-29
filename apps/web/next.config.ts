import { networkInterfaces } from 'node:os';
import type { NextConfig } from 'next';

const origin = (url: string) => new URL(url).origin;
const mediaUrl = new URL(process.env.NEXT_PUBLIC_MEDIA_URL ?? 'http://localhost:9000/shop-media/public');
const apiOrigin = origin(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1');
const wsOrigin = origin(process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:4000');
const isProd = process.env.NODE_ENV === 'production';
/** HTTPS 로 서비스할 때만 (로컬 next start 미리보기는 http) */
const isHttps = (process.env.NEXT_PUBLIC_SITE_URL ?? '').startsWith('https://');

/** 외부 연동: 토스페이먼츠 결제창, 카카오 우편번호, 포트원(PASS 본인인증) */
const TOSS = 'https://*.tosspayments.com';
/** 우편번호 서비스는 postcode.map.kakao.com 을 프레임으로 띄우며, 페이지 프로토콜을 따른다 (로컬 http 미리보기 포함) */
const DAUM = [
  'https://t1.daumcdn.net',
  'https://*.daumcdn.net',
  'https://postcode.map.daum.net',
  'https://*.daum.net',
  'https://postcode.map.kakao.com',
  'https://*.kakao.com',
  ...(isHttps ? [] : ['http://postcode.map.kakao.com', 'http://postcode.map.daum.net']),
];
const PORTONE = ['https://cdn.portone.io', 'https://*.portone.io'];

/**
 * 콘텐츠 보안 정책. 허용 목록 밖의 스크립트·연결·프레임은 브라우저가 막는다.
 * ponytail: Next 가 넣는 인라인 스크립트 때문에 script-src 에 'unsafe-inline' 을 둔다 — nonce 방식은 모든 페이지가 동적 렌더링이 되어 ISR 을 잃는다
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"} ${TOSS} ${DAUM.join(' ')} ${PORTONE.join(' ')}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${mediaUrl.origin} ${DAUM.join(' ')} ${TOSS}`,
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin} ${wsOrigin} ${wsOrigin.replace(/^http/, 'ws')} ${TOSS} ${PORTONE.join(' ')} ${DAUM.join(' ')}`,
  `frame-src ${TOSS} ${DAUM.join(' ')} ${PORTONE.join(' ')}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isHttps ? ['upgrade-insecure-requests'] : []),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  // 카메라는 채팅·판매 사진 촬영(파일 선택)에 쓰일 수 있어 자기 도메인만 허용
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(self)' },
  // 결제·본인인증 팝업이 opener 로 결과를 돌려줄 수 있게 same-origin-allow-popups
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  ...(isHttps
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
];

/**
 * 개발 서버를 localhost 가 아닌 주소로 여는 경우 — 앱(시뮬레이터·실기기)의 인앱 브라우저가 웹 브리지를
 * 127.0.0.1·PC 의 내부망 IP 로 연다. Next 는 이런 출처의 개발 리소스(/_next/*)를 기본으로 막는다.
 */
const devOrigins = [
  '127.0.0.1',
  ...Object.values(networkInterfaces())
    .flat()
    .filter((i) => i?.family === 'IPv4' && !i.internal)
    .map((i) => i!.address),
];

const config: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: isProd ? undefined : devOrigins,
  poweredByHeader: false,
  transpilePackages: ['@shop/shared', '@shop/tokens', '@shop/api-client'],
  images: {
    remotePatterns: [
      {
        protocol: mediaUrl.protocol.replace(':', '') as 'http' | 'https',
        hostname: mediaUrl.hostname,
        port: mediaUrl.port,
        pathname: `${mediaUrl.pathname}/**`,
      },
    ],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default config;
