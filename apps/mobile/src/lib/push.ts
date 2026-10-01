import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { Platform } from 'react-native';
import i18n from '@/i18n';
import { api } from './api';
import { secure } from './secure';

const TOKEN_KEY = 'hwaso.pushToken';
let currentPath = '';

/** 지금 보고 있는 화면 — 같은 채팅방 알림은 배너를 띄우지 않는다 */
export const setCurrentPath = (p: string) => {
  currentPath = p;
};

Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const link = (n.request.content.data as { link?: string } | undefined)?.link;
    const here = !!link && link === currentPath;
    return { shouldShowBanner: !here, shouldShowList: true, shouldPlaySound: !here, shouldSetBadge: true };
  },
});

/**
 * 로그인 후 알림 권한을 묻고 이 기기의 푸시 토큰을 서버에 등록한다.
 * iOS 는 APNs 기기 토큰, Android 는 FCM 기기 토큰 — 서버가 Apple·Google 로 직접 보낸다.
 * 에뮬레이터·웹·권한 거절이면 조용히 넘어간다 (앱 사용에는 지장 없음).
 */
export async function registerPush(): Promise<boolean> {
  if (Platform.OS === 'web' || !Device.isDevice) return false;
  if (Platform.OS === 'android')
    await Notifications.setNotificationChannelAsync('default', {
      name: i18n.t('common:push.channelName'),
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#2F7A58',
    });
  const current = await Notifications.getPermissionsAsync();
  const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return false;
  const { data } = await Notifications.getDevicePushTokenAsync();
  await saveToken(String(data));
  listenTokenChanges();
  return true;
}

async function saveToken(token: string) {
  await api.notifications.registerPush({ token, platform: Platform.OS === 'ios' ? 'apns' : 'fcm' });
  await secure.set(TOKEN_KEY, token);
}

let tokenSub: { remove: () => void } | null = null;
/** OS 가 토큰을 바꾸면(앱 재설치·복원 등) 새 토큰으로 다시 등록한다 */
function listenTokenChanges() {
  if (tokenSub) return;
  tokenSub = Notifications.addPushTokenListener(({ data }) => {
    void saveToken(String(data)).catch(() => undefined);
  });
}

/** 로그아웃 시 이 기기로 더 보내지 않게 해제 */
export async function unregisterPush() {
  const token = await secure.get(TOKEN_KEY);
  if (!token) return;
  tokenSub?.remove();
  tokenSub = null;
  await api.notifications.unregisterPush(token).catch(() => undefined);
  await secure.remove(TOKEN_KEY);
}

/** 알림을 눌러 앱이 열리면 알림의 link 로 이동 */
export function listenNotificationTaps() {
  if (Platform.OS === 'web') return undefined;
  const open = (r: Notifications.NotificationResponse | null) => {
    const link = (r?.notification.request.content.data as { link?: string } | undefined)?.link;
    if (link?.startsWith('/')) router.push(link as Href);
  };
  void Notifications.getLastNotificationResponseAsync().then(open);
  const sub = Notifications.addNotificationResponseReceivedListener(open);
  return () => sub.remove();
}
