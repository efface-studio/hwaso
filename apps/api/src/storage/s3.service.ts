import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { env } from '../config/env';

/** 공개 파생 이미지는 public/, 원본은 originals/ (비공개) 에 저장한다 (docs/ARCHITECTURE.md §6) */
export const PUBLIC_PREFIX = 'public/';
export const ORIGINAL_PREFIX = 'originals/';

export function createS3Client(): S3Client {
  const e = env();
  return new S3Client({
    region: e.S3_REGION,
    endpoint: e.S3_ENDPOINT,
    forcePathStyle: e.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: e.S3_ACCESS_KEY, secretAccessKey: e.S3_SECRET_KEY },
  });
}

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  readonly client = createS3Client();
  readonly bucket = env().S3_BUCKET;

  put(key: string, body: Buffer, contentType: string, cache: 'immutable' | 'private') {
    return this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentDisposition: 'inline',
        CacheControl: cache === 'immutable' ? 'public, max-age=31536000, immutable' : 'private, no-store',
      }),
    );
  }

  /** 개발/테스트: 버킷이 없으면 만들고 public/ 만 익명 읽기 허용. 운영 버킷은 인프라에서 관리한다 */
  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: '*',
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${this.bucket}/${PUBLIC_PREFIX}*`],
        },
      ],
    };
    try {
      await this.client.send(
        new PutBucketPolicyCommand({ Bucket: this.bucket, Policy: JSON.stringify(policy) }),
      );
    } catch (err) {
      this.logger.warn({ err }, '버킷 공개 정책 설정 실패 — 이미지가 공개되지 않을 수 있습니다.');
    }
  }
}

@Global()
@Module({ providers: [S3Service], exports: [S3Service] })
export class StorageModule {}
