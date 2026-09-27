import { Controller, Module, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AppException } from '../common/app-exception';
import { CurrentUser, type AuthUser } from '../common/auth';
import { RateLimit } from '../common/rate-limit';
import { MAX_UPLOAD_BYTES } from './image';
import { MediaService } from './media.service';

@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('images')
  @RateLimit({ name: 'upload', limit: 60, windowSec: 60, by: 'user' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  upload(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new AppException('VALIDATION_FAILED', '이미지 파일을 선택해주세요.');
    return this.media.uploadImage(file.buffer, user.id);
  }
}

@Module({ controllers: [MediaController], providers: [MediaService], exports: [MediaService] })
export class MediaModule {}
