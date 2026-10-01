/**
 * 금칙어 필터 — 닉네임·소개·작품 제목/설명·후기·문의·채팅에 욕설·비하 표현을 막는다 (App Store 1.2 UGC).
 * 서버가 최종 판단하고(400 PROHIBITED_CONTENT), 클라이언트는 같은 함수로 입력 중 미리 안내한다.
 *
 * 원칙: 오탐(정상 문장 차단)이 미탐보다 나쁘다. 흔한 낱말과 겹치는 짧은 표현(예: 씹다·보지 않다·자지 않다·등신대·미친 가격)은
 * 목록에 넣지 않고, 겹치는 정상 낱말은 ALLOWED_TERMS 로 먼저 지운 뒤 검사한다.
 *
 * 정규화: NFKC(전각→반각) → 소문자 → 보이지 않는 문자 제거 → 낱말(공백 기준)마다 글자만 남긴다.
 * - 한 글자씩 띄어 쓴 우회("시 발", "f u c k")는 이어 붙여 다시 검사한다
 * - 반복 글자("fuuuck", "시발발")는 목록 글자마다 1회 이상 반복을 허용해 잡는다
 * - 숫자·기호 끼워 넣기("시1발", "시.발")는 지우고, 영문은 흔한 치환(sh1t, @ss)을 되돌린다
 * - 숫자 바로 뒤 "시"는 시각(3시 발송)으로 보고 검사에서 뺀다
 */

/** 부분 일치로 찾는 표현 (정규화 후) */
export const PROHIBITED_TERMS: readonly string[] = [
  // 한국어 욕설·비하
  '씨발',
  '시발',
  '씨빨',
  '시빨',
  '씨팔',
  '시팔',
  '씨벌',
  '씹새',
  '씹할',
  '씹년',
  '씹놈',
  '씹창',
  '좆',
  '좃같',
  '좇같',
  '병신',
  '븅신',
  '빙신',
  '개새끼',
  '개새기',
  '개색기',
  '개색끼',
  '개새키',
  '개세끼',
  '개쉐이',
  '개년',
  '미친놈',
  '미친년',
  '미친새끼',
  '지랄',
  '니미럴',
  '니애미',
  '느금마',
  '엠창',
  '애미뒤진',
  '애비뒤진',
  '창녀',
  '걸레년',
  '썅년',
  '썅놈',
  '쌍년',
  '쌍놈',
  '호로새끼',
  '후레자식',
  // 초성·자판 우회
  'ㅅㅂ',
  'ㅆㅂ',
  'ㅄ',
  'ㅂㅅ',
  'ㅈㄹ',
  'ㄱㅅㄲ',
  'ㅁㅊㄴ',
  'tlqkf',
  'qudtls',
  'sibal',
  'ssibal',
  'shibal',
  // 영어 (다른 낱말 속에 거의 나오지 않는 것만 부분 일치)
  'fuck',
  'nigger',
  'nigga',
  'faggot',
  'bitch',
  'asshole',
  'bullshit',
  'whore',
];

/** 낱말 전체가 일치할 때만 막는 짧은 영어 표현 (class·assassin·cocktail·Dickens 오탐 방지) */
export const PROHIBITED_WORDS: readonly string[] = [
  'shit',
  'ass',
  'cunt',
  'dick',
  'cock',
  'pussy',
  'slut',
  'fag',
  'retard',
  'twat',
  'wanker',
  'bastard',
  'jackass',
  'dumbass',
];

/** 금칙어와 겹치는 정상 낱말 — 검사 전에 지운다 */
export const ALLOWED_TERMS: readonly string[] = [
  '시발점',
  '시발역',
  '시발차',
  '시발택시',
  '시발자동차',
  '발라드',
  // 육십갑자 연도 (고미술 제작 연도 표기)
  '병신년',
];

/** 폭 없는 공백·방향 제어·한글 채움 문자 등 눈에 보이지 않는 문자 */
const INVISIBLE_RANGES: [number, number][] = [
  [0x00ad, 0x00ad],
  [0x034f, 0x034f],
  [0x061c, 0x061c],
  [0x115f, 0x1160],
  [0x17b4, 0x17b5],
  [0x180b, 0x180e],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x2064],
  [0x3164, 0x3164],
  [0xfeff, 0xfeff],
  [0xffa0, 0xffa0],
];
const visible = (c: string) => {
  const cp = c.codePointAt(0) ?? 0;
  return !INVISIBLE_RANGES.some(([from, to]) => cp >= from && cp <= to);
};
const NON_LETTER = /[^\p{L}]/gu;
const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
  '!': 'i',
  '|': 'l',
};

const escape = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** "fuck" → /f+u+c+k+/ — 글자 반복 우회를 잡는다 */
const repeatable = (term: string) => [...term].map((c) => `${escape(c)}+`).join('');

const base = (text: string) => [...text.normalize('NFKC').toLowerCase()].filter(visible).join('');
const letters = (s: string) => s.replace(NON_LETTER, '');

const TERM_PATTERNS = PROHIBITED_TERMS.map((t) => new RegExp(repeatable(letters(base(t)))));
const WORD_PATTERNS = PROHIBITED_WORDS.map(
  (w) =>
    new RegExp(
      `^(?:${repeatable(letters(base(w)))})(?:s|es|y|ty|ed|er|ers|ing|ting|head|heads|hole|holes)?$`,
    ),
);
const ALLOWED = ALLOWED_TERMS.map((a) => letters(base(a)));

/** 한 글자짜리 낱말이 이어지면("시 발", "f u c k") 붙여서 하나 더 만든다 */
function withJoinedRuns(words: string[]): string[] {
  const out = [...words];
  let run = '';
  const flush = () => {
    if ([...run].length > 1) out.push(run);
    run = '';
  };
  for (const w of words) {
    if ([...w].length === 1) run += w;
    else flush();
  }
  flush();
  return out;
}

/** 검사할 낱말 목록: 한국어용(숫자·기호 제거)과 영어용(흔한 치환 복원) 두 갈래 */
function candidates(text: string): string[] {
  const raw = base(text)
    // 숫자 바로 뒤 "시"는 시각이다 ("3시 발송", "3시발송") — 검사 대상 글자에서 뺀다
    .replace(/(\d)\s*시/g, '$1時')
    .split(/\s+/)
    .filter(Boolean);
  const korean = raw.map(letters).filter(Boolean);
  const latin = raw.map((w) => letters([...w].map((c) => LEET[c] ?? c).join(''))).filter(Boolean);
  return [...new Set([...withJoinedRuns(korean), ...withJoinedRuns(latin)])];
}

/** 금칙어가 있으면 true */
export function containsProhibited(text: string | null | undefined): boolean {
  if (!text) return false;
  for (const word of candidates(text)) {
    if (WORD_PATTERNS.some((p) => p.test(word))) return true;
    const cleaned = ALLOWED.reduce((w, a) => w.split(a).join(' '), word);
    if (TERM_PATTERNS.some((p) => p.test(cleaned))) return true;
  }
  return false;
}
