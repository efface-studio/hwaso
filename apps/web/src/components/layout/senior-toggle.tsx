'use client';

import { Switch } from '@/components/ui/choice';
import { useSeniorStore } from '@/stores/senior';

/** 설정 화면용 스위치 */
export function SeniorSwitch() {
  const { enabled, setEnabled } = useSeniorStore();
  return (
    <Switch
      checked={enabled}
      onCheckedChange={setEnabled}
      label="큰 글씨 모드 (시니어 모드)"
      description="글자와 버튼을 크게, 글자색을 진하게 하고 화면 움직임을 줄여요. 이 기기에만 적용돼요."
    />
  );
}

/** 푸터·마이페이지 빠른 전환 버튼 */
export function SeniorQuickToggle() {
  const { enabled, setEnabled } = useSeniorStore();
  return (
    <button
      type="button"
      aria-pressed={enabled}
      onClick={() => setEnabled(!enabled)}
      className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-border px-3 text-label hover:bg-surface-2 aria-pressed:border-foreground"
    >
      <span aria-hidden className="font-bold">
        가
      </span>
      {enabled ? '큰 글씨 끄기' : '큰 글씨 켜기'}
    </button>
  );
}
