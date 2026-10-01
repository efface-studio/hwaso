import { describe, expect, it } from 'vitest';
import { containsProhibited } from './moderation';

describe('containsProhibited — 금칙어', () => {
  it.each(['시발', '이 씨발놈아', '개새끼야', 'FUCK you', 'what the fuck', 'bullshit', 'you are a bitch'])(
    '기본 표현을 잡는다: %s',
    (text) => {
      expect(containsProhibited(text)).toBe(true);
    },
  );

  it.each([
    ['띄어쓰기', '시 발'],
    ['띄어쓰기(영문)', 'f u c k'],
    ['기호 끼우기', '시.발'],
    ['기호 여러 개', '씨!!발'],
    ['숫자 끼우기', '시1발'],
    ['폭 없는 공백', `시${String.fromCharCode(0x200b)}발`],
    ['한글 채움 문자', `병${String.fromCharCode(0x3164)}신`],
    ['반복 글자', 'fuuuuuck'],
    ['반복 글자(한글)', '시발발발'],
    ['영문 치환', 'sh1t'],
    ['전각 문자', 'ｆｕｃｋ'],
    ['대소문자', 'ShIt'],
    ['초성', 'ㅅㅂ 진짜'],
    ['자판 우회', 'tlqkf'],
    ['낱말 변형', 'shitty'],
  ])('정규화: %s', (_, text) => {
    expect(containsProhibited(text)).toBe(true);
  });

  it.each([
    '시발점',
    '역사의 시발점이 된 작품',
    '오후 3시 발송',
    '당일 3시발송',
    '김씨 발라드 LP',
    '씨발라드',
    '병신년 제작 백자',
    '실물 크기 등신대 조각',
    '미친 가격이에요',
    '새끼 고양이 도자기',
    '껌을 씹다',
    '잠을 자지 않았다',
    '보지 않은 새 책',
    '보존 상태 양호',
    'first class',
    'assassin figure',
    'Charles Dickens first edition',
    'cocktail glass',
    'peacock brooch',
    'Scunthorpe',
    'shitake',
    'as good as new',
    '',
  ])('정상 문장은 통과: %s', (text) => {
    expect(containsProhibited(text)).toBe(false);
  });

  it('null·undefined 는 통과', () => {
    expect(containsProhibited(null)).toBe(false);
    expect(containsProhibited(undefined)).toBe(false);
  });
});
