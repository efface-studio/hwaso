import { z } from 'zod';
import type { ChatMessageKind, ProductStatus, SaleType } from './enums';
import type { ImageDto, UserSummary } from './dto';
import { formatRelativeTime } from './format';
import { id } from './schemas/common';

/** 채팅방에 남는 거래 안내 (판매자의 상태 변경 · 주문 진행) */
export const CHAT_SYSTEM_TEXT = {
  TRADE_ACTIVE: '판매자가 판매 중으로 바꿨어요.',
  TRADE_RESERVED: '판매자가 거래 중으로 바꿨어요.',
  TRADE_SOLD: '판매자가 판매 완료로 바꿨어요.',
  ORDER_PAID: '결제가 완료됐어요. 판매자가 발송을 준비해요.',
  ORDER_SHIPPED: '작품이 발송됐어요.',
  ORDER_DELIVERED: '배송이 완료됐어요. 작품을 확인하고 구매를 확정해주세요.',
  ORDER_COMPLETED: '구매가 확정됐어요. 거래 후기를 남겨주세요.',
  ORDER_CANCELLED: '주문이 취소됐어요.',
  ORDER_REFUND_REQUESTED: '환불이 요청됐어요.',
  ORDER_REFUNDED: '환불이 완료됐어요.',
} as const;
export type ChatSystemEvent = keyof typeof CHAT_SYSTEM_TEXT;

/** 판매자가 채팅에서 바꿀 수 있는 거래 상태 */
export const CHAT_TRADE_STATUSES = ['ACTIVE', 'RESERVED', 'SOLD'] as const;
export const chatTradeSchema = z.strictObject({ status: z.enum(CHAT_TRADE_STATUSES) });
export type ChatTradeInput = z.infer<typeof chatTradeSchema>;

export interface ChatMessageDto {
  id: string;
  roomId: string;
  senderId: string;
  kind: ChatMessageKind;
  body: string | null;
  /** 첫 사진 (구버전 앱 호환) — 여러 장이면 images */
  image: ImageDto | null;
  images: ImageDto[];
  product: {
    id: string;
    title: string;
    image: ImageDto | null;
    price: number | null;
    status: ProductStatus;
  } | null;
  appointment: { at: string; place: string } | null;
  /** SYSTEM 메시지: 거래 상태 변경·주문 진행 안내 (본문은 body) */
  system: { event: ChatSystemEvent; orderId: string | null } | null;
  /** 답장한 원문 요약. 원문이 지워지면 deleted 로 보인다 */
  replyTo: {
    id: string;
    senderId: string;
    kind: ChatMessageKind;
    preview: string;
    deleted: boolean;
  } | null;
  /** 외부 연락처·계좌 등 외부 거래 유도로 보이는 메시지 */
  warning: boolean;
  clientId: string | null;
  deleted: boolean;
  createdAt: string;
}

export interface ChatRoomDto {
  id: string;
  role: 'buyer' | 'seller';
  product: {
    id: string;
    title: string;
    image: ImageDto | null;
    price: number | null;
    status: ProductStatus;
    saleType: SaleType;
  } | null;
  /** online: 지금 접속 중, lastSeenAt: 마지막 접속 (접속 기록이 없으면 null) */
  counterpart: UserSummary & { left: boolean; online: boolean; lastSeenAt: string | null };
  /** 내가 차단 / 상대가 나를 차단 */
  blocked: boolean;
  blockedMe: boolean;
  lastMessage: { kind: ChatMessageKind; preview: string; senderId: string; createdAt: string } | null;
  unreadCount: number;
  muted: boolean;
  /** 상단 고정 */
  pinned: boolean;
  lastMessageAt: string;
  /** 읽음 표시용: 상대가 마지막으로 읽은 시각 */
  counterpartLastReadAt: string | null;
}

export const CHAT_MESSAGE_MAX = 1000;

export const createChatRoomSchema = z.strictObject({ productId: id });

/** 한 메시지에 보낼 수 있는 사진 수 */
export const CHAT_IMAGES_MAX = 10;

export const sendMessageSchema = z
  .strictObject({
    kind: z.enum(['TEXT', 'IMAGE', 'PRODUCT', 'APPOINTMENT']),
    body: z.string().trim().max(CHAT_MESSAGE_MAX).optional(),
    imageKey: z.string().max(200).optional(),
    /** 사진 여러 장 (최대 CHAT_IMAGES_MAX). imageKey 한 장도 계속 받는다 */
    imageKeys: z.array(z.string().max(200)).min(1).max(CHAT_IMAGES_MAX).optional(),
    productId: id.optional(),
    appointment: z
      .strictObject({ at: z.iso.datetime({ offset: true }), place: z.string().trim().min(1).max(100) })
      .optional(),
    clientId: z.string().min(8).max(64).optional(),
    /** 답장할 같은 방 메시지 */
    replyToId: id.optional(),
  })
  .refine(
    (v) =>
      (v.kind === 'TEXT' && !!v.body) ||
      (v.kind === 'IMAGE' && (!!v.imageKey || !!v.imageKeys?.length)) ||
      (v.kind === 'PRODUCT' && !!v.productId) ||
      (v.kind === 'APPOINTMENT' && !!v.appointment),
    { message: '메시지 내용을 확인해주세요.' },
  );
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

