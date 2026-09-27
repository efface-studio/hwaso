'use client';

import { ApiError } from '@shop/api-client';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/stores/toast';

export function FollowButton({
  userId,
  initial,
  onChange,
  size = 'md',
}: {
  userId: string;
  initial: boolean;
  onChange?: (following: boolean, followerCount: number) => void;
  size?: 'sm' | 'md';
}) {
  const me = useAuthStore((s) => s.user);
  const router = useRouter();
  const pathname = usePathname();
  const [following, setFollowing] = useState(initial);
  const [busy, setBusy] = useState(false);
  if (me?.id === userId) return null;
  const toggle = async () => {
    if (!me) return router.push(`/login?next=${encodeURIComponent(pathname)}`);
    setBusy(true);
    try {
      const r = following ? await api.community.unfollow(userId) : await api.community.follow(userId);
      setFollowing(r.following);
      onChange?.(r.following, r.followerCount);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '처리하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      size={size}
      variant={following ? 'outline' : 'primary'}
      loading={busy}
      aria-pressed={following}
      onClick={() => void toggle()}
    >
      {following ? '팔로잉' : '팔로우'}
    </Button>
  );
}
