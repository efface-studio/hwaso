import { z } from 'zod';
import { CHAT_MESSAGE_KINDS, REPORT_REASONS, REPORT_TARGETS } from '../enums';
import { id } from './common';
import { nicknameSchema } from './auth';

export const updateProfileSchema = z.strictObject({
  nickname: nicknameSchema.optional(),
  bio: z.string().trim().max(300).optional(),
  avatarKey: z.string().max(200).nullish(),
  region: z.string().trim().max(50).nullish(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const createChatRoomSchema = z.strictObject({ productId: id });

export const sendMessageSchema = z
  .strictObject({
    kind: z.enum(CHAT_MESSAGE_KINDS),
    body: z.string().trim().max(2000).optional(),
    imageKey: z.string().max(200).optional(),
    productId: id.optional(),
  })
  .refine(
    (v) =>
      (v.kind === 'TEXT' && !!v.body) ||
      (v.kind === 'IMAGE' && !!v.imageKey) ||
      (v.kind === 'PRODUCT' && !!v.productId),
    { message: '메시지 내용을 확인해주세요.' },
  );
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const createReviewSchema = z.strictObject({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(5, '5자 이상 작성해주세요.').max(1000),
  imageKeys: z.array(z.string().max(200)).max(5).default([]),
});
export type CreateReviewInput = z.infer<typeof createReviewSchema>;

export const createReportSchema = z.strictObject({
  targetType: z.enum(REPORT_TARGETS),
  targetId: id,
  reason: z.enum(REPORT_REASONS),
  detail: z.string().trim().max(1000).default(''),
});
export type CreateReportInput = z.infer<typeof createReportSchema>;

export const markNotificationsSchema = z.union([
  z.strictObject({ ids: z.array(id).min(1).max(100) }),
  z.strictObject({ all: z.literal(true) }),
]);
