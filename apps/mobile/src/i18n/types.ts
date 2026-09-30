/** 한국어 원문과 같은 모양의 번역 (키가 빠지거나 남으면 타입 오류) */
export type Translation<T> = { [K in keyof T]: T[K] extends string ? string : Translation<T[K]> };
