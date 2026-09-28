import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CHAT_TRADE_STATUSES,
  chatPreview,
  looksLikeExternalTrade,
  type ChatMessageDto,
  type ChatRoomDto,
  type ChatTradeInput,
  type ImageDto,
  type Page,
  type SendMessageInput,
} from '@shop/shared';
import { AppException } from '../common/app-exception';
import { RateLimitService } from '../common/rate-limit';
import { createHash } from 'node:crypto';
import type { AuthUser } from '../common/auth';
import { logNotifyError } from '../notifications/notification-events';
import { NotificationsService } from '../notifications/notifications.service';
import { isUniqueViolation } from '../orders/order-state';
import { PrismaService } from '../prisma/prisma.service';
import { mediaOwnerKey } from '../products/seller-products.service';
import { RealtimeService } from '../realtime/realtime';
import { RedisService } from '../redis/redis.service';
import { SafetyService } from '../safety/safety.controller';
import { postSystemMessage } from './system';

const PAGE = 50;
const ROOM_LIMIT = 100;
const imageSelect = { key: true, width: true, height: true, dominantColor: true } as const;
const userSelect = {
  id: true,
  status: true,
  profile: { select: { nickname: true, avatarKey: true } },
} as const;

const messageInclude = {
  product: {
    select: {
      id: true,
      title: true,
      price: true,
      status: true,
      images: { select: imageSelect, orderBy: { sortOrder: 'asc' }, take: 1 },
    },
  },
  replyTo: { select: { id: true, senderId: true, kind: true, body: true, data: true, deletedAt: true } },
} satisfies Prisma.ChatMessageInclude;

type MessageRow = Prisma.ChatMessageGetPayload<{ include: typeof messageInclude }>;
type MessageData = {
  image?: ImageDto;
  images?: ImageDto[];
  appointment?: { at: string; place: string };
  warning?: boolean;
  system?: ChatMessageDto['system'];
};

export function toMessageDto(m: MessageRow): ChatMessageDto {
  const deleted = !!m.deletedAt;
  const data = (m.data ?? {}) as MessageData;
  return {
    id: m.id,
    roomId: m.roomId,
    senderId: m.senderId,
    kind: m.kind,
    body: deleted ? null : m.body,
    image: deleted ? null : (data.image ?? null),
    images: deleted ? [] : (data.images ?? (data.image ? [data.image] : [])),
    product:
      deleted || !m.product
        ? null
        : {
            id: m.product.id,
            title: m.product.title,
            image: m.product.images[0] ?? null,
            price: m.product.price == null ? null : Number(m.product.price),
            status: m.product.status,
          },
    appointment: deleted ? null : (data.appointment ?? null),
    system: data.system ?? null,
    replyTo:
      deleted || !m.replyTo
        ? null
        : {
            id: m.replyTo.id,
            senderId: m.replyTo.senderId,
            kind: m.replyTo.kind,
            preview: chatPreview({
              kind: m.replyTo.kind,
              body: m.replyTo.body,
              deleted: !!m.replyTo.deletedAt,
              imageCount: ((m.replyTo.data ?? {}) as MessageData).images?.length,
            }),
            deleted: !!m.replyTo.deletedAt,
          },
    warning: !deleted && !!data.warning,
    clientId: m.clientId,
    deleted,
    createdAt: m.createdAt.toISOString(),
  };
}

const roomInclude = {
  product: {
    select: {
      id: true,
      title: true,
      price: true,
      status: true,
      saleType: true,
      images: { select: imageSelect, orderBy: { sortOrder: 'asc' }, take: 1 },
    },
  },
  buyer: { select: userSelect },
  seller: { select: userSelect },
  readStates: true,
  messages: { orderBy: { createdAt: 'desc' }, take: 1 },
} satisfies Prisma.ChatRoomInclude;

type RoomRow = Prisma.ChatRoomGetPayload<{ include: typeof roomInclude }>;

/**
 * 작품 기반 1:1 채팅 (docs/API.md "Chat"). 메시지는 두 참여자의 개인 룸(user:{id})으로 실시간 전송하고,
 * 입력 중 표시만 채팅방 룸(chat:{id})을 쓴다. 차단 관계에서는 방 생성·전송이 막힌다.
 */
