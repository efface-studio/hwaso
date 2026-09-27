import type { NotificationDto, NotificationPrefs, Page, PushTokenInput } from '@shop/shared';
import type { Http } from '../http';

export const notificationsApi = (http: Http) => ({
  list: (cursor?: string) => http.get<Page<NotificationDto>>('/notifications', { cursor }),
  unreadCount: () => http.get<{ unreadCount: number }>('/notifications/unread-count'),
  read: (body: { ids: string[] } | { all: true }) =>
    http.post<{ unreadCount: number }>('/notifications/read', body),
  remove: (id: string) => http.delete<{ unreadCount: number }>(`/notifications/${encodeURIComponent(id)}`),
  clearRead: () => http.delete<{ ok: true }>('/notifications'),
  prefs: () => http.get<NotificationPrefs>('/me/notification-settings'),
  setPrefs: (prefs: NotificationPrefs) => http.put<NotificationPrefs>('/me/notification-settings', prefs),
  pushConfig: () => http.get<{ vapidPublicKey: string | null }>('/notifications/push-config'),
  registerPush: (body: PushTokenInput) => http.post<{ ok: true }>('/me/push-tokens', body),
  unregisterPush: (token: string) => http.delete<{ ok: true }>('/me/push-tokens', { token }),
});
