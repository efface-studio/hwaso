import { z } from 'zod';
import { REPORT_REASONS, REPORT_TARGETS } from '../enums';
import { id } from './common';
import { nicknameSchema } from './auth';

export const updateProfileSchema = z.strictObject({
  nickname: nicknameSchema.optional(),
  bio: z.string().trim().max(300).optional(),
  avatarKey: z.string().max(200).nullish(),
  region: z.string().trim().max(50).nullish(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

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
