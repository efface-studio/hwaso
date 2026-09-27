import { z } from 'zod';
import type { ChatMessageKind, ProductStatus, SaleType } from './enums';
import type { ImageDto, UserSummary } from './dto';
import { id } from './schemas/common';

export interface ChatMessageDto {
  id: string;
  roomId: string;
  senderId: string;
  kind: ChatMessageKind;
  body: string | null;
  image: ImageDto | null;
  product: {
    id: string;
    title: string;
    image: ImageDto | null;
    price: number | null;
    status: ProductStatus;
  } | null;
  appointment: { at: string; place: string } | null;
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
  counterpart: UserSummary & { left: boolean };
  /** 내가 차단 / 상대가 나를 차단 */
  blocked: boolean;
  blockedMe: boolean;
  lastMessage: { kind: ChatMessageKind; preview: string; senderId: string; createdAt: string } | null;
  unreadCount: number;
  muted: boolean;
  lastMessageAt: string;
  /** 읽음 표시용: 상대가 마지막으로 읽은 시각 */
  counterpartLastReadAt: string | null;
}

export const CHAT_MESSAGE_MAX = 1000;

export const createChatRoomSchema = z.strictObject({ productId: id });

export const sendMessageSchema = z
  .strictObject({
    kind: z.enum(['TEXT', 'IMAGE', 'PRODUCT', 'APPOINTMENT']),
    body: z.string().trim().max(CHAT_MESSAGE_MAX).optional(),
    imageKey: z.string().max(200).optional(),
    productId: id.optional(),
    appointment: z
      .strictObject({ at: z.iso.datetime({ offset: true }), place: z.string().trim().min(1).max(100) })
      .optional(),
    clientId: z.string().min(8).max(64).optional(),
  })
  .refine(
    (v) =>
      (v.kind === 'TEXT' && !!v.body) ||
      (v.kind === 'IMAGE' && !!v.imageKey) ||
      (v.kind === 'PRODUCT' && !!v.productId) ||
      (v.kind === 'APPOINTMENT' && !!v.appointment),
    { message: '메시지 내용을 확인해주세요.' },
  );
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const chatRoomSettingsSchema = z.strictObject({ muted: z.boolean() });

/** 외부 거래 유도 표현 (메신저 아이디·계좌·전화번호). 차단하지 않고 안전 안내만 띄운다 */
const EXTERNAL_TRADE =
  /(카톡|카카오\s?톡|오픈\s?채팅|텔레그램|라인\s?아이디|계좌\s?번호|계좌로|입금해|선입금|송금|직거래|0\d{1,2}[-\s.]?\d{3,4}[-\s.]?\d{4})/;

export const looksLikeExternalTrade = (text: string) => EXTERNAL_TRADE.test(text);

export function chatPreview(m: { kind: ChatMessageKind; body: string | null; deleted: boolean }): string {
  if (m.deleted) return '삭제된 메시지입니다.';
  switch (m.kind) {
    case 'IMAGE':
      return '사진을 보냈어요.';
    case 'PRODUCT':
      return '작품을 공유했어요.';
    case 'APPOINTMENT':
      return '거래 약속을 제안했어요.';
    default:
      return (m.body ?? '').slice(0, 80);
  }
}
