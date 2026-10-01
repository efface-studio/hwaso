'use client';

import { useRouter } from 'next/navigation';
import { FollowButton } from './follow-button';

/** 서버에서 그린 프로필 숫자(팔로워 수)를 팔로우 후 새로고침한다 */
export function ProfileFollow({
  userId,
  initial,
  followsMe,
}: {
  userId: string;
  initial: boolean;
  followsMe: boolean;
}) {
  const router = useRouter();
  return (
    <FollowButton userId={userId} initial={initial} followsMe={followsMe} onChange={() => router.refresh()} />
  );
}
