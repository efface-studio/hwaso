import { create } from 'zustand';
import { useAuthStore } from '@/stores/auth';
import { askPushPermission, pushPermission, requestPushPermission } from './push';
import { secure } from './secure';

/** 알림이 쓸모 있는 순간 — 안내 문구가 달라진다 */
export type PushReason = 'chat' | 'bid' | 'favorite' | 'follow';

/** 안내 시트를 한 번 보여 줬는지 (나중에를 눌러도 다시 조르지 않는다 — 알림 설정에서 켤 수 있다) */
const ASKED_KEY = 'hwaso.pushAsked';

/** 첫 실행 때 시스템 알림 창을 띄웠는지 (기기당 한 번) */
const LAUNCH_ASKED_KEY = 'hwaso.pushAskedOnLaunch';

/** 루트의 PushPromptHost 가 그린다 */
export const usePushPrompt = create<{ reason: PushReason | null }>(() => ({ reason: null }));

let checking = false;

/**
 * 알림 권한을 맥락 안에서 묻는다: 채팅을 보내거나 입찰·관심·팔로우를 한 직후 처음 한 번,
 * 아직 권한을 묻지 않은 기기에만 짧은 안내 시트를 띄운다 (시스템 권한 창은 시트에서 '알림 켜기'를 누를 때).
 */
export async function askPushInContext(reason: PushReason) {
  if (checking || usePushPrompt.getState().reason) return;
  // 약관 동의 전에는 푸시 토큰을 등록할 수 없다 (서버가 쓰기 요청을 막는다)
  const user = useAuthStore.getState().user;
  if (!user || user.consentRequired) return;
  checking = true;
  try {
    if ((await pushPermission()) !== 'undetermined') return;
    if (await secure.get(ASKED_KEY)) return;
    usePushPrompt.setState({ reason });
  } finally {
    checking = false;
  }
}

/** 시트 닫기. allow 면 시스템 권한 창을 띄운다 */
export async function answerPushPrompt(allow: boolean) {
  usePushPrompt.setState({ reason: null });
  await secure.set(ASKED_KEY, '1');
  if (allow) await requestPushPermission().catch(() => false);
}

/**
 * 앱을 처음 실행하면(스플래시가 끝난 뒤) 시스템 알림 허용 창을 한 번 띄운다.
 * 로그인·약관 동의를 마친 상태면 바로 토큰을 등록하고, 아니면 허용만 받아 둔다 — 로그인하면 AppSync 가 등록한다.
 * 이미 허용·거부했거나 한 번 물어본 기기에서는 다시 띄우지 않는다.
 */
export async function askPushOnLaunch() {
  if (await secure.get(LAUNCH_ASKED_KEY)) return;
  if ((await pushPermission()) !== 'undetermined') return;
  await secure.set(LAUNCH_ASKED_KEY, '1');
  const user = useAuthStore.getState().user;
  if (user && !user.consentRequired) await requestPushPermission().catch(() => false);
  else await askPushPermission().catch(() => false);
}
