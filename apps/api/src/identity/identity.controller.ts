import { Body, Controller, Get, HttpCode, Module, Post } from '@nestjs/common';
import { identityCompleteSchema } from '@shop/shared';
import { CurrentUser, type AuthUser } from '../common/auth';
import { RateLimit } from '../common/rate-limit';
import { ZodPipe } from '../common/zod.pipe';
import { IdentityService, PortOneClient } from './identity.service';

@Controller('identity')
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @Get()
  status(@CurrentUser() user: AuthUser) {
    return this.identity.status(user.id);
  }

  @Post('prepare')
  @HttpCode(200)
  @RateLimit({ name: 'identity', limit: 10, windowSec: 3600, by: 'user' })
  prepare(@CurrentUser() user: AuthUser) {
    return this.identity.prepare(user.id);
  }

  @Post('complete')
  @HttpCode(200)
  complete(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(identityCompleteSchema)) body: { identityVerificationId: string },
  ) {
    return this.identity.complete(user.id, body.identityVerificationId);
  }
}

@Module({
  controllers: [IdentityController],
  providers: [IdentityService, PortOneClient],
  exports: [IdentityService],
})
export class IdentityModule {}
