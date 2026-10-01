import { createHash, createVerify } from 'node:crypto';
import type { OtaAsset, OtaPublishInput } from '@shop/shared';
import type { Response } from 'supertest';
import { env } from '../src/config/env';
import { inRollout } from '../src/ota/ota.protocol';
import { createTestApp, type TestContext } from './app';
import { createUser } from './fixtures';

let t: TestContext;
let seq = 0;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});

const TOKEN = { 'x-ota-publish-token': process.env.OTA_PUBLISH_TOKEN! };
const PUBLIC_KEY = process.env.OTA_TEST_PUBLIC_KEY!;
const M = '/api/v1/ota/manifest';

/** 테스트마다 다른 runtimeVersion 으로 서로 간섭하지 않게 한다 */
const runtime = () => `1.0.${++seq}-${Date.now()}`;

const asset = (n: number, ext = '.png'): OtaAsset => ({
  hash: createHash('sha256').update(`asset-${n}`).digest('base64url'),
  key: createHash('md5').update(`asset-${n}`).digest('hex'),
  contentType: ext ? 'image/png' : 'application/javascript',
  fileExtension: ext,
  url: `http://localhost:9000/shop-media/public/ota/${n}${ext}`,
});

async function publish(runtimeVersion: string, over: Partial<OtaPublishInput> = {}) {
  const res = await t.http
    .post('/api/v1/ota/updates')
    .set(TOKEN)
    .send({
      platform: 'ios',
      runtimeVersion,
      message: `v${seq}`,
      launchAsset: asset(++seq, ''),
      assets: [asset(++seq)],
      ...over,
    })
    .expect(201);
  return res.body as { id: string; createdAt: string };
}

function manifestReq(headers: Record<string, string>) {
  return (
    t.http
      .get(M)
      .set({ 'expo-protocol-version': '1', 'expo-platform': 'ios', ...headers })
      // multipart/mixed 는 supertest 기본 파서가 버리므로 Buffer 로 받는다
      .responseType('blob')
  );
}

type Part = { headers: Record<string, string>; body: string };

function parts(res: Response): Record<string, Part> {
  const boundary = /boundary=(.+)$/.exec(String(res.headers['content-type']))![1]!;
  const text = Buffer.isBuffer(res.body) ? res.body.toString('utf8') : '';
  expect(text.endsWith(`--${boundary}--\r\n`)).toBe(true);
  const out: Record<string, Part> = {};
  for (const raw of text.split(`--${boundary}`).slice(1, -1)) {
    const chunk = raw.slice(2, -2); // 앞뒤 CRLF
    const sep = chunk.indexOf('\r\n\r\n');
    const headers: Record<string, string> = {};
    for (const line of chunk.slice(0, sep).split('\r\n')) {
      const i = line.indexOf(':');
      headers[line.slice(0, i).toLowerCase()] = line.slice(i + 1).trim();
    }
    const name = /name="(\w+)"/.exec(headers['content-disposition']!)![1]!;
    out[name] = { headers, body: chunk.slice(sep + 4) };
  }
  return out;
}

function verified(p: Part): boolean {
  const m = /^sig="([^"]+)", keyid="main"$/.exec(p.headers['expo-signature'] ?? '');
  if (!m) return false;
  return createVerify('RSA-SHA256').update(p.body, 'utf8').verify(PUBLIC_KEY, m[1]!, 'base64');
}

describe('publish token', () => {
  it('rejects missing or wrong token', async () => {
    await t.http.post('/api/v1/ota/updates').send({}).expect(401);
    await t.http
      .post('/api/v1/ota/updates')
      .set({ 'x-ota-publish-token': 'x'.repeat(40) })
      .send({})
      .expect(401);
    await t.http.post('/api/v1/ota/assets').attach('file', Buffer.from('x'), 'a.js').expect(401);
  });

  it('503 when the server has no token', async () => {
    const e = env();
    const saved = e.OTA_PUBLISH_TOKEN;
    e.OTA_PUBLISH_TOKEN = undefined;
    try {
      const res = await t.http.post('/api/v1/ota/updates').set(TOKEN).send({}).expect(503);
      expect(res.body.error.code).toBe('OTA_NOT_CONFIGURED');
    } finally {
      e.OTA_PUBLISH_TOKEN = saved;
    }
  });

  it('validates the publish body', async () => {
    await t.http
      .post('/api/v1/ota/updates')
      .set(TOKEN)
      .send({ platform: 'ios', runtimeVersion: '1', launchAsset: { ...asset(1), hash: 'x' }, assets: [] })
      .expect(400);
  });
});

