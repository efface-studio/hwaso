/** 상단 카테고리 바 (관리자 카테고리 트리의 대표 항목). 전체 목록은 /search 필터에서 제공 */
export const NAV_CATEGORIES = [
  { href: '/auctions', label: '경매' },
  { href: '/category/painting', label: '회화' },
  { href: '/category/drawing', label: '드로잉' },
  { href: '/category/print', label: '판화' },
  { href: '/category/sculpture', label: '조각' },
  { href: '/category/photography', label: '사진' },
  { href: '/category/contemporary', label: '현대미술' },
  { href: '/category/old-art', label: '고미술' },
  { href: '/category/antique', label: '골동품' },
  { href: '/category/vintage', label: '빈티지' },
  { href: '/category/collectible', label: '컬렉터블' },
] as const;
