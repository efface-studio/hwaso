import { ApiError, createLogStream } from '@shop/api-client';
import type { ServerLogEntry, ServerLogFilterLevel } from '@shop/shared';
import { Stack, type NativeStackHeaderItem } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Empty } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { api } from '@/lib/api';
import { env } from '@/lib/env';
import { selectionHaptic } from '@/lib/haptics';
import { useAuthStore } from '@/stores/auth';
import { useTheme, type Colors } from '@/theme';

/** 화면에 두는 최대 줄 수 (오래된 줄부터 버린다) */
const MAX_LINES = 1000;
/** 처음·다시 연결할 때 받는 줄 수 */
const TAIL = 200;
/** 바닥에서 이만큼 안이면 "맨 아래에 있음"으로 본다 */
const NEAR_BOTTOM = 48;

const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });

const LEVELS: { value: ServerLogFilterLevel; label: string }[] = [
  { value: 'info', label: '정보 이상' },
  { value: 'warn', label: '경고 이상' },
  { value: 'error', label: '오류만' },
];

const LEVEL_COLOR: Record<ServerLogEntry['level'], keyof Colors> = {
  trace: 'faint',
  debug: 'faint',
  info: 'muted',
  warn: 'warning',
  error: 'destructive',
  fatal: 'destructive',
};

