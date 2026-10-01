import '../zod-config';
import * as z from 'zod';
import {
  CHAT_IMAGES_MAX,
  CHAT_MESSAGE_MAX,
  CHAT_PHRASE_MAX,
  CHAT_PHRASES_MAX,
  CHAT_TRADE_STATUSES,
} from '../chat';
import { id } from './common';

// 채팅 입력 검증 — 상수·헬퍼(../chat)만 쓰는 화면이 zod 를 끌어오지 않게 따로 둔다

export const chatTradeSchema = z.strictObject({ status: z.enum(CHAT_TRADE_STATUSES) });
export type ChatTradeInput = z.infer<typeof chatTradeSchema>;

export const createChatRoomSchema = z.strictObject({ productId: id });

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

export const chatPhrasesSchema = z.strictObject({
  phrases: z.array(z.string().trim().min(1).max(CHAT_PHRASE_MAX)).max(CHAT_PHRASES_MAX),
});
export type ChatPhrasesInput = z.infer<typeof chatPhrasesSchema>;

/** 방 설정: 알림 끄기·상단 고정 (둘 중 하나 이상) */
export const chatRoomSettingsSchema = z
  .strictObject({ muted: z.boolean().optional(), pinned: z.boolean().optional() })
  .refine((v) => v.muted !== undefined || v.pinned !== undefined, { message: '바꿀 설정이 없습니다.' });
export type ChatRoomSettingsInput = z.infer<typeof chatRoomSettingsSchema>;
