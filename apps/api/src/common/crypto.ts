import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import { env } from '../config/env';

export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export const hmac = (secret: string, v: string) => createHmac('sha256', secret).update(v).digest('hex');

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

/** 6자리 숫자 OTP (암호학적 난수) */
export const otpCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** 정산 계좌 등 민감 정보 암호화 (AES-256-GCM). 결과: iv.tag.cipher (base64url) */
export function encrypt(plain: string): string {
  const key = Buffer.from(env().DATA_ENCRYPTION_KEY, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.');
}

export function decrypt(payload: string): string {
  const [iv, tag, enc] = payload.split('.').map((p) => Buffer.from(p, 'base64url'));
  if (!iv || !tag || !enc) throw new Error('invalid payload');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(env().DATA_ENCRYPTION_KEY, 'hex'), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

/** "1234567890123" → "*********0123" */
export const maskTail = (v: string, keep = 4) =>
  `${'*'.repeat(Math.max(0, v.length - keep))}${v.slice(-keep)}`;

/** "홍길동" → "홍*동", "김철" → "김*" */
export function maskName(name: string): string {
  const c = [...name];
  if (c.length <= 2) return `${c[0] ?? ''}*`;
  return `${c[0]}${'*'.repeat(c.length - 2)}${c[c.length - 1]}`;
}

/** "01012345678" → "010-****-5678" */
export function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  return d.length >= 10 ? `${d.slice(0, 3)}-****-${d.slice(-4)}` : maskTail(d);
}

/** IP 마지막 옥텟 마스킹 (기기 관리 화면) */
export function maskIp(ip: string): string {
  if (ip.includes('.')) return ip.replace(/\.\d+$/, '.*');
  return ip.replace(/:[0-9a-f]*$/i, ':*');
}
