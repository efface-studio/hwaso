import { describe, expect, it } from 'vitest';
import { chatPreview, looksLikeExternalTrade, sendMessageSchema } from './chat';

describe('chat', () => {
  it('flags external trade phrases', () => {
    expect(looksLikeExternalTrade('카톡으로 연락주세요')).toBe(true);
    expect(looksLikeExternalTrade('010-1234-5678 로 문자 주세요')).toBe(true);
    expect(looksLikeExternalTrade('선입금 해주시면 바로 보내드려요')).toBe(true);
    expect(looksLikeExternalTrade('액자 포함인가요?')).toBe(false);
  });

  it('validates message kinds', () => {
    expect(sendMessageSchema.safeParse({ kind: 'TEXT', body: ' ' }).success).toBe(false);
    expect(sendMessageSchema.safeParse({ kind: 'TEXT', body: '안녕하세요' }).success).toBe(true);
    expect(
      sendMessageSchema.safeParse({
        kind: 'APPOINTMENT',
        appointment: { at: '2026-10-01T15:00:00+09:00', place: '인사동 쌈지길 앞' },
      }).success,
    ).toBe(true);
    expect(sendMessageSchema.safeParse({ kind: 'SYSTEM', body: 'x' }).success).toBe(false);
  });

  it('previews', () => {
    expect(chatPreview({ kind: 'IMAGE', body: null, deleted: false })).toBe('사진을 보냈어요.');
    expect(chatPreview({ kind: 'TEXT', body: '안녕', deleted: true })).toBe('삭제된 메시지입니다.');
  });
});
