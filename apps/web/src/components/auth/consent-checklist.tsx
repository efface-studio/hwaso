'use client';

import Link from 'next/link';
import { Checkbox } from '@/components/ui/choice';

export interface ConsentState {
  terms: boolean;
  privacy: boolean;
  ageOver14: boolean;
  marketing: boolean;
}

export const EMPTY_CONSENT: ConsentState = {
  terms: false,
  privacy: false,
  ageOver14: false,
  marketing: false,
};

/** 필수 항목(약관·개인정보·만 14세)에 모두 동의했는지 */
export const hasRequiredConsent = (c: ConsentState) => c.terms && c.privacy && c.ageOver14;

const ITEMS: { key: keyof ConsentState; label: string; href?: string }[] = [
  { key: 'terms', label: '(필수) 이용약관 동의', href: '/terms' },
  { key: 'privacy', label: '(필수) 개인정보 수집·이용 동의', href: '/privacy' },
  { key: 'ageOver14', label: '(필수) 만 14세 이상입니다' },
  { key: 'marketing', label: '(선택) 새 작품·경매 소식 등 마케팅 정보 수신' },
];

/** 가입·동의 화면 공용 약관 동의 목록. 전문은 새 탭으로 열어 입력 중인 내용을 잃지 않게 한다 */
export function ConsentChecklist({
  value,
  onChange,
}: {
  value: ConsentState;
  onChange: (next: ConsentState) => void;
}) {
  const all = ITEMS.every((i) => value[i.key]);
  return (
    <fieldset className="flex flex-col">
      <legend className="sr-only">약관 동의</legend>
      <Checkbox
        checked={all}
        onCheckedChange={(v) => onChange({ terms: v, privacy: v, ageOver14: v, marketing: v })}
        label={<span className="font-semibold">모두 동의합니다</span>}
        className="border-b border-border pb-1"
      />
      <ul className="flex flex-col pt-1">
        {ITEMS.map((item) => (
          <li key={item.key} className="flex items-center justify-between gap-3">
            <Checkbox
              checked={value[item.key]}
              onCheckedChange={(v) => onChange({ ...value, [item.key]: v })}
              label={item.label}
              className="text-small"
            />
            {item.href && (
              <Link
                href={item.href}
                target="_blank"
                rel="noopener"
                className="shrink-0 px-1 py-2 text-caption text-muted underline underline-offset-2 hover:text-foreground"
              >
                보기<span className="sr-only"> ({item.label.replace(/^\(필수\) /, '')} 전문, 새 창)</span>
              </Link>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-caption text-muted">만 14세 미만은 가입할 수 없어요.</p>
    </fieldset>
  );
}