describe('asset upload', () => {
  it('stores by content hash and returns manifest identifiers', async () => {
    const body = Buffer.from(`console.log(${Date.now()})`);
    const sha = createHash('sha256').update(body).digest();
    const res = await t.http
      .post('/api/v1/ota/assets')
      .set(TOKEN)
      .field('contentType', 'application/javascript')
      .field('fileExtension', '.js')
      .attach('file', body, 'bundle.js')
      .expect(201);
    expect(res.body).toEqual({
      hash: sha.toString('base64url'),
      key: createHash('md5').update(body).digest('hex'),
      contentType: 'application/javascript',
      fileExtension: '.js',
      url: `${env().MEDIA_PUBLIC_URL}/ota/${sha.toString('hex')}.js`,
    });
    expect(res.body.hash).not.toContain('=');
    expect(t.s3.objects.get(`public/ota/${sha.toString('hex')}.js`)).toEqual({
      contentType: 'application/javascript',
      size: body.byteLength,
    });
  });

  it('rejects unsafe extensions and missing file', async () => {
    await t.http
      .post('/api/v1/ota/assets')
      .set(TOKEN)
      .field('contentType', 'image/png')
      .field('fileExtension', '../x')
      .attach('file', Buffer.from('x'), 'a.png')
      .expect(400);
    await t.http.post('/api/v1/ota/assets').set(TOKEN).field('contentType', 'image/png').expect(400);
  });
});

