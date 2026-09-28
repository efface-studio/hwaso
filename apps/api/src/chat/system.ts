import type { OrderStatus } from '@prisma/client';
import { CHAT_SYSTEM_TEXT, type ChatSystemEvent } from '@shop/shared';
import type { Tx } from '../prisma/prisma.service';

/**
 * 채팅방에 남기는 거래 안내(SYSTEM 메시지). 보낸 사람은 판매자로 두어 구매자에게 안 읽음으로 뜬다.
 * 트랜잭션 안에서 쓰고, 실시간 전송은 호출한 쪽이 커밋 뒤에 한다.
 */
export async function postSystemMessage(
  tx: Tx,
  room: { id: string; sellerId: string },
  event: ChatSystemEvent,
  orderId: string | null = null,
) {
  const now = new Date();
  const message = await tx.chatMessage.create({
    data: {
      roomId: room.id,
      senderId: room.sellerId,
      kind: 'SYSTEM',
      body: CHAT_SYSTEM_TEXT[event],
      data: { system: { event, orderId } },
      createdAt: now,
    },
  });
  await tx.chatRoom.update({ where: { id: room.id }, data: { lastMessageAt: now } });
  return message;
}

const ORDER_EVENT: Partial<Record<OrderStatus, ChatSystemEvent>> = {
  PAID: 'ORDER_PAID',
  SHIPPED: 'ORDER_SHIPPED',
  DELIVERED: 'ORDER_DELIVERED',
  COMPLETED: 'ORDER_COMPLETED',
  CANCELLED: 'ORDER_CANCELLED',
  REFUND_REQUESTED: 'ORDER_REFUND_REQUESTED',
  REFUNDED: 'ORDER_REFUNDED',
};

/**
 * 주문 상태가 바뀌면 그 작품의 구매자·판매자 대화방(있으면)에 안내를 남긴다.
 * ponytail: 실시간 전송 없이 저장만 — 방을 열거나 새로고침할 때 보인다. 필요하면 커밋 뒤 CHAT_MESSAGE 로 보낸다
 */
export async function postOrderEvent(tx: Tx, orderId: string, to: OrderStatus) {
  const event = ORDER_EVENT[to];
  if (!event) return;
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { buyerId: true, sellerId: true, items: { select: { productId: true }, take: 1 } },
  });
  const productId = order?.items[0]?.productId;
  if (!order || !productId) return;
  const room = await tx.chatRoom.findUnique({
    where: { productId_buyerId_sellerId: { productId, buyerId: order.buyerId, sellerId: order.sellerId } },
    select: { id: true, sellerId: true },
  });
  if (room) await postSystemMessage(tx, room, event, orderId);
}
