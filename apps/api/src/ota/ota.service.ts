import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma, type OtaUpdate } from '@prisma/client';
import {
  otaAssetSchema,
  type OtaAsset,
  type OtaListQuery,
  type OtaPatchInput,
  type OtaPlatform,
  type OtaPublishInput,
  type OtaRollbackInput,
  type OtaUpdateDto,
} from '@shop/shared';
import { z } from 'zod';
import { AuditService, type AuditContext } from '../admin/audit.service';
import { AppException } from '../common/app-exception';
import { env } from '../config/env';
import { AdminNotifier } from '../notifications/admin-notifier';
import { logNotifyError } from '../notifications/notification-events';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { PUBLIC_PREFIX, S3Service } from '../storage/s3.service';
import {
  assetDigests,
  buildManifest,
  inRollout,
  multipartBody,
  newBoundary,
  rollBackDirective,
  signPart,
  type MultipartPart,
} from './ota.protocol';

/** 매니페스트 요청 헤더 (소문자 이름) */
export interface ManifestRequest {
  platform: OtaPlatform;
  runtimeVersion: string;
  channel: string;
  currentUpdateId?: string;
  embeddedUpdateId?: string;
  clientId?: string;
  expectSignature: boolean;
}

export type ManifestResponse = { status: 204 } | { status: 200; boundary: string; body: string };

type Group = Pick<OtaUpdate, 'platform' | 'runtimeVersion' | 'channel'>;

const CANDIDATES = 50;
const CACHE_MAX = 200;
const assetList = z.array(otaAssetSchema);
const expoClientSchema = z.record(z.string(), z.unknown()).nullable();

export const toOtaDto = (r: OtaUpdate): OtaUpdateDto => ({
  id: r.id,
  platform: r.platform === 'android' ? 'android' : 'ios',
  runtimeVersion: r.runtimeVersion,
  channel: r.channel,
  kind: r.kind === 'ROLLBACK' ? 'ROLLBACK' : 'UPDATE',
  message: r.message,
  critical: r.critical,
  rolloutPercent: r.rolloutPercent,
  status: r.status === 'ROLLED_BACK' ? 'ROLLED_BACK' : 'ACTIVE',
  // 번들(launchAsset) + 에셋 파일 수
  assetCount: (r.launchAsset ? 1 : 0) + (Array.isArray(r.assets) ? r.assets.length : 0),
  createdAt: r.createdAt.toISOString(),
});