describe('manifest', () => {
  it('400 without platform or runtime version', async () => {
    await t.http.get(M).set({ 'expo-runtime-version': '1' }).expect(400);
    await t.http.get(M).set({ 'expo-platform': 'web', 'expo-runtime-version': '1' }).expect(400);
    await t.http.get(M).set({ 'expo-platform': 'ios' }).expect(400);
  });

  it('serves a signed multipart manifest for the latest update', async () => {
    const rv = runtime();
    await publish(rv);
    const up = await publish(rv, {
      critical: true,
      launchAsset: asset(900, ''),
      assets: [asset(901), asset(902, '.ttf')],
      expoClient: { name: '화소', version: '1.0.0' },
    });

    const res = await manifestReq({
      'expo-runtime-version': rv,
      'expo-expect-signature': 'sig, keyid="main"',
    })
      .expect(200)
      .expect('expo-protocol-version', '1')
      .expect('expo-sfv-version', '0')
      .expect('cache-control', 'private, max-age=0');
    expect(res.headers['content-type']).toMatch(/^multipart\/mixed; boundary=/);

    const p = parts(res);
    expect(p.manifest!.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(verified(p.manifest!)).toBe(true);
    const manifest = JSON.parse(p.manifest!.body);
    const { fileExtension: _, ...launch } = asset(900, '');
    expect(manifest).toEqual({
      id: up.id,
      createdAt: up.createdAt,
      runtimeVersion: rv,
      launchAsset: launch,
      assets: [asset(901), asset(902, '.ttf')],
      metadata: {},
      extra: { expoClient: { name: '화소', version: '1.0.0' }, critical: true },
    });
    expect(JSON.parse(p.extensions!.body)).toEqual({ assetRequestHeaders: {} });

    // 서명 헤더가 없어도 키가 있으면 서명한다 (캐시된 파트 재사용)
    const again = parts(await manifestReq({ 'expo-runtime-version': rv }).expect(200));
    expect(again.manifest!.body).toBe(p.manifest!.body);
    expect(verified(again.manifest!)).toBe(true);
  });

  it('204 when already on the latest, or nothing for this runtime/channel/platform', async () => {
    const rv = runtime();
    const up = await publish(rv);
    await manifestReq({ 'expo-runtime-version': rv, 'expo-current-update-id': up.id })
      .expect(204)
      .expect('expo-protocol-version', '1');
    await manifestReq({ 'expo-runtime-version': rv, 'expo-current-update-id': up.id.toUpperCase() }).expect(
      204,
    );
    await manifestReq({ 'expo-runtime-version': `${rv}-other` }).expect(204);
    await manifestReq({ 'expo-runtime-version': rv, 'expo-channel-name': 'staging' }).expect(204);
    await manifestReq({ 'expo-runtime-version': rv, 'expo-platform': 'android' }).expect(204);
  });

  it('500 when a signature is expected but no key is configured', async () => {
    const rv = runtime();
    await publish(rv);
    const e = env();
    const saved = e.OTA_SIGNING_KEY;
    e.OTA_SIGNING_KEY = undefined;
    try {
      await manifestReq({ 'expo-runtime-version': rv, 'expo-expect-signature': 'sig' }).expect(500);
    } finally {
      e.OTA_SIGNING_KEY = saved;
    }
  });

  it('rollout < 100% is decided by eas-client-id', async () => {
    const rv = runtime();
    const base = await publish(rv);
    const partial = await publish(rv, { rolloutPercent: 30 });
    const clients = Array.from({ length: 200 }, (_, i) => `client-${i}`);
    const inside = clients.find((c) => inRollout(partial.id, 30, c))!;
    const outside = clients.find((c) => !inRollout(partial.id, 30, c))!;

    const idFor = async (clientId?: string) => {
      const res = await manifestReq({
        'expo-runtime-version': rv,
        ...(clientId ? { 'eas-client-id': clientId } : {}),
      }).expect(200);
      return JSON.parse(parts(res).manifest!.body).id as string;
    };
    expect(await idFor(inside)).toBe(partial.id);
    expect(await idFor(inside)).toBe(partial.id);
    expect(await idFor(outside)).toBe(base.id);
    // 기기 ID 가 없으면 100% 배포만
    expect(await idFor()).toBe(base.id);
  });
});

describe('admin', () => {
  it('requires an admin role', async () => {
    const user = await createUser(t);
    await t.http.get('/api/v1/admin/ota').expect(401);
    await t.http.get('/api/v1/admin/ota').set(user.auth).expect(403);
    await t.http.patch('/api/v1/admin/ota/x').set(user.auth).send({ rolloutPercent: 10 }).expect(403);
    await t.http
      .post('/api/v1/admin/ota/rollback')
      .set(user.auth)
      .send({ platform: 'ios', runtimeVersion: '1', target: 'embedded' })
      .expect(403);
  });

  it('lists and patches updates with an audit log', async () => {
    const admin = await createUser(t, 'ADMIN');
    const rv = runtime();
    const up = await publish(rv, { platform: 'android', channel: 'staging' });

    const list = await t.http
      .get('/api/v1/admin/ota')
      .query({ platform: 'android', channel: 'staging' })
      .set(admin.auth)
      .expect(200);
    expect(list.body[0]).toMatchObject({
      id: up.id,
      platform: 'android',
      channel: 'staging',
      kind: 'UPDATE',
      status: 'ACTIVE',
      rolloutPercent: 100,
      assetCount: 2,
    });
    expect(list.body.every((r: { platform: string }) => r.platform === 'android')).toBe(true);

    const patched = await t.http
      .patch(`/api/v1/admin/ota/${up.id}`)
      .set(admin.auth)
      .send({ rolloutPercent: 20 })
      .expect(200);
    expect(patched.body.rolloutPercent).toBe(20);
    await t.http.patch(`/api/v1/admin/ota/${up.id}`).set(admin.auth).send({ rolloutPercent: 0 }).expect(400);
    await t.http.patch('/api/v1/admin/ota/nope').set(admin.auth).send({ status: 'ACTIVE' }).expect(404);

    // 배포 중단 → 더 이상 내려주지 않는다
    await t.http
      .patch(`/api/v1/admin/ota/${up.id}`)
      .set(admin.auth)
      .send({ status: 'ROLLED_BACK' })
      .expect(200);
    await manifestReq({
      'expo-runtime-version': rv,
      'expo-platform': 'android',
      'expo-channel-name': 'staging',
    })
      .set('eas-client-id', 'c1')
      .expect(204);
    expect(await t.prisma.auditLog.count({ where: { action: 'ota.update', targetId: up.id } })).toBe(2);
  });

  it('rollback previous republishes the older update under a new id', async () => {
    const admin = await createUser(t, 'ADMIN');
    const rv = runtime();
    const v1 = await publish(rv, { message: '첫 배포', launchAsset: asset(700, ''), assets: [asset(701)] });
    const v2 = await publish(rv);

    const res = await t.http
      .post('/api/v1/admin/ota/rollback')
      .set(admin.auth)
      .send({ platform: 'ios', runtimeVersion: rv, target: 'previous' })
      .expect(200);
    expect(res.body).toMatchObject({ kind: 'UPDATE', message: '되돌림: 첫 배포', status: 'ACTIVE' });
    expect(res.body.id).not.toBe(v1.id);
    expect(new Date(res.body.createdAt).getTime()).toBeGreaterThan(new Date(v2.createdAt).getTime());
    expect((await t.prisma.otaUpdate.findUnique({ where: { id: v2.id } }))!.status).toBe('ROLLED_BACK');
    expect((await t.prisma.otaUpdate.findUnique({ where: { id: v1.id } }))!.status).toBe('ACTIVE');

    // v2 를 받은 기기는 새 id 의 v1 내용을 받는다
    const p = parts(
      await manifestReq({ 'expo-runtime-version': rv, 'expo-current-update-id': v2.id }).expect(200),
    );
    const manifest = JSON.parse(p.manifest!.body);
    expect(manifest.id).toBe(res.body.id);
    expect(manifest.launchAsset.hash).toBe(asset(700, '').hash);
    expect(manifest.assets).toEqual([asset(701)]);
    expect(await t.prisma.auditLog.count({ where: { action: 'ota.rollback', targetId: res.body.id } })).toBe(
      1,
    );
  });

  it('rollback previous without an older update falls back to embedded; 404 when nothing to roll back', async () => {
    const admin = await createUser(t, 'ADMIN');
    const rv = runtime();
    await t.http
      .post('/api/v1/admin/ota/rollback')
      .set(admin.auth)
      .send({ platform: 'ios', runtimeVersion: rv, target: 'previous' })
      .expect(404);
    await publish(rv);
    const res = await t.http
      .post('/api/v1/admin/ota/rollback')
      .set(admin.auth)
      .send({ platform: 'ios', runtimeVersion: rv, target: 'previous' })
      .expect(200);
    expect(res.body).toMatchObject({ kind: 'ROLLBACK', assetCount: 0 });
  });

  it('rollback embedded sends a signed directive unless the client already runs the embedded bundle', async () => {
    const admin = await createUser(t, 'ADMIN');
    const rv = runtime();
    const up = await publish(rv);
    const res = await t.http
      .post('/api/v1/admin/ota/rollback')
      .set(admin.auth)
      .send({ platform: 'ios', runtimeVersion: rv, target: 'embedded' })
      .expect(200);
    expect(res.body).toMatchObject({ kind: 'ROLLBACK', message: '내장 버전으로 되돌림' });

    const embedded = '11111111-1111-4111-8111-111111111111';
    const p = parts(
      await manifestReq({
        'expo-runtime-version': rv,
        'expo-current-update-id': up.id,
        'expo-embedded-update-id': embedded,
      }).expect(200),
    );
    expect(p.manifest).toBeUndefined();
    expect(verified(p.directive!)).toBe(true);
    expect(JSON.parse(p.directive!.body)).toEqual({
      type: 'rollBackToEmbedded',
      parameters: { commitTime: res.body.createdAt },
    });

    await manifestReq({
      'expo-runtime-version': rv,
      'expo-current-update-id': embedded,
      'expo-embedded-update-id': embedded,
    }).expect(204);
    await manifestReq({ 'expo-runtime-version': rv }).expect(204);
  });
});
