'use client';

import { useRouter } from 'next/navigation';
import { FollowButton } from './follow-button';

/** 서버에서 그린 프로필 숫자(팔로워 수)를 팔로우 후 새로고침한다 */
export function ProfileFollow({ userId, initial }: { userId: string; initial: boolean }) {
  const router = useRouter();
  return <FollowButton userId={userId} initial={initial} onChange={() => router.refresh()} />;
}
