'use client';

import { ApiError } from '@shop/api-client';
import { MoreHorizontal } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { DropdownMenu } from '@/components/ui/menu';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/stores/toast';
import { ReportDialog } from './report-dialog';

/** 다른 사용자 프로필의 더보기: 신고 · 차단 (본인 프로필에서는 숨김) */
export function ProfileMenu({ userId, nickname }: { userId: string; nickname: string }) {
  const me = useAuthStore((s) => s.user);
  const router = useRouter();
  const pathname = usePathname();
  const [reporting, setReporting] = useState(false);
  if (me?.id === userId) return null;
  const needLogin = () => router.push(`/login?next=${encodeURIComponent(pathname)}`);
  const block = async () => {
    if (!me) return needLogin();
    if (!confirm(`${nickname}님을 차단할까요? 서로 채팅을 주고받을 수 없게 돼요.`)) return;
    try {
      await api.safety.block(userId);
      toast.success('차단했어요. 설정 > 차단한 사용자에서 해제할 수 있어요.');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '차단하지 못했습니다.');
    }
  };
  return (
    <>
      <DropdownMenu
        trigger={
          <button type="button" aria-label="더보기" className="rounded-sm p-2 text-muted hover:bg-surface-2">
            <MoreHorizontal className="size-5" aria-hidden />
          </button>
        }
        items={[
          { label: '신고하기', onSelect: () => (me ? setReporting(true) : needLogin()) },
          { label: '차단하기', destructive: true, onSelect: () => void block() },
        ]}
      />
      {reporting && <ReportDialog open onOpenChange={setReporting} targetType="USER" targetId={userId} />}
    </>
  );
}
