'use client';

import { ApiError } from '@shop/api-client';
import { MessageCircle } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/stores/toast';

/** 작품 기준으로 판매자와의 채팅방을 열고 이동 (이미 있으면 그 방으로) */
export function StartChatButton({
  productId,
  label = '채팅하기',
  ...props
}: { productId: string; label?: string } & Omit<ButtonProps, 'onClick'>) {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const start = async () => {
    if (!user) return router.push(`/login?next=${encodeURIComponent(pathname)}`);
    setBusy(true);
    try {
      const { id } = await api.chat.open(productId);
      router.push(`/chat/${id}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '채팅을 열지 못했습니다.');
      setBusy(false);
    }
  };
  return (
    <Button variant="outline" loading={busy} onClick={() => void start()} {...props}>
      <MessageCircle className="size-4" aria-hidden />
      {label}
    </Button>
  );
}
