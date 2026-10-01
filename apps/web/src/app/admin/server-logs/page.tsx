'use client';

import { ApiError, createLogStream } from '@shop/api-client';
import {
  SERVER_LOG_FILTER_LEVELS,
  type ServerLogEntry,
  type ServerLogFilterLevel,
  type ServerLogLevel,
} from '@shop/shared';
import { Pause, Play } from 'lucide-react';
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AdminPage } from '@/components/admin/admin-shell';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/choice';
import { Alert, Badge, EmptyState, type BadgeTone } from '@/components/ui/display';
import { Input } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { env } from '@/lib/env';
import { useAuthStore } from '@/stores/auth';

/** 화면에 남기는 최대 줄 수 */
const MAX_LINES = 1000;
const SEARCH_DEBOUNCE_MS = 350;
const FORBIDDEN_MESSAGE = '최고 관리자만 볼 수 있어요.';

const LEVEL_LABEL: Record<ServerLogFilterLevel, string> = {
  info: '정보 이상',
  warn: '경고 이상',
  error: '오류만',
};
const LEVEL_STYLE: Record<ServerLogLevel, { tone: BadgeTone; className?: string }> = {
  trace: { tone: 'outline' },
  debug: { tone: 'outline' },
  info: { tone: 'neutral' },
  warn: { tone: 'neutral', className: 'bg-warning/10 text-warning' },
  error: { tone: 'destructive' },
  fatal: { tone: 'destructive', className: 'bg-destructive text-white' },
};

type Conn = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
const CONN: Record<Conn, { label: string; dot: string }> = {
  connecting: { label: '연결 중…', dot: 'bg-faint' },
  connected: { label: '연결됨', dot: 'bg-success' },
  reconnecting: { label: '다시 연결 중', dot: 'bg-warning' },
  disconnected: { label: '끊김', dot: 'bg-destructive' },
};

const bySeq = (a: ServerLogEntry, b: ServerLogEntry) => a.seq - b.seq;
const capLines = (l: ServerLogEntry[]) => (l.length > MAX_LINES ? l.slice(-MAX_LINES) : l);
const hms = (iso: string) =>
  new Date(iso).toLocaleTimeString('ko-KR', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const LogLine = memo(function LogLine({ e }: { e: ServerLogEntry }) {
  const level = LEVEL_STYLE[e.level];
  const fields = e.fields ? Object.entries(e.fields) : [];
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-border/60 px-3 py-1 last:border-b-0">
      <time dateTime={e.time} className="text-muted">
        {hms(e.time)}
      </time>
      <Badge tone={level.tone} className={cn('w-12 justify-center uppercase', level.className)}>
        {e.level}
      </Badge>
      {e.context && <span className="text-muted">[{e.context}]</span>}
      {e.method && (
        <span>
          {e.method} {e.url}
          {e.status != null && (
            <span
              className={cn(
                e.status >= 500 ? 'text-destructive' : e.status >= 400 ? 'text-warning' : 'text-muted',
              )}
            >
              {' '}
              {e.status}
            </span>
          )}
          {e.ms != null && <span className="text-muted"> {e.ms}ms</span>}
        </span>
      )}
      <span className="break-all whitespace-pre-wrap">{e.msg}</span>
      {e.err && (
        <span className="break-all text-destructive">
          {e.err.type}: {e.err.message}
        </span>
      )}
      {fields.length > 0 && (
        <span className="flex basis-full flex-wrap gap-x-3 pl-[4.5rem] text-faint">
          {fields.map(([k, v]) => (
            <span key={k} className="break-all">
              {k}={String(v)}
            </span>
          ))}
        </span>
      )}
    </li>
  );
});

