import { api } from './api';

export type WebPushState = 'unsupported' | 'unconfigured' | 'denied' | 'off' | 'on';

const supported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration() {
  return (
    (await navigator.serviceWorker.getRegistration('/sw.js')) ?? navigator.serviceWorker.register('/sw.js')
  );
}

/** 이 브라우저의 웹 푸시 상태 (서버에 VAPID 키가 없으면 unconfigured) */
export async function webPushState(): Promise<WebPushState> {
  if (!supported()) return 'unsupported';
  const { vapidPublicKey } = await api.notifications.pushConfig();
  if (!vapidPublicKey) return 'unconfigured';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  return (await reg?.pushManager.getSubscription()) ? 'on' : 'off';
}

/** 권한 요청 → 구독 → 서버 등록 */
export async function enableWebPush(): Promise<WebPushState> {
  const { vapidPublicKey } = await api.notifications.pushConfig();
  if (!vapidPublicKey) return 'unconfigured';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const reg = await registration();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));
  await api.notifications.registerPush({ token: JSON.stringify(sub), platform: 'web' });
  return 'on';
}

export async function disableWebPush(): Promise<WebPushState> {
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api.notifications.unregisterPush(JSON.stringify(sub)).catch(() => undefined);
    await sub.unsubscribe();
  }
  return 'off';
}
