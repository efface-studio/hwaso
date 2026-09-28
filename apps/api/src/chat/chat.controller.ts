import { Body, Controller, Delete, Get, HttpCode, Module, Param, Patch, Post, Query } from '@nestjs/common';
import {
  chatRoomSettingsSchema,
  chatTradeSchema,
  createChatRoomSchema,
  sendMessageSchema,
  type ChatTradeInput,
  type SendMessageInput,
} from '@shop/shared';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../common/auth';
import { RateLimit } from '../common/rate-limit';
import { ZodPipe } from '../common/zod.pipe';
import { ChatService } from './chat.service';

const beforeSchema = z.object({ before: z.string().max(40).optional() });

@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post('rooms')
  @HttpCode(200)
  @RateLimit({ name: 'chat-open', limit: 30, windowSec: 3600, by: 'user' })
  open(@CurrentUser() u: AuthUser, @Body(new ZodPipe(createChatRoomSchema)) body: { productId: string }) {
    return this.chat.open(u, body.productId);
  }

  @Get('rooms')
  rooms(@CurrentUser() u: AuthUser) {
    return this.chat.rooms(u);
  }

  @Get('unread-count')
  unread(@CurrentUser() u: AuthUser) {
    return this.chat.unreadTotal(u);
  }

  @Get('rooms/:id')
  room(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.chat.room(u, id);
  }

  @Get('rooms/:id/messages')
  messages(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Query(new ZodPipe(beforeSchema)) q: { before?: string },
  ) {
    return this.chat.messages(u, id, q.before);
  }

  @Post('rooms/:id/messages')
  @RateLimit({ name: 'chat-send', limit: 30, windowSec: 10, by: 'user' })
  send(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(sendMessageSchema)) body: SendMessageInput,
  ) {
    return this.chat.send(u, id, body);
  }

  @Delete('rooms/:id/messages/:messageId')
  deleteMessage(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('messageId') messageId: string) {
    return this.chat.deleteMessage(u, id, messageId);
  }

  /** 판매자: 채팅에서 거래 상태 변경 (판매 중·예약 중·거래 완료) */
  @Patch('rooms/:id/trade')
  trade(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(chatTradeSchema)) body: ChatTradeInput,
  ) {
    return this.chat.setTradeStatus(u, id, body);
  }

  @Post('rooms/:id/read')
  @HttpCode(200)
  read(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.chat.read(u, id);
  }

  @Post('rooms/:id/leave')
  @HttpCode(200)
  leave(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.chat.leave(u, id);
  }

  @Patch('rooms/:id')
  settings(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(chatRoomSettingsSchema)) body: { muted: boolean },
  ) {
    return this.chat.settings(u, id, body.muted);
  }
}

@Module({ controllers: [ChatController], providers: [ChatService] })
export class ChatModule {}
