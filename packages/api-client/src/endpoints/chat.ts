import type {
  ChatMessageDto,
  ChatRoomDto,
  ChatTradeInput,
  CreateReportInput,
  Page,
  SendMessageInput,
} from '@shop/shared';
import type { Http } from '../http';

const id = (v: string) => encodeURIComponent(v);

export interface BlockedUser {
  id: string;
  nickname: string;
  avatarKey: string | null;
  blockedAt: string;
}

export const chatApi = (http: Http) => ({
  open: (productId: string) => http.post<{ id: string }>('/chat/rooms', { productId }),
  rooms: () => http.get<ChatRoomDto[]>('/chat/rooms'),
  room: (roomId: string) => http.get<ChatRoomDto>(`/chat/rooms/${id(roomId)}`),
  unreadCount: () => http.get<{ unreadCount: number }>('/chat/unread-count'),
  messages: (roomId: string, before?: string) =>
    http.get<Page<ChatMessageDto>>(`/chat/rooms/${id(roomId)}/messages`, { before }),
  send: (roomId: string, body: SendMessageInput) =>
    http.post<ChatMessageDto>(`/chat/rooms/${id(roomId)}/messages`, body),
  deleteMessage: (roomId: string, messageId: string) =>
    http.delete<{ ok: true }>(`/chat/rooms/${id(roomId)}/messages/${id(messageId)}`),
  read: (roomId: string) => http.post<{ ok: true }>(`/chat/rooms/${id(roomId)}/read`),
  /** 판매자: 거래 상태 변경 (판매 중·거래 중·판매 완료) */
  trade: (roomId: string, status: ChatTradeInput['status']) =>
    http.patch<{ status: ChatTradeInput['status'] }>(`/chat/rooms/${id(roomId)}/trade`, { status }),
  leave: (roomId: string) => http.post<{ ok: true }>(`/chat/rooms/${id(roomId)}/leave`),
  /** 자주 쓰는 문구 (저장한 적 없으면 기본 문구) */
  phrases: () => http.get<{ phrases: string[] }>('/chat/phrases'),
  savePhrases: (phrases: string[]) => http.put<{ phrases: string[] }>('/chat/phrases', { phrases }),
  mute: (roomId: string, muted: boolean) =>
    http.patch<{ muted: boolean; pinned: boolean }>(`/chat/rooms/${id(roomId)}`, { muted }),
  /** 상단 고정 / 해제 */
  pin: (roomId: string, pinned: boolean) =>
    http.patch<{ muted: boolean; pinned: boolean }>(`/chat/rooms/${id(roomId)}`, { pinned }),
});

export const safetyApi = (http: Http) => ({
  block: (userId: string) => http.post<{ ok: true }>(`/users/${id(userId)}/block`),
  unblock: (userId: string) => http.delete<{ ok: true }>(`/users/${id(userId)}/block`),
  blocks: () => http.get<BlockedUser[]>('/me/blocks'),
  report: (body: CreateReportInput) => http.post<{ id: string }>('/reports', body),
  myReports: () =>
    http.get<
      {
        id: string;
        targetType: CreateReportInput['targetType'];
        targetId: string;
        reason: CreateReportInput['reason'];
        detail: string;
        status: 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED';
        resolution: string | null;
        createdAt: string;
      }[]
    >('/me/reports'),
});
