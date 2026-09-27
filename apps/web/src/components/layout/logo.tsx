import Link from 'next/link';

/** 워드마크: 화소(畫所) — 한글 이름 + 한자 보조 표기 */
export function Logo() {
  return (
    <Link href="/" className="inline-flex shrink-0 items-baseline gap-1.5" aria-label="화소 홈">
      <span className="text-h2 font-bold tracking-tight">화소</span>
      <span className="text-caption font-medium text-muted" aria-hidden>
        畫所
      </span>
    </Link>
  );
}