const CHAT_BURST_LIMIT = 8;
const CHAT_BURST_WINDOW_SEC = 10;
const CHAT_DUPLICATE_LIMIT = 2;
const CHAT_DUPLICATE_WINDOW_SEC = 30;

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly redis: RedisService,
    private readonly safety: SafetyService,
    private readonly notifications: NotificationsService,
    private readonly limiter: RateLimitService,
  ) {}

  private async member(user: AuthUser, roomId: string) {
    const room = await this.prisma.chatRoom.findUnique({
      where: { id: roomId },
      include: { readStates: true },
    });
    if (!room || (room.buyerId !== user.id && room.sellerId !== user.id)) throw new AppException('NOT_FOUND');
    const counterpartId = room.buyerId === user.id ? room.sellerId : room.buyerId;
    const mine = room.readStates.find((r) => r.userId === user.id);
    return { room, counterpartId, mine };
  }

  // ───── 방 ─────

  /** 작품 상세의 "채팅하기": 같은 작품·같은 상대면 기존 방을 다시 연다 */
  async open(user: AuthUser, productId: string) {
    const p = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null, publishedAt: { not: null } },
      select: { sellerId: true },
    });
    if (!p) throw new AppException('NOT_FOUND');
    if (p.sellerId === user.id) throw new AppException('FORBIDDEN', '본인 작품에는 채팅할 수 없습니다.');
    if (await this.safety.blockedBetween(user.id, p.sellerId))
      throw new AppException('FORBIDDEN', '차단한 사용자와는 대화할 수 없습니다.');
    const room = await this.prisma.chatRoom.upsert({
      where: { productId_buyerId_sellerId: { productId, buyerId: user.id, sellerId: p.sellerId } },
      create: { productId, buyerId: user.id, sellerId: p.sellerId },
      update: {},
    });
    await this.prisma.chatReadState.createMany({
      data: [
        { roomId: room.id, userId: user.id },
        { roomId: room.id, userId: p.sellerId },
      ],
      skipDuplicates: true,
    });
    return { id: room.id };
  }

  private async blockSets(userId: string) {
    const rows = await this.prisma.userBlock.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    });
    return {
      blocked: new Set(rows.filter((r) => r.blockerId === userId).map((r) => r.blockedId)),
      blockedMe: new Set(rows.filter((r) => r.blockedId === userId).map((r) => r.blockerId)),
    };
  }

  private async unreadByRoom(userId: string, roomIds: string[]) {
    if (!roomIds.length) return new Map<string, number>();
    const rows = await this.prisma.$queryRaw<{ roomId: string; count: bigint }[]>`
      SELECT m."roomId", count(*) AS count
      FROM "ChatMessage" m
      JOIN "ChatReadState" r ON r."roomId" = m."roomId" AND r."userId" = ${userId}
      WHERE m."roomId" IN (${Prisma.join(roomIds)})
        AND m."senderId" <> ${userId}
        AND m."deletedAt" IS NULL
        AND m."createdAt" > r."lastReadAt"
      GROUP BY m."roomId"`;
    return new Map(rows.map((r) => [r.roomId, Number(r.count)]));
  }

  private toRoom(
    r: RoomRow,
    userId: string,
    unread: number,
    blocks: { blocked: Set<string>; blockedMe: Set<string> },
  ): ChatRoomDto {
    const isBuyer = r.buyerId === userId;
    const other = isBuyer ? r.seller : r.buyer;
    const mine = r.readStates.find((s) => s.userId === userId);
    const theirs = r.readStates.find((s) => s.userId === other.id);
    const last = r.messages[0];
    const visibleLast = last && (!mine?.hiddenAt || last.createdAt > mine.hiddenAt) ? last : null;
    return {
      id: r.id,
      role: isBuyer ? 'buyer' : 'seller',
      product: r.product && {
        id: r.product.id,
        title: r.product.title,
        image: r.product.images[0] ?? null,
        price: r.product.price == null ? null : Number(r.product.price),
        status: r.product.status,
        saleType: r.product.saleType,
      },
      counterpart: {
        id: other.id,
        nickname: other.profile?.nickname ?? '탈퇴한 회원',
        avatarKey: other.profile?.avatarKey ?? null,
        left: other.status === 'DELETED',
      },
      blocked: blocks.blocked.has(other.id),
      blockedMe: blocks.blockedMe.has(other.id),
      lastMessage: visibleLast && {
        kind: visibleLast.kind,
        preview: chatPreview({
          ...visibleLast,
          deleted: !!visibleLast.deletedAt,
          imageCount: ((visibleLast.data ?? {}) as MessageData).images?.length,
        }),
        senderId: visibleLast.senderId,
        createdAt: visibleLast.createdAt.toISOString(),
      },
      unreadCount: unread,
      muted: mine?.muted ?? false,
      lastMessageAt: r.lastMessageAt.toISOString(),
      counterpartLastReadAt: theirs?.lastReadAt.toISOString() ?? null,
    };
  }

  /** 내 채팅 목록: 최근 대화 순. 나간 방은 새 메시지가 오면 다시 보인다 */
  async rooms(user: AuthUser): Promise<ChatRoomDto[]> {
    // ponytail: 최근 100개 방만 — 그 이상은 페이지네이션 추가
    const rows = await this.prisma.chatRoom.findMany({
      where: { OR: [{ buyerId: user.id }, { sellerId: user.id }] },
      include: roomInclude,
      orderBy: { lastMessageAt: 'desc' },
      take: ROOM_LIMIT,
    });
    const visible = rows.filter((r) => {
      const mine = r.readStates.find((s) => s.userId === user.id);
      const last = r.messages[0];
      if (!last) return r.buyerId === user.id && !mine?.hiddenAt; // 빈 방은 연 사람에게만
      return !mine?.hiddenAt || last.createdAt > mine.hiddenAt;
    });
    const [unread, blocks] = await Promise.all([
      this.unreadByRoom(
        user.id,
        visible.map((r) => r.id),
      ),
      this.blockSets(user.id),
    ]);
    return visible.map((r) => this.toRoom(r, user.id, unread.get(r.id) ?? 0, blocks));
  }

  async room(user: AuthUser, roomId: string): Promise<ChatRoomDto> {
    await this.member(user, roomId);
    const r = await this.prisma.chatRoom.findUniqueOrThrow({ where: { id: roomId }, include: roomInclude });
    const [unread, blocks] = await Promise.all([
      this.unreadByRoom(user.id, [roomId]),
      this.blockSets(user.id),
    ]);
    return this.toRoom(r, user.id, unread.get(roomId) ?? 0, blocks);
  }

  /** 하단 탭·헤더 배지: 알림을 끈 방은 제외 */
  async unreadTotal(user: AuthUser) {
    const [row] = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count
      FROM "ChatMessage" m
      JOIN "ChatReadState" r ON r."roomId" = m."roomId" AND r."userId" = ${user.id}
      WHERE m."senderId" <> ${user.id}
        AND m."deletedAt" IS NULL
        AND r.muted = false
        AND m."createdAt" > r."lastReadAt"
        AND (r."hiddenAt" IS NULL OR m."createdAt" > r."hiddenAt")`;
    return { unreadCount: Number(row?.count ?? 0) };
  }

  // ───── 메시지 ─────

  /** 최신순 페이지 (before = 이 메시지보다 이전). 나간 뒤에는 그 이후 메시지만 보인다 */
  async messages(user: AuthUser, roomId: string, before?: string): Promise<Page<ChatMessageDto>> {
    const { mine } = await this.member(user, roomId);
    const pivot = before
      ? await this.prisma.chatMessage.findFirst({
          where: { id: before, roomId },
          select: { createdAt: true },
        })
      : null;
    const rows = await this.prisma.chatMessage.findMany({
      where: {
        roomId,
        createdAt: {
          ...(pivot ? { lt: pivot.createdAt } : {}),
          ...(mine?.hiddenAt ? { gt: mine.hiddenAt } : {}),
        },
      },
      include: messageInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PAGE + 1,
    });
    const page = rows.slice(0, PAGE);
    return { items: page.map(toMessageDto), nextCursor: rows.length > PAGE ? page.at(-1)!.id : null };
  }

  private async content(user: AuthUser, input: SendMessageInput) {
    const data: MessageData = {};
    let productId: string | undefined;
    let imageKey: string | undefined;
    if (input.kind === 'TEXT') {
      data.warning = looksLikeExternalTrade(input.body!);
    } else if (input.kind === 'IMAGE') {
      // 여러 장(imageKeys) 또는 예전 앱의 한 장(imageKey). 모두 내가 올린 사진이어야 한다
      const keys = [...new Set(input.imageKeys ?? [input.imageKey!])];
      const images: ImageDto[] = [];
      for (const key of keys) {
        if ((await this.redis.get(mediaOwnerKey(key))) !== user.id)
          throw new AppException('INVALID_IMAGE', '업로드한 사진만 보낼 수 있습니다. 다시 올려주세요.');
        const meta = await this.redis.get(`media:meta:${key}`);
        if (!meta) throw new AppException('INVALID_IMAGE', '사진 정보를 찾을 수 없습니다. 다시 올려주세요.');
        const m = JSON.parse(meta) as ImageDto;
        images.push({ key, width: m.width, height: m.height, dominantColor: m.dominantColor });
      }
      imageKey = keys[0];
      data.images = images;
      data.image = images[0];
    } else if (input.kind === 'PRODUCT') {
      const p = await this.prisma.product.count({
        where: { id: input.productId, deletedAt: null, publishedAt: { not: null } },
      });
      if (!p) throw new AppException('NOT_FOUND', '공유할 작품을 찾을 수 없습니다.');
      productId = input.productId;
    } else if (input.kind === 'APPOINTMENT') {
      if (Date.parse(input.appointment!.at) < Date.now())
        throw new AppException('VALIDATION_FAILED', '약속 시간은 지금 이후로 정해주세요.');
      data.appointment = input.appointment;
    }
    return { data, productId, imageKey };
  }

  async send(user: AuthUser, roomId: string, input: SendMessageInput): Promise<ChatMessageDto> {
    const { counterpartId } = await this.member(user, roomId);
    if (await this.safety.blockedBetween(user.id, counterpartId))
      throw new AppException('FORBIDDEN', '차단한 사용자와는 대화할 수 없습니다.');
    const other = await this.prisma.user.findUnique({
      where: { id: counterpartId },
      select: { status: true },
    });
    if (!other || other.status === 'DELETED')
      throw new AppException('FORBIDDEN', '대화 상대가 탈퇴해 메시지를 보낼 수 없습니다.');
    const { data, productId, imageKey } = await this.content(user, input);
    if (
      input.replyToId &&
      !(await this.prisma.chatMessage.count({ where: { id: input.replyToId, roomId, deletedAt: null } }))
    )
      throw new AppException('NOT_FOUND', '답장할 메시지를 찾을 수 없습니다.');
    // 네트워크 재시도(같은 clientId)는 이미 저장된 메시지를 돌려주고 도배 제한에 세지 않는다
    if (input.clientId) {
      const sent = await this.prisma.chatMessage.findFirst({
        where: { roomId, senderId: user.id, clientId: input.clientId },
        include: messageInclude,
      });
      if (sent) return toMessageDto(sent);
    }
    await this.assertNotSpam(user.id, roomId, input);

    let message: MessageRow;
    try {
      message = await this.prisma.$transaction(async (tx) => {
        const now = new Date();
        const m = await tx.chatMessage.create({
          data: {
            roomId,
            senderId: user.id,
            kind: input.kind,
            body: input.kind === 'TEXT' ? input.body : null,
            imageKey,
            productId,
            data: data as object,
            clientId: input.clientId,
            replyToId: input.replyToId,
            createdAt: now,
          },
          include: messageInclude,
        });
        await tx.chatRoom.update({ where: { id: roomId }, data: { lastMessageAt: now } });
        await tx.chatReadState.upsert({
          where: { roomId_userId: { roomId, userId: user.id } },
          create: { roomId, userId: user.id, lastReadAt: now },
          update: { lastReadAt: now },
        });
        return m;
      });
    } catch (e) {
      // 같은 clientId 재전송 — 이미 저장된 메시지를 그대로 돌려준다
      if (isUniqueViolation(e) && input.clientId) {
        const existing = await this.prisma.chatMessage.findFirstOrThrow({
          where: { roomId, senderId: user.id, clientId: input.clientId },
          include: messageInclude,
        });
        return toMessageDto(existing);
      }
      throw e;
    }

    const dto = toMessageDto(message);
    for (const uid of [user.id, counterpartId])
      this.realtime.toUser(uid, 'CHAT_MESSAGE', { roomId, message: dto });
    void this.pushToCounterpart(user.id, counterpartId, roomId, dto).catch(logNotifyError);
    return dto;
  }

  /**
   * 도배 제한: 사용자당 10초 8개, 같은 방에 같은 글(공백·대소문자 무시)은 30초에 2번까지.
   * ponytail: 고정 창 카운터 — 창 경계에서 최대 2배까지 통과할 수 있다. 정밀해야 하면 슬라이딩 창으로
   */
  private async assertNotSpam(userId: string, roomId: string, input: SendMessageInput) {
    if (await this.limiter.exceeded(`chat-burst:u:${userId}`, CHAT_BURST_LIMIT, CHAT_BURST_WINDOW_SEC))
      throw new AppException('CHAT_TOO_FAST');
    if (input.kind !== 'TEXT' || !input.body) return;
    const normalized = input.body.trim().replace(/\s+/g, ' ').toLowerCase();
    const key = `chat-dup:u:${userId}:${roomId}:${createHash('sha256').update(normalized).digest('hex').slice(0, 16)}`;
    if (await this.limiter.exceeded(key, CHAT_DUPLICATE_LIMIT, CHAT_DUPLICATE_WINDOW_SEC))
      throw new AppException('CHAT_DUPLICATE');
  }

  /**
   * 판매자가 채팅에서 거래 상태를 바꾼다 (판매 중 ↔ 예약 중 → 거래 완료). 직거래용이라
   * 경매 작품이나 주문이 걸린 작품(취소·환불 외)은 주문 흐름이 상태를 정하므로 막는다.
   */
  async setTradeStatus(user: AuthUser, roomId: string, input: ChatTradeInput) {
    const { room, counterpartId } = await this.member(user, roomId);
    if (room.sellerId !== user.id)
      throw new AppException('FORBIDDEN', '판매자만 거래 상태를 바꿀 수 있어요.');
    const product = room.productId
      ? await this.prisma.product.findUnique({
          where: { id: room.productId },
          select: { id: true, status: true, saleType: true, deletedAt: true },
        })
      : null;
    if (!product || product.deletedAt) throw new AppException('NOT_FOUND');
    if (
      product.saleType === 'AUCTION' ||
      !(CHAT_TRADE_STATUSES as readonly string[]).includes(product.status)
    )
      throw new AppException('INVALID_TRANSITION', '이 작품은 채팅에서 거래 상태를 바꿀 수 없어요.');
    const ordered = await this.prisma.orderItem.count({
      where: { productId: product.id, order: { status: { notIn: ['CANCELLED', 'REFUNDED'] } } },
    });
    if (ordered)
      throw new AppException('INVALID_TRANSITION', '주문이 진행 중인 작품은 주문 화면에서 처리해주세요.');
    if (product.status === input.status) return { status: input.status };

    const message = await this.prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id: product.id }, data: { status: input.status } });
      const m = await postSystemMessage(tx, room, `TRADE_${input.status}`);
      return tx.chatMessage.findUniqueOrThrow({ where: { id: m.id }, include: messageInclude });
    });
    const dto = toMessageDto(message);
    for (const uid of [user.id, counterpartId])
      this.realtime.toUser(uid, 'CHAT_MESSAGE', { roomId, message: dto });
    return { status: input.status };
  }

  private async pushToCounterpart(senderId: string, to: string, roomId: string, m: ChatMessageDto) {
    const state = await this.prisma.chatReadState.findUnique({
      where: { roomId_userId: { roomId, userId: to } },
    });
    if (state?.muted) return;
    const sender = await this.prisma.profile.findUnique({
      where: { userId: senderId },
      select: { nickname: true },
    });
    await this.notifications.notify(to, {
      type: 'CHAT_MESSAGE',
      title: sender?.nickname ?? '새 메시지',
      body: chatPreview({ ...m, imageCount: m.images.length }),
      link: `/chat/${roomId}`,
      store: false,
    });
  }

  /** 보낸 사람만 삭제 가능. 기록은 남기고 "삭제된 메시지"로 보인다 */
  async deleteMessage(user: AuthUser, roomId: string, messageId: string) {
    const { counterpartId } = await this.member(user, roomId);
    const r = await this.prisma.chatMessage.updateMany({
      where: { id: messageId, roomId, senderId: user.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (!r.count) throw new AppException('NOT_FOUND');
    for (const uid of [user.id, counterpartId])
      this.realtime.toUser(uid, 'CHAT_MESSAGE_DELETED', { roomId, messageId });
    return { ok: true };
  }

  async read(user: AuthUser, roomId: string) {
    const { counterpartId } = await this.member(user, roomId);
    const now = new Date();
    await this.prisma.chatReadState.upsert({
      where: { roomId_userId: { roomId, userId: user.id } },
      create: { roomId, userId: user.id, lastReadAt: now },
      update: { lastReadAt: now },
    });
    // 상대 화면의 읽음 표시 + 내 다른 기기의 안 읽은 배지
    for (const uid of [counterpartId, user.id])
      this.realtime.toUser(uid, 'CHAT_READ', { roomId, userId: user.id, lastReadAt: now.toISOString() });
    return { ok: true };
  }

  /** 나가기: 내 목록과 기록에서 숨긴다 (상대에게는 그대로) */
  async leave(user: AuthUser, roomId: string) {
    await this.member(user, roomId);
    const now = new Date();
    await this.prisma.chatReadState.upsert({
      where: { roomId_userId: { roomId, userId: user.id } },
      create: { roomId, userId: user.id, hiddenAt: now, lastReadAt: now },
      update: { hiddenAt: now, lastReadAt: now },
    });
    return { ok: true };
  }

  async settings(user: AuthUser, roomId: string, muted: boolean) {
    await this.member(user, roomId);
    await this.prisma.chatReadState.upsert({
      where: { roomId_userId: { roomId, userId: user.id } },
      create: { roomId, userId: user.id, muted },
      update: { muted },
    });
    return { muted };
  }
}
