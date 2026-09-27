const krw = new Intl.NumberFormat('ko-KR');

/** 1050000 → "1,050,000원" */
export function formatPrice(amount: number): string {
  return `${krw.format(amount)}원`;
}

/** 1050000 → "1,050,000" */
export function formatNumber(n: number): string {
  return krw.format(n);
}

/** "1,050,000" / "1050000원" → 1050000. 숫자가 아니면 null */
export function parsePrice(input: string): number | null {
  const digits = input.replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * 남은 시간 표시. 음수는 0 으로 본다.
 * 1일 미만: "02:31:12", 1일 이상: "3일 04:10:22"
 */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const hms = `${pad(h)}:${pad(m)}:${pad(s)}`;
  return days > 0 ? `${days}일 ${hms}` : hms;
}

/** 입찰 기록 등 공개 표시용 닉네임 마스킹: "collector" → "co*****r", 2자 이하 → "a*" */
export function maskNickname(nickname: string): string {
  const chars = [...nickname];
  if (chars.length <= 2) return `${chars[0] ?? ''}*`;
  return `${chars.slice(0, 2).join('')}${'*'.repeat(chars.length - 3)}${chars[chars.length - 1]}`;
}

/** "3분 전", "2시간 전", "어제", "2026.09.01" */
export function formatRelativeTime(date: Date | string, now: Date = new Date()): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 172800) return '어제';
  if (diff < 604800) return `${Math.floor(diff / 86400)}일 전`;
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

/** 작품 크기 "53.0 × 45.5 × 3.0 cm" */
export function formatDimensions(w?: number | null, h?: number | null, d?: number | null): string | null {
  const parts = [w, h, d].filter((v): v is number => typeof v === 'number' && v > 0);
  if (parts.length === 0) return null;
  return `${parts.map((v) => v.toFixed(1)).join(' × ')} cm`;
}
