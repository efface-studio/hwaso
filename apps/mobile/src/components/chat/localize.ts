import {
  CHAT_DEFAULT_PHRASES,
  CHAT_SYSTEM_TEXT,
  chatPreview,
  type ChatMessageKind,
  type ChatSystemEvent,
} from '@shop/shared';
import i18n from '@/i18n';
import { formatRelative } from '@/i18n/format';

/**
 * 서버(@shop/shared)가 한국어로 만든 채팅 문구를 지금 언어로 바꾼다.
 * 컴포넌트가 useTranslation 으로 언어가 바뀔 때 다시 그려지므로 렌더 중에 부르면 된다.
 */

const isSystemEvent = (k: string): k is ChatSystemEvent => k in CHAT_SYSTEM_TEXT;

/** 거래 안내 문구 */
export const systemText = (event: ChatSystemEvent): string => i18n.t(`chat:system.${event}`);

/** 서버가 만든 "삭제된 메시지" 요약 (비교용) */
const DELETED_PREVIEW = chatPreview({ kind: 'TEXT', body: null, deleted: true });

/**
 * 목록·답장 인용의 메시지 요약. 글 메시지는 그대로 두고, 사진·작품·약속·거래 안내·삭제 표시는 번역한다.
 * 사진 여러 장은 서버 요약("사진 3장을 보냈어요.")의 숫자로 장수를 알아낸다.
 */
export function localizePreview(p: { kind: ChatMessageKind; preview: string; deleted?: boolean }): string {
  if (p.deleted || p.preview === DELETED_PREVIEW) return i18n.t('chat:message.deleted');
  switch (p.kind) {
    case 'IMAGE': {
      const count = Number(/\d+/.exec(p.preview)?.[0] ?? 1);
      return count > 1 ? i18n.t('chat:preview.photos', { count }) : i18n.t('chat:preview.photo');
    }
    case 'PRODUCT':
      return i18n.t('chat:preview.product');
    case 'APPOINTMENT':
      return i18n.t('chat:preview.appointment');
    case 'SYSTEM': {
      const event = Object.keys(CHAT_SYSTEM_TEXT)
        .filter(isSystemEvent)
        .find((k) => CHAT_SYSTEM_TEXT[k] === p.preview);
      return event ? systemText(event) : p.preview;
    }
    default:
      return p.preview;
  }
}

/** 대화 상대 접속 상태: "접속 중" · "5분 전 접속" · 기록 없으면 null */
export function presenceText(c: {
  online: boolean;
  lastSeenAt: string | null;
  left?: boolean;
}): string | null {
  if (c.left) return null;
  if (c.online) return i18n.t('chat:room.online');
  return c.lastSeenAt ? i18n.t('chat:room.lastSeen', { time: formatRelative(c.lastSeenAt) }) : null;
}

/** CHAT_DEFAULT_PHRASES 와 같은 순서의 번역 키 */
const DEFAULT_PHRASE_KEYS = ['askAvailable', 'stillAvailable', 'morePhotos', 'safePay', 'getBack'] as const;

/** 기본 문구(저장한 적 없을 때 서버가 주는 한국어)는 지금 언어로, 직접 저장한 문구는 그대로 */
export function localizePhrase(phrase: string): string {
  const key = DEFAULT_PHRASE_KEYS[CHAT_DEFAULT_PHRASES.findIndex((d) => d === phrase)];
  return key ? i18n.t(`chat:phrases.defaults.${key}`) : phrase;
}
