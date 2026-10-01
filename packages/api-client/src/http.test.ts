import { describe, expect, it, vi } from 'vitest';
import { type ApiError, buildQuery, createHttp } from './http';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('buildQuery', () => {
  it('빈 값은 제외하고 배열은 콤마로 합친다', () => {
    expect(buildQuery({ q: 'a b', saleType: ['FIXED', 'AUCTION'], empty: '', none: undefined })).toBe(
      '?q=a+b&saleType=FIXED%2CAUCTION',
    );
  });
});

describe('createHttp', () => {
  it('서버 에러 본문을 ApiError 로 변환한다', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        json(400, { error: { code: 'BID_TOO_LOW', message: 'm', details: { minAmount: 1 } } }),
      );
    const http = createHttp({ baseUrl: 'http://x', getAccessToken: () => null, fetch });
    await expect(http.get('/a')).rejects.toMatchObject({
      status: 400,
      code: 'BID_TOO_LOW',
      details: { minAmount: 1 },
    });
  });

  it('401 이면 refresh 를 한 번만 호출하고 재시도한다 (동시 요청 포함)', async () => {
    let token = 'old';
    const refresh = vi.fn(async () => {
      token = 'new';
      return token;
    });
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      const auth = (init.headers as Record<string, string>).Authorization;
      return auth === 'Bearer new'
        ? json(200, { ok: true })
        : json(401, { error: { code: 'UNAUTHORIZED', message: '' } });
    });
    const http = createHttp({
      baseUrl: 'http://x',
      getAccessToken: () => token,
      refresh,
      fetch: fetch as never,
    });
    const results = await Promise.all([http.get('/a'), http.get('/b'), http.get('/c')]);
    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('JSON 이 아닌 5xx 는 INTERNAL 메시지로 감춘다', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('<html>stack</html>', { status: 502 }));
    const http = createHttp({ baseUrl: 'http://x', getAccessToken: () => null, fetch });
    const err = (await http.get('/a').catch((e) => e)) as ApiError;
    expect(err.code).toBe('INTERNAL');
    expect(err.message).toBe('잠시 문제가 발생했습니다. 다시 시도해주세요.');
  });
});

describe('재인증 (403 REAUTH_REQUIRED)', () => {
  const reauthRequired = () => json(403, { error: { code: 'REAUTH_REQUIRED', message: '본인 확인' } });
  const headerOf = (init: RequestInit) => (init.headers as Record<string, string>)['x-reauth-token'];

  it('동시 요청 2개가 막혀도 훅은 한 번만 부르고 둘 다 헤더를 붙여 재시도한다', async () => {
    const reauth = vi.fn(async () => 'rt-1');
    const fetch = vi.fn(async (_url: string, init: RequestInit) =>
      headerOf(init) === 'rt-1' ? json(200, { ok: true }) : reauthRequired(),
    );
    const http = createHttp({
      baseUrl: 'http://x',
      getAccessToken: () => 'a',
      reauth,
      fetch: fetch as never,
    });
    const results = await Promise.all([http.post('/a', {}), http.patch('/b', {})]);
    expect(results).toEqual([{ ok: true }, { ok: true }]);
    expect(reauth).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(4);
    // 받은 토큰은 저장되어 다음 요청에 바로 붙는다
    await http.post('/c', {});
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(headerOf(fetch.mock.calls[4]![1])).toBe('rt-1');
  });

  it('훅이 null 이면(취소) 403 REAUTH_REQUIRED 를 던지고 다시 보내지 않는다', async () => {
    const reauth = vi.fn(async () => null);
    const fetch = vi.fn(async () => reauthRequired());
    const http = createHttp({
      baseUrl: 'http://x',
      getAccessToken: () => 'a',
      reauth,
      fetch: fetch as never,
    });
    await expect(http.post('/a', {})).rejects.toMatchObject({ status: 403, code: 'REAUTH_REQUIRED' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('직접 준 reauthToken 이 거부되면 훅을 부르지 않는다', async () => {
    const reauth = vi.fn(async () => 'rt-new');
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => reauthRequired());
    const http = createHttp({
      baseUrl: 'http://x',
      getAccessToken: () => 'a',
      reauth,
      fetch: fetch as never,
    });
    await expect(http.post('/a', {}, { reauthToken: 'mine' })).rejects.toMatchObject({
      code: 'REAUTH_REQUIRED',
    });
    expect(headerOf(fetch.mock.calls[0]![1])).toBe('mine');
    expect(reauth).not.toHaveBeenCalled();
  });

  it('setReauthToken 으로 저장한 토큰은 만료 전까지만 붙고, 거부되면 지우고 새로 받는다', async () => {
    const reauth = vi.fn(async () => 'fresh');
    const fetch = vi.fn(async (_url: string, init: RequestInit) =>
      headerOf(init) === 'fresh' ? json(200, { ok: true }) : reauthRequired(),
    );
    const http = createHttp({
      baseUrl: 'http://x',
      getAccessToken: () => 'a',
      reauth,
      fetch: fetch as never,
    });
    http.setReauthToken('expired', new Date(Date.now() - 1000).toISOString());
    await http.post('/a', {});
    expect(headerOf(fetch.mock.calls[0]![1])).toBeUndefined();

    http.setReauthToken('stale', new Date(Date.now() + 60_000).toISOString());
    await expect(http.post('/b', {})).resolves.toEqual({ ok: true });
    expect(headerOf(fetch.mock.calls[2]![1])).toBe('stale');
    expect(headerOf(fetch.mock.calls[3]![1])).toBe('fresh');
    expect(reauth).toHaveBeenCalledTimes(2);
  });

  it('다른 403 은 훅 없이 그대로 에러, 401 은 기존대로 refresh 후 재시도', async () => {
    const reauth = vi.fn(async () => 'rt');
    const refresh = vi.fn(async () => 'new');
    let token = 'old';
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/forbidden')) return json(403, { error: { code: 'FORBIDDEN', message: '' } });
      return (init.headers as Record<string, string>).Authorization === 'Bearer new'
        ? json(200, { ok: true })
        : json(401, { error: { code: 'INVALID_TOKEN', message: '' } });
    });
    const http = createHttp({
      baseUrl: 'http://x',
      getAccessToken: () => token,
      refresh: async () => {
        token = await refresh();
        return token;
      },
      reauth,
      fetch: fetch as never,
    });
    await expect(http.get('/forbidden')).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    await expect(http.get('/a')).resolves.toEqual({ ok: true });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reauth).not.toHaveBeenCalled();
  });
});
