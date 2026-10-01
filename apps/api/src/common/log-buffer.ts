import { hostname } from 'node:os';
import type { ServerLogEntry, ServerLogFilterLevel, ServerLogLevel } from '@shop/shared';
import { toLogEntry } from './log-redact';

const RANK: Record<ServerLogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

export interface LogFilter {
  level: ServerLogFilterLevel;
  /** 소문자 검색어 */
  q?: string;
}

export const matchesLog = (e: ServerLogEntry, f: LogFilter): boolean => {
  if (RANK[e.level] < RANK[f.level]) return false;
  if (!f.q) return true;
  const hay = [
    e.msg,
    e.context,
    e.url,
    e.method,
    e.reqId,
    e.err?.type,
    e.err?.message,
    ...Object.values(e.fields ?? {}).map(String),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(f.q);
};

/**
 * 이 API 프로세스가 쓴 최근 로그 (가린 뒤) — 관리자 실시간 로그의 원천 (docs/SECURITY.md "서버 로그 열람").
 * 로그 파일 경로(launchd)와 상관없이 동작하고, 메모리에 최대 capacity 줄만 둔다. 가린 결과만 보관한다.
 */
export class LogBuffer {
  private readonly items: ServerLogEntry[] = [];
  private seq = 0;
  private readonly listeners = new Set<(e: ServerLogEntry) => void>();
  readonly instance = `${hostname()}:${process.pid}`;

  constructor(readonly capacity: number) {}

  /** pino 가 쓴 JSON 한 줄을 받는다. 로깅을 방해하지 않게 절대 던지지 않는다 */
  push(line: string) {
    try {
      const e = toLogEntry(line.trimEnd(), this.seq + 1);
      if (!e) return;
      this.seq = e.seq;
      this.items.push(e);
      if (this.items.length > this.capacity) this.items.shift();
      for (const l of this.listeners) {
        try {
          l(e);
        } catch {
          // 구독자 오류는 무시한다
        }
      }
    } catch {
      // 가리기 실패는 그 줄만 버린다
    }
  }

  /** 조건에 맞는 마지막 limit 줄 (오래된 것부터). after 가 있으면 그 seq 다음만 */
  tail(f: LogFilter & { after?: number; limit: number }): ServerLogEntry[] {
    const out: ServerLogEntry[] = [];
    for (let i = this.items.length - 1; i >= 0 && out.length < f.limit; i--) {
      const e = this.items[i]!;
      if (f.after !== undefined && e.seq <= f.after) break;
      if (matchesLog(e, f)) out.push(e);
    }
    return out.reverse();
  }

  subscribe(fn: (e: ServerLogEntry) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get size() {
    return this.items.length;
  }
}

export const logBuffer = new LogBuffer(
  Math.min(Math.max(Number(process.env.LOG_BUFFER_SIZE) || 1000, 100), 5000),
);
