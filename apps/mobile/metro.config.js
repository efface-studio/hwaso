// Expo 가 모노레포(워크스페이스 패키지)를 자동으로 설정한다 — watchFolders 등을 직접 넣지 않는다
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// 시연 데이터(기록한 응답 ≈1MB · 이미지 ≈5MB)는 시연이 꺼진 배포 번들에서 빈 모듈로 바꿔 뺀다.
// 앱의 demoEnabled(__DEV__ || EXPO_PUBLIC_DEMO === '1')와 같은 조건 — context.dev 가 곧 번들의 __DEV__ 다
const DEMO_FETCH = path.join('src', 'demo', 'demo-fetch.ts');
const DEMO_DATA = new Set(['./data/snapshot', './data/media']);
const DEMO_EMPTY = path.join(__dirname, 'src/demo/data/empty.ts');
const upstream = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    !context.dev &&
    process.env.EXPO_PUBLIC_DEMO !== '1' &&
    context.originModulePath.endsWith(DEMO_FETCH) &&
    DEMO_DATA.has(moduleName)
  )
    return { type: 'sourceFile', filePath: DEMO_EMPTY };
  return (upstream ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
