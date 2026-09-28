import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/** 디자인 토큰의 글자 크기 유틸리티 — 등록하지 않으면 text-body 를 색으로 보고 text-muted 와 충돌시킨다 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'display',
            'h1',
            'h2',
            'h3',
            'body',
            'body-strong',
            'small',
            'caption',
            'label',
            'price',
            'price-lg',
          ],
        },
      ],
    },
  },
});

/** 조건부 클래스 + 충돌 정리 (나중에 준 클래스가 이긴다: cn('px-4', 'px-0') → 'px-0') */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