function ServerLogs() {
  const [level, setLevel] = useState<ServerLogFilterLevel>('info');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [lines, setLines] = useState<ServerLogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);
  const [conn, setConn] = useState<Conn>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ instance: string; capacity: number } | null>(null);
  const [dropped, setDropped] = useState(0);

  const pausedRef = useRef(false);
  /** 일시정지 동안 받은 줄 (재개하면 한꺼번에 붙인다) */
  const bufferRef = useRef<ServerLogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 검색어 입력은 잠시 멈췄을 때 반영
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    let alive = true;
    let stopped = false;
    // logs:filter 응답 전에 오는 줄은 이전(기본) 필터 기준일 수 있어 버리고, 응답 뒤 HTTP 로 빈 구간을 채운다
    let accepting = false;
    let attempts = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const seen = new Set<number>();
    let lastSeq = 0;
    const query = { level, q: q || undefined };

    bufferRef.current = [];
    setLines([]);
    setPendingCount(0);
    setDropped(0);
    setError(null);
    setConn('connecting');

    const ingest = (entries: ServerLogEntry[]) => {
      const fresh = entries.filter((e) => !seen.has(e.seq));
      if (!fresh.length) return;
      for (const e of fresh) {
        seen.add(e.seq);
        if (e.seq > lastSeq) lastSeq = e.seq;
      }
      // 중복 확인용 seq 는 화면 보관량의 몇 배까지만 유지
      if (seen.size > MAX_LINES * 4) {
        let drop = seen.size - MAX_LINES * 2;
        for (const s of seen) {
          if (drop-- <= 0) break;
          seen.delete(s);
        }
      }
      if (pausedRef.current) {
        bufferRef.current = capLines([...bufferRef.current, ...fresh].sort(bySeq));
        setPendingCount(bufferRef.current.length);
      } else {
        setLines((l) => capLines([...l, ...fresh].sort(bySeq)));
      }
    };

    const socket = createLogStream(env.wsUrl, () => useAuthStore.getState().accessToken);

    const stop = (message: string) => {
      stopped = true;
      clearTimeout(retry);
      setError(message);
      setConn('disconnected');
      socket.disconnect();
    };

    /** HTTP 로 최근 줄(또는 after 다음 줄)을 받는다. 401 이면 api-client 가 토큰을 갱신하고 다시 보낸다 */
    const fetchTail = async (after?: number) => {
      try {
        const t = await api.admin.serverLogs({ ...query, after, limit: 200 });
        if (!alive) return false;
        setMeta({ instance: t.instance, capacity: t.capacity });
        setError(null);
        ingest(t.entries);
        return true;
      } catch (e) {
        if (!alive) return false;
        if (e instanceof ApiError && e.status === 403) stop(FORBIDDEN_MESSAGE);
        else setError(e instanceof ApiError ? e.message : '로그를 불러오지 못했어요.');
        return false;
      }
    };

    /** 서버가 끊었거나(토큰 만료·권한 변경) 연결을 거절했을 때: 토큰을 갱신하고 다시 연결 */
    const reconnect = () => {
      if (stopped) return;
      setConn('reconnecting');
      clearTimeout(retry);
      const delay = Math.min(1000 * 2 ** attempts, 10_000);
      attempts += 1;
      retry = setTimeout(() => {
        void fetchTail(lastSeq || undefined).then((ok) => {
          if (!alive || stopped) return;
          if (ok) socket.connect();
          else reconnect();
        });
      }, delay);
    };

    socket.on('connect', () => {
      attempts = 0;
      accepting = false;
      setConn('connected');
      socket.emit('logs:filter', query, (res) => {
        if (!alive) return;
        if (!res.ok) {
          if (res.code === 'FORBIDDEN') stop(FORBIDDEN_MESSAGE);
          else setError(`필터를 적용하지 못했어요 (${res.code})`);
          return;
        }
        accepting = true;
        void fetchTail(lastSeq || undefined);
      });
    });
    socket.on('SERVER_LOG', (p) => {
      if (!accepting) return;
      if (p.dropped) setDropped((d) => d + p.dropped);
      ingest(p.entries);
    });
    socket.on('disconnect', (reason) => {
      accepting = false;
      if (!alive || stopped) return;
      if (reason === 'io server disconnect') reconnect();
      // 그 밖의 끊김은 Socket.IO 가 알아서 다시 연결한다
      else if (reason !== 'io client disconnect') setConn('reconnecting');
    });
    socket.on('connect_error', (err) => {
      if (!alive || stopped) return;
      if (err.message === 'FORBIDDEN') return stop(FORBIDDEN_MESSAGE);
      // 서버 미들웨어가 거절하면(토큰 만료 등) 자동 재연결하지 않는다
      if (!socket.active) reconnect();
      else setConn('reconnecting');
    });

    void fetchTail().then((ok) => {
      if (!alive || stopped) return;
      if (ok) socket.connect();
      else reconnect();
    });

    return () => {
      alive = false;
      clearTimeout(retry);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [level, q]);

  // 자동 스크롤: 그리기 전에 맨 아래로 (스크롤 이벤트가 "사용자가 올렸다"로 오인되지 않게)
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && autoScroll && !paused) el.scrollTop = el.scrollHeight;
  }, [lines, autoScroll, paused]);

  const pause = () => {
    pausedRef.current = true;
    setPaused(true);
  };
  const resume = () => {
    pausedRef.current = false;
    setPaused(false);
    const buffered = bufferRef.current;
    bufferRef.current = [];
    setPendingCount(0);
    if (buffered.length) setLines((l) => capLines([...l, ...buffered].sort(bySeq)));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="로그 단계"
          value={level}
          onValueChange={setLevel}
          options={SERVER_LOG_FILTER_LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l] }))}
          className="w-36"
        />
        <Input
          type="search"
          aria-label="로그 검색"
          placeholder="메시지 · 경로 · 요청 ID"
          maxLength={100}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-w-48 flex-1"
        />
        <Button variant="outline" onClick={paused ? resume : pause} aria-pressed={paused}>
          {paused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
          {paused ? '재개' : '일시정지'}
        </Button>
        <Checkbox checked={autoScroll} onCheckedChange={setAutoScroll} label="자동 스크롤" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-caption text-muted">
        <p aria-live="polite" className="flex items-center gap-1.5">
          <span className={cn('size-2 rounded-full', CONN[conn].dot)} aria-hidden />
          {CONN[conn].label}
          {paused && pendingCount > 0 && (
            <span className="font-semibold text-foreground">
              · 새 로그 {pendingCount.toLocaleString('ko-KR')}줄
            </span>
          )}
        </p>
        {meta && (
          <p>
            {meta.instance} · 최근 {meta.capacity.toLocaleString('ko-KR')}줄까지 보관 · 가린 뒤 표시돼요
            (토큰·이메일·IP 등)
            {dropped > 0 && ` · 너무 많아 건너뛴 줄 ${dropped.toLocaleString('ko-KR')}`}
          </p>
        )}
      </div>
      {error && <Alert tone="destructive">{error}</Alert>}
      <div
        ref={scrollRef}
        role="log"
        aria-live="off"
        aria-label="서버 로그"
        tabIndex={0}
        onScroll={(e) => {
          const el = e.currentTarget;
          // 사용자가 위로 올려 보면 자동 스크롤을 끈다
          if (autoScroll && el.scrollHeight - el.scrollTop - el.clientHeight > 24) setAutoScroll(false);
        }}
        className="max-h-[70vh] min-h-80 overflow-auto rounded-md border border-border bg-surface font-mono text-caption"
      >
        {lines.length ? (
          <ol>
            {lines.map((e) => (
              <LogLine key={e.seq} e={e} />
            ))}
          </ol>
        ) : (
          <p className="px-6 py-16 text-center font-sans text-small text-muted">
            {conn === 'connecting' ? '불러오는 중…' : '표시할 로그가 없어요.'}
          </p>
        )}
      </div>
    </div>
  );
}

export default function AdminServerLogsPage() {
  const isSuper = useAuthStore((s) => s.user?.role === 'SUPER_ADMIN');
  return (
    <AdminPage
      title="서버 로그"
      description="API 서버 로그를 실시간으로 봐요. 민감한 값은 서버가 가린 뒤 보내요."
    >
      {isSuper ? <ServerLogs /> : <EmptyState title={FORBIDDEN_MESSAGE} />}
    </AdminPage>
  );
}
