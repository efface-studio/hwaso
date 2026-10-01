import type { PushToken } from '@prisma/client';
import type { ApnsClient, ApnsResult } from './apns';
import { apnsPayload, fcmData, PushService, type PushMessage } from './push.service';

const msg: PushMessage = {
  title: '지완',
  body: '안녕하세요',
  link: '/chat/r1',
  sender: { id: 'u1', name: '지완', avatarUrl: 'https://cdn.test/a/w400.webp' },
  threadId: 'chat-r1',
};

describe('푸시 페이로드', () => {
  it('iOS: 알림 서비스 확장이 쓰도록 mutable-content 와 보낸 사람을 body 에 담는다', () => {
    expect(apnsPayload(msg)).toEqual({
      aps: {
        alert: { title: '지완', body: '안녕하세요' },
        sound: 'default',
        'mutable-content': 1,
        'thread-id': 'chat-r1',
      },
      body: { link: '/chat/r1', sender: msg.sender },
    });
  });

  it('Android: Expo 푸시와 같은 data 키 (값은 모두 문자열)', () => {
    const data = fcmData(msg);
    expect(data).toMatchObject({ title: '지완', message: '안녕하세요', channelId: 'default' });
    expect(JSON.parse(data.body!)).toEqual({ link: '/chat/r1', sender: msg.sender });
    expect(Object.values(data).every((v) => typeof v === 'string')).toBe(true);
  });
});

describe('iOS 발송', () => {
  const token = (platform: string): PushToken => ({
    id: 't1',
    userId: 'u2',
    token: 'abc123',
    platform,
    createdAt: new Date(),
  });

  function setup(platform: string, responses: Record<'production' | 'sandbox', ApnsResult>) {
    const prisma = {
      pushToken: {
        findMany: vi.fn().mockResolvedValue([token(platform)]),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
      },
    };
    const calls: string[] = [];
    const apns = {
      send: vi.fn((_t: string, _p: object, env: 'production' | 'sandbox') => {
        calls.push(env);
        return Promise.resolve(responses[env]);
      }),
      close: vi.fn(),
    } as unknown as ApnsClient;
    const service = new PushService(prisma as never);
    Object.assign(service, { apnsClient: apns, fcmClient: null });
    return { service, prisma, calls };
  }

  it('운영에서 BadDeviceToken 이면 샌드박스로 다시 보내고, 통하면 토큰을 샌드박스로 기억한다', async () => {
    const { service, prisma, calls } = setup('apns', {
      production: { status: 400, reason: 'BadDeviceToken' },
      sandbox: { status: 200 },
    });
    await service.send('u2', msg);
    expect(calls).toEqual(['production', 'sandbox']);
    expect(prisma.pushToken.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { platform: 'apns-sandbox' },
    });
    expect(prisma.pushToken.delete).not.toHaveBeenCalled();
  });

  it('샌드박스로 기억된 토큰은 샌드박스로 바로 보낸다', async () => {
    const { service, calls } = setup('apns-sandbox', {
      production: { status: 400, reason: 'BadDeviceToken' },
      sandbox: { status: 200 },
    });
    await service.send('u2', msg);
    expect(calls).toEqual(['sandbox']);
  });

  it('앱이 지워진 기기(410)의 토큰은 지운다', async () => {
    const { service, prisma } = setup('apns-sandbox', {
      production: { status: 200 },
      sandbox: { status: 410, reason: 'Unregistered' },
    });
    await service.send('u2', msg);
    expect(prisma.pushToken.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
  });
});
