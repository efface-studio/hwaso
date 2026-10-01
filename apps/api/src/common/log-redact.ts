import type { ServerLogEntry, ServerLogLevel } from '@shop/shared';

/**
 * 관리자 화면으로 내보내는 서버 로그를 가린다 (docs/SECURITY.md "서버 로그 열람").
 * pino redact 를 거친 줄이라도 메시지·URL·에러 문구에 섞인 값은 남아 있을 수 있어, 내보내기 전에 한 번 더 거른다.
 * 원칙: 알려진 필드만 골라 담고(스택·요청 헤더 제외), 문자열은 모두 아래 규칙으로 문지른다.
 */

const LEVELS: Record<number, ServerLogLevel> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
};

/** 값을 통째로 가리는 키 (부분 일치, 대소문자 무시) */
const SECRET_KEY =
  /pass(word|wd)?|token|secret|authori[sz]ation|cookie|otp|^code$|phone|address|bank|account|^ci|card|jwt|session|signature|private|credential|api_?key|^key$|^auth$|enc$/i;
const EMAIL_KEY = /email/i;
const IP_KEY = /(^|\.)(ip|remoteAddress|clientIp|x-forwarded-for)$/i;
/** 내보내지 않는 키: 스택(환경 값·경로 노출), pino 기본 필드, 따로 담는 필드 */
const SKIP_KEY = new Set([
  'pid',
  'hostname',
  'time',
  'level',
  'msg',
  'v',
  'stack',
  'trace',
  'req',
  'res',
  'err',
  'error',
  'context',
  'reqId',
  'responseTime',
  'headers',
]);

const MAX_MSG = 2000;
const MAX_FIELD = 300;
const MAX_FIELDS = 20;
/** 이보다 긴 줄은 파싱하지 않는다 (큰 객체를 통째로 남긴 로그) */
export const MAX_LINE = 32 * 1024;

/** "abcdef@example.com" → "ab***@example.com" */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '***';
  const local = email.slice(0, at);
  return `${local.slice(0, local.length > 2 ? 2 : 1)}***${email.slice(at)}`;
}

