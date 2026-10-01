import {
  Body,
  type CanActivate,
  Controller,
  type ExecutionContext,
  Get,
  HttpCode,
  Injectable,
  Module,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  OTA_PLATFORMS,
  otaListQuery,
  otaPatchSchema,
  otaPublishSchema,
  otaRollbackSchema,
  type OtaListQuery,
  type OtaPatchInput,
  type OtaPublishInput,
  type OtaRollbackInput,
} from '@shop/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AuditService } from '../admin/audit.service';
import { AppException } from '../common/app-exception';
import { Public, Roles, type AuthedRequest } from '../common/auth';
import { safeEqual } from '../common/crypto';
import { clientIp } from '../common/rate-limit';
import { ZodPipe } from '../common/zod.pipe';
import { env } from '../config/env';
import { OtaService } from './ota.service';

export const OTA_MAX_ASSET_BYTES = 50 * 1024 * 1024;

const assetFieldsSchema = z.object({
  contentType: z.string().min(1).max(100),
  // ".png" 형태. 번들은 "" (S3 키에 그대로 붙으므로 영숫자만)
  fileExtension: z
    .string()
    .regex(/^(\.[A-Za-z0-9]{1,15})?$/)
    .default(''),
});

/** 배포 스크립트 전용: x-ota-publish-token 이 OTA_PUBLISH_TOKEN 과 같아야 한다 */
@Injectable()
export class OtaPublishGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const expected = env().OTA_PUBLISH_TOKEN;
    if (!expected) throw new AppException('OTA_NOT_CONFIGURED');
    const token = ctx.switchToHttp().getRequest<Request>().headers['x-ota-publish-token'];
    if (typeof token !== 'string' || !safeEqual(token, expected))
      throw new AppException('UNAUTHORIZED', '배포 토큰이 올바르지 않습니다.');
    return true;
  }
}

const header = (req: Request, name: string): string | undefined => {
  const v = req.headers[name];
  const s = (Array.isArray(v) ? v[0] : v)?.trim();
  return s ? s : undefined;
};

/** 앱(expo-updates)과 배포 스크립트가 부르는 OTA API (docs/API.md "OTA") */
@Controller('ota')
export class OtaController {
  constructor(private readonly ota: OtaService) {}

  @Public()
  @Get('manifest')
  async manifest(@Req() req: Request, @Res() res: Response) {
    const platform = header(req, 'expo-platform');
    const runtimeVersion = header(req, 'expo-runtime-version');
    if (!platform || !(OTA_PLATFORMS as readonly string[]).includes(platform)) {
      throw new AppException('VALIDATION_FAILED', 'expo-platform 헤더가 필요합니다 (ios, android).');
    }
    if (!runtimeVersion)
      throw new AppException('VALIDATION_FAILED', 'expo-runtime-version 헤더가 필요합니다.');
    // expo-protocol-version 이 없으면 1 로 본다 — 응답은 항상 v1 형식
    const result = await this.ota.manifest({
      platform: platform === 'android' ? 'android' : 'ios',
      runtimeVersion,
      channel: header(req, 'expo-channel-name') ?? 'production',
      currentUpdateId: header(req, 'expo-current-update-id'),
      embeddedUpdateId: header(req, 'expo-embedded-update-id'),
      clientId: header(req, 'eas-client-id'),
      expectSignature: req.headers['expo-expect-signature'] !== undefined,
    });
    res.setHeader('expo-protocol-version', '1');
    res.setHeader('cache-control', 'private, max-age=0');
    if (result.status === 204) {
      res.status(204).end();
      return;
    }
    res.setHeader('expo-sfv-version', '0');
    res.setHeader('content-type', `multipart/mixed; boundary=${result.boundary}`);
    res.status(200).send(Buffer.from(result.body, 'utf8'));
  }

  @Public()
  @UseGuards(OtaPublishGuard)
  @Post('assets')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: OTA_MAX_ASSET_BYTES, files: 1 } }))
  uploadAsset(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodPipe(assetFieldsSchema)) b: z.output<typeof assetFieldsSchema>,
  ) {
    if (!file) throw new AppException('VALIDATION_FAILED', '파일을 첨부해주세요.');
    return this.ota.uploadAsset(file.buffer, b.contentType, b.fileExtension);
  }

  @Public()
  @UseGuards(OtaPublishGuard)
  @Post('updates')
  publish(@Body(new ZodPipe(otaPublishSchema)) b: OtaPublishInput) {
    return this.ota.publish(b);
  }
}

/** 관리자: 배포 목록 · 점진 배포 비율 · 되돌리기 (docs/API.md "Admin") */
@Roles('ADMIN', 'SUPER_ADMIN')
@Controller('admin/ota')
export class AdminOtaController {
  constructor(private readonly ota: OtaService) {}

  @Get()
  list(@Query(new ZodPipe(otaListQuery)) q: OtaListQuery) {
    return this.ota.list(q);
  }

  @Post('rollback')
  @HttpCode(200)
  rollback(@Req() req: AuthedRequest, @Body(new ZodPipe(otaRollbackSchema)) b: OtaRollbackInput) {
    return this.ota.rollback({ user: req.user!, ip: clientIp(req) }, b);
  }

  @Patch(':id')
  update(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(new ZodPipe(otaPatchSchema)) b: OtaPatchInput,
  ) {
    return this.ota.patch({ user: req.user!, ip: clientIp(req) }, id, b);
  }
}

@Module({
  controllers: [OtaController, AdminOtaController],
  providers: [OtaService, OtaPublishGuard, AuditService],
})
export class OtaModule {}