/** 채팅 자주 쓰는 문구 — 저장한 적 없으면 기본 문구를 준다 */
export const CHAT_PHRASES_MAX = 20;
export const CHAT_PHRASE_MAX = 100;
export const CHAT_DEFAULT_PHRASES = [
  '안녕하세요, 작품 아직 판매 중인가요?',
  '네, 아직 판매 중이에요.',
  '작품 상태와 뒷면 사진을 더 볼 수 있을까요?',
  '택배 거래는 안전결제로 부탁드려요.',
  '확인하고 다시 연락드릴게요. 감사합니다!',
] as const;
export const chatPhrasesSchema = z.strictObject({
  phrases: z.array(z.string().trim().min(1).max(CHAT_PHRASE_MAX)).max(CHAT_PHRASES_MAX),
});
export type ChatPhrasesInput = z.infer<typeof chatPhrasesSchema>;

/** 방 설정: 알림 끄기·상단 고정 (둘 중 하나 이상) */
export const chatRoomSettingsSchema = z
  .strictObject({ muted: z.boolean().optional(), pinned: z.boolean().optional() })
  .refine((v) => v.muted !== undefined || v.pinned !== undefined, { message: '바꿀 설정이 없습니다.' });
export type ChatRoomSettingsInput = z.infer<typeof chatRoomSettingsSchema>;

/** 외부 거래 유도 표현 (메신저 아이디·계좌·전화번호). 차단하지 않고 안전 안내만 띄운다 */
const EXTERNAL_TRADE =
  /(카톡|카카오\s?톡|오픈\s?채팅|텔레그램|라인\s?아이디|계좌\s?번호|계좌로|입금해|선입금|송금|직거래|0\d{1,2}[-\s.]?\d{3,4}[-\s.]?\d{4})/;

export const looksLikeExternalTrade = (text: string) => EXTERNAL_TRADE.test(text);

export function chatPreview(m: {
  kind: ChatMessageKind;
  body: string | null;
  deleted: boolean;
  imageCount?: number;
}): string {
  if (m.deleted) return '삭제된 메시지입니다.';
  switch (m.kind) {
    case 'IMAGE':
      return (m.imageCount ?? 1) > 1 ? `사진 ${m.imageCount}장을 보냈어요.` : '사진을 보냈어요.';
    case 'PRODUCT':
      return '작품을 공유했어요.';
    case 'APPOINTMENT':
      return '거래 약속을 제안했어요.';
    default:
      return (m.body ?? '').slice(0, 80);
  }
}

/** 채팅 목록 필터 */
export const CHAT_ROOM_FILTERS = [
  ['all', '전체'],
  ['buying', '구매'],
  ['selling', '판매'],
  ['unread', '안 읽음'],
] as const;
export type ChatRoomFilter = (typeof CHAT_ROOM_FILTERS)[number][0];

/** 채팅 목록 거르기: 구매·판매·안 읽음 + 상대 닉네임·작품명 검색 (웹·앱 공용) */
export function filterChatRooms<
  R extends Pick<ChatRoomDto, 'role' | 'unreadCount'> & {
    counterpart: { nickname: string };
    product: { title: string } | null;
  },
>(rooms: readonly R[], filter: ChatRoomFilter, query: string): R[] {
  const q = query.trim().toLowerCase();
  return rooms.filter(
    (r) =>
      (filter === 'all' ||
        (filter === 'buying' && r.role === 'buyer') ||
        (filter === 'selling' && r.role === 'seller') ||
        (filter === 'unread' && r.unreadCount > 0)) &&
      (!q || `${r.counterpart.nickname} ${r.product?.title ?? ''}`.toLowerCase().includes(q)),
  );
}

/** 대화 상대 접속 상태 문구: "접속 중" · "5분 전 접속" · 기록 없으면 null */
export function presenceLabel(
  c: { online: boolean; lastSeenAt: string | null; left?: boolean },
  now: Date = new Date(),
): string | null {
  if (c.left) return null;
  if (c.online) return '접속 중';
  return c.lastSeenAt ? `${formatRelativeTime(c.lastSeenAt, now)} 접속` : null;
}
