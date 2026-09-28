/**
 * 유니버설 링크(iOS)·앱 링크(Android) 검증 파일. 웹 주소를 누르면 설치된 앱의 같은 화면이 열린다.
 * 팀 ID·서명 지문이 설정되지 않으면 파일을 내지 않는다 (앱 출시 전에는 웹만 열린다).
 */
type Env = Partial<Record<'APPLE_TEAM_ID' | 'ANDROID_CERT_SHA256' | 'APP_BUNDLE_ID', string>>;

const DEFAULT_BUNDLE_ID = 'dev.efface.hwaso';

/** 앱에 같은 화면이 있는 경로만 앱으로 보낸다. 브리지·인증 복귀는 반드시 웹에서 열려야 한다 */
const EXCLUDED = ['/app-bridge/*', '/auth/*', '/admin/*', '/api/*'];
const APP_PATHS = [
  '/products/*',
  '/auctions/*',
  '/artists/*',
  '/users/*',
  '/category/*',
  '/chat/*',
  '/orders/*',
  '/notices/*',
  '/search',
];

export function appleAppSiteAssociation(env: Env) {
  if (!env.APPLE_TEAM_ID) return null;
  const appId = `${env.APPLE_TEAM_ID}.${env.APP_BUNDLE_ID || DEFAULT_BUNDLE_ID}`;
  return {
    applinks: {
      details: [
        {
          appIDs: [appId],
          // 위에서부터 첫 번째로 맞는 규칙을 쓰므로 제외 규칙을 먼저 둔다
          components: [
            ...EXCLUDED.map((p) => ({ '/': p, exclude: true })),
            ...APP_PATHS.map((p) => ({ '/': p })),
          ] as { '/': string; exclude?: boolean }[],
        },
      ],
    },
    webcredentials: { apps: [appId] },
  };
}

export function assetLinks(env: Env) {
  const fingerprints = (env.ANDROID_CERT_SHA256 ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!fingerprints.length) return null;
  return [
    {
      relation: [
        'delegate_permission/common.handle_all_urls',
        'delegate_permission/common.get_login_creds',
      ],
      target: {
        namespace: 'android_app',
        package_name: env.APP_BUNDLE_ID || DEFAULT_BUNDLE_ID,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}
