import { Injectable } from '@nestjs/common';
import { AppException } from '../common/app-exception';
import { RedisService } from '../redis/redis.service';
import { ORIGINAL_PREFIX, PUBLIC_PREFIX, S3Service } from '../storage/s3.service';
import { InvalidImageError, processImage } from './image';

export interface UploadedImage {
  key: string;
  width: number;
  height: number;
  dominantColor: string;
}

@Injectable()
export class MediaService {
  constructor(
    private readonly s3: S3Service,
    private readonly redis: RedisService,
  ) {}

  async uploadImage(buffer: Buffer, ownerId: string): Promise<UploadedImage> {
    let img;
    try {
      img = await processImage(buffer);
    } catch (e) {
      if (!(e instanceof InvalidImageError)) throw e;
      throw new AppException(
        e.message === 'too large' ? 'IMAGE_TOO_LARGE' : 'INVALID_IMAGE',
        undefined,
        undefined,
        400,
      );
    }
    // ponytail: 요청 내 동기 처리 — 업로드가 몰리면 이미지 워커 + 큐로 분리 (docs/ARCHITECTURE.md §10)
    await Promise.all([
      this.s3.put(
        `${ORIGINAL_PREFIX}${img.key}.${img.originalFormat}`,
        buffer,
        'application/octet-stream',
        'private',
      ),
      ...img.variants.map((v) =>
        this.s3.put(`${PUBLIC_PREFIX}${v.path}`, v.body, v.contentType, 'immutable'),
      ),
    ]);
    const result = { key: img.key, width: img.width, height: img.height, dominantColor: img.dominantColor };
    // 업로드한 사람만 이 키를 상품·프로필에 붙일 수 있도록 24시간 기록 (seller-products.service.ts)
    await this.redis
      .multi()
      .set(`media:owner:${img.key}`, ownerId, 'EX', 86_400)
      .set(`media:meta:${img.key}`, JSON.stringify(result), 'EX', 86_400)
      .exec();
    return result;
  }
}
