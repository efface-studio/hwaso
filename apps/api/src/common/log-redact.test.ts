import { describe, expect, it } from 'vitest';
import { LogBuffer } from './log-buffer';
import { maskEmail, maskIp, resetEnvSecretsForTest, scrub, toLogEntry } from './log-redact';

const line = (o: Record<string, unknown>) =>
  JSON.stringify({ level: 30, time: Date.UTC(2026, 9, 1), pid: 1, hostname: 'h', ...o });

describe('log redaction', () => {
  it('masks emails and IPs partially', () => {
    expect(maskEmail('abcdef@example.com')).toBe('ab***@example.com');
    expect(maskEmail('a@x.io')).toBe('a***@x.io');
    expect(maskIp('203.0.113.42')).toBe('203.0.113.*');
    expect(maskIp('::ffff:10.1.2.3')).toBe('::ffff:10.1.2.*');
    expect(maskIp('2001:db8:85a3:0:0:8a2e:370:7334')).toBe('2001:db8:85a3:*');
    expect(scrub('login from 198.51.100.7 by kim.chulsoo@example.com')).toBe(
      'login from 198.51.100.* by ki***@example.com',
    );
  });

  it('removes tokens, cookies, passwords, OTP codes and phone numbers from text', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.c2lnbmF0dXJl';
    const out = scrub(
      `Bearer ${jwt} cookie=sid123; password: "hunter22" 인증번호: 482913 call 010-1234-5678 ` +
        `/auth/callback?code=abc&state=xyz&next=/home token=${jwt}`,
    );
    expect(out).not.toContain(jwt);
    expect(out).not.toContain('sid123');
    expect(out).not.toContain('hunter22');
    expect(out).not.toContain('482913');
    expect(out).not.toContain('1234-5678');
    expect(out).toContain('010-****-5678');
    expect(out).toContain('code=[redacted]');
    expect(out).toContain('state=[redacted]');
    expect(out).toContain('next=/home');
  });

  it('never ships env secrets or connection-string credentials (e.g. inside an error message)', () => {
    process.env.TEST_FAKE_SECRET = 'super-secret-value-123';
    resetEnvSecretsForTest();
    const e = toLogEntry(
      line({
        level: 50,
        msg: 'boom',
        err: {
          type: 'PrismaClientInitializationError',
          message: `cannot reach postgresql://shop:pw@db:5432/shop with super-secret-value-123`,
          stack: 'Error: boom\n    at /srv/app/dist/main.js:1:1 DATABASE_URL=postgresql://shop:pw@db',
        },
      }),
      1,
    )!;
    delete process.env.TEST_FAKE_SECRET;
    resetEnvSecretsForTest();
    expect(e.level).toBe('error');
    expect(e.err!.type).toBe('PrismaClientInitializationError');
    expect(e.err!.message).not.toContain('pw@');
    expect(e.err!.message).not.toContain('super-secret-value-123');
    expect(JSON.stringify(e)).not.toContain('stack');
    expect(JSON.stringify(e)).not.toContain('/srv/app');
  });

  it('keeps request summary fields and redacts sensitive keys in the rest', () => {
    const e = toLogEntry(
      line({
        req: {
          id: 'req-1',
          method: 'POST',
          url: '/api/v1/auth/reset?token=abc',
          headers: { authorization: 'x' },
        },
        res: { statusCode: 401 },
        responseTime: 12.6,
        msg: 'request completed',
        context: 'Auth',
        email: 'someone@example.com',
        ip: '192.0.2.10',
        body: { password: 'pw', code: '123456', nickname: 'kim' },
        refreshToken: 'r',
        trace: 'Error\n at x',
      }),
      7,
    )!;
    expect(e).toMatchObject({
      seq: 7,
      level: 'info',
      reqId: 'req-1',
      method: 'POST',
      url: '/api/v1/auth/reset?token=[redacted]',
      status: 401,
      ms: 13,
      context: 'Auth',
    });
    expect(e.fields).toEqual({
      email: 'so***@example.com',
      ip: '192.0.2.*',
      'body.password': '[redacted]',
      'body.code': '[redacted]',
      'body.nickname': 'kim',
      refreshToken: '[redacted]',
    });
    expect(JSON.stringify(e)).not.toContain('authorization');
  });

  it('skips unparsable lines and summarizes oversized ones', () => {
    expect(toLogEntry('not json', 1)).toBeNull();
    expect(toLogEntry(line({ msg: 'x'.repeat(40_000) }), 2)!.msg).toContain('생략');
  });
});

describe('LogBuffer', () => {
  it('keeps the last N entries and filters by level, text and seq', () => {
    const b = new LogBuffer(3);
    const seen: number[] = [];
    const off = b.subscribe((e) => seen.push(e.seq));
    b.push(line({ msg: 'one' }));
    b.push(line({ level: 40, msg: 'two warn' }));
    b.push('garbage');
    b.push(line({ level: 50, msg: 'three error' }));
    b.push(line({ msg: 'four' }));
    off();
    b.push(line({ msg: 'five' }));
    expect(seen).toEqual([1, 2, 3, 4]);
    expect(b.size).toBe(3);
    expect(b.tail({ level: 'info', limit: 10 }).map((e) => e.msg)).toEqual(['three error', 'four', 'five']);
    expect(b.tail({ level: 'warn', limit: 10 }).map((e) => e.msg)).toEqual(['three error']);
    expect(b.tail({ level: 'info', q: 'fo', limit: 10 }).map((e) => e.msg)).toEqual(['four']);
    expect(b.tail({ level: 'info', after: 4, limit: 10 }).map((e) => e.msg)).toEqual(['five']);
    expect(b.tail({ level: 'info', limit: 1 }).map((e) => e.msg)).toEqual(['five']);
  });
});