const sameId = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** 자체 호스팅 OTA (Expo Updates 프로토콜 v1 — docs/MOBILE_RELEASE.md "OTA 업데이트") */
@Injectable()
export class OtaService {
  /** 서명된 파트 캐시 (행 id → 파트). 매니페스트 내용은 만든 뒤 바뀌지 않는다 */
  private readonly partCache = new Map<string, MultipartPart>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly audit: AuditService,
    private readonly admins: AdminNotifier,
  ) {}

  // ───── 앱 ─────

  async manifest(req: ManifestRequest): Promise<ManifestResponse> {
    const key = env().OTA_SIGNING_KEY;
    if (req.expectSignature && !key) {
      throw new AppException('OTA_NOT_CONFIGURED', 'OTA 서명 키가 설정되지 않았습니다.', undefined, 500);
    }
    const rows = await this.prisma.otaUpdate.findMany({
      where: {
        platform: req.platform,
        runtimeVersion: req.runtimeVersion,
        channel: req.channel,
        status: 'ACTIVE',
      },
      orderBy: { createdAt: 'desc' },
      take: CANDIDATES,
    });
    const picked = rows.find((r) => inRollout(r.id, r.rolloutPercent, req.clientId));
    if (!picked) return { status: 204 };

    if (picked.kind === 'ROLLBACK') {
      // 이미 내장 번들로 실행 중이면 할 일이 없다
      if (!req.currentUpdateId || sameId(req.currentUpdateId, req.embeddedUpdateId)) return { status: 204 };
      const boundary = newBoundary();
      return { status: 200, boundary, body: multipartBody([this.part(picked, key)], boundary) };
    }
    if (sameId(picked.id, req.currentUpdateId)) return { status: 204 };

    const boundary = newBoundary();
    const extensions: MultipartPart = {
      name: 'extensions',
      body: JSON.stringify({ assetRequestHeaders: {} }),
    };
    return {
      status: 200,
      boundary,
      body: multipartBody([this.part(picked, key), extensions], boundary),
    };
  }

  /** 매니페스트·지시 파트. JSON 을 한 번 직렬화해 그 바이트에 서명한다 */
  private part(row: OtaUpdate, key: string | undefined): MultipartPart {
    const cacheKey = `${row.id}:${key ? env().OTA_SIGNING_KEY_ID : '-'}`;
    const hit = this.partCache.get(cacheKey);
    if (hit) return hit;

    let part: MultipartPart;
    if (row.kind === 'ROLLBACK') {
      part = { name: 'directive', body: JSON.stringify(rollBackDirective(row.createdAt)) };
    } else {
      const manifest = buildManifest({
        id: row.id,
        createdAt: row.createdAt,
        runtimeVersion: row.runtimeVersion,
        critical: row.critical,
        launchAsset: otaAssetSchema.parse(row.launchAsset),
        assets: assetList.parse(row.assets),
        expoClient: expoClientSchema.parse(row.expoClient),
      });
      part = { name: 'manifest', body: JSON.stringify(manifest) };
    }
    if (key) part.signature = signPart(part.body, key, env().OTA_SIGNING_KEY_ID);

    if (this.partCache.size >= CACHE_MAX) {
      const oldest = this.partCache.keys().next().value;
      if (oldest !== undefined) this.partCache.delete(oldest);
    }
    this.partCache.set(cacheKey, part);
    return part;
  }

  // ───── 배포 스크립트 ─────

  /** 내용 주소(sha256) 로 저장한다. 같은 파일은 같은 키라 다시 올려도 덮어쓸 뿐이다 */
  async uploadAsset(body: Buffer, contentType: string, fileExtension: string): Promise<OtaAsset> {
    const { hash, key, sha256Hex } = assetDigests(body);
    const name = `${sha256Hex}${fileExtension}`;
    await this.s3.put(`${PUBLIC_PREFIX}ota/${name}`, body, contentType, 'immutable');
    return { hash, key, contentType, fileExtension, url: `${env().MEDIA_PUBLIC_URL}/ota/${name}` };
  }

  async publish(input: OtaPublishInput): Promise<OtaUpdateDto> {
    const row = await this.prisma.otaUpdate.create({
      data: {
        id: randomUUID(),
        platform: input.platform,
        runtimeVersion: input.runtimeVersion,
        channel: input.channel,
        kind: 'UPDATE',
        message: input.message,
        critical: input.critical,
        rolloutPercent: input.rolloutPercent,
        launchAsset: input.launchAsset,
        assets: input.assets,
        // 요청 본문(JSON)에서 온 값이라 JSON 으로 직렬화 가능하다
        expoClient: input.expoClient as Prisma.InputJsonObject | undefined,
        createdAt: await this.nextCreatedAt(this.prisma, input),
      },
    });
    // 배포 스크립트(토큰)로 올라오므로 일으킨 관리자가 없다 — 관리자 전원에게
    void this.admins.appUpdate(row).catch(logNotifyError);
    return toOtaDto(row);
  }

  // ───── 관리자 ─────

  async list(q: OtaListQuery): Promise<OtaUpdateDto[]> {
    const rows = await this.prisma.otaUpdate.findMany({
      where: {
        ...(q.platform ? { platform: q.platform } : {}),
        ...(q.channel ? { channel: q.channel } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map(toOtaDto);
  }

  async patch(ctx: AuditContext, id: string, input: OtaPatchInput): Promise<OtaUpdateDto> {
    const before = await this.prisma.otaUpdate.findUnique({ where: { id } });
    if (!before) throw new AppException('NOT_FOUND');
    const row = await this.prisma.otaUpdate.update({ where: { id }, data: input });
    await this.audit.log(ctx, 'ota.update', 'OTA_UPDATE', id, toOtaDto(before), input);
    return toOtaDto(row);
  }

  /**
   * previous: 최신 업데이트를 중단하고 직전 업데이트를 새 id·새 시각으로 다시 낸다
   * (클라이언트는 더 새로운 업데이트만 받으므로 옛 행을 되살리지 않는다). 직전이 없으면 내장 번들로.
   * embedded: 내장 번들로 되돌리기 지시(ROLLBACK 행)를 낸다.
   */
  async rollback(ctx: AuditContext, input: OtaRollbackInput): Promise<OtaUpdateDto> {
    const group: Group = {
      platform: input.platform,
      runtimeVersion: input.runtimeVersion,
      channel: input.channel,
    };
    const result = await this.prisma.$transaction(async (tx) => {
      let rolledBack: string | null = null;
      let data: Prisma.OtaUpdateCreateInput;
      if (input.target === 'previous') {
        const [current, prev] = await tx.otaUpdate.findMany({
          where: { ...group, kind: 'UPDATE', status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
          take: 2,
        });
        if (!current) throw new AppException('NOT_FOUND', '되돌릴 업데이트가 없습니다.');
        await tx.otaUpdate.update({ where: { id: current.id }, data: { status: 'ROLLED_BACK' } });
        rolledBack = current.id;
        data = prev
          ? {
              ...this.base(ctx, group, 'UPDATE', `되돌림: ${prev.message}`.slice(0, 200)),
              critical: prev.critical,
              launchAsset: otaAssetSchema.parse(prev.launchAsset),
              assets: assetList.parse(prev.assets),
              expoClient: prev.expoClient ?? undefined,
            }
          : this.base(ctx, group, 'ROLLBACK', '내장 버전으로 되돌림');
      } else {
        data = this.base(ctx, group, 'ROLLBACK', '내장 버전으로 되돌림');
      }
      data.createdAt = await this.nextCreatedAt(tx, group);
      const row = await tx.otaUpdate.create({ data });
      return { row, rolledBack };
    });
    await this.audit.log(ctx, 'ota.rollback', 'OTA_UPDATE', result.row.id, null, {
      ...input,
      rolledBack: result.rolledBack,
    });
    void this.admins.appUpdate(result.row, { rollback: true, actorId: ctx.user.id }).catch(logNotifyError);
    return toOtaDto(result.row);
  }

  private base(ctx: AuditContext, group: Group, kind: 'UPDATE' | 'ROLLBACK', message: string) {
    return {
      id: randomUUID(),
      ...group,
      kind,
      message,
      rolloutPercent: 100,
      createdById: ctx.user.id,
    } satisfies Prisma.OtaUpdateCreateInput;
  }

  /**
   * 같은 그룹의 최신 행보다 반드시 늦은 시각. 클라이언트는 createdAt(commitTime) 이 더 새로운 업데이트·지시만
   * 적용하고, 선택도 createdAt 순이라 같은 밀리초에 두 행이 생겨도 순서가 흔들리지 않게 한다.
   */
  private async nextCreatedAt(db: Tx, group: Group): Promise<Date> {
    const latest = await db.otaUpdate.findFirst({
      where: { platform: group.platform, runtimeVersion: group.runtimeVersion, channel: group.channel },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const now = Date.now();
    return new Date(latest && latest.createdAt.getTime() >= now ? latest.createdAt.getTime() + 1 : now);
  }
}
