import { describe, expect, it } from 'vitest';
import {
  chatPreview,
  filterChatRooms,
  looksLikeExternalTrade,
  presenceLabel,
  sendMessageSchema,
  type ChatRoomDto,
  type ChatRoomFilter,
} from './chat';

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

const room = (id: string, over: object = {}) =>
  ({
    id,
    role: 'buyer',
    unreadCount: 0,
    counterpart: { nickname: '미술관옆집' },
    product: { title: '달항아리' },
    ...over,
  }) as unknown as ChatRoomDto;

describe('filterChatRooms', () => {
  const rooms = [
    room('a'),
    room('b', { role: 'seller', unreadCount: 2, counterpart: { nickname: 'Collector' } }),
    room('c', { product: null, counterpart: { nickname: '수집가' } }),
  ];
  const ids = (f: ChatRoomFilter, q = '') => filterChatRooms(rooms, f, q).map((r) => r.id);

  it('구매·판매·안 읽음으로 나눈다', () => {
    expect(ids('all')).toEqual(['a', 'b', 'c']);
    expect(ids('buying')).toEqual(['a', 'c']);
    expect(ids('selling')).toEqual(['b']);
    expect(ids('unread')).toEqual(['b']);
  });

  it('닉네임·작품명으로 찾는다 (대소문자·앞뒤 공백 무시, 작품 없는 방도 안전)', () => {
    expect(ids('all', ' collector ')).toEqual(['b']);
    expect(ids('all', '항아리')).toEqual(['a', 'b']);
    expect(ids('buying', '수집')).toEqual(['c']);
    expect(ids('all', '없는말')).toEqual([]);
  });
});

describe('presenceLabel', () => {
  const now = new Date('2026-09-29T12:00:00Z');
  it('접속 중 · N분 전 접속 · 기록 없음 · 탈퇴', () => {
    expect(presenceLabel({ online: true, lastSeenAt: null }, now)).toBe('접속 중');
    expect(presenceLabel({ online: false, lastSeenAt: '2026-09-29T11:55:00Z' }, now)).toBe('5분 전 접속');
    expect(presenceLabel({ online: false, lastSeenAt: null }, now)).toBeNull();
    expect(presenceLabel({ online: true, lastSeenAt: null, left: true }, now)).toBeNull();
  });
});
