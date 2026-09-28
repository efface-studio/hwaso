import Link from 'next/link';

/** 헤더 로고: 앱 아이콘 + 화소 워드마크. 아이콘은 테마에 맞는 배경 버전을 쓴다 */
export function Logo() {
  return (
    <Link href="/" className="inline-flex shrink-0 items-center gap-2">
      <span className="size-7 shrink-0">
        <img
          src="/brand/hwaso-logo-white.svg"
          alt=""
          width={28}
          height={28}
          className="theme-light-only size-7"
        />
        <img
          src="/brand/hwaso-logo-black.svg"
          alt=""
          width={28}
          height={28}
          className="theme-dark-only size-7"
        />
      </span>
      <span className="text-h2 font-bold tracking-tight">화소</span>
      <span className="-ml-1 text-caption font-medium text-muted">畫所</span>
      {/* 접근 가능한 이름이 보이는 글자로 시작해야 음성 명령("화소 누르기")이 맞는다 */}
      <span className="sr-only">홈</span>
    </Link>
  );
}
