import { Injectable } from '@nestjs/common';
import { AppException } from '../common/app-exception';
import { RedisService } from '../redis/redis.service';
import { ORIGINAL_PREFIX, PUBLIC_PREFIX, S3Service } from '../storage/s3.service';
import { InvalidImageError, prepareImage, settleAll, type PreparedImage } from './image';

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
    let img: PreparedImage;
    try {
      img = await prepareImage(buffer);
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
    // 파일마다 인코딩이 끝나는 대로 저장한다 (모두 인코딩한 뒤 한꺼번에 올리지 않는다).
    // 웹 <picture> 가 업로드 직후 AVIF·WebP 를 바로 그리므로 파생본이 모두 저장된 뒤에 응답한다
    const stored = settleAll([
      // 업로드 원본 대신 메타데이터를 지운 보관본(긴 변 3200 AVIF)을 비공개로 둔다
      img.master.then((f) => this.s3.put(`${ORIGINAL_PREFIX}${f.path}`, f.body, f.contentType, 'private')),
      ...img.variants.map((job) =>
        job.then((f) => this.s3.put(`${PUBLIC_PREFIX}${f.path}`, f.body, f.contentType, 'immutable')),
      ),
    ]);
    const [dominantColor] = await Promise.all([img.dominantColor, stored]);
    const result = { key: img.key, width: img.width, height: img.height, dominantColor };
    // 업로드한 사람만 이 키를 상품·프로필에 붙일 수 있도록 24시간 기록 (seller-products.service.ts)
    await this.redis
      .multi()
      .set(`media:owner:${img.key}`, ownerId, 'EX', 86_400)
      .set(`media:meta:${img.key}`, JSON.stringify(result), 'EX', 86_400)
      .exec();
    return result;
  }
}
