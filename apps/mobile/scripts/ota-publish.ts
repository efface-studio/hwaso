/**
 * OTA 업데이트 배포 (docs/MOBILE_RELEASE.md 「OTA 업데이트」).
 * JS 번들·이미지를 만들어 서버에 올리고 업데이트로 등록한다. 앱은 다음 실행 때 적용한다.
 *
 *   OTA_PUBLISH_TOKEN=... pnpm --filter @shop/mobile ota:publish -- --message "판매 탭 문구 수정"
 *
 * 옵션: --platform ios|android|all (기본 all) · --message · --critical (받는 즉시 다시 시작)
 *       --rollout 1~100 (기본 100, 일부 기기에만) · --channel (기본 OTA_CHANNEL 또는 production)
 * 환경: OTA_PUBLISH_TOKEN (서버와 같은 값), OTA_API_URL (기본 EXPO_PUBLIC_API_URL — .env 파일에서 읽는다)
 *
 * 런타임 버전(fingerprint)은 스토어 빌드와 같은 소스·같은 환경 변수로 계산해야 맞는다 — 다르면 앱이 받지 않는다.
 */
import { execFileSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { OTA_PLATFORMS, type OtaAsset, type OtaPlatform, type OtaUpdateDto } from '@shop/shared';

const ROOT = path.join(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'dist-ota');
const requireFrom = createRequire(import.meta.url);

const { values: args } = parseArgs({
  // pnpm ota:publish -- --message ... 처럼 앞에 붙는 -- 는 무시한다
  args: process.argv.slice(2).filter((a) => a !== '--'),
  options: {
    platform: { type: 'string', default: 'all' },
    message: { type: 'string', default: '' },
    critical: { type: 'boolean', default: false },
    rollout: { type: 'string', default: '100' },
    channel: { type: 'string' },
  },
});

/** expo CLI 와 같은 규칙으로 .env 파일을 읽는다 — 빌드 때와 같은 설정·런타임 버전이 나오게 */
async function loadEnv() {
  // 스토어 빌드와 같은 .env 파일 조합을 읽도록 (expo export 도 production 으로 번들한다)
  process.env.NODE_ENV ??= 'production';
  const expoEnv = (await import(
    requireFrom.resolve('@expo/env', { paths: [requireFrom.resolve('expo/package.json', { paths: [ROOT] })] })
  )) as { load: (root: string) => void };
  expoEnv.load(ROOT);
}

/** 진행 상황 출력 (lint 가 console.log 를 막는다) */
const log = (msg: string) => process.stdout.write(`${msg}\n`);

const run = (cmd: string, argv: string[]) =>
  execFileSync(cmd, argv, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
  json: 'application/json',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
};

interface ExportMetadata {
  fileMetadata: Record<string, { bundle: string; assets: { path: string; ext: string }[] }>;
}

async function upload(api: string, token: string, file: string, contentType: string, ext: string) {
  const form = new FormData();
  form.set(
    'file',
    new Blob([await readFile(path.join(OUT, file))], { type: contentType }),
    path.basename(file),
  );
  form.set('contentType', contentType);
  form.set('fileExtension', ext);
  const res = await fetch(`${api}/ota/assets`, {
    method: 'POST',
    headers: { 'x-ota-publish-token': token },
    body: form,
  });
  if (!res.ok) throw new Error(`자산 업로드 실패 (${res.status}) ${file}: ${await res.text()}`);
  return (await res.json()) as OtaAsset;
}

/** 여러 개를 동시에 올리되 한꺼번에 너무 많이 열지 않는다 */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

async function publish(platform: OtaPlatform, api: string, token: string, expoClient: unknown) {
  const runtimeVersion = (
    JSON.parse(run('npx', ['expo-updates', 'runtimeversion:resolve', '--platform', platform])) as {
      runtimeVersion: string | null;
    }
  ).runtimeVersion;
  if (!runtimeVersion) throw new Error(`${platform} 런타임 버전을 계산하지 못했어요`);

  const meta = JSON.parse(await readFile(path.join(OUT, 'metadata.json'), 'utf8')) as ExportMetadata;
  const files = meta.fileMetadata[platform];
  if (!files) throw new Error(`${platform} 번들이 없어요`);

  log(`[${platform}] 런타임 ${runtimeVersion.slice(0, 12)}… · 자산 ${files.assets.length}개 업로드`);
  const launchAsset = await upload(api, token, files.bundle, 'application/javascript', '.bundle');
  const assets = await mapLimit(files.assets, 6, (a) =>
    upload(api, token, a.path, CONTENT_TYPES[a.ext.toLowerCase()] ?? 'application/octet-stream', `.${a.ext}`),
  );

  const res = await fetch(`${api}/ota/updates`, {
    method: 'POST',
    headers: { 'x-ota-publish-token': token, 'content-type': 'application/json' },
    body: JSON.stringify({
      platform,
      runtimeVersion,
      channel: args.channel ?? process.env.OTA_CHANNEL ?? 'production',
      message: args.message,
      critical: args.critical,
      rolloutPercent: Number(args.rollout),
      launchAsset,
      assets,
      expoClient,
    }),
  });
  if (!res.ok) throw new Error(`업데이트 등록 실패 (${res.status}): ${await res.text()}`);
  const update = (await res.json()) as OtaUpdateDto;
  log(`[${platform}] 배포 완료 ${update.id} (${update.rolloutPercent}%${update.critical ? ', 긴급' : ''})`);
}

async function main() {
  await loadEnv();
  const token = process.env.OTA_PUBLISH_TOKEN;
  const api = process.env.OTA_API_URL ?? process.env.EXPO_PUBLIC_API_URL;
  if (!token) throw new Error('OTA_PUBLISH_TOKEN 이 필요해요');
  if (!api) throw new Error('OTA_API_URL 또는 EXPO_PUBLIC_API_URL 이 필요해요');
  const platforms: OtaPlatform[] =
    args.platform === 'all' ? [...OTA_PLATFORMS] : [args.platform as OtaPlatform];
  if (!platforms.every((p) => OTA_PLATFORMS.includes(p)))
    throw new Error(`알 수 없는 플랫폼: ${args.platform}`);
  const rollout = Number(args.rollout);
  if (!Number.isInteger(rollout) || rollout < 1 || rollout > 100) throw new Error('--rollout 은 1~100');

  await rm(OUT, { recursive: true, force: true });
  run('npx', [
    'expo',
    'export',
    ...platforms.flatMap((p) => ['--platform', p]),
    '--output-dir',
    OUT,
    '--clear',
  ]);
  // 앱이 Constants.expoConfig 로 읽는 설정 — 매니페스트 extra.expoClient 로 내려준다
  const expoClient = JSON.parse(run('npx', ['expo', 'config', '--type', 'public', '--json'])) as unknown;

  for (const p of platforms) await publish(p, api, token, expoClient);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
