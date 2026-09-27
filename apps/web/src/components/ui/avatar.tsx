import { User } from 'lucide-react';
import { cn } from '@/lib/cn';
import { mediaUrl } from '@/lib/media';

const sizes = { sm: 'size-7', md: 'size-10', lg: 'size-16', xl: 'size-24' } as const;

interface AvatarProps {
  avatarKey: string | null | undefined;
  name: string;
  size?: keyof typeof sizes;
  className?: string;
}

export function Avatar({ avatarKey, name, size = 'md', className }: AvatarProps) {
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2',
        sizes[size],
        className,
      )}
    >
      {avatarKey ? (
        // 작은 고정 크기라 next/image 최적화 이점이 적고, 서버가 이미 리사이즈한 파생본을 쓴다
        <img
          src={mediaUrl(avatarKey, 400)}
          alt={`${name} 프로필 사진`}
          className="size-full object-cover"
          loading="lazy"
        />
      ) : (
        <User className="size-1/2 text-faint" role="img" aria-label={`${name} 프로필 사진 없음`} />
      )}
    </span>
  );
}
