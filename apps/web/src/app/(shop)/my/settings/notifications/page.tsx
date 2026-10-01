'use client';

import { ApiError } from '@shop/api-client';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_LABEL,
  QUIET_HOURS,
  type NotificationPrefs,
} from '@shop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { RequireAuth } from '@/components/auth/require-auth';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/choice';
import { Skeleton } from '@/components/ui/display';
import { api } from '@/lib/api';
import { disableWebPush, enableWebPush, webPushState, type WebPushState } from '@/lib/web-push';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/stores/toast';

const PUSH_TEXT: Record<WebPushState, string> = {
  unsupported: '이 브라우저는 알림을 지원하지 않아요.',
  unconfigured: '웹 알림 준비 중이에요.',
  denied: '브라우저 설정에서 화소의 알림을 허용해주세요.',
  off: '브라우저를 닫아도 중요한 소식을 알려드려요.',
  on: '이 브라우저로 알림을 받고 있어요.',
};

function BrowserPush() {
  const [state, setState] = useState<WebPushState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void webPushState()
      .then(setState)
      .catch(() => setState('unsupported'));
  }, []);
  const toggle = async () => {
    setBusy(true);
    try {
      setState(state === 'on' ? await disableWebPush() : await enableWebPush());
    } catch {
      toast.error('알림 설정을 바꾸지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center justify-between gap-4 rounded-sm border border-border p-4">
      <div>
        <p className="text-body-strong">브라우저 알림</p>
        <p className="text-small text-muted">{state ? PUSH_TEXT[state] : '확인 중…'}</p>
      </div>
      {(state === 'on' || state === 'off') && (
        <Button
          variant={state === 'on' ? 'outline' : 'primary'}
          size="sm"
          loading={busy}
          onClick={() => void toggle()}
        >
          {state === 'on' ? '끄기' : '켜기'}
        </Button>
      )}
    </div>
  );
}

/**
 * 선택 동의: 마케팅 정보 수신. 바꾸면 처리 결과(날짜·동의 여부)를 알린다 (정보통신망법 수신동의 처리결과 고지).
 * 광고성 알림은 동의한 회원에게만, 밤 9시~아침 8시에는 푸시 없이 보낸다.
 */
function Marketing() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const save = useMutation({
    mutationFn: (marketing: boolean) =>
      api.auth.consent({ terms: true, privacy: true, ageOver14: true, marketing }),
    onSuccess: (me) => {
      setUser(me);
      const date = new Date().toLocaleDateString('ko-KR');
      toast.success(`${date} 마케팅 정보 수신에 ${me.marketingOptIn ? '동의했어요' : '동의를 철회했어요'}.`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : '저장하지 못했습니다.'),
  });
  if (!user) return null;
  return (
    <section className="flex flex-col gap-4 border-t border-border pt-6">
      <Switch
        checked={user.marketingOptIn}
        disabled={save.isPending}
        onCheckedChange={(v) => save.mutate(v)}
        label="마케팅 정보 수신 (선택)"
        description="기획전·할인 소식을 알림으로 받아요. 언제든 끌 수 있어요."
      />
    </section>
  );
}

function Prefs() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['notification-prefs'], queryFn: api.notifications.prefs });
  const save = useMutation({
    mutationFn: (p: NotificationPrefs) => api.notifications.setPrefs(p),
    onMutate: (p) => qc.setQueryData(['notification-prefs'], p),
    onError: (e) => {
      toast.error(e instanceof ApiError ? e.message : '저장하지 못했습니다.');
      void qc.invalidateQueries({ queryKey: ['notification-prefs'] });
    },
  });
  if (!data) return <Skeleton className="h-64 w-full" />;
  return (
    <div className="flex flex-col gap-6">
      <BrowserPush />
      <section className="flex flex-col gap-4">
        <h2 className="text-h3">푸시 알림 받기</h2>
        <p className="-mt-2 text-small text-muted">
          꺼도 알림함에는 그대로 쌓여요. 계정·운영 공지는 끌 수 없어요.
        </p>
        {NOTIFICATION_CATEGORIES.map((c) => (
          <Switch
            key={c}
            checked={data.push[c]}
            onCheckedChange={(v) => save.mutate({ ...data, push: { ...data.push, [c]: v } })}
            label={NOTIFICATION_CATEGORY_LABEL[c].label}
            description={NOTIFICATION_CATEGORY_LABEL[c].description}
          />
        ))}
      </section>
      <section className="flex flex-col gap-4 border-t border-border pt-6">
        <Switch
          checked={data.quietHours}
          onCheckedChange={(v) => save.mutate({ ...data, quietHours: v })}
          label="방해 금지 시간"
          description={`밤 ${QUIET_HOURS.start}시부터 아침 ${QUIET_HOURS.end}시까지 푸시를 보내지 않아요.`}
        />
      </section>
      <Marketing />
    </div>
  );
}

export default function NotificationSettingsPage() {
  return (
    <div className="page-x mx-auto max-w-2xl py-6 md:py-10">
      <h1 className="mb-6 text-h1">알림 설정</h1>
      <RequireAuth>
        <Prefs />
      </RequireAuth>
    </div>
  );
}