type Status = 'connecting' | 'live' | 'reconnecting' | 'closed' | 'forbidden';
const STATUS_LABEL: Record<Status, string> = {
  connecting: '연결 중',
  live: '실시간',
  reconnecting: '다시 연결 중',
  closed: '연결 끊김',
  forbidden: '권한 없음',
};

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('ko-KR', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

/**
 * 실시간 로그 연결: 처음 tail 은 HTTP 로 받고(토큰 갱신·열람 기록도 여기서), 이후는 소켓으로 이어 받는다.
 * 다시 연결될 때마다 마지막 seq 다음을 HTTP 로 채워 빈 구간을 없앤다. 일시정지 중에는 화면에 붙이지 않고 모아 둔다.
 */
function useServerLogs(level: ServerLogFilterLevel, q: string | undefined, paused: boolean) {
  const [lines, setLines] = useState<ServerLogEntry[]>([]);
  const [status, setStatus] = useState<Status>('connecting');
  const [meta, setMeta] = useState<{ instance: string; capacity: number } | null>(null);
  const [held, setHeld] = useState(0);
  const [dropped, setDropped] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const lastSeq = useRef(0);
  const instance = useRef<string | null>(null);
  const holding = useRef<ServerLogEntry[]>([]);
  const pausedRef = useRef(paused);

  const append = useCallback((entries: ServerLogEntry[]) => {
    const fresh = entries.filter((e) => e.seq > lastSeq.current);
    if (!fresh.length) return;
    lastSeq.current = fresh[fresh.length - 1]!.seq;
    if (pausedRef.current) {
      holding.current = [...holding.current, ...fresh].slice(-MAX_LINES);
      setHeld(holding.current.length);
      return;
    }
    setLines((prev) => [...prev, ...fresh].slice(-MAX_LINES));
  }, []);

  // 재개하면 모아 둔 줄을 한 번에 붙인다
  useEffect(() => {
    pausedRef.current = paused;
    if (paused || !holding.current.length) return;
    const flush = holding.current;
    holding.current = [];
    setHeld(0);
    setLines((prev) => [...prev, ...flush].slice(-MAX_LINES));
  }, [paused]);

  useEffect(() => {
    let alive = true;
    let retries = 0;
    lastSeq.current = 0;
    instance.current = null;
    holding.current = [];
    setLines([]);
    setHeld(0);
    setDropped(0);
    setStatus('connecting');
    const socket = createLogStream(env.wsUrl, () => useAuthStore.getState().accessToken);

    const fail = (e: unknown) => {
      if (!alive) return;
      setStatus(e instanceof ApiError && e.status === 403 ? 'forbidden' : 'closed');
      socket.disconnect();
    };
    /** HTTP 로 빈 구간을 채운다. API 가 다시 시작돼 인스턴스가 바뀌면 처음부터 다시 받는다 */
    const fill = async () => {
      const tail = await api.admin.serverLogs({
        level,
        q,
        after: lastSeq.current || undefined,
        limit: TAIL,
      });
      if (!alive) return;
      if (instance.current && instance.current !== tail.instance) {
        lastSeq.current = 0;
        setLines([]);
        const again = await api.admin.serverLogs({ level, q, limit: TAIL });
        if (!alive) return;
        append(again.entries);
      } else append(tail.entries);
      instance.current = tail.instance;
      setMeta({ instance: tail.instance, capacity: tail.capacity });
    };
    /** 토큰 만료·권한 변경으로 서버가 끊었을 때: API 호출로 토큰을 갱신하고 다시 연결 (두 번까지) */
    const refreshAndConnect = () => {
      if (++retries > 2) return fail(null);
      setStatus('reconnecting');
      void fill()
        .then(() => alive && socket.connect())
        .catch(fail);
    };

    socket.on('connect', () => {
      retries = 0;
      setStatus('live');
      socket.emit('logs:filter', { level, q }, () => undefined);
      void fill().catch(() => undefined);
    });
    socket.on('SERVER_LOG', (p) => {
      append(p.entries);
      if (p.dropped) setDropped((d) => d + p.dropped);
    });
    socket.on('disconnect', (reason) => {
      if (!alive) return;
      if (reason === 'io server disconnect') refreshAndConnect();
      else setStatus('reconnecting');
    });
    socket.on('connect_error', (e) => {
      if (!alive) return;
      if (e.message === 'FORBIDDEN') return fail(new ApiError(403, 'FORBIDDEN', e.message));
      if (e.message === 'UNAUTHORIZED') return refreshAndConnect();
      // 서버가 거절한 연결(접속 수·횟수 제한)은 자동으로 다시 시도하지 않는다
      if (e.message === 'RATE_LIMITED' || e.message === 'TOO_MANY_SUBSCRIBERS') return fail(null);
      setStatus('reconnecting');
    });

    void fill()
      .then(() => alive && socket.connect())
      .catch(fail);
    return () => {
      alive = false;
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [level, q, attempt, append]);

  return { lines, status, meta, held, dropped, reconnect: () => setAttempt((n) => n + 1) };
}

/** 로그 한 줄: 시각·단계·맥락 / 메시지 / 요청 요약 / 에러 / 나머지 필드 */
const LogLine = memo(function LogLine({ e }: { e: ServerLogEntry }) {
  const request = e.method
    ? `${e.method} ${e.url ?? ''}${e.status ? ` ${e.status}` : ''}${e.ms != null ? ` · ${e.ms}ms` : ''}`
    : null;
  const fields = e.fields
    ? Object.entries(e.fields)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join('  ')
    : null;
  return (
    <View style={styles.line} accessible accessibilityLabel={`${time(e.time)} ${e.level} ${e.msg}`}>
      <Text variant="caption" style={styles.mono} numberOfLines={1}>
        <Text variant="caption" color="faint" style={styles.mono}>
          {time(e.time)}{' '}
        </Text>
        <Text variant="caption" color={LEVEL_COLOR[e.level]} style={[styles.mono, styles.level]}>
          {e.level.toUpperCase()}
        </Text>
        {e.context ? (
          <Text variant="caption" color="muted" style={styles.mono}>
            {' '}
            [{e.context}]
          </Text>
        ) : null}
      </Text>
      {!!e.msg && (
        <Text variant="caption" style={styles.mono} selectable>
          {e.msg}
        </Text>
      )}
      {request && (
        <Text variant="caption" color="muted" style={styles.mono} selectable>
          {request}
        </Text>
      )}
      {e.err && (
        <Text variant="caption" color="destructive" style={styles.mono} selectable>
          {e.err.type}: {e.err.message}
        </Text>
      )}
      {fields && (
        <Text variant="caption" color="faint" style={styles.mono} selectable>
          {fields}
        </Text>
      )}
    </View>
  );
});

function Separator() {
  const t = useTheme();
  return (
    <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.colors.border, marginLeft: 16 }} />
  );
}

/**
 * 서버 로그 (최고 관리자): 이 API 프로세스의 최근 로그를 실시간으로. 서버가 토큰·이메일·IP 등을 가린 뒤 보낸다.
 * 헤더에서 단계·검색·일시정지. 맨 아래를 보고 있으면 새 줄을 따라 내려가고, 위로 올리면 멈춘다.
 */
export default function ServerLogsScreen() {
  const t = useTheme();
  const role = useAuthStore((s) => s.user?.role);
  const [level, setLevel] = useState<ServerLogFilterLevel>('info');
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 350) || undefined;
  const [paused, setPaused] = useState(false);
  const [follow, setFollow] = useState(true);
  const list = useRef<FlatList<ServerLogEntry>>(null);
  const allowed = role === 'SUPER_ADMIN';
  const logs = useServerLogs(level, q, paused || !allowed);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const near = contentSize.height - (contentOffset.y + layoutMeasurement.height) < NEAR_BOTTOM;
    if (near !== follow) setFollow(near);
  };
  const toBottom = () => {
    setFollow(true);
    list.current?.scrollToEnd({ animated: true });
  };

  const headerItems: NativeStackHeaderItem[] = [
    {
      type: 'button',
      label: paused ? '재개' : '일시정지',
      icon: { type: 'sfSymbol', name: paused ? 'play.fill' : 'pause.fill' },
      onPress: () => {
        selectionHaptic();
        setPaused((p) => !p);
      },
    },
    {
      type: 'menu',
      label: `단계: ${LEVELS.find((l) => l.value === level)!.label}`,
      icon: { type: 'sfSymbol', name: 'line.3.horizontal.decrease.circle' },
      menu: {
        items: LEVELS.map((l) => ({
          type: 'action' as const,
          label: l.label,
          state: l.value === level ? ('on' as const) : ('off' as const),
          onPress: () => setLevel(l.value),
        })),
      },
    },
  ];

  if (!allowed)
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.background }}>
        <Empty title="최고 관리자만 볼 수 있어요" description="서버 로그는 최고 관리자 계정에서만 열려요." />
      </View>
    );

  const statusColor: keyof Colors =
    logs.status === 'live'
      ? 'primary'
      : logs.status === 'reconnecting' || logs.status === 'connecting'
        ? 'warning'
        : 'destructive';

  return (
    <>
      <Stack.Screen
        options={{
          headerSearchBarOptions: {
            placement: 'integratedButton',
            allowToolbarIntegration: false,
            hideWhenScrolling: false,
            placeholder: '메시지 · 경로 · 요청 ID',
            autoCapitalize: 'none',
            onChangeText: (e) => setSearch(e.nativeEvent.text),
            onCancelButtonPress: () => setSearch(''),
          },
          unstable_headerRightItems: () => headerItems,
        }}
      />
      <FlatList
        ref={list}
        style={{ backgroundColor: t.colors.background }}
        contentInsetAdjustmentBehavior="automatic"
        data={logs.lines}
        keyExtractor={(e) => String(e.seq)}
        renderItem={({ item }) => <LogLine e={item} />}
        ItemSeparatorComponent={Separator}
        onScroll={onScroll}
        scrollEventThrottle={100}
        onContentSizeChange={() => follow && list.current?.scrollToEnd({ animated: false })}
        initialNumToRender={30}
        windowSize={9}
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          <View style={styles.summary}>
            <Text variant="caption" color={statusColor}>
              ● {STATUS_LABEL[logs.status]}
              {paused ? ' · 일시정지' : ''}
            </Text>
            <Text variant="caption" color="muted" numberOfLines={2}>
              {logs.meta
                ? `${logs.meta.instance} · 최근 ${logs.meta.capacity.toLocaleString('ko-KR')}줄까지 보관 · 토큰·이메일·IP 등은 가려서 보여요`
                : '토큰·이메일·IP 등은 가려서 보여요'}
            </Text>
            {logs.dropped > 0 && (
              <Text variant="caption" color="warning">
                로그가 몰려 {logs.dropped.toLocaleString('ko-KR')}줄을 건너뛰었어요.
              </Text>
            )}
            {(logs.status === 'closed' || logs.status === 'forbidden') && (
              <Pressable accessibilityRole="button" hitSlop={10} onPress={logs.reconnect}>
                <Text variant="caption" color="primary">
                  다시 연결
                </Text>
              </Pressable>
            )}
          </View>
        }
        ListEmptyComponent={
          <Empty
            kind="search"
            title={logs.status === 'connecting' ? '불러오는 중이에요' : '조건에 맞는 로그가 없어요'}
          />
        }
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
      />
      {(!follow || logs.held > 0) && logs.lines.length > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={logs.held > 0 ? `새 로그 ${logs.held}줄, 재개하고 맨 아래로` : '맨 아래로'}
          onPress={() => {
            setPaused(false);
            toBottom();
          }}
          style={[styles.jump, { backgroundColor: t.colors.foreground, borderRadius: t.radius.full }]}
        >
          <Text variant="label" color="background">
            {logs.held > 0 ? `새 로그 ${logs.held.toLocaleString('ko-KR')}줄 · 재개` : '맨 아래로'}
          </Text>
        </Pressable>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  summary: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8, gap: 2 },
  line: { paddingHorizontal: 16, paddingVertical: 8, gap: 2 },
  mono: { fontFamily: mono },
  level: { fontWeight: '600' },
  jump: { position: 'absolute', alignSelf: 'center', bottom: 24, paddingHorizontal: 16, paddingVertical: 10 },
});
