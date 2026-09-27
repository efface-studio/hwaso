import 'server-only';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cn } from '@/lib/cn';

type Variant = 'white' | 'black' | 'green';
const cache = new Map<string, string>();

/**
 * 가로형 브랜드 배너(로고 + 화소 + 슬로건). 글자가 SVG <text> 라서 <img> 로 넣으면 기기 폰트로 바뀐다 —
 * 인라인으로 넣어 페이지의 Pretendard 를 쓰게 하고, 여러 벌을 한 페이지에 넣어도 id 가 겹치지 않게 접두어를 붙인다.
 */
function svg(variant: Variant, transparent = false): string {
  const cacheKey = `${variant}:${transparent}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  const raw = readFileSync(join(process.cwd(), 'src/assets/brand', `hwaso-banner-${variant}.svg`), 'utf8');
  const out = raw
    .replace(/id="([^"]+)"/g, `id="${variant}-$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${variant}-$1)`)
    .replace(/href="#([^"]+)"/g, `href="#${variant}-$1"`)
    .replace(/font-family="Pretendard, sans-serif"/g, 'style="font-family:var(--font-sans)"')
    .replace(
      /<svg /,
      '<svg role="img" aria-label="화소 畫所 — 작품과 사람이 만나는 곳" style="width:100%;height:auto;display:block" ',
    )
    .replace(/ width="580" height="240"/, '')
    // 배경색 위에 올릴 때는 배너 자체 배경을 뺀다
    .replace(transparent ? /<rect width="580" height="240" fill="[^"]*"\s*\/?>(<\/rect>)?/ : /$^/, '');
  cache.set(cacheKey, out);
  return out;
}

/** 현재 테마에 맞는 배너 (라이트 = 화이트, 다크 = 블랙) */
export function BrandBanner({
  className,
  variant,
  transparent,
}: {
  className?: string;
  variant?: Variant;
  transparent?: boolean;
}) {
  if (variant) {
    return (
      <span
        className={cn('block', className)}
        dangerouslySetInnerHTML={{ __html: svg(variant, transparent) }}
      />
    );
  }
  return (
    <span className={cn('block', className)}>
      <span
        className="theme-light-only block"
        dangerouslySetInnerHTML={{ __html: svg('white', transparent) }}
      />
      <span
        className="theme-dark-only block"
        dangerouslySetInnerHTML={{ __html: svg('black', transparent) }}
      />
    </span>
  );
}
