import { Image, type ImageProps } from 'expo-image';
import { imageWidthFor, mediaUrl } from '@/lib/media';

type Props = Omit<ImageProps, 'source'> & {
  /** 서버 이미지 키 (ImageDto.key) */
  mediaKey: string;
  /** 화면에 그려질 폭(pt) — 이 폭 × 화면 배율에 맞는 파생본(w400·w800·w1600)을 받는다 */
  displayWidth: number;
};

/**
 * 서버 이미지 공용 컴포넌트. expo-image 기본 캐시(disk)는 다시 그릴 때마다 디스크에서 읽어 디코딩하므로
 * 메모리 캐시를 함께 쓴다 (목록을 오가거나 탭을 돌아올 때 깜빡이지 않게).
 * 같은 자리에서 다른 이미지로 바뀌면 이전 이미지를 남기지 않는다(recyclingKey).
 */
export function MediaImage({ mediaKey, displayWidth, ...props }: Props) {
  return (
    <Image
      cachePolicy="memory-disk"
      recyclingKey={mediaKey}
      {...props}
      source={mediaUrl(mediaKey, imageWidthFor(displayWidth))}
    />
  );
}
