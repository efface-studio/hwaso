import type { AuctionResult, AuctionStatus, NotificationType, OrderStatus } from './enums';
import type { BidDto } from './dto';
import type { ChatMessageDto } from './chat';

/** Socket.IO namespace. docs/API.md "WebSocket" 과 동일 */
export const RT_NAMESPACE = '/rt';

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface ServerToClientEvents {
  AUCTION_BID: (p: {
    auctionId: string;
    seq: number;
    bid: Omit<BidDto, 'isMine'> & { bidderId: string };
  }) => void;
  AUCTION_PRICE_UPDATED: (p: {
    auctionId: string;
    seq: number;
    currentPrice: number;
    minNextBid: number;
    bidCount: number;
    bidderCount: number;
    highestBidderId: string | null;
  }) => void;
  AUCTION_TIMER_UPDATED: (p: { auctionId: string; seq: number; endsAt: string; serverTime: string }) => void;
  AUCTION_EXTENDED: (p: { auctionId: string; seq: number; endsAt: string; extendedBySec: number }) => void;
  AUCTION_STARTED: (p: { auctionId: string; seq: number; status: AuctionStatus }) => void;
  AUCTION_ENDED: (p: {
    auctionId: string;
    seq: number;
    status: AuctionStatus;
    result: AuctionResult;
    winnerId: string | null;
    finalPrice: number;
  }) => void;
  AUCTION_WATCHERS: (p: { auctionId: string; watchers: number }) => void;
  CHAT_MESSAGE: (p: { roomId: string; message: ChatMessageDto }) => void;
  CHAT_MESSAGE_DELETED: (p: { roomId: string; messageId: string }) => void;
  CHAT_TYPING: (p: { roomId: string; userId: string }) => void;
  CHAT_READ: (p: { roomId: string; userId: string; lastReadAt: string }) => void;
  NOTIFICATION: (p: { notification: NotificationDto; unreadCount: number }) => void;
  ORDER_STATUS_UPDATED: (p: { orderId: string; status: OrderStatus }) => void;
}

export type Ack<T> = (res: { ok: true; data: T } | { ok: false; code: string }) => void;

export interface ClientToServerEvents {
  'auction:join': (p: { auctionId: string }, ack: Ack<{ serverTime: string }>) => void;
  'auction:leave': (p: { auctionId: string }) => void;
  'chat:join': (p: { roomId: string }, ack: Ack<null>) => void;
  'chat:leave': (p: { roomId: string }) => void;
  'chat:typing': (p: { roomId: string }) => void;
  'time:sync': (ack: Ack<{ serverTime: string }>) => void;
}

export const rooms = {
  auction: (id: string) => `auction:${id}`,
  user: (id: string) => `user:${id}`,
  chat: (id: string) => `chat:${id}`,
};
