import type { CategoryGroup } from '@prisma/client';

/** 기본 카테고리 트리 (요구사항 §12). 운영 중에는 관리자 화면에서 추가/수정한다. */
export const CATEGORY_TREE: {
  slug: string;
  name: string;
  group: CategoryGroup;
  children: [string, string][];
}[] = [
  {
    slug: 'art',
    name: '미술',
    group: 'ART',
    children: [
      ['painting', '회화'],
      ['drawing', '드로잉'],
      ['print', '판화'],
      ['sculpture', '조각'],
      ['photography', '사진'],
      ['contemporary', '현대미술'],
      ['old-art', '고미술'],
      ['craft', '공예'],
    ],
  },
  {
    slug: 'historical',
    name: '역사 · 골동',
    group: 'HISTORICAL',
    children: [
      ['artifact', '역사적 유물'],
      ['antique', '골동품'],
      ['vintage', '빈티지'],
      ['document', '역사적 문서'],
      ['book', '서적'],
      ['poster', '포스터'],
      ['stamp', '우표'],
      ['medal', '메달'],
      ['currency', '화폐'],
      ['daily-object', '역사적 생활용품'],
    ],
  },
  {
    slug: 'collectibles',
    name: '컬렉터블',
    group: 'COLLECTIBLES',
    children: [
      ['collectible', '컬렉터블'],
      ['limited', '한정판'],
      ['etc', '기타'],
    ],
  },
];