/** IPv4 는 마지막 자리, IPv6 는 앞 세 묶음만 남긴다 */
export function maskIp(ip: string): string {
  const v4 = ip.match(/^(.*?)(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
  if (v4) return `${v4[1]}${v4[2]}.*`;
  const groups = ip.split(':');
  return groups.length > 3 ? `${groups.slice(0, 3).join(':')}:*` : '*';
}

let envSecrets: string[] | null = null;
/** 환경 변수 중 비밀값 (8자 이상) — 에러 문구에 접속 문자열 등이 섞여 나오는 경우를 막는다 */
function secretsFromEnv(): string[] {
  envSecrets ??= Object.entries(process.env)
    .filter(
      ([k, v]) =>
        /SECRET|KEY|TOKEN|PASSWORD|PRIVATE|DATABASE_URL|REDIS_URL|SMTP_URL|SERVICE_ACCOUNT|DEMO_ACCOUNTS/.test(
          k,
        ) &&
        !!v &&
        v.length >= 8,
    )
    .map(([, v]) => v!)
    // 긴 값부터 바꿔야 겹치는 값이 덜 드러난다
    .sort((a, b) => b.length - a.length);
  return envSecrets;
}

/** 테스트에서 환경 변수를 바꾼 뒤 다시 읽게 한다 */
export const resetEnvSecretsForTest = () => {
  envSecrets = null;
};

const RULES: [RegExp, string | ((...m: string[]) => string)][] = [
  // 접속 문자열의 계정 정보 (postgres://user:pass@host)
  [/\b([a-z][\w+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi, '$1[redacted]@'],
  [/\b(Bearer|Basic)\s+[\w.~+/=-]+/gi, '$1 [redacted]'],
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]*/g, '[jwt]'],
  // 주소창 쿼리의 민감한 값 (?token=…&code=…)
  [
    /([?&;](?:[\w-]*(?:token|code|state|password|secret|key|signature|otp|auth|email)[\w-]*)=)[^&\s#"']*/gi,
    '$1[redacted]',
  ],
  // 문장 속 "password: …", "token=…" 같은 쌍
  [
    /(\b(?:password|passwd|pwd|token|secret|otp|code|authorization|cookie|set-cookie)\b["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;&]+)/gi,
    '$1[redacted]',
  ],
  [/(인증번호\s*[:：]?\s*)\d{4,8}/g, '$1[redacted]'],
  // 이메일 → 앞 두 글자만
  [/[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, (m) => maskEmail(m)],
  // 휴대전화 → 가운데 가림
  [
    /(\+?82[-. ]?|\b)(01[016789])[-. ]?\d{3,4}[-. ]?(\d{4})\b/g,
    (_m, cc: string, head: string, tail: string) => `${cc}${head}-****-${tail}`,
  ],
  // IPv4 → 마지막 자리
  [/\b(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}\b/g, '$1.*'],
  // IPv6 → 앞 세 묶음
  [/\b([0-9a-f]{1,4}:[0-9a-f]{1,4}:[0-9a-f]{1,4}):[0-9a-f:]*[0-9a-f]\b/gi, '$1:*'],
];

/** 문자열 하나를 규칙대로 문지른다 */
export function scrub(text: string, max = MAX_MSG): string {
  let s = text.length > max * 2 ? text.slice(0, max * 2) : text;
  for (const secret of secretsFromEnv()) if (s.includes(secret)) s = s.split(secret).join('[env]');
  for (const [re, to] of RULES) s = s.replace(re, to as string);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

type Scalar = string | number | boolean | null;

/** 키 이름으로 가리고, 문자열이면 문지른다 */
function field(key: string, v: unknown): Scalar | undefined {
  // 펼친 키(body.code)는 마지막 이름으로 판단한다
  const leaf = key.slice(key.lastIndexOf('.') + 1);
  const secret = SECRET_KEY.test(leaf) || SECRET_KEY.test(key);
  if (v === null || typeof v === 'number' || typeof v === 'boolean') return secret ? '[redacted]' : v;
  if (typeof v !== 'string') return undefined;
  if (secret) return '[redacted]';
  if (EMAIL_KEY.test(leaf)) return maskEmail(v);
  if (IP_KEY.test(key)) return maskIp(v);
  return scrub(v, MAX_FIELD);
}

/** 나머지 필드: 한 단계까지 펼친 단일 값만, 최대 20개 */
function extraFields(o: Record<string, unknown>): ServerLogEntry['fields'] {
  const out: Record<string, Scalar> = {};
  let n = 0;
  const put = (k: string, v: unknown) => {
    if (n >= MAX_FIELDS) return;
    const x = field(k, v);
    if (x === undefined) return;
    out[k] = x;
    n++;
  };
  for (const [k, v] of Object.entries(o)) {
    if (SKIP_KEY.has(k)) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (SECRET_KEY.test(k)) put(k, '[redacted]');
      else for (const [k2, v2] of Object.entries(v)) if (!SKIP_KEY.has(k2)) put(`${k}.${k2}`, v2);
    } else if (Array.isArray(v)) put(k, `[${v.length}개]`);
    else put(k, v);
  }
  return n ? out : undefined;
}

const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** pino 가 쓴 JSON 한 줄 → 가린 항목. 파싱할 수 없으면 null */
export function toLogEntry(line: string, seq: number): ServerLogEntry | null {
  if (line.length > MAX_LINE)
    return { seq, time: new Date().toISOString(), level: 'info', msg: '[로그가 너무 길어 생략했어요]' };
  let o: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(line);
    if (!parsed || typeof parsed !== 'object') return null;
    o = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  const req = (o.req && typeof o.req === 'object' ? o.req : {}) as Record<string, unknown>;
  const res = (o.res && typeof o.res === 'object' ? o.res : {}) as Record<string, unknown>;
  const errRaw = (o.err ?? o.error) as Record<string, unknown> | string | undefined;
  const time = num(o.time);
  const entry: ServerLogEntry = {
    seq,
    time: new Date(time ?? Date.now()).toISOString(),
    level: LEVELS[num(o.level) ?? 30] ?? 'info',
    msg: scrub(str(o.msg) ?? ''),
  };
  const context = str(o.context);
  if (context) entry.context = scrub(context, 100);
  const reqId = str(req.id) ?? str(o.reqId);
  if (reqId) entry.reqId = scrub(reqId, 64);
  const method = str(req.method);
  if (method) entry.method = method.slice(0, 10);
  const url = str(req.url);
  if (url) entry.url = scrub(url, 500);
  const status = num(res.statusCode);
  if (status !== undefined) entry.status = status;
  const ms = num(o.responseTime);
  if (ms !== undefined) entry.ms = Math.round(ms);
  if (errRaw && typeof errRaw === 'object')
    entry.err = {
      type: scrub(str(errRaw.type) ?? str(errRaw.name) ?? 'Error', 100),
      message: scrub(str(errRaw.message) ?? ''),
    };
  else if (typeof errRaw === 'string') entry.err = { type: 'Error', message: scrub(errRaw) };
  const fields = extraFields(o);
  if (fields) entry.fields = fields;
  return entry;
}
