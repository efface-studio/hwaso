import i18n from '@/i18n';

/** zod 검사 결과 중 여기서 쓰는 부분 (@shop/shared 의 passwordSchema·nicknameSchema) */
type Issue = { code: string; message: string };

/**
 * 공용 스키마의 오류 문구는 한국어라, 어떤 규칙에서 걸렸는지(issue.code)로 지금 언어의 문구를 고른다.
 * 규칙 순서는 스키마와 같다: 길이 → 영문 → 숫자. 모르는 오류는 스키마 문구를 그대로 쓴다.
 */
export function passwordIssueMessage(issue: Issue, value: string): string {
  switch (issue.code) {
    case 'too_small':
      return i18n.t('auth:validation.passwordMin');
    case 'too_big':
      return i18n.t('auth:validation.passwordMax');
    case 'invalid_format':
      return /[A-Za-z]/.test(value)
        ? i18n.t('auth:validation.passwordDigit')
        : i18n.t('auth:validation.passwordLetter');
    default:
      return issue.message;
  }
}

export function nicknameIssueMessage(issue: Issue): string {
  switch (issue.code) {
    case 'too_small':
      return i18n.t('auth:validation.nicknameMin');
    case 'too_big':
      return i18n.t('auth:validation.nicknameMax');
    case 'invalid_format':
      return i18n.t('auth:validation.nicknameChars');
    default:
      return issue.message;
  }
}
