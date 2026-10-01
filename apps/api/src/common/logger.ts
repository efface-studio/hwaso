import { randomUUID } from 'node:crypto';
import pino from 'pino';
import { pinoHttp } from 'pino-http';

/** 로그에서 토큰·비밀번호·개인정보를 가린다 (docs/SECURITY.md) */
const REDACT = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-reauth-token"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.newPassword',
  '*.currentPassword',
  '*.refreshToken',
  '*.accessToken',
  '*.verificationToken',
  '*.reauthToken',
  '*.secret',
  '*.code',
  '*.phone',
  '*.address1',
  '*.address2',
  '*.bankAccount',
];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  redact: { paths: REDACT, censor: '[redacted]' },
  transport:
    process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { singleLine: true } }
      : undefined,
});

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const incoming = req.headers['x-request-id'];
    const id = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader('x-request-id', id);
    return id;
  },
  autoLogging: { ignore: (req) => req.url === '/api/v1/health' },
  serializers: {
    req: (req: { id: string; method: string; url: string }) => ({
      id: req.id,
      method: req.method,
      url: req.url,
    }),
    res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
  },
});
