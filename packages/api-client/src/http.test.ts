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
